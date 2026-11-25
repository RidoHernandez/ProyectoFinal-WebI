import { authGuard, authModel } from "../models/authModel.js";
import { productModel, validateProduct } from "../models/productModel.js";
import {
    baseTableOptions,
    confirmAction,
    escapeHtml,
    extractProblemMessage,
    initAuthenticatedView,
    resolveConnectedPermissions,
    safeTextRender,
    setElementVisibility
} from "./uiHelpers.js";

authGuard('canViewProductsAdmin');

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

const display = (fn) => (data, type, row) => (type === 'display' ? fn(data, row) : data);

function normalizarPermisosProductos(src = {}) {
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

function renderAccionesProducto(row, p = permisosActuales) {
    const idSeguro = escapeHtml(row?.productId ?? '');
    const yaDescontinuado = Boolean(row?.discontinued);
    const botones = [];

    if (p.canEditProductPricingStock || p.canEditProductDetails) {
        const space = (p.canDiscontinueProducts || p.canDeleteProducts) ? ' me-1' : '';
        botones.push(`<button type="button" class="btn btn-sm btn-outline-primary${space}" data-action="editar" data-id="${idSeguro}">Editar</button>`);
    }
    if (p.canDiscontinueProducts) {
        const cls = yaDescontinuado ? 'btn-secondary' : 'btn-outline-warning';
        const space = p.canDeleteProducts ? ' me-1' : '';
        botones.push(`<button type="button" class="btn btn-sm ${cls}${space}" data-action="descontinuar" data-id="${idSeguro}"${yaDescontinuado ? ' disabled' : ''}>${yaDescontinuado ? 'Descontinuado' : 'Descontinuar'}</button>`);
    }
    if (p.canDeleteProducts) {
        botones.push(`<button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" data-id="${idSeguro}">Eliminar</button>`);
    }
    return botones.join('');
}

function aplicarPermisosProductos(permisos = permisosActuales) {
    permisosActuales = normalizarPermisosProductos(permisos);
    const { canCreateProducts, canEditProductDetails, canEditProductPricingStock, canDeleteProducts, canDiscontinueProducts } = permisosActuales;
    const puedeEditarPrecioStock = canEditProductPricingStock || canEditProductDetails;

    setElementVisibility(document.getElementById('btnNuevoProducto'), canCreateProducts);
    document.querySelectorAll('button[data-action="eliminar"]').forEach((b) => setElementVisibility(b, canDeleteProducts));
    document.querySelectorAll('button[data-action="descontinuar"]').forEach((b) => setElementVisibility(b, canDiscontinueProducts));

    const prodName = document.getElementById('prodName');
    const prodDiscontinued = document.getElementById('prodDiscontinued');
    const prodPrice = document.getElementById('prodPrice');
    const prodStock = document.getElementById('prodStock');

    if (prodName) {
        prodName.disabled = !canEditProductDetails;
        prodName.readOnly = !canEditProductDetails;
    }
    if (prodDiscontinued) prodDiscontinued.disabled = !canEditProductDetails;
    if (prodPrice) {
        prodPrice.disabled = !puedeEditarPrecioStock;
        prodPrice.readOnly = !puedeEditarPrecioStock;
    }
    if (prodStock) {
        prodStock.disabled = !puedeEditarPrecioStock;
        prodStock.readOnly = !puedeEditarPrecioStock;
    }
}

function limpiarValidacionModal() {
    document.getElementById('formProducto')?.classList.remove('was-validated');
    ['prodName', 'prodPrice', 'prodStock', 'prodDiscontinued'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('is-invalid', 'is-valid');
            el.removeAttribute('aria-invalid');
        }
    });
    for (const [id, text] of Object.entries(DEFAULT_FEEDBACK_MESSAGES)) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
    const alertModal = document.getElementById('alertModalProducto');
    if (alertModal) {
        alertModal.textContent = '';
        setElementVisibility(alertModal, false);
    }
}

function mostrarToastProducto(mensaje, tipo = 'success') {
    const toastEl = document.getElementById('toastProducto');
    const bodyEl = document.getElementById('toastProductoMensaje');
    if (!toastEl || !bodyEl) return;

    const colorClass = tipo === 'danger' ? 'text-bg-danger' : (tipo === 'warning' ? 'text-bg-warning' : 'text-bg-success');
    toastEl.className = `toast align-items-center ${colorClass} border-0 show`;
    bodyEl.textContent = String(mensaje || '');
    setElementVisibility(toastEl, true);

    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3500 }).show();
    }
}

