import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { ProductModel, validateProduct } from "../models/productModel.js";
import {
    baseTableOptions,
    confirmAction,
    escapeHtml,
    extractProblemMessage,
    initAuthenticatedView,
    resolveConnectedPermissions,
    safeTextRender,
    setElementVisibility
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable
authGuard('canViewProductsAdmin');

// Mensaje exacto requerido para conflicto HTTP 409 en eliminación física (TASK-F3-05 / REQ-BIZ-001)
const CONFLICT_409_MESSAGE =
    'No se puede eliminar fisicamente el producto porque tiene ordenes historicas vinculadas. Se ha mantenido en el registro para preservar la integridad historica.';

const DEFAULT_FEEDBACK_MESSAGES = Object.freeze({
    feedbackProdName: 'El nombre es obligatorio (2 a 40 caracteres).',
    feedbackProdPrice: 'El precio debe estar entre $0.01 y $100,000.00.',
    feedbackProdStock: 'Valor entero entre 0 y 32,767.'
});

let productosCache = [];
let modalInstancia = null;
let modal409Instancia = null;
let tabla = null;
let permisosActuales = {
    canViewProductsAdmin: false,
    canCreateProducts: false,
    canEditProductDetails: false,
    canEditProductPricingStock: false,
    canDeleteProducts: false,
    canDiscontinueProducts: false
};

// Renderiza sólo en modo 'display'; para ordenar/buscar se usa el valor crudo
const display = (fn) => (data, type, row) => type === 'display' ? fn(data, row) : data;

function normalizarPermisosProductos(permisos = permisosActuales) {
    const src = permisos && typeof permisos === 'object' ? permisos : {};
    return {
        canViewProductsAdmin: Boolean(src.canViewProductsAdmin),
        canCreateProducts: Boolean(src.canCreateProducts),
        canEditProductDetails: Boolean(src.canEditProductDetails),
        canEditProductPricingStock: Boolean(src.canEditProductPricingStock),
        canDeleteProducts: Boolean(src.canDeleteProducts),
        canDiscontinueProducts: Boolean(src.canDiscontinueProducts)
    };
}

function setProductsTableMessage(message) {
    const tbody = document.getElementById('tbodyProductos');
    if (!tbody) return;
    tbody.textContent = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-center text-muted py-3';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// Genera los botones de acción de cada fila según las capacidades de UI autorizadas por el backend
function renderAccionesProducto(row, permisos = permisosActuales) {
    const idSeguro = escapeHtml(row?.productId ?? row?.ProductId ?? '');
    const p = normalizarPermisosProductos(permisos);
    const yaDescontinuado = Boolean(row?.discontinued ?? row?.Discontinued);

    const botones = [];
    if (p.canEditProductPricingStock || p.canEditProductDetails) {
        const hasMore = p.canDiscontinueProducts || p.canDeleteProducts;
        botones.push(
            `<button type="button" class="btn btn-sm btn-outline-primary${hasMore ? ' me-1' : ''}" data-action="editar" data-id="${idSeguro}">Editar</button>`
        );
    }

    if (p.canDiscontinueProducts) {
        botones.push(
            `<button type="button" class="btn btn-sm ${yaDescontinuado ? 'btn-secondary' : 'btn-outline-warning'}${p.canDeleteProducts ? ' me-1' : ''}" data-action="descontinuar" data-id="${idSeguro}"${yaDescontinuado ? ' disabled' : ''}>${yaDescontinuado ? 'Descontinuado' : 'Descontinuar'}</button>`
        );
    }

    if (p.canDeleteProducts) {
        botones.push(
            `<button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" data-id="${idSeguro}">Eliminar</button>`
        );
    }

    return botones.join('');
}

// Adapta dinámicamente los controles de la vista y del modal según las capacidades de UI autorizadas por el backend
function aplicarPermisosProductos(permisos = permisosActuales) {
    permisosActuales = normalizarPermisosProductos(permisos);
    const puedeCrear = permisosActuales.canCreateProducts;
    const puedeEditarDetalles = permisosActuales.canEditProductDetails;
    const puedeEditarStockPrecio = permisosActuales.canEditProductPricingStock || puedeEditarDetalles;
    const puedeEliminar = permisosActuales.canDeleteProducts;
    const puedeDescontinuar = permisosActuales.canDiscontinueProducts;

    const btnNuevo = document.getElementById('btnNuevoProducto');
    if (btnNuevo) {
        setElementVisibility(btnNuevo, puedeCrear);
    }

    for (const btn of document.querySelectorAll('button[data-action="eliminar"]')) {
        setElementVisibility(btn, puedeEliminar);
    }
    for (const btn of document.querySelectorAll('button[data-action="descontinuar"]')) {
        setElementVisibility(btn, puedeDescontinuar);
    }

    // Restricción de campos en el modal según capacidades autorizadas
    const prodName = document.getElementById('prodName');
    const prodDiscontinued = document.getElementById('prodDiscontinued');
    const prodPrice = document.getElementById('prodPrice');
    const prodStock = document.getElementById('prodStock');

    if (prodName) {
        prodName.disabled = !puedeEditarDetalles;
        prodName.readOnly = !puedeEditarDetalles;
        if (!puedeEditarDetalles) {
            prodName.setAttribute('readonly', 'true');
            prodName.setAttribute('disabled', 'true');
        } else {
            prodName.removeAttribute('readonly');
            prodName.removeAttribute('disabled');
        }
    }

    if (prodDiscontinued) {
        prodDiscontinued.disabled = !puedeEditarDetalles;
        if (!puedeEditarDetalles) {
            prodDiscontinued.setAttribute('disabled', 'true');
        } else {
            prodDiscontinued.removeAttribute('disabled');
        }
    }

    if (prodPrice) {
        prodPrice.disabled = !puedeEditarStockPrecio;
        prodPrice.readOnly = !puedeEditarStockPrecio;
    }

    if (prodStock) {
        prodStock.disabled = !puedeEditarStockPrecio;
        prodStock.readOnly = !puedeEditarStockPrecio;
    }
}

// Limpia todos los estados de validación del formulario modal (TASK-F3-04)
function limpiarValidacionModal() {
    const form = document.getElementById('formProducto');
    if (form) {
        form.classList.remove('was-validated');
    }

    const fieldIds = ['prodName', 'prodPrice', 'prodStock', 'prodDiscontinued'];
    for (const id of fieldIds) {
        const input = document.getElementById(id);
        if (input) {
            input.classList.remove('is-invalid', 'is-valid');
            input.removeAttribute('aria-invalid');
        }
    }

    for (const [feedbackId, defaultText] of Object.entries(DEFAULT_FEEDBACK_MESSAGES)) {
        const feedbackEl = document.getElementById(feedbackId);
        if (feedbackEl) {
            feedbackEl.textContent = defaultText;
        }
    }

    const alertModal = document.getElementById('alertModalProducto');
    if (alertModal) {
        alertModal.textContent = '';
        setElementVisibility(alertModal, false);
    }
}

// Muestra notificación Toast no bloqueante para operaciones de productos (TASK-F3-04 / TASK-F3-05)
function mostrarToastProducto(mensaje, tipo = 'success') {
    const textoSeguro = String(mensaje || '');

    let container = document.getElementById('toastContainerProductos');
    if (!container && document.body) {
        container = document.createElement('div');
        container.id = 'toastContainerProductos';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
    }

    let toastEl = document.getElementById('toastProducto');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'toastProducto';
        toastEl.setAttribute('role', 'status');
        (container || document.body)?.appendChild(toastEl);
    }

    let bodyEl = document.getElementById('toastProductoMensaje');
    if (!bodyEl) {
        bodyEl = document.createElement('div');
        bodyEl.id = 'toastProductoMensaje';
        bodyEl.className = 'toast-body fw-semibold';
        toastEl.appendChild(bodyEl);
    }

    const colorClass = tipo === 'danger' || tipo === 'error'
        ? 'text-bg-danger'
        : (tipo === 'warning' ? 'text-bg-warning' : 'text-bg-success');

    toastEl.className = `toast align-items-center ${colorClass} border-0 show`;
    toastEl.dataset.tipo = tipo;
    bodyEl.textContent = textoSeguro;

    setElementVisibility(toastEl, true);

    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        try {
            const toastInstance = bootstrap.Toast.getOrCreateInstance
                ? bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3500 })
                : new bootstrap.Toast(toastEl, { delay: 3500 });
            toastInstance.show();
        } catch {
            // Fallback visual directo ya aplicado
        }
    }

    return toastEl;
}

