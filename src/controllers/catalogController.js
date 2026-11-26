import { authGuard, authModel } from "../models/authModel.js";
import { productModel } from "../models/productModel.js";
import { cartModel, validateCartQuantity } from "../models/cartModel.js";
import {
    formatCurrency,
    initAuthenticatedView,
    resolveConnectedPermissions,
    setElementVisibility,
    showModal,
    bindModalDismiss,
    extractProblemMessage,
    updateCartBadge
} from "./uiHelpers.js";

authGuard();

let productos = [];

function parsePriceBound(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function filtrarProductosCatalogo(lista, { texto = '', precioMin = null, precioMax = null, soloDisponibles = false } = {}) {
    const query = String(texto).trim().toLowerCase();
    const minVal = parsePriceBound(precioMin);
    const maxVal = parsePriceBound(precioMax);

    return lista.filter((prod) => {
        const nombre = prod.productName.toLowerCase();
        const idStr = String(prod.productId);
        const cumpleTexto = !query || nombre.includes(query) || idStr.includes(query) || `#${idStr}` === query;
        const cumpleMin = minVal === null || prod.unitPrice >= minVal;
        const cumpleMax = maxVal === null || prod.unitPrice <= maxVal;
        const cumpleStock = !soloDisponibles || prod.unitsInStock > 0;
        return cumpleTexto && cumpleMin && cumpleMax && cumpleStock;
    });
}

function renderCatalogNotice(contenedor, message, variant = 'info') {
    contenedor.textContent = '';
    const col = document.createElement('div');
    col.className = 'col-12';
    const alert = document.createElement('div');
    alert.className = `alert alert-${variant} mb-0`;
    alert.textContent = message;
    col.appendChild(alert);
    contenedor.appendChild(col);
}

function buildProductCard(prod) {
    const agotado = prod.unitsInStock <= 0;

    const col = document.createElement('div');
    col.className = 'col';

    const card = document.createElement('div');
    card.className = agotado
        ? 'card h-100 shadow-sm card-producto card-agotado border-danger-subtle opacity-75'
        : 'card h-100 shadow-sm border-0 card-producto card-disponible';
    card.dataset.productId = String(prod.productId);
    card.dataset.stockStatus = agotado ? 'agotado' : 'disponible';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ver detalle de ${prod.productName}`);

    const body = document.createElement('div');
    body.className = 'card-body d-flex flex-column';

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-start gap-2 mb-2';

    const title = document.createElement('h5');
    title.className = 'card-title fw-bold text-dark mb-0';
    title.textContent = prod.productName;

    const idBadge = document.createElement('span');
    idBadge.className = 'badge bg-light text-secondary border';
    idBadge.textContent = `#${prod.productId}`;

    header.append(title, idBadge);

    const price = document.createElement('p');
    price.className = 'card-text text-primary fs-5 fw-semibold mb-3';
    price.textContent = formatCurrency(prod.unitPrice);

    const footer = document.createElement('div');
    footer.className = 'mt-auto d-flex flex-wrap justify-content-between align-items-center gap-1';

    const stockBadge = document.createElement('span');
    stockBadge.className = agotado
        ? 'badge bg-danger-subtle text-danger border border-danger-subtle badge-agotado'
        : 'badge bg-success-subtle text-success border border-success-subtle badge-disponible';
    stockBadge.textContent = agotado ? 'Agotado' : `Disponible (Stock: ${prod.unitsInStock})`;
    footer.appendChild(stockBadge);

    if (prod.discontinued) {
        const discBadge = document.createElement('span');
        discBadge.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle badge-descontinuado';
        discBadge.textContent = 'Descontinuado';
        footer.appendChild(discBadge);
    }

    body.append(header, price, footer);
    card.appendChild(body);
    col.appendChild(card);
    return col;
}

function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (!contenedor) return;

    const lblContador = document.getElementById('lblTotalCatalogo');
    if (lblContador) lblContador.textContent = `${lista.length} producto(s)`;

    if (lista.length === 0) {
        renderCatalogNotice(contenedor, 'No hay productos disponibles con los criterios seleccionados.', 'info');
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const prod of lista) {
        fragment.appendChild(buildProductCard(prod));
    }
    contenedor.textContent = '';
    contenedor.appendChild(fragment);
}

function aplicarFiltrosActivos() {
    const filtrados = filtrarProductosCatalogo(productos, {
        texto: document.getElementById('txtBuscarCatalogo')?.value || '',
        precioMin: document.getElementById('txtPrecioMinCatalogo')?.value ?? null,
        precioMax: document.getElementById('txtPrecioMaxCatalogo')?.value ?? null,
        soloDisponibles: Boolean(document.getElementById('chkSoloDisponibles')?.checked)
    });
    renderizarTarjetas(filtrados);
}