async function listarProductos() {
    try {
        productosCache = await productModel.getAll();
        const lblTotal = document.getElementById('lblTotalProductos');
        if (lblTotal) lblTotal.textContent = String(productosCache.length);

        if (tabla) {
            tabla.clear().rows.add(productosCache).draw();
        } else if (productosCache.length === 0) {
            setProductsTableMessage('No se encontraron productos.');
        }

        aplicarPermisosProductos(permisosActuales);
    } catch (err) {
        if (tabla) tabla.clear().draw();
        else setProductsTableMessage('No se pudieron cargar los productos.');
        mostrarToastProducto(`Error al listar productos: ${extractProblemMessage(err, 'Error desconocido')}`, 'danger');
    }
}

function abrirModalNuevoProducto() {
    if (!permisosActuales.canCreateProducts) return;
    document.getElementById('formProducto')?.reset();
    limpiarValidacionModal();
    document.getElementById('prodId').value = '';
    document.getElementById('modalTitulo').textContent = 'Nuevo Producto';
    aplicarPermisosProductos(permisosActuales);
    modalInstancia?.show();
}

function editarProducto(id) {
    const prod = productosCache.find((p) => Number(p.productId) === Number(id));
    if (!prod) return;

    limpiarValidacionModal();
    document.getElementById('prodId').value = String(prod.productId);
    document.getElementById('prodName').value = prod.productName;
    document.getElementById('prodPrice').value = prod.unitPrice;
    document.getElementById('prodStock').value = prod.unitsInStock;
    document.getElementById('prodDiscontinued').checked = Boolean(prod.discontinued);
    document.getElementById('modalTitulo').textContent = `Editar Producto #${prod.productId}`;
    aplicarPermisosProductos(permisosActuales);
    modalInstancia?.show();
}

function setFieldInvalidState(inputEl, feedbackEl, message) {
    if (inputEl) {
        inputEl.classList.remove('is-valid');
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
    }
    if (feedbackEl && message) feedbackEl.textContent = message;
}

async function guardarProductoModal(event) {
    event?.preventDefault?.();
    limpiarValidacionModal();

    const prodIdEl = document.getElementById('prodId');
    const prodNameEl = document.getElementById('prodName');
    const prodPriceEl = document.getElementById('prodPrice');
    const prodStockEl = document.getElementById('prodStock');
    const prodDiscontinuedEl = document.getElementById('prodDiscontinued');
    const alertModalEl = document.getElementById('alertModalProducto');
    const btnGuardar = document.getElementById('btnGuardar');

    const idStr = String(prodIdEl?.value ?? '').trim();
    const esEdicion = idStr !== '';
    const numericId = esEdicion ? Number(idStr) : null;

    if (!esEdicion && !permisosActuales.canCreateProducts) {
        alertModalEl.textContent = 'Operación no permitida: No tienes permisos para crear nuevos productos.';
        setElementVisibility(alertModalEl, true);
        return;
    }

    let productName = prodNameEl.value.trim();
    let discontinued = Boolean(prodDiscontinuedEl.checked);

    // Si es EMPLEADO (sin permiso de editar detalles), preservar nombre y estado originales
    if (esEdicion && !permisosActuales.canEditProductDetails) {
        const original = productosCache.find((p) => Number(p.productId) === numericId);
        if (original) {
            productName = original.productName;
            discontinued = Boolean(original.discontinued);
            prodNameEl.value = productName;
            prodDiscontinuedEl.checked = discontinued;
        }
    }

    const dto = {
        productName,
        unitPrice: prodPriceEl.value === '' ? null : Number(prodPriceEl.value),
        unitsInStock: prodStockEl.value === '' ? null : Number(prodStockEl.value),
        discontinued
    };

    const validation = validateProduct(dto, {
        existingProducts: productosCache,
        excludeProductId: numericId
    });

    if (!validation.valid) {
        const { fieldErrors, errors } = validation;
        if (fieldErrors.productName) setFieldInvalidState(prodNameEl, document.getElementById('feedbackProdName'), fieldErrors.productName);
        if (fieldErrors.unitPrice) setFieldInvalidState(prodPriceEl, document.getElementById('feedbackProdPrice'), fieldErrors.unitPrice);
        if (fieldErrors.unitsInStock) setFieldInvalidState(prodStockEl, document.getElementById('feedbackProdStock'), fieldErrors.unitsInStock);
        document.getElementById('formProducto')?.classList.add('was-validated');
        alertModalEl.textContent = errors[0] || 'Verifica los datos ingresados en el formulario.';
        setElementVisibility(alertModalEl, true);
        return;
    }

    const payload = { productId: numericId, ...dto };
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
    }

    try {
        if (esEdicion) {
            await productModel.update(numericId, payload);
        } else {
            await productModel.create(payload);
        }
        modalInstancia?.hide();
        limpiarValidacionModal();
        await listarProductos();
        mostrarToastProducto(esEdicion ? 'Producto actualizado exitosamente.' : 'Producto creado exitosamente.', 'success');
    } catch (err) {
        const msg = extractProblemMessage(err, 'No se pudo guardar el producto.');
        alertModalEl.textContent = msg;
        setElementVisibility(alertModalEl, true);
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar';
        }
    }
}

