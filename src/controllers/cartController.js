import { authGuard, authModel } from "../models/authModel.js";
import { cartModel, validateCheckoutPayload } from "../models/cartModel.js";
import {
    clearTbody,
    confirmAction,
    extractProblemMessage,
    formatCurrency,
    initAuthenticatedView,
    setElementVisibility,
    updateCartBadge
} from "./uiHelpers.js";

authGuard('canPurchaseCatalog');

const REQUIRED_PERMISSION = 'canPurchaseCatalog';

let currentCart = { items: [], totalQuantity: 0, total: 0 };
let isSubmitting = false;

function showAlert(id, message = '', visible = Boolean(message)) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = visible ? String(message) : '';
    setElementVisibility(el, visible);
}

function setFieldValidationState(el, invalid, feedbackEl = null, message = '') {
    if (!el) return;
    el.classList.toggle('is-invalid', invalid);
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    if (invalid && feedbackEl && message) feedbackEl.textContent = message;
}

function resetCheckoutValidation() {
    [
        'txtCarritoEnvioNombre',
        'txtCarritoEnvioDireccion',
        'txtCarritoEnvioCiudad',
        'txtCarritoEnvioPais'
    ].forEach((id) => setFieldValidationState(document.getElementById(id), false));
}

function renderCartRows(items) {
    const tbody = document.getElementById('tbodyCarrito');
    if (!tbody) return;
    clearTbody(tbody);

    for (const item of items) {
        const tr = document.createElement('tr');

        const thProduct = document.createElement('th');
        thProduct.scope = 'row';
        thProduct.className = 'fw-semibold';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.productName;
        thProduct.appendChild(nameSpan);

        const idSpan = document.createElement('span');
        idSpan.className = 'badge bg-light text-secondary border ms-2';
        idSpan.textContent = `#${item.productId}`;
        thProduct.appendChild(idSpan);

        if (item.discontinued) {
            const discBadge = document.createElement('span');
            discBadge.className = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2';
            discBadge.textContent = 'Descontinuado';
            thProduct.appendChild(discBadge);
        }

        const tdPrice = document.createElement('td');
        tdPrice.className = 'text-end';
        tdPrice.textContent = formatCurrency(item.unitPrice);

        const tdQty = document.createElement('td');
        tdQty.className = 'text-end fw-semibold';
        tdQty.textContent = String(item.quantity);

        const tdSub = document.createElement('td');
        tdSub.className = 'text-end fw-semibold';
        tdSub.textContent = formatCurrency(item.subtotal);

        tr.append(thProduct, tdPrice, tdQty, tdSub);
        tbody.appendChild(tr);
    }
}

function renderCartState(cart, { keepReceiptVisible = false } = {}) {
    currentCart = cart || { items: [], totalQuantity: 0, total: 0 };
    const items = Array.isArray(currentCart.items) ? currentCart.items : [];
    const totalQuantity = Number(currentCart.totalQuantity) || 0;
    const total = Number(currentCart.total) || 0;

    updateCartBadge(totalQuantity);

    const lblTotalItems = document.getElementById('lblTotalItemsCarrito');
    if (lblTotalItems) lblTotalItems.textContent = `${totalQuantity} unidad(es)`;

    const lblLineas = document.getElementById('lblLineasCarrito');
    if (lblLineas) lblLineas.textContent = `${items.length} producto(s)`;

    const lblCantTabla = document.getElementById('lblCantidadTotalTabla');
    if (lblCantTabla) lblCantTabla.textContent = String(totalQuantity);

    const formattedTotal = formatCurrency(total);
    const lblTotal = document.getElementById('lblTotalCarrito');
    if (lblTotal) lblTotal.textContent = formattedTotal;

    const lblResumen = document.getElementById('lblResumenTotalCheckout');
    if (lblResumen) lblResumen.textContent = formattedTotal;

    if (!keepReceiptVisible) {
        setElementVisibility(document.getElementById('resumenPedidoCarrito'), false);
    }

    const hasItems = items.length > 0;
    setElementVisibility(document.getElementById('contenidoCarrito'), hasItems);
    setElementVisibility(document.getElementById('carritoVacio'), !hasItems && !keepReceiptVisible);

    if (hasItems) {
        renderCartRows(items);
        const hasDiscontinued = items.some((i) => i.discontinued);
        showAlert(
            'alertCarritoDescontinuado',
            hasDiscontinued
                ? 'Uno o más productos de tu carrito fueron descontinuados. Cancela el carrito completo para devolver los productos al inventario.'
                : '',
            hasDiscontinued
        );
        const btnConfirmar = document.getElementById('btnConfirmarCompraCarrito');
        if (btnConfirmar) btnConfirmar.disabled = hasDiscontinued || isSubmitting;
    } else {
        clearTbody(document.getElementById('tbodyCarrito'));
        showAlert('alertCarritoDescontinuado', '', false);
    }
}

