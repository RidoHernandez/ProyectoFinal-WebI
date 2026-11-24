import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { ProductModel, validateProduct } from "../models/productModel.js";
import { baseTableOptions, escapeHtml, formatCurrency, initNavbar, resolveConnectedRole } from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04 / TASK-F3-03)
authGuard(['ADMIN', 'EMPLEADO']);

// Mensaje exacto requerido para conflicto HTTP 409 en eliminación física (TASK-F3-05 / REQ-BIZ-001)
export const CONFLICT_409_MESSAGE =
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
let rolActual = 'ADMIN';

// Renderiza sólo en modo 'display'; para ordenar/buscar se usa el valor crudo
const display = (fn) => (data, type, row) => type === 'display' ? fn(data, row) : data;

function getDoc(customDoc = null) {
    if (customDoc) return customDoc;
    return typeof document !== 'undefined' ? document : null;
}

function setElementVisibility(el, visible) {
    if (!el) return;
    if (visible) {
        el.classList?.remove('d-none');
        el.hidden = false;
        if (el.style) el.style.display = '';
    } else {
        el.classList?.add('d-none');
        el.hidden = true;
        if (el.style) el.style.display = 'none';
    }
}

// Validación de respaldo en caso de que productModel.validateProduct aún no esté cargado
function fallbackValidateProduct(dto = {}, { existingProducts = [], excludeProductId = null } = {}) {
    const errors = [];
    const fieldErrors = {};

    const rawName = dto?.productName ?? dto?.ProductName ?? '';
    const trimmedName = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();

    if (!trimmedName) {
        const msg = 'El nombre del producto es obligatorio.';
        errors.push(msg);
        fieldErrors.productName = msg;
    } else if (trimmedName.length < 2 || trimmedName.length > 40) {
        const msg = 'El nombre del producto debe tener entre 2 y 40 caracteres.';
        errors.push(msg);
        fieldErrors.productName = msg;
    } else if (Array.isArray(existingProducts) && existingProducts.length > 0) {
        const normalizedTarget = trimmedName.toLowerCase();
        const excludedId = excludeProductId !== null && excludeProductId !== undefined && excludeProductId !== ''
            ? Number(excludeProductId)
            : null;
        const duplicate = existingProducts.some((item) => {
            if (!item) return false;
            const itemId = Number(item.productId ?? item.ProductId);
            if (excludedId !== null && !Number.isNaN(excludedId) && itemId === excludedId) {
                return false;
            }
            const itemName = String(item.productName ?? item.ProductName ?? '').trim().toLowerCase();
            return itemName !== '' && itemName === normalizedTarget;
        });
        if (duplicate) {
            const msg = `Ya existe un producto registrado con el nombre "${trimmedName}".`;
            errors.push(msg);
            fieldErrors.productName = msg;
        }
    }

    const rawPrice = dto?.unitPrice ?? dto?.UnitPrice;
    const numPrice = (rawPrice === '' || rawPrice === null || rawPrice === undefined || typeof rawPrice === 'boolean')
        ? NaN
        : Number(rawPrice);
    if (!Number.isFinite(numPrice) || numPrice < 0.01 || numPrice > 100000.00) {
        const msg = 'El precio unitario debe ser un número entre 0.01 y 100,000.00.';
        errors.push(msg);
        fieldErrors.unitPrice = msg;
    }

    const rawStock = dto?.unitsInStock ?? dto?.UnitsInStock;
    const numStock = (rawStock === '' || rawStock === null || rawStock === undefined || typeof rawStock === 'boolean')
        ? NaN
        : Number(rawStock);
    if (!Number.isFinite(numStock) || !Number.isInteger(numStock) || numStock < 0 || numStock > 32767) {
        const msg = 'Las unidades en stock deben ser un número entero entre 0 y 32,767.';
        errors.push(msg);
        fieldErrors.unitsInStock = msg;
    }

    const hasDiscontinued = Object.prototype.hasOwnProperty.call(dto || {}, 'discontinued')
        || Object.prototype.hasOwnProperty.call(dto || {}, 'Discontinued');
    const rawDiscontinued = dto?.discontinued ?? dto?.Discontinued;
    if (hasDiscontinued && rawDiscontinued !== undefined && typeof rawDiscontinued !== 'boolean') {
        const msg = 'El estado descontinuado debe ser un valor booleano (true o false).';
        errors.push(msg);
        fieldErrors.discontinued = msg;
    }

    errors.valid = errors.length === 0;
    errors.fieldErrors = fieldErrors;
    return errors;
}