function ocultarConflicto409() {
    modal409Instancia?.hide();
    const modalEl = document.getElementById('modalConflicto409');
    if (modalEl) {
        modalEl.classList.remove('show');
        setElementVisibility(modalEl, false);
    }
    setElementVisibility(document.getElementById('alertConflicto409'), false);
}

function mostrarConflicto409(id, problemDetails = null) {
    const modalEl = document.getElementById('modalConflicto409');
    const alertEl = document.getElementById('alertConflicto409');
    const detalleEl = document.getElementById('detalleConflicto409');
    const btnDescontinuar = document.getElementById('btnDescontinuarDesde409');
    const numericId = Number(id);

    if (alertEl) {
        alertEl.textContent = CONFLICT_409_MESSAGE;
        setElementVisibility(alertEl, true);
    }
    if (detalleEl) {
        detalleEl.textContent = problemDetails?.detail && problemDetails.detail !== CONFLICT_409_MESSAGE
            ? String(problemDetails.detail)
            : '';
    }
    if (btnDescontinuar) {
        btnDescontinuar.dataset.id = String(numericId);
        btnDescontinuar.disabled = false;
        btnDescontinuar.onclick = async (e) => {
            e?.preventDefault?.();
            await manejarDescontinuacionProducto(Number(btnDescontinuar.dataset.id || numericId));
        };
    }
    if (modalEl) {
        setElementVisibility(modalEl, true);
        modalEl.classList.add('show');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            modal409Instancia = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal409Instancia.show();
        }
    }
}

async function manejarDescontinuacionProducto(id) {
    if (!permisosActuales.canDiscontinueProducts) return;
    const numericId = Number(id);
    const cachedProd = productosCache.find((p) => Number(p.productId) === numericId) || null;

    try {
        await productModel.discontinue(numericId, cachedProd);
        ocultarConflicto409();
        await listarProductos();
        mostrarToastProducto(`Producto #${numericId} marcado como descontinuado.`, 'warning');
    } catch (err) {
        mostrarToastProducto(extractProblemMessage(err, 'No se pudo descontinuar el producto.'), 'danger');
    }
}

async function manejarEliminacionProducto(id, btnElement = null) {
    if (!permisosActuales.canDeleteProducts) return;
    const numericId = Number(id);
    if (!confirmAction(`¿Estás seguro de eliminar el producto #${numericId}?`)) return;

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Eliminando...';
    }

    try {
        await productModel.delete(numericId);
        await listarProductos();
        mostrarToastProducto('Producto eliminado exitosamente.', 'success');
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 0;
        if (status === 409) {
            mostrarConflicto409(numericId, err?.problemDetails);
            return;
        }
        mostrarToastProducto(extractProblemMessage(err, 'Error al eliminar el producto.'), 'danger');
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
                    if (type !== 'display') return d ? 'Descontinuado' : 'Activo';
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
    document.getElementById('btnNuevoProducto')?.addEventListener('click', abrirModalNuevoProducto);
    document.getElementById('modalProducto')?.addEventListener('hidden.bs.modal', limpiarValidacionModal);
    document.getElementById('btnCancelarModalProducto')?.addEventListener('click', limpiarValidacionModal);
    document.getElementById('btnCerrarConflicto409')?.addEventListener('click', ocultarConflicto409);
    document.getElementById('formProducto')?.addEventListener('submit', guardarProductoModal);

    document.getElementById('tablaProductos')?.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('button[data-action]');
        const id = parseInt(btn?.dataset.id, 10);
        if (!btn || Number.isNaN(id)) return;

        if (btn.dataset.action === 'editar') editarProducto(id);
        else if (btn.dataset.action === 'descontinuar' && permisosActuales.canDiscontinueProducts) await manejarDescontinuacionProducto(id);
        else if (btn.dataset.action === 'eliminar' && permisosActuales.canDeleteProducts) await manejarEliminacionProducto(id, btn);
    });
}

async function initProductsController() {
    const usuario = await initAuthenticatedView({
        authModel,
        requiredPermission: 'canViewProductsAdmin'
    });
    if (!usuario) return;

    permisosActuales = normalizarPermisosProductos(resolveConnectedPermissions(usuario, authModel));
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
            !authModel.isAuthenticated() ||
            !authModel.hasPermission('canViewProductsAdmin')
        ) {
            return;
        }
        await initProductsController();
    });
}