function configurarFiltrosCatalogo() {
    const ids = ['txtBuscarCatalogo', 'txtPrecioMinCatalogo', 'txtPrecioMaxCatalogo', 'chkSoloDisponibles'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && !el._catalogoBound) {
            el._catalogoBound = true;
            el.addEventListener('input', aplicarFiltrosActivos);
            el.addEventListener('change', aplicarFiltrosActivos);
        }
    }

    const btnLimpiar = document.getElementById('btnLimpiarFiltrosCatalogo');
    if (btnLimpiar && !btnLimpiar._catalogoBound) {
        btnLimpiar._catalogoBound = true;
        btnLimpiar.addEventListener('click', () => {
            ['txtBuscarCatalogo', 'txtPrecioMinCatalogo', 'txtPrecioMaxCatalogo'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const chk = document.getElementById('chkSoloDisponibles');
            if (chk) chk.checked = false;
            aplicarFiltrosActivos();
        });
    }
}

async function cargarCatalogo() {
    const contenedor = document.getElementById('contenedorCatalogo');
    try {
        productos = await productModel.getAll();
        aplicarFiltrosActivos();
    } catch {
        if (contenedor) {
            renderCatalogNotice(contenedor, 'No se pudieron cargar los productos. Intenta nuevamente.', 'warning');
        }
    }
}

function findProducto(productId) {
    return productos.find((p) => String(p.productId) === String(productId)) || null;
}

function setFieldValidationState(el, invalid, feedbackEl = null, message = '') {
    if (!el) return;
    el.classList.toggle('is-invalid', invalid);
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    if (invalid && feedbackEl && message) feedbackEl.textContent = message;
}

function showCompraAlert(message = '', visible = Boolean(message), variant = 'danger') {
    const alertEl = document.getElementById('alertCompraCatalogo');
    if (!alertEl) return;
    alertEl.className = `alert alert-${variant} py-2 px-3 small mb-3`;
    alertEl.textContent = visible ? String(message) : '';
    setElementVisibility(alertEl, visible);
}

function resetValidacionCompra() {
    setFieldValidationState(document.getElementById('txtCantidadCompra'), false);
}

function actualizarTotalCompra() {
    const prod = findProducto(document.getElementById('compraProductoId')?.value);
    const txtCantidad = document.getElementById('txtCantidadCompra');
    const lblTotal = document.getElementById('lblTotalCompra');
    if (!prod || !lblTotal) return;

    const validation = validateCartQuantity(txtCantidad?.value, prod.unitsInStock);
    const total = validation.valid ? Math.round((validation.value * prod.unitPrice + Number.EPSILON) * 100) / 100 : 0;
    lblTotal.textContent = formatCurrency(total);
    if (validation.valid) setFieldValidationState(txtCantidad, false);
}

function abrirModalProductoCatalogo(productId) {
    const prod = findProducto(productId);
    const modalEl = document.getElementById('modalDetalleCatalogo');
    if (!prod || !modalEl) return;

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };
    setText('modalCatalogoTitulo', `Producto #${prod.productId}`);
    setText('detCatalogoId', `#${prod.productId}`);
    setText('detCatalogoNombre', prod.productName);
    setText('detCatalogoPrecio', formatCurrency(prod.unitPrice));
    setText('detCatalogoStock', prod.unitsInStock);

    const estadoEl = document.getElementById('detCatalogoEstado');
    if (estadoEl) {
        if (prod.discontinued) {
            estadoEl.textContent = 'Descontinuado';
            estadoEl.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle';
        } else if (prod.unitsInStock > 0) {
            estadoEl.textContent = 'Disponible';
            estadoEl.className = 'badge bg-success-subtle text-success border border-success-subtle';
        } else {
            estadoEl.textContent = 'Agotado';
            estadoEl.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
        }
    }

    showCompraAlert('', false);
    setElementVisibility(document.getElementById('resumenCompraCatalogo'), false);
    resetValidacionCompra();

    const usuario = authModel.getCurrentUser();
    const canBuy = Boolean(resolveConnectedPermissions(usuario, authModel).canPurchaseCatalog);
    setElementVisibility(document.getElementById('seccionCompraCatalogo'), canBuy);
    setElementVisibility(document.getElementById('footerSoloLecturaCatalogo'), !canBuy);

    if (canBuy) {
        const puedeAgregar = prod.unitsInStock > 0 && !prod.discontinued;
        document.getElementById('compraProductoId').value = String(prod.productId);

        const txtCantidad = document.getElementById('txtCantidadCompra');
        txtCantidad.max = String(Math.max(1, prod.unitsInStock));
        txtCantidad.value = puedeAgregar ? '1' : '0';

        ['txtCantidadCompra', 'btnAgregarCarrito'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = !puedeAgregar;
        });

        if (!puedeAgregar) {
            showCompraAlert(
                prod.discontinued
                    ? 'Este producto está descontinuado y no puede agregarse al carrito.'
                    : 'Este producto está agotado temporalmente.',
                true,
                'warning'
            );
        }
        actualizarTotalCompra();
    }

    showModal(modalEl);
}