function renderOrderReceipt(order, shippingValues) {
    const orderIdEl = document.getElementById('resCarritoOrdenId');
    if (orderIdEl) orderIdEl.textContent = order?.orderId ? `#${order.orderId}` : '-';

    const totalEl = document.getElementById('resCarritoTotal');
    if (totalEl) totalEl.textContent = formatCurrency(order?.total ?? currentCart.total);

    const destEl = document.getElementById('resCarritoDestino');
    if (destEl) {
        const { shipName, shipAddress, shipCity, shipCountry } = shippingValues;
        destEl.textContent = `${shipName} — ${shipAddress}, ${shipCity}, ${shipCountry}`;
    }

    const tbody = document.getElementById('tbodyResumenPedido');
    if (tbody) {
        clearTbody(tbody);
        const items = Array.isArray(order?.items) ? order.items : [];
        for (const item of items) {
            const tr = document.createElement('tr');
            const subtotal = Number.isFinite(Number(item.subtotal))
                ? Number(item.subtotal)
                : Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0);

            const cells = [
                { text: item.productName || `Producto #${item.productId}`, cls: '' },
                { text: formatCurrency(item.unitPrice ?? 0), cls: 'text-end' },
                { text: String(item.quantity ?? 0), cls: 'text-end' },
                { text: formatCurrency(subtotal), cls: 'text-end fw-semibold' }
            ];
            for (const c of cells) {
                const td = document.createElement('td');
                if (c.cls) td.className = c.cls;
                td.textContent = c.text;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
    }

    setElementVisibility(document.getElementById('resumenPedidoCarrito'), true);
}

async function cargarCarrito() {
    showAlert('alertCarritoError', '', false);
    try {
        const cart = await cartModel.get();
        renderCartState(cart);
    } catch (err) {
        setElementVisibility(document.getElementById('contenidoCarrito'), false);
        setElementVisibility(document.getElementById('carritoVacio'), false);
        setElementVisibility(document.getElementById('resumenPedidoCarrito'), false);
        showAlert('alertCarritoError', extractProblemMessage(err, 'No se pudo cargar tu carrito. Intenta nuevamente.'), true);
    }
}

async function manejarCheckout(event) {
    event?.preventDefault?.();
    if (isSubmitting) return;

    showAlert('alertCarritoError', '', false);
    showAlert('alertCarritoExito', '', false);

    if (!currentCart.items || currentCart.items.length === 0) {
        showAlert('alertCarritoError', 'Tu carrito está vacío. Agrega al menos un producto antes de comprar.', true);
        return;
    }

    const txtNombre = document.getElementById('txtCarritoEnvioNombre');
    const txtDir = document.getElementById('txtCarritoEnvioDireccion');
    const txtCiudad = document.getElementById('txtCarritoEnvioCiudad');
    const txtPais = document.getElementById('txtCarritoEnvioPais');

    const validation = validateCheckoutPayload({
        shipName: txtNombre?.value,
        shipAddress: txtDir?.value,
        shipCity: txtCiudad?.value,
        shipCountry: txtPais?.value
    });

    setFieldValidationState(txtNombre, Boolean(validation.fieldErrors.shipName), document.getElementById('feedbackCarritoNombre'), validation.fieldErrors.shipName || '');
    setFieldValidationState(txtDir, Boolean(validation.fieldErrors.shipAddress), document.getElementById('feedbackCarritoDireccion'), validation.fieldErrors.shipAddress || '');
    setFieldValidationState(txtCiudad, Boolean(validation.fieldErrors.shipCity), document.getElementById('feedbackCarritoCiudad'), validation.fieldErrors.shipCity || '');
    setFieldValidationState(txtPais, Boolean(validation.fieldErrors.shipCountry), document.getElementById('feedbackCarritoPais'), validation.fieldErrors.shipCountry || '');

    if (!validation.valid) {
        const firstInvalid = [txtNombre, txtDir, txtCiudad, txtPais].find((el) => el?.classList.contains('is-invalid'));
        firstInvalid?.focus?.();
        return;
    }

    const btnConfirmar = document.getElementById('btnConfirmarCompraCarrito');
    const btnCancelar = document.getElementById('btnCancelarCarrito');
    isSubmitting = true;
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Procesando compra...';
    }
    if (btnCancelar) btnCancelar.disabled = true;

    try {
        const createdOrder = await cartModel.checkout(validation.values);
        renderOrderReceipt(createdOrder, validation.values);
        renderCartState({ items: [], totalQuantity: 0, total: 0 }, { keepReceiptVisible: true });
        document.getElementById('formCheckoutCarrito')?.reset();
        resetCheckoutValidation();
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 0;
        const message = extractProblemMessage(err, 'No se pudo completar la compra. Intenta nuevamente.');
        if (status === 400 || status === 404 || status === 409) {
            try {
                const refreshedCart = await cartModel.get();
                renderCartState(refreshedCart);
            } catch {
                // Conservar el estado visible si falla la recarga auxiliar
            }
        }
        showAlert('alertCarritoError', message, true);
    } finally {
        isSubmitting = false;
        if (btnConfirmar) {
            btnConfirmar.textContent = 'Confirmar Compra';
            const hasDiscontinued = currentCart.items.some((i) => i.discontinued);
            btnConfirmar.disabled = hasDiscontinued;
        }
        if (btnCancelar) btnCancelar.disabled = false;
    }
}