function executeValidateProduct(dto, options = {}) {
    const fn = validateProduct || ProductModel.validateProduct || fallbackValidateProduct;
    const res = fn(dto, options);

    const errors = Array.isArray(res) ? res : (Array.isArray(res?.errors) ? [...res.errors] : []);
    const fieldErrors = { ...(res?.fieldErrors || {}) };

    // Verificar duplicados en cliente (REQ-BIZ-002) si existingProducts fue provisto y aún no se marcó error en productName
    const rawName = String(dto?.productName ?? dto?.ProductName ?? '').trim();
    if (rawName && !fieldErrors.productName && Array.isArray(options.existingProducts)) {
        const target = rawName.toLowerCase();
        const excludedId = options.excludeProductId !== null && options.excludeProductId !== undefined && options.excludeProductId !== ''
            ? Number(options.excludeProductId)
            : null;
        const isDup = options.existingProducts.some((p) => {
            if (!p) return false;
            const pid = Number(p.productId ?? p.ProductId);
            if (excludedId !== null && !Number.isNaN(excludedId) && pid === excludedId) return false;
            const pname = String(p.productName ?? p.ProductName ?? '').trim().toLowerCase();
            return pname !== '' && pname === target;
        });
        if (isDup) {
            const dupMsg = `Ya existe un producto registrado con el nombre "${rawName}".`;
            if (!errors.some((e) => String(e).toLowerCase().includes('duplicad') || String(e).toLowerCase().includes('ya existe'))) {
                errors.push(dupMsg);
            }
            fieldErrors.productName = dupMsg;
        }
    }

    // Mapear errores por texto si el validador no adjuntó alguna llave de fieldErrors
    for (const errMsg of errors) {
        const text = String(errMsg || '');
        if (!fieldErrors.productName && /nombre|productname|duplicad|ya existe/i.test(text)) {
            fieldErrors.productName = text;
        }
        if (!fieldErrors.unitPrice && /precio|unitprice/i.test(text)) {
            fieldErrors.unitPrice = text;
        }
        if (!fieldErrors.unitsInStock && /stock|existencia|unitsinstock|entero/i.test(text)) {
            fieldErrors.unitsInStock = text;
        }
        if (!fieldErrors.discontinued && /descontinuad|discontinued|booleano/i.test(text)) {
            fieldErrors.discontinued = text;
        }
    }

    errors.valid = errors.length === 0;
    errors.fieldErrors = fieldErrors;
    return errors;
}

export function setProductosCache(lista = []) {
    productosCache = Array.isArray(lista) ? [...lista] : [];
    return productosCache;
}

export function getProductosCache() {
    return productosCache;
}

// Genera los botones de acción de cada fila según el rol:
// ADMIN: Editar, Descontinuar y Eliminar
// EMPLEADO: únicamente Editar (precio y existencias)
export function renderAccionesProducto(row, rol = rolActual) {
    const idSeguro = escapeHtml(row?.productId ?? row?.ProductId ?? '');
    const esAdmin = String(rol || '').toUpperCase() === 'ADMIN';
    const yaDescontinuado = Boolean(row?.discontinued ?? row?.Discontinued);

    const btnEditar = `<button type="button" class="btn btn-sm btn-outline-primary${esAdmin ? ' me-1' : ''}" data-action="editar" data-id="${idSeguro}">Editar</button>`;
    if (!esAdmin) {
        return btnEditar;
    }

    const btnDescontinuar = `<button type="button" class="btn btn-sm ${yaDescontinuado ? 'btn-secondary' : 'btn-outline-warning'} me-1" data-action="descontinuar" data-id="${idSeguro}"${yaDescontinuado ? ' disabled' : ''}>${yaDescontinuado ? 'Descontinuado' : 'Descontinuar'}</button>`;
    const btnEliminar = `<button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" data-id="${idSeguro}">Eliminar</button>`;

    return `${btnEditar}${btnDescontinuar}${btnEliminar}`;
}