async function listarProductos() {
    try {
        const resultado = await productService.getAll();

        productosCache = Array.isArray(resultado)
            ? resultado
            : (Array.isArray(resultado?.products) ? resultado.products : []);

        const total = resultado?.totalProducts ?? productosCache.length;
        const lblTotal = document.getElementById('lblTotalProductos');
        if (lblTotal) {
            lblTotal.textContent = String(total);
        }

        if (tabla) {
            tabla.clear().rows.add(productosCache).draw();
        } else if (productosCache.length === 0) {
            setProductsTableMessage('No se encontraron productos.');
        }

        aplicarPermisosProductos(permisosActuales);
        return productosCache;
    } catch (err) {
        if (tabla) {
            tabla.clear().draw();
        } else {
            setProductsTableMessage('No se pudieron cargar los productos.');
        }
        mostrarToastProducto(`Error al listar productos: ${extractProblemMessage(err, 'Error desconocido')}`, 'danger');
        return [];
    }
}

function abrirModalNuevoProducto() {
    if (!permisosActuales.canCreateProducts) return false;

    const form = document.getElementById('formProducto');
    if (form && typeof form.reset === 'function') {
        form.reset();
    }

    limpiarValidacionModal();

    const prodId = document.getElementById('prodId');
    const prodName = document.getElementById('prodName');
    const prodPrice = document.getElementById('prodPrice');
    const prodStock = document.getElementById('prodStock');
    const prodDiscontinued = document.getElementById('prodDiscontinued');
    const modalTitulo = document.getElementById('modalTitulo');

    if (prodId) prodId.value = '';
    if (prodName) prodName.value = '';
    if (prodPrice) prodPrice.value = '';
    if (prodStock) prodStock.value = '';
    if (prodDiscontinued) prodDiscontinued.checked = false;
    if (modalTitulo) modalTitulo.textContent = 'Nuevo Producto';

    aplicarPermisosProductos(permisosActuales);
    modalInstancia?.show();
    return true;
}