async function manejarCancelarCarrito() {
    if (isSubmitting) return;
    if (!currentCart.items || currentCart.items.length === 0) return;

    showAlert('alertCarritoError', '', false);
    showAlert('alertCarritoExito', '', false);

    const confirmed = confirmAction(
        '¿Confirmas que deseas cancelar tu carrito completo? Todos los productos serán devueltos al inventario.'
    );
    if (!confirmed) return;

    const btnCancelar = document.getElementById('btnCancelarCarrito');
    const btnConfirmar = document.getElementById('btnConfirmarCompraCarrito');
    isSubmitting = true;
    if (btnCancelar) {
        btnCancelar.disabled = true;
        btnCancelar.textContent = 'Cancelando...';
    }
    if (btnConfirmar) btnConfirmar.disabled = true;

    try {
        const emptyCart = await cartModel.cancel();
        renderCartState(emptyCart);
        showAlert('alertCarritoExito', 'Tu carrito fue cancelado por completo y todos los productos fueron devueltos al inventario.', true);
    } catch (err) {
        showAlert('alertCarritoError', extractProblemMessage(err, 'No se pudo cancelar el carrito. Intenta nuevamente.'), true);
    } finally {
        isSubmitting = false;
        if (btnCancelar) {
            btnCancelar.disabled = false;
            btnCancelar.textContent = 'Cancelar Carrito';
        }
        if (btnConfirmar) {
            const hasDiscontinued = currentCart.items.some((i) => i.discontinued);
            btnConfirmar.disabled = hasDiscontinued;
        }
    }
}

function configurarEventos() {
    const form = document.getElementById('formCheckoutCarrito');
    if (form && !form._cartBound) {
        form._cartBound = true;
        form.addEventListener('submit', manejarCheckout);
    }

    const btnCancelar = document.getElementById('btnCancelarCarrito');
    if (btnCancelar && !btnCancelar._cartBound) {
        btnCancelar._cartBound = true;
        btnCancelar.addEventListener('click', manejarCancelarCarrito);
    }

    [
        'txtCarritoEnvioNombre',
        'txtCarritoEnvioDireccion',
        'txtCarritoEnvioCiudad',
        'txtCarritoEnvioPais'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el._cartClearBound) {
            el._cartClearBound = true;
            el.addEventListener('input', () => setFieldValidationState(el, false));
        }
    });
}

async function initCartController() {
    const usuario = await initAuthenticatedView({
        authModel,
        requiredPermission: REQUIRED_PERMISSION,
        skipCartBadgeSync: true
    });
    if (!usuario) return;

    const txtNombre = document.getElementById('txtCarritoEnvioNombre');
    if (txtNombre && !txtNombre.value.trim() && usuario?.username) {
        txtNombre.value = usuario.username;
    }

    configurarEventos();
    await cargarCarrito();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authModel.isAuthenticated() ||
            !authModel.hasPermission(REQUIRED_PERMISSION)
        ) {
            return;
        }
        await initCartController();
    });
}