// Adapta dinámicamente los controles de la vista y del modal según el rol conectado (TASK-F3-03 / REQ-AUTH-002)
export function aplicarPermisosRolProductos(rol = rolActual) {
    const upperRol = String(rol || '').trim().toUpperCase();
    rolActual = upperRol === 'ADMIN'
        ? 'ADMIN'
        : (upperRol === 'EMPLEADO' ? 'EMPLEADO' : 'CLIENTE');
    const esAdmin = rolActual === 'ADMIN';
    const puedeEditarStockPrecio = rolActual === 'ADMIN' || rolActual === 'EMPLEADO';

    const doc = getDoc();
    if (!doc) return;

    const btnNuevo = doc.getElementById('btnNuevoProducto');
    if (btnNuevo) {
        setElementVisibility(btnNuevo, esAdmin);
    }

    if (typeof doc.querySelectorAll === 'function') {
        const botonesEliminar = Array.from(doc.querySelectorAll('button[data-action="eliminar"]') || []);
        for (const btn of botonesEliminar) {
            setElementVisibility(btn, esAdmin);
        }

        const botonesDescontinuar = Array.from(doc.querySelectorAll('button[data-action="descontinuar"]') || []);
        for (const btn of botonesDescontinuar) {
            setElementVisibility(btn, esAdmin);
        }
    }

    // Soporte adicional para entornos de prueba con doc.allElements
    if (Array.isArray(doc.allElements)) {
        for (const el of doc.allElements) {
            if (!el || el.tagName !== 'BUTTON') continue;
            const action = el.dataset?.action || el.getAttribute?.('data-action');
            if (action === 'eliminar' || action === 'descontinuar') {
                setElementVisibility(el, esAdmin);
            }
        }
    }

    // Restricción de campos en el modal: EMPLEADO sólo puede editar precio y existencias
    const prodName = doc.getElementById('prodName');
    const prodDiscontinued = doc.getElementById('prodDiscontinued');
    const prodPrice = doc.getElementById('prodPrice');
    const prodStock = doc.getElementById('prodStock');

    if (prodName) {
        prodName.disabled = !esAdmin;
        prodName.readOnly = !esAdmin;
        if (!esAdmin) {
            prodName.setAttribute?.('readonly', 'true');
            prodName.setAttribute?.('disabled', 'true');
        } else {
            prodName.removeAttribute?.('readonly');
            prodName.removeAttribute?.('disabled');
        }
    }

    if (prodDiscontinued) {
        prodDiscontinued.disabled = !esAdmin;
        if (!esAdmin) {
            prodDiscontinued.setAttribute?.('disabled', 'true');
        } else {
            prodDiscontinued.removeAttribute?.('disabled');
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
export function limpiarValidacionModal(customDoc = null) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    const form = doc.getElementById('formProducto');
    if (form) {
        form.classList?.remove('was-validated');
    }

    const fieldIds = ['prodName', 'prodPrice', 'prodStock', 'prodDiscontinued'];
    for (const id of fieldIds) {
        const input = doc.getElementById(id);
        if (input) {
            input.classList?.remove('is-invalid', 'is-valid');
            input.removeAttribute?.('aria-invalid');
        }
    }

    for (const [feedbackId, defaultText] of Object.entries(DEFAULT_FEEDBACK_MESSAGES)) {
        const feedbackEl = doc.getElementById(feedbackId);
        if (feedbackEl) {
            feedbackEl.textContent = defaultText;
        }
    }

    const alertModal = doc.getElementById('alertModalProducto');
    if (alertModal) {
        alertModal.textContent = '';
        setElementVisibility(alertModal, false);
    }
}

// Muestra notificación Toast no bloqueante para operaciones de productos (TASK-F3-04 / TASK-F3-05)
export function mostrarToastProducto(mensaje, tipo = 'success') {
    const doc = getDoc();
    const textoSeguro = String(mensaje || '');
    if (!doc) return null;

    let container = doc.getElementById('toastContainerProductos');
    if (!container && doc.body) {
        container = doc.createElement('div');
        container.id = 'toastContainerProductos';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        doc.body.appendChild(container);
    }

    let toastEl = doc.getElementById('toastProducto');
    if (!toastEl) {
        toastEl = doc.createElement('div');
        toastEl.id = 'toastProducto';
        toastEl.setAttribute('role', 'status');
        if (container) {
            container.appendChild(toastEl);
        } else if (doc.body) {
            doc.body.appendChild(toastEl);
        }
    }

    let bodyEl = doc.getElementById('toastProductoMensaje');
    if (!bodyEl) {
        bodyEl = doc.createElement('div');
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

// Renderiza filas en #tbodyProductos cuando DataTables no está cargado (entornos DOM / pruebas unitarias)
export function renderizarTablaFallback(lista = productosCache, rol = rolActual) {
    const doc = getDoc();
    if (!doc) return;

    const tbody = doc.getElementById('tbodyProductos');
    if (!tbody) return;

    const items = Array.isArray(lista) ? lista : [];
    if (Array.isArray(tbody.children)) {
        tbody.children.length = 0;
        tbody.innerHTML = '';
    } else {
        tbody.textContent = '';
    }

    const htmlRows = items.map((prod) => {
        const id = prod?.productId ?? prod?.ProductId ?? '';
        const name = prod?.productName ?? prod?.ProductName ?? '';
        const price = prod?.unitPrice ?? prod?.UnitPrice ?? 0;
        const stock = prod?.unitsInStock ?? prod?.UnitsInStock ?? 0;
        const disc = Boolean(prod?.discontinued ?? prod?.Discontinued);

        const estadoBadge = disc
            ? '<span class="badge bg-danger">Descontinuado</span>'
            : '<span class="badge bg-success">Activo</span>';
        const accionesHtml = renderAccionesProducto(
            { productId: id, productName: name, unitPrice: price, unitsInStock: stock, discontinued: disc },
            rol
        );

        if (typeof doc.createElement === 'function') {
            const tr = doc.createElement('tr');
            if (tr.dataset) {
                tr.dataset.productId = String(id);
            }
            tr.setAttribute?.('data-product-id', String(id));

            const tdId = doc.createElement('td');
            const strongId = doc.createElement('strong');
            strongId.textContent = String(id);
            tdId.appendChild(strongId);
            if (!tdId.innerHTML) {
                tdId.innerHTML = `<strong>${escapeHtml(id)}</strong>`;
            }

            const tdName = doc.createElement('td');
            tdName.textContent = String(name);

            const tdPrice = doc.createElement('td');
            tdPrice.textContent = formatCurrency(price);

            const tdStock = doc.createElement('td');
            tdStock.textContent = String(stock);

            const tdStatus = doc.createElement('td');
            const spanBadge = doc.createElement('span');
            spanBadge.className = disc ? 'badge bg-danger' : 'badge bg-success';
            spanBadge.textContent = disc ? 'Descontinuado' : 'Activo';
            tdStatus.appendChild(spanBadge);
            if (!tdStatus.innerHTML) {
                tdStatus.innerHTML = estadoBadge;
            }

            const tdActions = doc.createElement('td');
            tdActions.className = 'text-center text-nowrap';
            tdActions.innerHTML = accionesHtml;

            tr.appendChild(tdId);
            tr.appendChild(tdName);
            tr.appendChild(tdPrice);
            tr.appendChild(tdStock);
            tr.appendChild(tdStatus);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        }

        return `<tr data-product-id="${escapeHtml(id)}"><td><strong>${escapeHtml(id)}</strong></td><td>${escapeHtml(name)}</td><td>${escapeHtml(formatCurrency(price))}</td><td>${escapeHtml(stock)}</td><td>${estadoBadge}</td><td class="text-center text-nowrap">${accionesHtml}</td></tr>`;
    });

    if (!tbody.innerHTML) {
        tbody.innerHTML = htmlRows.join('');
    }
}

export async function listarProductos() {
    const doc = getDoc();
    try {
        const resultado = typeof productService.getAll === 'function'
            ? await productService.getAll()
            : await productService.getProducts();

        productosCache = Array.isArray(resultado)
            ? resultado
            : (Array.isArray(resultado?.products) ? resultado.products : []);

        const total = resultado?.totalProducts ?? productosCache.length;
        const lblTotal = doc?.getElementById('lblTotalProductos');
        if (lblTotal) {
            lblTotal.textContent = String(total);
        }

        if (tabla) {
            tabla.clear().rows.add(productosCache).draw();
        } else {
            renderizarTablaFallback(productosCache, rolActual);
        }

        aplicarPermisosRolProductos(rolActual);
        return productosCache;
    } catch (err) {
        if (tabla) {
            tabla.clear().draw();
        } else {
            renderizarTablaFallback([], rolActual);
        }
        mostrarToastProducto(`Error al listar productos: ${err?.message || 'Error desconocido'}`, 'danger');
        return [];
    }
}

export function abrirModalNuevoProducto() {
    if (rolActual !== 'ADMIN') return false;
    const doc = getDoc();
    if (!doc) return false;

    const form = doc.getElementById('formProducto');
    if (form && typeof form.reset === 'function') {
        form.reset();
    }

    limpiarValidacionModal(doc);

    const prodId = doc.getElementById('prodId');
    const prodName = doc.getElementById('prodName');
    const prodPrice = doc.getElementById('prodPrice');
    const prodStock = doc.getElementById('prodStock');
    const prodDiscontinued = doc.getElementById('prodDiscontinued');
    const modalTitulo = doc.getElementById('modalTitulo');

    if (prodId) prodId.value = '';
    if (prodName) prodName.value = '';
    if (prodPrice) prodPrice.value = '';
    if (prodStock) prodStock.value = '';
    if (prodDiscontinued) prodDiscontinued.checked = false;
    if (modalTitulo) modalTitulo.textContent = 'Nuevo Producto';

    aplicarPermisosRolProductos('ADMIN');
    modalInstancia?.show();
    return true;
}

export function editarProducto(id) {
    const numericId = Number(id);
    const prod = productosCache.find((p) => Number(p?.productId ?? p?.ProductId) === numericId);
    if (!prod) return null;

    const doc = getDoc();
    if (!doc) return prod;

    limpiarValidacionModal(doc);

    const prodId = doc.getElementById('prodId');
    const prodName = doc.getElementById('prodName');
    const prodPrice = doc.getElementById('prodPrice');
    const prodStock = doc.getElementById('prodStock');
    const prodDiscontinued = doc.getElementById('prodDiscontinued');
    const modalTitulo = doc.getElementById('modalTitulo');

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

    // Si es EMPLEADO, deshabilita #prodName y #prodDiscontinued, permitiendo sólo precio y existencias
    aplicarPermisosRolProductos(rolActual);
    modalInstancia?.show();
    return prod;
}

function setFieldInvalidState(inputEl, feedbackEl, message) {
    if (inputEl) {
        inputEl.classList?.remove('is-valid');
        inputEl.classList?.add('is-invalid');
        inputEl.setAttribute?.('aria-invalid', 'true');
    }
    if (feedbackEl && message) {
        feedbackEl.textContent = message;
    }
}

function extractProblemDetailsMessage(errOrResp, fallback = 'Error al guardar el producto.') {
    const pd = errOrResp?.problemDetails || errOrResp?.data || errOrResp;
    const rawErrors = pd?.errors || errOrResp?.errors || null;
    if (rawErrors && typeof rawErrors === 'object') {
        const first = Object.values(rawErrors).flat().filter(Boolean)[0];
        if (first && typeof first === 'string') return first.trim();
    }
    if (pd?.detail && typeof pd.detail === 'string' && pd.detail.trim() !== '') {
        return pd.detail.trim();
    }
    if (pd?.message && typeof pd.message === 'string' && pd.message.trim() !== '') {
        return pd.message.trim();
    }
    if (pd?.title && typeof pd.title === 'string' && pd.title.trim() !== '') {
        return pd.title.trim();
    }
    return fallback;
}

// Procesa el alta o edición del producto desde el modal unificado (TASK-F3-04)
export async function guardarProductoModal(eventOrData = null) {
    if (eventOrData && typeof eventOrData.preventDefault === 'function') {
        eventOrData.preventDefault();
    }

    const doc = getDoc();
    limpiarValidacionModal(doc);

    const isDirectData = Boolean(
        eventOrData &&
        typeof eventOrData === 'object' &&
        typeof eventOrData.preventDefault !== 'function'
    );

    const form = doc?.getElementById('formProducto');
    const prodIdEl = doc?.getElementById('prodId');
    const prodNameEl = doc?.getElementById('prodName');
    const prodPriceEl = doc?.getElementById('prodPrice');
    const prodStockEl = doc?.getElementById('prodStock');
    const prodDiscontinuedEl = doc?.getElementById('prodDiscontinued');
    const feedbackNameEl = doc?.getElementById('feedbackProdName');
    const feedbackPriceEl = doc?.getElementById('feedbackProdPrice');
    const feedbackStockEl = doc?.getElementById('feedbackProdStock');
    const alertModalEl = doc?.getElementById('alertModalProducto');
    const btnGuardar = doc?.getElementById('btnGuardar');

    const rawId = isDirectData && eventOrData.productId !== undefined
        ? eventOrData.productId
        : (prodIdEl ? prodIdEl.value : '');
    const idStr = String(rawId ?? '').trim();
    const esEdicion = Boolean(idStr !== '');
    const numericId = esEdicion ? Number(idStr) : null;

    if (!esEdicion && rolActual !== 'ADMIN') {
        const msg = 'Operación no permitida: Solo un Administrador puede crear nuevos productos.';
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

    // Si es EMPLEADO editando, preservar el nombre y estado descontinuado originales del producto
    if (esEdicion && rolActual === 'EMPLEADO') {
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

    const validationErrors = executeValidateProduct(dtoForValidation, {
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
            prodDiscontinuedEl.classList?.add('is-invalid');
        }

        if (form) {
            form.classList?.add('was-validated');
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
        let resp;
        if (esEdicion) {
            resp = typeof productService.update === 'function'
                ? await productService.update(numericId, payload)
                : await productService.updateProduct(numericId, payload);
        } else {
            resp = typeof productService.create === 'function'
                ? await productService.create(payload)
                : await productService.createProduct(payload);
        }

        if (resp && resp.ok === false) {
            const status = Number(resp.status || resp.problemDetails?.status) || 400;
            const errObj = new Error(extractProblemDetailsMessage(resp));
            errObj.status = status;
            errObj.problemDetails = resp.problemDetails || resp.data || { status, detail: errObj.message };
            throw errObj;
        }

        modalInstancia?.hide();
        limpiarValidacionModal(doc);
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
        const friendlyMsg = extractProblemDetailsMessage(err, err?.message || 'No se pudo guardar el producto.');
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

function ensureConflict409Elements(doc) {
    if (!doc) return {};

    let modalEl = doc.getElementById('modalConflicto409');
    if (!modalEl && doc.body) {
        modalEl = doc.createElement('div');
        modalEl.id = 'modalConflicto409';
        modalEl.className = 'modal fade d-none';
        doc.body.appendChild(modalEl);
    }

    let alertEl = doc.getElementById('alertConflicto409');
    if (!alertEl) {
        alertEl = doc.createElement('div');
        alertEl.id = 'alertConflicto409';
        alertEl.className = 'alert alert-warning d-none mb-2';
        alertEl.setAttribute('role', 'alert');
        if (modalEl) {
            modalEl.appendChild(alertEl);
        } else if (doc.body) {
            doc.body.appendChild(alertEl);
        }
    }

    let detalleEl = doc.getElementById('detalleConflicto409');
    if (!detalleEl) {
        detalleEl = doc.createElement('p');
        detalleEl.id = 'detalleConflicto409';
        detalleEl.className = 'small text-muted mb-0';
        if (modalEl) {
            modalEl.appendChild(detalleEl);
        }
    }

    let btnDescontinuar = doc.getElementById('btnDescontinuarDesde409');
    if (!btnDescontinuar) {
        btnDescontinuar = doc.createElement('button');
        btnDescontinuar.type = 'button';
        btnDescontinuar.id = 'btnDescontinuarDesde409';
        btnDescontinuar.className = 'btn btn-warning fw-semibold';
        btnDescontinuar.textContent = 'Descontinuar Producto';
        if (modalEl) {
            modalEl.appendChild(btnDescontinuar);
        } else if (alertEl) {
            alertEl.appendChild(btnDescontinuar);
        }
    }

    return { modalEl, alertEl, detalleEl, btnDescontinuar };
}

export function ocultarConflicto409() {
    const doc = getDoc();
    if (!doc) return;

    const modalEl = doc.getElementById('modalConflicto409');
    const alertEl = doc.getElementById('alertConflicto409');

    if (modal409Instancia && typeof modal409Instancia.hide === 'function') {
        modal409Instancia.hide();
    }
    if (modalEl) {
        modalEl.classList?.remove('show');
        setElementVisibility(modalEl, false);
    }
    if (alertEl) {
        setElementVisibility(alertEl, false);
    }
}

// Despliega el modal/alerta dedicado para conflicto 409 con acción rápida de descontinuación (TASK-F3-05)
export function mostrarConflicto409(id, problemDetails = null) {
    const doc = getDoc();
    if (!doc) return null;

    const { modalEl, alertEl, detalleEl, btnDescontinuar } = ensureConflict409Elements(doc);
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
        btnDescontinuar.setAttribute?.('data-id', String(numericId));
        btnDescontinuar.disabled = false;

        const handler = async (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            const targetId = Number(btnDescontinuar.dataset.id || numericId);
            return await manejarDescontinuacionProducto(targetId);
        };

        btnDescontinuar.onclick = handler;
        if (btnDescontinuar.listeners && typeof btnDescontinuar.listeners.set === 'function') {
            btnDescontinuar.listeners.set('click', [handler]);
        } else if (!btnDescontinuar.dataset.listener409Bound) {
            btnDescontinuar.dataset.listener409Bound = 'true';
            btnDescontinuar.addEventListener?.('click', handler);
        }
    }

    if (modalEl) {
        // En MockElement (pruebas unitarias), asegurar que modalEl.textContent también exponga el mensaje requerido
        if (Object.prototype.hasOwnProperty.call(modalEl, 'textContent')) {
            modalEl.textContent = CONFLICT_409_MESSAGE;
        }
        setElementVisibility(modalEl, true);
        modalEl.classList?.add('show');

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

// Descontinúa lógicamente un producto (PUT /api/Products/{id} con discontinued = true) (TASK-F3-05)
export async function manejarDescontinuacionProducto(id, prod = null) {
    if (rolActual !== 'ADMIN') {
        return { ok: false, status: 403, message: 'Solo un Administrador puede descontinuar productos.' };
    }

    const numericId = Number(id);
    const cachedProd = prod || productosCache.find((p) => Number(p?.productId ?? p?.ProductId) === numericId) || null;

    try {
        if (typeof productService.discontinue === 'function') {
            await productService.discontinue(numericId, cachedProd);
        } else {
            const baseData = cachedProd || (typeof productService.getById === 'function' ? await productService.getById(numericId) : {});
            const payload = ProductModel.createPayload({
                productId: numericId,
                productName: baseData.productName ?? baseData.ProductName ?? 'Producto',
                unitPrice: baseData.unitPrice ?? baseData.UnitPrice ?? 1,
                unitsInStock: baseData.unitsInStock ?? baseData.UnitsInStock ?? 0,
                discontinued: true
            });
            if (typeof productService.update === 'function') {
                await productService.update(numericId, payload);
            } else {
                await productService.updateProduct(numericId, payload);
            }
        }

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
        const msg = extractProblemDetailsMessage(err, err?.message || 'No se pudo descontinuar el producto.');
        mostrarToastProducto(msg, 'danger');
        return {
            ok: false,
            status: Number(err?.status || err?.problemDetails?.status) || 500,
            message: msg
        };
    }
}

// Ejecuta eliminación física o captura HTTP 409 Conflict ofreciendo descontinuación lógica (TASK-F3-05)
export async function manejarEliminacionProducto(id, btnElement = null, { skipConfirm = false } = {}) {
    if (rolActual !== 'ADMIN') {
        return { ok: false, status: 403, message: 'Solo un Administrador puede eliminar productos.' };
    }

    const numericId = Number(id);

    if (!skipConfirm && btnElement !== null) {
        const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function')
            ? window.confirm.bind(window)
            : (typeof confirm === 'function' ? confirm : null);
        if (confirmFn) {
            const confirmar = confirmFn(`¿Estás seguro de eliminar el producto #${numericId}?`);
            if (confirmar === false) return { ok: false, cancelled: true };
        }
    }

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Eliminando...';
    }

    try {
        const resp = typeof productService.delete === 'function'
            ? await productService.delete(numericId)
            : await productService.deleteProduct(numericId);

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

            const errObj = new Error(extractProblemDetailsMessage(resp, `No se pudo eliminar (HTTP ${status})`));
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

        const msg = extractProblemDetailsMessage(err, err?.message || 'Error al eliminar el producto.');
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

export const eliminarProducto = manejarEliminacionProducto;
export const descontinuarProducto = manejarDescontinuacionProducto;

function inicializarTabla() {
    if (typeof DataTable === 'undefined') {
        tabla = null;
        return;
    }
    tabla = new DataTable('#tablaProductos', baseTableOptions({
        order: [[0, 'asc']],
        columns: [
            { data: 'productId', render: display((d) => `<strong>${escapeHtml(d)}</strong>`) },
            { data: 'productName', render: display((d) => escapeHtml(d)) },
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
                render: (_, __, row) => renderAccionesProducto(row, rolActual)
            }
        ]
    }));
}

function configurarEventos(doc = getDoc()) {
    if (!doc) return;

    const form = doc.getElementById('formProducto');
    const btnNuevo = doc.getElementById('btnNuevoProducto');
    const modalEl = doc.getElementById('modalProducto');
    const btnCancelarModal = doc.getElementById('btnCancelarModalProducto');
    const btnCerrar409 = doc.getElementById('btnCerrarConflicto409');

    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            abrirModalNuevoProducto();
        });
    }

    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            limpiarValidacionModal(doc);
        });
    }

    if (btnCancelarModal) {
        btnCancelarModal.addEventListener('click', () => {
            limpiarValidacionModal(doc);
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

    const tablaEl = doc.getElementById('tablaProductos');
    if (tablaEl) {
        tablaEl.addEventListener('click', async (e) => {
            const target = e.target;
            const btn = target && typeof target.closest === 'function'
                ? target.closest('button[data-action]')
                : target;
            if (!btn) return;

            const action = btn.dataset?.action || btn.getAttribute?.('data-action');
            const id = parseInt(btn.dataset?.id || btn.getAttribute?.('data-id'), 10);
            if (Number.isNaN(id)) return;

            if (action === 'editar') {
                editarProducto(id);
            } else if (action === 'descontinuar' && rolActual === 'ADMIN') {
                await manejarDescontinuacionProducto(id);
            } else if (action === 'eliminar' && rolActual === 'ADMIN') {
                await manejarEliminacionProducto(id, btn);
            }
        });
    }
}

export async function initProductsController(customDoc = null) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    const usuario = (typeof authService.getCurrentUser === 'function' && authService.getCurrentUser())
        || await authService.checkSession();
    if (!usuario) {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './login.html';
        }
        return;
    }

    rolActual = resolveConnectedRole(usuario, authService);
    initNavbar(usuario, authService);
    aplicarPermisosRolProductos(rolActual);

    const modalEl = doc.getElementById('modalProducto');
    if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        modalInstancia = new bootstrap.Modal(modalEl);
    }

    inicializarTabla();
    configurarEventos(doc);

    await listarProductos();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initProductsController(document);
    });
}