function editarProducto(id) {
    const numericId = Number(id);
    const prod = productosCache.find((p) => Number(p?.productId ?? p?.ProductId) === numericId);
    if (!prod) return null;

    limpiarValidacionModal();

    const prodId = document.getElementById('prodId');
    const prodName = document.getElementById('prodName');
    const prodPrice = document.getElementById('prodPrice');
    const prodStock = document.getElementById('prodStock');
    const prodDiscontinued = document.getElementById('prodDiscontinued');
    const modalTitulo = document.getElementById('modalTitulo');

    const resolvedId = prod.productId ?? prod.ProductId;
    const resolvedName = prod.productName ?? prod.ProductName ?? '';
    const resolvedPrice = prod.unitPrice ?? prod.UnitPrice ?? '';
    const resolvedStock = prod.unitsInStock ?? prod.UnitsInStock ?? 0;
    const resolvedDisc = Boolean(prod.discontinued ?? prod.Discontinued);

    if (prodId) prodId.value = String(resolvedId);
    if (prodName) prodName.value = resolvedName;
    if (prodPrice) prodPrice.value = resolvedPrice;
    if (prodStock) prodStock.value = resolvedStock;
    if (prodDiscontinued) prodDiscontinued.checked = resolvedDisc;
    if (modalTitulo) modalTitulo.textContent = `Editar Producto #${resolvedId}`;

    aplicarPermisosProductos(permisosActuales);
    modalInstancia?.show();
    return prod;
}

function setFieldInvalidState(inputEl, feedbackEl, message) {
    if (inputEl) {
        inputEl.classList.remove('is-valid');
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
    }
    if (feedbackEl && message) {
        feedbackEl.textContent = message;
    }
}

