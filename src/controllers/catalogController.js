import { authGuard, authModel } from "../models/authModel.js";
import { productModel } from "../models/productModel.js";
import { orderModel } from "../models/orderModel.js";
import {
    escapeHtml,
    formatCurrency,
    initAuthenticatedView,
    resolveConnectedPermissions,
    setElementVisibility,
    showModal,
    bindModalDismiss,
    extractProblemMessage
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

function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (!contenedor) return;

    const lblContador = document.getElementById('lblTotalCatalogo');
    if (lblContador) lblContador.textContent = `${lista.length} producto(s)`;

    if (lista.length === 0) {
        contenedor.innerHTML = '<div class="col-12"><div class="alert alert-info mb-0">No hay productos disponibles con los criterios seleccionados.</div></div>';
        return;
    }

    contenedor.innerHTML = lista.map((prod) => {
        const agotado = prod.unitsInStock <= 0;
        const cardClass = agotado
            ? 'card h-100 shadow-sm card-producto card-agotado border-danger-subtle opacity-75'
            : 'card h-100 shadow-sm border-0 card-producto card-disponible';
        const stockBadgeClass = agotado
            ? 'badge bg-danger-subtle text-danger border border-danger-subtle badge-agotado'
            : 'badge bg-success-subtle text-success border border-success-subtle badge-disponible';
        const stockText = agotado ? 'Agotado' : `Disponible (Stock: ${escapeHtml(prod.unitsInStock)})`;
        const discBadge = prod.discontinued
            ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle badge-descontinuado">Descontinuado</span>'
            : '';

        return `
        <div class="col">
            <div class="${cardClass}" data-product-id="${escapeHtml(prod.productId)}" data-stock-status="${agotado ? 'agotado' : 'disponible'}" role="button" tabindex="0" aria-label="Ver detalle de ${escapeHtml(prod.productName)}">
                <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <h5 class="card-title fw-bold text-dark mb-0">${escapeHtml(prod.productName)}</h5>
                        <span class="badge bg-light text-secondary border">#${escapeHtml(prod.productId)}</span>
                    </div>
                    <p class="card-text text-primary fs-5 fw-semibold mb-3">${escapeHtml(formatCurrency(prod.unitPrice))}</p>
                    <div class="mt-auto d-flex flex-wrap justify-content-between align-items-center gap-1">
                        <span class="${stockBadgeClass}">${stockText}</span>${discBadge}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
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
        renderizarTarjetas(productos);
    } catch (err) {
        console.warn('Aviso al cargar catálogo:', err?.message || err);
        if (contenedor) {
            contenedor.innerHTML = '<div class="col-12"><div class="alert alert-warning mb-0">No se pudieron cargar los productos.</div></div>';
        }
    }
}

function validarCantidadCompra(rawValue, maxStock = 0) {
    const str = String(rawValue ?? '').trim();
    const qty = Number(str);
    if (!/^\d+$/.test(str) || !Number.isSafeInteger(qty) || qty < 1) {
        return { valid: false, error: 'La cantidad debe ser un entero positivo (mínimo 1).' };
    }
    if (maxStock <= 0) {
        return { valid: false, error: 'Este producto no cuenta con stock disponible.' };
    }
    if (qty > maxStock) {
        return { valid: false, error: `Solo hay ${maxStock} unidad(es) disponibles en inventario.` };
    }
    return { valid: true, value: qty };
}

function validarDatosEnvio({ shipName = '', shipAddress = '', shipCity = '', shipCountry = '' } = {}) {
    const values = {
        shipName: String(shipName).trim(),
        shipAddress: String(shipAddress).trim(),
        shipCity: String(shipCity).trim(),
        shipCountry: String(shipCountry).trim()
    };
    const fieldErrors = {};
    if (values.shipName.length < 2 || values.shipName.length > 80) fieldErrors.shipName = 'Ingresa el nombre del destinatario (2 a 80 caracteres).';
    if (values.shipAddress.length < 4 || values.shipAddress.length > 200) fieldErrors.shipAddress = 'Ingresa una dirección de envío válida (4 a 200 caracteres).';
    if (values.shipCity.length < 2 || values.shipCity.length > 60) fieldErrors.shipCity = 'Ingresa la ciudad de entrega (2 a 60 caracteres).';
    if (values.shipCountry.length < 2 || values.shipCountry.length > 60) fieldErrors.shipCountry = 'Ingresa el país de entrega (2 a 60 caracteres).';

    return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, values };
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
    ['txtCantidadCompra', 'txtEnvioNombre', 'txtEnvioDireccion', 'txtEnvioCiudad', 'txtEnvioPais'].forEach((id) => {
        setFieldValidationState(document.getElementById(id), false);
    });
}

function actualizarTotalCompra() {
    const prod = findProducto(document.getElementById('compraProductoId')?.value);
    const txtCantidad = document.getElementById('txtCantidadCompra');
    const lblTotal = document.getElementById('lblTotalCompra');
    if (!prod || !lblTotal) return;

    const validation = validarCantidadCompra(txtCantidad?.value, prod.unitsInStock);
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
        const puedeComprar = prod.unitsInStock > 0 && !prod.discontinued;
        document.getElementById('compraProductoId').value = String(prod.productId);

        const txtCantidad = document.getElementById('txtCantidadCompra');
        const txtNombre = document.getElementById('txtEnvioNombre');
        txtCantidad.max = String(Math.max(1, prod.unitsInStock));
        txtCantidad.value = puedeComprar ? '1' : '0';

        if (!txtNombre.value.trim() && usuario?.username) {
            txtNombre.value = usuario.username;
        }

        ['txtCantidadCompra', 'txtEnvioNombre', 'txtEnvioDireccion', 'txtEnvioCiudad', 'txtEnvioPais', 'btnConfirmarCompra']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.disabled = !puedeComprar;
            });

        if (!puedeComprar) {
            showCompraAlert(
                prod.discontinued
                    ? 'Este producto está descontinuado y no se encuentra disponible para compra.'
                    : 'Este producto está agotado temporalmente.',
                true,
                'warning'
            );
        }
        actualizarTotalCompra();
    }

    showModal(modalEl);
}

async function procesarCompraCatalogo(event) {
    event?.preventDefault?.();

    const usuario = authModel.getCurrentUser();
    if (!resolveConnectedPermissions(usuario, authModel).canPurchaseCatalog) {
        showCompraAlert('Tu cuenta no está habilitada para realizar compras desde el catálogo.', true);
        return;
    }

    const prod = findProducto(document.getElementById('compraProductoId')?.value);
    if (!prod || prod.discontinued || prod.unitsInStock <= 0) {
        showCompraAlert('Este producto ya no está disponible para compra.', true, 'warning');
        return;
    }

    const txtCantidad = document.getElementById('txtCantidadCompra');
    const txtNombre = document.getElementById('txtEnvioNombre');
    const txtDir = document.getElementById('txtEnvioDireccion');
    const txtCiudad = document.getElementById('txtEnvioCiudad');
    const txtPais = document.getElementById('txtEnvioPais');

    const qtyResult = validarCantidadCompra(txtCantidad?.value, prod.unitsInStock);
    setFieldValidationState(txtCantidad, !qtyResult.valid, document.getElementById('feedbackCantidadCompra'), qtyResult.error || '');

    const shipResult = validarDatosEnvio({
        shipName: txtNombre?.value,
        shipAddress: txtDir?.value,
        shipCity: txtCiudad?.value,
        shipCountry: txtPais?.value
    });

    setFieldValidationState(txtNombre, Boolean(shipResult.fieldErrors.shipName), document.getElementById('feedbackEnvioNombre'), shipResult.fieldErrors.shipName || '');
    setFieldValidationState(txtDir, Boolean(shipResult.fieldErrors.shipAddress), document.getElementById('feedbackEnvioDireccion'), shipResult.fieldErrors.shipAddress || '');
    setFieldValidationState(txtCiudad, Boolean(shipResult.fieldErrors.shipCity), document.getElementById('feedbackEnvioCiudad'), shipResult.fieldErrors.shipCity || '');
    setFieldValidationState(txtPais, Boolean(shipResult.fieldErrors.shipCountry), document.getElementById('feedbackEnvioPais'), shipResult.fieldErrors.shipCountry || '');

    if (!qtyResult.valid || !shipResult.valid) {
        const firstInvalid = [txtCantidad, txtNombre, txtDir, txtCiudad, txtPais].find((el) => el?.classList.contains('is-invalid'));
        firstInvalid?.focus?.();
        return;
    }

    const cantidad = qtyResult.value;
    const nuevoStock = prod.unitsInStock - cantidad;
    const btnComprar = document.getElementById('btnConfirmarCompra');
    showCompraAlert('', false);
    if (btnComprar) {
        btnComprar.disabled = true;
        btnComprar.textContent = 'Procesando...';
    }

    try {
        const createdOrder = await orderModel.create({
            items: [{ productId: prod.productId, quantity: cantidad }],
            ...shipResult.values
        });

        prod.unitsInStock = nuevoStock;
        aplicarFiltrosActivos();

        document.getElementById('detCatalogoStock').textContent = String(nuevoStock);
        if (nuevoStock <= 0) {
            const estadoEl = document.getElementById('detCatalogoEstado');
            estadoEl.textContent = 'Agotado';
            estadoEl.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
        }

        const totalPagado = formatCurrency(createdOrder?.total > 0 ? createdOrder.total : cantidad * prod.unitPrice);
        const { shipName, shipAddress, shipCity, shipCountry } = shipResult.values;
        const summary = {
            resCompraOrdenId: createdOrder?.orderId ? `#${createdOrder.orderId}` : '-',
            resCompraProducto: `${prod.productName} (#${prod.productId})`,
            resCompraCantidad: cantidad,
            resCompraTotal: totalPagado,
            resCompraDestino: `${shipName} — ${shipAddress}, ${shipCity}, ${shipCountry}`,
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
        showCompraAlert(extractProblemMessage(err, 'No se pudo completar la compra. Intenta nuevamente.'), true);
    } finally {
        if (btnComprar) {
            btnComprar.disabled = false;
            btnComprar.textContent = 'Comprar';
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

    ['txtEnvioNombre', 'txtEnvioDireccion', 'txtEnvioCiudad', 'txtEnvioPais'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el._compraClearBound) {
            el._compraClearBound = true;
            el.addEventListener('input', () => setFieldValidationState(el, false));
        }
    });

    const formCompra = document.getElementById('formCompraCatalogo');
    if (formCompra && !formCompra._compraBound) {
        formCompra._compraBound = true;
        formCompra.addEventListener('submit', procesarCompraCatalogo);
    }

    bindModalDismiss(document.getElementById('modalDetalleCatalogo'), () => {
        showCompraAlert('', false);
        resetValidacionCompra();
    });
}

async function initCatalogController() {
    const usuario = await initAuthenticatedView({ authModel });
    if (!usuario) return;

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