async function procesarAgregarAlCarrito(event) {
    event?.preventDefault?.();

    const usuario = authModel.getCurrentUser();
    if (!resolveConnectedPermissions(usuario, authModel).canPurchaseCatalog) {
        showCompraAlert('Tu cuenta no está habilitada para agregar productos al carrito.', true);
        return;
    }

    const prod = findProducto(document.getElementById('compraProductoId')?.value);
    if (!prod || prod.discontinued || prod.unitsInStock <= 0) {
        showCompraAlert('Este producto ya no está disponible.', true, 'warning');
        return;
    }

    const txtCantidad = document.getElementById('txtCantidadCompra');
    const qtyResult = validateCartQuantity(txtCantidad?.value, prod.unitsInStock);
    setFieldValidationState(txtCantidad, !qtyResult.valid, document.getElementById('feedbackCantidadCompra'), qtyResult.error || '');

    if (!qtyResult.valid) {
        txtCantidad?.focus?.();
        return;
    }

    const cantidad = qtyResult.value;
    const nuevoStock = prod.unitsInStock - cantidad;
    const btnAgregar = document.getElementById('btnAgregarCarrito');
    showCompraAlert('', false);
    if (btnAgregar) {
        btnAgregar.disabled = true;
        btnAgregar.textContent = 'Agregando...';
    }

    try {
        const updatedCart = await cartModel.addItem(prod.productId, cantidad);

        prod.unitsInStock = nuevoStock;
        aplicarFiltrosActivos();
        updateCartBadge(updatedCart.totalQuantity);

        document.getElementById('detCatalogoStock').textContent = String(nuevoStock);
        if (nuevoStock <= 0) {
            const estadoEl = document.getElementById('detCatalogoEstado');
            estadoEl.textContent = 'Agotado';
            estadoEl.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
        }

        const subtotalAgregado = formatCurrency(Math.round((cantidad * prod.unitPrice + Number.EPSILON) * 100) / 100);
        const summary = {
            resCompraProducto: `${prod.productName} (#${prod.productId})`,
            resCompraCantidad: cantidad,
            resCompraTotal: subtotalAgregado,
            resCompraTotalCarrito: updatedCart.totalQuantity,
            resCompraStockRestante: nuevoStock
        };
        for (const [id, val] of Object.entries(summary)) {
            const el = document.getElementById(id);
            if (el) el.textContent = String(val);
        }

        setElementVisibility(document.getElementById('seccionCompraCatalogo'), false);
        setElementVisibility(document.getElementById('resumenCompraCatalogo'), true);
        setElementVisibility(document.getElementById('footerSoloLecturaCatalogo'), true);
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 0;
        showCompraAlert(extractProblemMessage(err, 'No se pudo agregar el producto al carrito. Intenta nuevamente.'), true);
        if (status === 409) {
            await cargarCatalogo();
        }
    } finally {
        if (btnAgregar) {
            btnAgregar.disabled = false;
            btnAgregar.textContent = 'Agregar al Carrito';
        }
    }
}

function configurarModalCatalogo() {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (contenedor && !contenedor._modalCatalogoBound) {
        contenedor._modalCatalogoBound = true;
        const resolveId = (target) => target?.closest?.('.card-producto[data-product-id]')?.getAttribute('data-product-id') || null;

        contenedor.addEventListener('click', (e) => {
            const id = resolveId(e.target);
            if (id) abrirModalProductoCatalogo(id);
        });
        contenedor.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const id = resolveId(e.target);
            if (id) {
                e.preventDefault();
                abrirModalProductoCatalogo(id);
            }
        });
    }

    const txtCantidad = document.getElementById('txtCantidadCompra');
    if (txtCantidad && !txtCantidad._compraBound) {
        txtCantidad._compraBound = true;
        txtCantidad.addEventListener('input', actualizarTotalCompra);
        txtCantidad.addEventListener('change', actualizarTotalCompra);
    }

    const formCompra = document.getElementById('formCompraCatalogo');
    if (formCompra && !formCompra._compraBound) {
        formCompra._compraBound = true;
        formCompra.addEventListener('submit', procesarAgregarAlCarrito);
    }

    bindModalDismiss(document.getElementById('modalDetalleCatalogo'), () => {
        showCompraAlert('', false);
        resetValidacionCompra();
    });
}

async function initCatalogController() {
    const usuario = await initAuthenticatedView({ authModel });
    if (!usuario) return;

    const canBuy = Boolean(resolveConnectedPermissions(usuario, authModel).canPurchaseCatalog);
    setElementVisibility(document.getElementById('btnIrCarritoCatalogo'), canBuy);

    configurarFiltrosCatalogo();
    configurarModalCatalogo();
    await cargarCatalogo();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (document.body?.getAttribute?.('data-auth-blocked') || !authModel.isAuthenticated()) {
            return;
        }
        await initCatalogController();
    });
}