// Procesa el alta o edición del producto desde el modal unificado (TASK-F3-04)
async function guardarProductoModal(eventOrData = null) {
    if (eventOrData && typeof eventOrData.preventDefault === 'function') {
        eventOrData.preventDefault();
    }

    limpiarValidacionModal();

    const isDirectData = Boolean(
        eventOrData &&
        typeof eventOrData === 'object' &&
        typeof eventOrData.preventDefault !== 'function'
    );

    const form = document.getElementById('formProducto');
    const prodIdEl = document.getElementById('prodId');
    const prodNameEl = document.getElementById('prodName');
    const prodPriceEl = document.getElementById('prodPrice');
    const prodStockEl = document.getElementById('prodStock');
    const prodDiscontinuedEl = document.getElementById('prodDiscontinued');
    const feedbackNameEl = document.getElementById('feedbackProdName');
    const feedbackPriceEl = document.getElementById('feedbackProdPrice');
    const feedbackStockEl = document.getElementById('feedbackProdStock');
    const alertModalEl = document.getElementById('alertModalProducto');
    const btnGuardar = document.getElementById('btnGuardar');

    const rawId = isDirectData && eventOrData.productId !== undefined
        ? eventOrData.productId
        : (prodIdEl ? prodIdEl.value : '');
    const idStr = String(rawId ?? '').trim();
    const esEdicion = Boolean(idStr !== '');
    const numericId = esEdicion ? Number(idStr) : null;

    if (!esEdicion && !permisosActuales.canCreateProducts) {
        const msg = 'Operación no permitida: No tienes permisos para crear nuevos productos.';
        if (alertModalEl) {
            alertModalEl.textContent = msg;
            setElementVisibility(alertModalEl, true);
        }
        return { ok: false, status: 403, message: msg };
    }

    let rawName = isDirectData && eventOrData.productName !== undefined
        ? eventOrData.productName
        : (prodNameEl ? prodNameEl.value : '');
    const rawPrice = isDirectData && eventOrData.unitPrice !== undefined
        ? eventOrData.unitPrice
        : (prodPriceEl ? prodPriceEl.value : '');
    const rawStock = isDirectData && eventOrData.unitsInStock !== undefined
        ? eventOrData.unitsInStock
        : (prodStockEl ? prodStockEl.value : '');
    let rawDiscontinued = isDirectData && eventOrData.discontinued !== undefined
        ? eventOrData.discontinued
        : (prodDiscontinuedEl ? Boolean(prodDiscontinuedEl.checked) : false);

    // Si no tiene permiso para editar detalles, preservar el nombre y estado descontinuado originales del producto
    if (esEdicion && !permisosActuales.canEditProductDetails) {
        const prodOriginal = productosCache.find((p) => Number(p?.productId ?? p?.ProductId) === numericId);
        if (prodOriginal) {
            rawName = prodOriginal.productName ?? prodOriginal.ProductName ?? rawName;
            rawDiscontinued = Boolean(prodOriginal.discontinued ?? prodOriginal.Discontinued);
            if (prodNameEl) prodNameEl.value = rawName;
            if (prodDiscontinuedEl) prodDiscontinuedEl.checked = rawDiscontinued;
        }
    }

    const dtoForValidation = {
        productName: typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim(),
        unitPrice: (rawPrice === '' || rawPrice === null || rawPrice === undefined) ? null : Number(rawPrice),
        unitsInStock: (rawStock === '' || rawStock === null || rawStock === undefined) ? null : Number(rawStock),
        discontinued: typeof rawDiscontinued === 'boolean' ? rawDiscontinued : Boolean(rawDiscontinued)
    };

    const validationErrors = validateProduct(dtoForValidation, {
        existingProducts: productosCache,
        excludeProductId: esEdicion ? numericId : null
    });

    if (!validationErrors.valid || validationErrors.length > 0) {
        const fe = validationErrors.fieldErrors || {};
        if (fe.productName) {
            setFieldInvalidState(prodNameEl, feedbackNameEl, fe.productName);
        }
        if (fe.unitPrice) {
            setFieldInvalidState(prodPriceEl, feedbackPriceEl, fe.unitPrice);
        }
        if (fe.unitsInStock) {
            setFieldInvalidState(prodStockEl, feedbackStockEl, fe.unitsInStock);
        }
        if (fe.discontinued && prodDiscontinuedEl) {
            prodDiscontinuedEl.classList.add('is-invalid');
        }

        if (form) {
            form.classList.add('was-validated');
        }

        const mainErrorMsg = validationErrors[0] || 'Verifica los datos ingresados en el formulario.';
        if (alertModalEl) {
            alertModalEl.textContent = mainErrorMsg;
            setElementVisibility(alertModalEl, true);
        }

        return {
            ok: false,
            valid: false,
            errors: Array.from(validationErrors),
            fieldErrors: fe
        };
    }

    const payload = ProductModel.createPayload({
        productId: esEdicion ? numericId : null,
        productName: dtoForValidation.productName,
        unitPrice: dtoForValidation.unitPrice,
        unitsInStock: dtoForValidation.unitsInStock,
        discontinued: dtoForValidation.discontinued
    });

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
    }

    try {
        const resp = esEdicion
            ? await productService.update(numericId, payload)
            : await productService.create(payload);

        if (resp && resp.ok === false) {
            const status = Number(resp.status || resp.problemDetails?.status) || 400;
            const errObj = new Error(extractProblemMessage(resp, 'Error al guardar el producto.'));
            errObj.status = status;
            errObj.problemDetails = resp.problemDetails || resp.data || { status, detail: errObj.message };
            throw errObj;
        }

        modalInstancia?.hide();
        limpiarValidacionModal();
        await listarProductos();

        const toastMsg = esEdicion
            ? 'Producto actualizado exitosamente.'
            : 'Producto creado exitosamente.';
        mostrarToastProducto(toastMsg, 'success');

        return {
            ok: true,
            status: esEdicion ? 204 : 201,
            data: resp?.data ?? resp
        };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 400;
        const friendlyMsg = extractProblemMessage(err, 'No se pudo guardar el producto.');
        const pdErrors = err?.problemDetails?.errors || err?.errors || null;

        let matchedField = false;
        if (pdErrors && typeof pdErrors === 'object') {
            for (const [key, val] of Object.entries(pdErrors)) {
                const msg = Array.isArray(val) ? val[0] : String(val || friendlyMsg);
                if (/name|nombre/i.test(key)) {
                    setFieldInvalidState(prodNameEl, feedbackNameEl, msg);
                    matchedField = true;
                } else if (/price|precio/i.test(key)) {
                    setFieldInvalidState(prodPriceEl, feedbackPriceEl, msg);
                    matchedField = true;
                } else if (/stock|existencia/i.test(key)) {
                    setFieldInvalidState(prodStockEl, feedbackStockEl, msg);
                    matchedField = true;
                }
            }
        }

        if (!matchedField) {
            if (/precio|unitprice/i.test(friendlyMsg)) {
                setFieldInvalidState(prodPriceEl, feedbackPriceEl, friendlyMsg);
            } else if (/stock|existencia|unitsinstock/i.test(friendlyMsg)) {
                setFieldInvalidState(prodStockEl, feedbackStockEl, friendlyMsg);
            } else {
                setFieldInvalidState(prodNameEl, feedbackNameEl, friendlyMsg);
            }
        }

        if (alertModalEl) {
            alertModalEl.textContent = friendlyMsg;
            setElementVisibility(alertModalEl, true);
        }

        return {
            ok: false,
            status,
            message: friendlyMsg,
            problemDetails: err?.problemDetails || null
        };
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar';
        }
    }
}

function ensureConflict409Elements() {
    let modalEl = document.getElementById('modalConflicto409');
    if (!modalEl && document.body) {
        modalEl = document.createElement('div');
        modalEl.id = 'modalConflicto409';
        modalEl.className = 'modal fade d-none';
        document.body.appendChild(modalEl);
    }

    let alertEl = document.getElementById('alertConflicto409');
    if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.id = 'alertConflicto409';
        alertEl.className = 'alert alert-warning d-none mb-2';
        alertEl.setAttribute('role', 'alert');
        (modalEl || document.body)?.appendChild(alertEl);
    }

    let detalleEl = document.getElementById('detalleConflicto409');
    if (!detalleEl) {
        detalleEl = document.createElement('p');
        detalleEl.id = 'detalleConflicto409';
        detalleEl.className = 'small text-muted mb-0';
        modalEl?.appendChild(detalleEl);
    }

    let btnDescontinuar = document.getElementById('btnDescontinuarDesde409');
    if (!btnDescontinuar) {
        btnDescontinuar = document.createElement('button');
        btnDescontinuar.type = 'button';
        btnDescontinuar.id = 'btnDescontinuarDesde409';
        btnDescontinuar.className = 'btn btn-warning fw-semibold';
        btnDescontinuar.textContent = 'Descontinuar Producto';
        (modalEl || alertEl)?.appendChild(btnDescontinuar);
    }

    return { modalEl, alertEl, detalleEl, btnDescontinuar };
}

function ocultarConflicto409() {
    const modalEl = document.getElementById('modalConflicto409');
    const alertEl = document.getElementById('alertConflicto409');

    if (modal409Instancia && typeof modal409Instancia.hide === 'function') {
        modal409Instancia.hide();
    }
    if (modalEl) {
        modalEl.classList.remove('show');
        setElementVisibility(modalEl, false);
    }
    if (alertEl) {
        setElementVisibility(alertEl, false);
    }
}

// Despliega el modal/alerta dedicado para conflicto 409 con acción rápida de descontinuación (TASK-F3-05)
function mostrarConflicto409(id, problemDetails = null) {
    const { modalEl, alertEl, detalleEl, btnDescontinuar } = ensureConflict409Elements();
    const numericId = Number(id);

    if (alertEl) {
        alertEl.textContent = CONFLICT_409_MESSAGE;
        setElementVisibility(alertEl, true);
    }

    if (detalleEl) {
        const extraDetail = problemDetails?.detail && problemDetails.detail !== CONFLICT_409_MESSAGE
            ? String(problemDetails.detail)
            : '';
        detalleEl.textContent = extraDetail;
    }

    if (btnDescontinuar) {
        btnDescontinuar.textContent = 'Descontinuar Producto';
        btnDescontinuar.dataset.id = String(numericId);
        btnDescontinuar.disabled = false;
        btnDescontinuar.onclick = async (e) => {
            e?.preventDefault?.();
            const targetId = Number(btnDescontinuar.dataset.id || numericId);
            await manejarDescontinuacionProducto(targetId);
        };
    }

    if (modalEl) {
        setElementVisibility(modalEl, true);
        modalEl.classList.add('show');

        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            try {
                modal409Instancia = bootstrap.Modal.getOrCreateInstance
                    ? bootstrap.Modal.getOrCreateInstance(modalEl)
                    : new bootstrap.Modal(modalEl);
                modal409Instancia.show();
            } catch {
                // Fallback visual directo ya aplicado
            }
        }
    }

    return {
        modalEl,
        alertEl,
        btnDescontinuar,
        message: CONFLICT_409_MESSAGE
    };
}

// Descontinúa lógicamente un producto (discontinued = true)
async function manejarDescontinuacionProducto(id, prod = null) {
    if (!permisosActuales.canDiscontinueProducts) {
        return { ok: false, status: 403, message: 'No tienes permisos para descontinuar productos.' };
    }

    const numericId = Number(id);
    const cachedProd = prod || productosCache.find((p) => Number(p?.productId ?? p?.ProductId) === numericId) || null;

    try {
        await productService.discontinue(numericId, cachedProd);

        if (cachedProd) {
            cachedProd.discontinued = true;
        }

        ocultarConflicto409();
        await listarProductos();
        mostrarToastProducto(`Producto #${numericId} marcado como descontinuado.`, 'warning');

        return {
            ok: true,
            status: 204,
            productId: numericId,
            discontinued: true
        };
    } catch (err) {
        const msg = extractProblemMessage(err, 'No se pudo descontinuar el producto.');
        mostrarToastProducto(msg, 'danger');
        return {
            ok: false,
            status: Number(err?.status || err?.problemDetails?.status) || 500,
            message: msg
        };
    }
}

// Ejecuta eliminación física o captura HTTP 409 Conflict ofreciendo descontinuación lógica
async function manejarEliminacionProducto(id, btnElement = null, { skipConfirm = false } = {}) {
    if (!permisosActuales.canDeleteProducts) {
        return { ok: false, status: 403, message: 'No tienes permisos para eliminar productos.' };
    }

    const numericId = Number(id);

    if (!skipConfirm && btnElement !== null) {
        if (!confirmAction(`¿Estás seguro de eliminar el producto #${numericId}?`)) {
            return { ok: false, cancelled: true };
        }
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Eliminando...';
    }

    try {
        const resp = await productService.delete(numericId);

        if (resp && resp.ok === false) {
            const status = Number(resp.status || resp.problemDetails?.status) || 500;
            if (status === 409) {
                const pd = resp.problemDetails || resp.data || { status: 409, detail: CONFLICT_409_MESSAGE };
                mostrarConflicto409(numericId, pd);
                return {
                    ok: false,
                    status: 409,
                    conflict: true,
                    message: CONFLICT_409_MESSAGE,
                    problemDetails: pd
                };
            }

            const errObj = new Error(extractProblemMessage(resp, `No se pudo eliminar (HTTP ${status})`));
            errObj.status = status;
            errObj.problemDetails = resp.problemDetails || null;
            throw errObj;
        }

        await listarProductos();
        mostrarToastProducto('Producto eliminado exitosamente.', 'success');
        return {
            ok: true,
            status: 204,
            productId: numericId
        };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 0;
        if (status === 409 || /409|conflict|integridad|vinculad|hist[oó]ric/i.test(String(err?.message || ''))) {
            const pd = err?.problemDetails || {
                status: 409,
                title: err?.title || 'Conflicto de integridad referencial',
                detail: err?.detail || err?.message || CONFLICT_409_MESSAGE
            };
            mostrarConflicto409(numericId, pd);
            return {
                ok: false,
                status: 409,
                conflict: true,
                message: CONFLICT_409_MESSAGE,
                problemDetails: pd
            };
        }

        const msg = extractProblemMessage(err, 'Error al eliminar el producto.');
        mostrarToastProducto(msg, 'danger');
        return {
            ok: false,
            status: status || 500,
            message: msg
        };
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.textContent = 'Eliminar';
        }
    }
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') {
        tabla = null;
        return;
    }
    tabla = new DataTable('#tablaProductos', baseTableOptions({
        order: [[0, 'asc']],
        columns: [
            { data: 'productId', render: display((d) => `<strong>${escapeHtml(d)}</strong>`) },
            { data: 'productName', render: safeTextRender('-') },
            {
                data: 'unitPrice',
                defaultContent: 0,
                render: display((d) => `$${d != null ? parseFloat(d).toFixed(2) : '0.00'}`)
            },
            { data: 'unitsInStock', defaultContent: 0, render: display((d) => escapeHtml(d ?? 0)) },
            {
                data: 'discontinued',
                defaultContent: false,
                render: (d, type) => {
                    const texto = d ? 'Descontinuado' : 'Activo';
                    if (type !== 'display') return texto;
                    return d
                        ? '<span class="badge bg-danger">Descontinuado</span>'
                        : '<span class="badge bg-success">Activo</span>';
                }
            },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center text-nowrap',
                render: (_, __, row) => renderAccionesProducto(row, permisosActuales)
            }
        ]
    }));
}

function configurarEventos() {
    const form = document.getElementById('formProducto');
    const btnNuevo = document.getElementById('btnNuevoProducto');
    const modalEl = document.getElementById('modalProducto');
    const btnCancelarModal = document.getElementById('btnCancelarModalProducto');
    const btnCerrar409 = document.getElementById('btnCerrarConflicto409');

    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            abrirModalNuevoProducto();
        });
    }

    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            limpiarValidacionModal();
        });
    }

    if (btnCancelarModal) {
        btnCancelarModal.addEventListener('click', () => {
            limpiarValidacionModal();
        });
    }

    if (btnCerrar409) {
        btnCerrar409.addEventListener('click', () => {
            ocultarConflicto409();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            await guardarProductoModal(e);
        });
    }

    const tablaEl = document.getElementById('tablaProductos');
    if (tablaEl) {
        tablaEl.addEventListener('click', async (e) => {
            const btn = e?.target?.closest?.('button[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = parseInt(btn.dataset.id, 10);
            if (Number.isNaN(id)) return;

            if (action === 'editar') {
                editarProducto(id);
            } else if (action === 'descontinuar' && permisosActuales.canDiscontinueProducts) {
                await manejarDescontinuacionProducto(id);
            } else if (action === 'eliminar' && permisosActuales.canDeleteProducts) {
                await manejarEliminacionProducto(id, btn);
            }
        });
    }
}

async function initProductsController() {
    const usuario = await initAuthenticatedView({
        authService,
        requiredPermission: 'canViewProductsAdmin'
    });
    if (!usuario) return;

    permisosActuales = normalizarPermisosProductos(resolveConnectedPermissions(usuario, authService));
    aplicarPermisosProductos(permisosActuales);

    const modalEl = document.getElementById('modalProducto');
    if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        modalInstancia = new bootstrap.Modal(modalEl);
    }

    inicializarTabla();
    configurarEventos();
    await listarProductos();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authService.isAuthenticated() ||
            !authService.hasPermission('canViewProductsAdmin')
        ) {
            return;
        }
        await initProductsController();
    });
}
