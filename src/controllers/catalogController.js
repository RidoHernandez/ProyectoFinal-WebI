import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { orderService } from "../services/orderService.js";
import {
    clearTbody,
    formatCurrency,
    escapeHtml,
    initNavbar,
    resolveConnectedRole,
    setElementVisibility,
    showModal,
    bindModalDismiss,
    extractProblemMessage
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04 / TASK-F3-06)
authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);

let productos = [];

/**
 * Normaliza un objeto de producto proveniente del backend (camelCase o PascalCase).
 */
export function normalizarProductoCatalogo(p = {}) {
    const productId = p?.productId ?? p?.ProductId ?? '';
    const productName = String(p?.productName ?? p?.ProductName ?? '').trim();
    const rawPrice = p?.unitPrice ?? p?.UnitPrice ?? 0;
    const parsedPrice = Number(rawPrice);
    const unitPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
    const rawStock = p?.unitsInStock ?? p?.UnitsInStock ?? 0;
    const parsedStock = Number(rawStock);
    const unitsInStock = Number.isFinite(parsedStock) ? Math.trunc(parsedStock) : 0;
    const discontinued = Boolean(p?.discontinued ?? p?.Discontinued ?? false);

    return {
        productId,
        productName,
        unitPrice,
        unitsInStock,
        discontinued
    };
}

/**
 * Convierte un límite de precio opcional en número finito o null si está vacío/inválido.
 */
function parsePriceBound(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value).trim());
    return Number.isFinite(num) ? num : null;
}

/**
 * Filtra de forma pura la lista de productos del catálogo por texto (nombre o ID),
 * rango de precios (mínimo y máximo) y disponibilidad de stock.
 */
export function filtrarProductosCatalogo(
    lista,
    {
        texto = '',
        precioMin = null,
        precioMax = null,
        soloDisponibles = false,
        termino = undefined,
        search = undefined,
        minPrice = undefined,
        maxPrice = undefined,
        onlyAvailable = undefined
    } = {}
) {
    if (!Array.isArray(lista)) return [];

    const rawQuery = texto !== '' ? texto : (termino ?? search ?? '');
    const query = String(rawQuery ?? '').trim().toLowerCase();

    const minVal = parsePriceBound(precioMin ?? minPrice);
    const maxVal = parsePriceBound(precioMax ?? maxPrice);
    const requireStock = Boolean(soloDisponibles || onlyAvailable);

    return lista.filter((item) => {
        const prod = normalizarProductoCatalogo(item);
        const nombre = prod.productName.toLowerCase();
        const idStr = String(prod.productId).toLowerCase();

        const cumpleTexto = !query || nombre.includes(query) || idStr.includes(query) || `#${idStr}` === query;
        const cumplePrecioMin = minVal === null || prod.unitPrice >= minVal;
        const cumplePrecioMax = maxVal === null || prod.unitPrice <= maxVal;
        const cumpleStock = !requireStock || prod.unitsInStock > 0;

        return cumpleTexto && cumplePrecioMin && cumplePrecioMax && cumpleStock;
    });
}

/**
 * Permite establecer o consultar la caché en memoria de productos del catálogo.
 */
export function setProductosCatalogo(lista) {
    productos = Array.isArray(lista) ? [...lista] : [];
    return productos;
}

export function getProductosCatalogo() {
    return productos;
}

/**
 * Renderiza la cuadrícula de tarjetas de productos en #contenedorCatalogo
 * aplicando construcción segura del DOM y escape HTML contra XSS.
 */
export function renderizarTarjetas(lista, doc = typeof document !== 'undefined' ? document : null, options = {}) {
    const items = Array.isArray(lista) ? lista : [];
    if (!options?.esFiltrado && items.length > 0 && productos.length === 0) {
        productos = [...items];
    }

    if (!doc) return '';

    const contenedor = doc.getElementById('contenedorCatalogo');
    if (!contenedor) return '';

    const lblContador = doc.getElementById('lblTotalCatalogo');
    if (lblContador) {
        lblContador.textContent = `${items.length} producto(s)`;
    }

    clearTbody(contenedor);

    if (items.length === 0) {
        const emptyHtml = '<div class="col-12"><div class="alert alert-info mb-0">No hay productos disponibles con los criterios seleccionados.</div></div>';
        if (typeof doc.createElement === 'function') {
            const colEmpty = doc.createElement('div');
            colEmpty.className = 'col-12';
            const alertEmpty = doc.createElement('div');
            alertEmpty.className = 'alert alert-info mb-0';
            alertEmpty.textContent = 'No hay productos disponibles con los criterios seleccionados.';
            colEmpty.appendChild(alertEmpty);
            contenedor.appendChild(colEmpty);
        }
        return emptyHtml;
    }

    const htmlCards = [];

    for (const rawItem of items) {
        const prod = normalizarProductoCatalogo(rawItem);
        const stock = prod.unitsInStock;
        const disponible = stock > 0;
        const agotado = !disponible;
        const descontinuado = prod.discontinued;

        const nombreSeguro = escapeHtml(prod.productName);
        const idSeguro = escapeHtml(prod.productId);
        const precioFormateado = formatCurrency(prod.unitPrice);
        const precioSeguro = escapeHtml(precioFormateado);
        const stockSeguro = escapeHtml(stock);

        const cardClass = agotado
            ? 'card h-100 shadow-sm card-producto card-agotado border-danger-subtle opacity-75'
            : 'card h-100 shadow-sm border-0 card-producto card-disponible';
        const stockBadgeClass = agotado
            ? 'badge bg-danger-subtle text-danger border border-danger-subtle badge-agotado'
            : 'badge bg-success-subtle text-success border border-success-subtle badge-disponible';
        const stockBadgeText = agotado
            ? 'Agotado'
            : `Disponible (Stock: ${stock})`;
        const stockBadgeTextSeguro = agotado
            ? 'Agotado'
            : `Disponible (Stock: ${stockSeguro})`;

        const discBadgeHtml = descontinuado
            ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle badge-descontinuado">Descontinuado</span>'
            : '';

        const cardHtml = `
        <div class="col">
            <div class="${cardClass}" data-product-id="${idSeguro}" data-stock-status="${agotado ? 'agotado' : 'disponible'}">
                <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <h5 class="card-title fw-bold text-dark mb-0">${nombreSeguro}</h5>
                        <span class="badge bg-light text-secondary border">#${idSeguro}</span>
                    </div>
                    <p class="card-text text-primary fs-5 fw-semibold mb-3">${precioSeguro}</p>
                    <div class="mt-auto d-flex flex-wrap justify-content-between align-items-center gap-1">
                        <span class="${stockBadgeClass}">${stockBadgeTextSeguro}</span>${discBadgeHtml}
                    </div>
                </div>
            </div>
        </div>`;

        htmlCards.push(cardHtml);

        if (typeof doc.createElement === 'function') {
            const colEl = doc.createElement('div');
            colEl.className = 'col';

            const cardEl = doc.createElement('div');
            cardEl.className = cardClass;
            cardEl.setAttribute('data-product-id', String(prod.productId));
            cardEl.setAttribute('data-stock-status', agotado ? 'agotado' : 'disponible');
            cardEl.setAttribute('role', 'button');
            cardEl.setAttribute('tabindex', '0');
            cardEl.setAttribute('aria-label', `Ver detalle de ${prod.productName}`);

            const bodyEl = doc.createElement('div');
            bodyEl.className = 'card-body d-flex flex-column';

            const headerEl = doc.createElement('div');
            headerEl.className = 'd-flex justify-content-between align-items-start gap-2 mb-2';

            const titleEl = doc.createElement('h5');
            titleEl.className = 'card-title fw-bold text-dark mb-0';
            titleEl.textContent = prod.productName;

            const idBadgeEl = doc.createElement('span');
            idBadgeEl.className = 'badge bg-light text-secondary border';
            idBadgeEl.textContent = `#${prod.productId}`;

            headerEl.appendChild(titleEl);
            headerEl.appendChild(idBadgeEl);

            const priceEl = doc.createElement('p');
            priceEl.className = 'card-text text-primary fs-5 fw-semibold mb-3';
            priceEl.textContent = precioFormateado;

            const footerEl = doc.createElement('div');
            footerEl.className = 'mt-auto d-flex flex-wrap justify-content-between align-items-center gap-1';

            const stockBadgeEl = doc.createElement('span');
            stockBadgeEl.className = stockBadgeClass;
            stockBadgeEl.textContent = stockBadgeText;
            footerEl.appendChild(stockBadgeEl);

            if (descontinuado) {
                const discBadgeEl = doc.createElement('span');
                discBadgeEl.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle badge-descontinuado';
                discBadgeEl.textContent = 'Descontinuado';
                footerEl.appendChild(discBadgeEl);
            }

            bodyEl.appendChild(headerEl);
            bodyEl.appendChild(priceEl);
            bodyEl.appendChild(footerEl);
            cardEl.appendChild(bodyEl);
            colEl.appendChild(cardEl);
            contenedor.appendChild(colEl);
        }
    }

    const joinedHtml = htmlCards.join('');
    return joinedHtml;
}

/**
 * Configura los eventos de filtrado en tiempo real por texto, rango de precios
 * (mínimo y máximo), interruptor de disponibilidad y botón de limpiar filtros.
 */
export function configurarFiltrosCatalogo(arg = null, maybeDoc = null) {
    let doc = typeof document !== 'undefined' ? document : null;
    if (Array.isArray(arg)) {
        productos = [...arg];
        if (maybeDoc && typeof maybeDoc.getElementById === 'function') {
            doc = maybeDoc;
        }
    } else if (arg && typeof arg.getElementById === 'function') {
        doc = arg;
    }

    if (!doc) return null;

    const txtBuscar = doc.getElementById('txtBuscarCatalogo');
    const txtPrecioMin = doc.getElementById('txtPrecioMinCatalogo');
    const txtPrecioMax = doc.getElementById('txtPrecioMaxCatalogo');
    const chkSoloDisponibles = doc.getElementById('chkSoloDisponibles');
    const btnLimpiar = doc.getElementById('btnLimpiarFiltrosCatalogo');

    const aplicarFiltros = () => {
        const filtrados = filtrarProductosCatalogo(productos, {
            texto: txtBuscar?.value || '',
            precioMin: txtPrecioMin?.value ?? null,
            precioMax: txtPrecioMax?.value ?? null,
            soloDisponibles: Boolean(chkSoloDisponibles?.checked)
        });

        renderizarTarjetas(filtrados, doc, { esFiltrado: true });
        return filtrados;
    };

    const limpiarFiltros = () => {
        if (txtBuscar) txtBuscar.value = '';
        if (txtPrecioMin) txtPrecioMin.value = '';
        if (txtPrecioMax) txtPrecioMax.value = '';
        if (chkSoloDisponibles) chkSoloDisponibles.checked = false;
        return aplicarFiltros();
    };

    if (txtBuscar && !txtBuscar._catalogoBound) {
        txtBuscar._catalogoBound = true;
        txtBuscar.addEventListener('input', aplicarFiltros);
        txtBuscar.addEventListener('change', aplicarFiltros);
    }

    if (txtPrecioMin && !txtPrecioMin._catalogoBound) {
        txtPrecioMin._catalogoBound = true;
        txtPrecioMin.addEventListener('input', aplicarFiltros);
        txtPrecioMin.addEventListener('change', aplicarFiltros);
    }

    if (txtPrecioMax && !txtPrecioMax._catalogoBound) {
        txtPrecioMax._catalogoBound = true;
        txtPrecioMax.addEventListener('input', aplicarFiltros);
        txtPrecioMax.addEventListener('change', aplicarFiltros);
    }

    if (chkSoloDisponibles && !chkSoloDisponibles._catalogoBound) {
        chkSoloDisponibles._catalogoBound = true;
        chkSoloDisponibles.addEventListener('change', aplicarFiltros);
        chkSoloDisponibles.addEventListener('input', aplicarFiltros);
    }

    if (btnLimpiar && !btnLimpiar._catalogoBound) {
        btnLimpiar._catalogoBound = true;
        btnLimpiar.addEventListener('click', limpiarFiltros);
    }

    return { aplicarFiltros, limpiarFiltros };
}

/**
 * Carga el catálogo comercial invocando productService.getAll() (con respaldo a getProducts()).
 */
export async function cargarCatalogo(doc = typeof document !== 'undefined' ? document : null) {
    const contenedor = doc ? doc.getElementById('contenedorCatalogo') : null;

    try {
        const respuesta = typeof productService.getAll === 'function'
            ? await productService.getAll()
            : await productService.getProducts();

        if (Array.isArray(respuesta)) {
            productos = respuesta;
        } else if (respuesta && Array.isArray(respuesta.products)) {
            productos = respuesta.products;
        } else if (respuesta && Array.isArray(respuesta.Products)) {
            productos = respuesta.Products;
        } else {
            productos = [];
        }

        if (contenedor) {
            renderizarTarjetas(productos, doc, { esFiltrado: true });
        }
        return productos;
    } catch (err) {
        console.warn("Aviso al cargar catálogo:", err?.message || err);
        if (contenedor) {
            clearTbody(contenedor);
            if (doc && typeof doc.createElement === 'function') {
                const colWarn = doc.createElement('div');
                colWarn.className = 'col-12';
                const alertWarn = doc.createElement('div');
                alertWarn.className = 'alert alert-warning mb-0';
                alertWarn.textContent = 'No se pudieron cargar los productos.';
                colWarn.appendChild(alertWarn);
                contenedor.appendChild(colWarn);
            }
        }
        return [];
    }
}

/**
 * Valida estrictamente que la cantidad a comprar sea un entero positivo dentro del stock disponible.
 */
export function validarCantidadCompra(rawValue, maxStock = 0) {
    if (rawValue === null || rawValue === undefined || typeof rawValue === 'boolean' || typeof rawValue === 'object') {
        return { valid: false, error: 'Ingresa una cantidad entera válida (mínimo 1).' };
    }

    const str = String(rawValue).trim();
    if (!/^\d+$/.test(str)) {
        return { valid: false, error: 'La cantidad debe ser un número entero positivo sin decimales ni signos.' };
    }

    const qty = Number(str);
    if (!Number.isSafeInteger(qty) || qty < 1) {
        return { valid: false, error: 'La cantidad mínima de compra es 1 unidad.' };
    }

    const stock = Number.isFinite(Number(maxStock)) ? Math.trunc(Number(maxStock)) : 0;
    if (stock <= 0) {
        return { valid: false, error: 'Este producto no cuenta con stock disponible.' };
    }

    if (qty > stock) {
        return { valid: false, error: `Solo hay ${stock} unidad(es) disponibles en inventario.` };
    }

    return { valid: true, value: qty };
}

/**
 * Valida los datos básicos de envío del formulario de compra.
 */
export function validarDatosEnvio(datos = {}) {
    const shipName = String(datos?.shipName ?? '').trim();
    const shipAddress = String(datos?.shipAddress ?? '').trim();
    const shipCity = String(datos?.shipCity ?? '').trim();
    const shipCountry = String(datos?.shipCountry ?? '').trim();

    const fieldErrors = {};
    if (shipName.length < 2 || shipName.length > 80) {
        fieldErrors.shipName = 'Ingresa el nombre del destinatario (entre 2 y 80 caracteres).';
    }
    if (shipAddress.length < 4 || shipAddress.length > 200) {
        fieldErrors.shipAddress = 'Ingresa una dirección de envío válida (entre 4 y 200 caracteres).';
    }
    if (shipCity.length < 2 || shipCity.length > 60) {
        fieldErrors.shipCity = 'Ingresa la ciudad de entrega (entre 2 y 60 caracteres).';
    }
    if (shipCountry.length < 2 || shipCountry.length > 60) {
        fieldErrors.shipCountry = 'Ingresa el país de entrega (entre 2 y 60 caracteres).';
    }

    return {
        valid: Object.keys(fieldErrors).length === 0,
        fieldErrors,
        values: { shipName, shipAddress, shipCity, shipCountry }
    };
}

function findProductoEnCache(productId) {
    const targetId = String(productId ?? '').trim();
    if (!targetId) return null;
    const raw = productos.find((item) => {
        const norm = normalizarProductoCatalogo(item);
        return String(norm.productId) === targetId;
    });
    return raw ? normalizarProductoCatalogo(raw) : null;
}

function setFieldValidationState(el, invalid, feedbackEl = null, message = '') {
    if (!el) return;
    if (invalid) {
        el.classList?.add('is-invalid');
        el.setAttribute?.('aria-invalid', 'true');
        if (feedbackEl && message) feedbackEl.textContent = message;
    } else {
        el.classList?.remove('is-invalid');
        el.setAttribute?.('aria-invalid', 'false');
    }
}

function showCompraAlert(doc, message = '', visible = Boolean(message), variant = 'danger') {
    const alertEl = doc?.getElementById('alertCompraCatalogo');
    if (!alertEl) return;
    alertEl.className = `alert alert-${variant} py-2 px-3 small mb-3`;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function resetValidacionCompra(doc) {
    if (!doc) return;
    const fields = [
        'txtCantidadCompra',
        'txtEnvioNombre',
        'txtEnvioDireccion',
        'txtEnvioCiudad',
        'txtEnvioPais'
    ];
    for (const id of fields) {
        setFieldValidationState(doc.getElementById(id), false);
    }
}

/**
 * Actualiza en tiempo real el total estimado de compra en el modal.
 */
export function actualizarTotalCompra(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return 0;
    const prodId = doc.getElementById('compraProductoId')?.value;
    const txtCantidad = doc.getElementById('txtCantidadCompra');
    const lblTotal = doc.getElementById('lblTotalCompra');
    const prod = findProductoEnCache(prodId);

    if (!prod || !lblTotal) return 0;

    const validation = validarCantidadCompra(txtCantidad?.value, prod.unitsInStock);
    const total = validation.valid
        ? Math.round((validation.value * prod.unitPrice + Number.EPSILON) * 100) / 100
        : 0;
    lblTotal.textContent = formatCurrency(total);

    if (validation.valid && txtCantidad) {
        setFieldValidationState(txtCantidad, false);
    }
    return total;
}

/**
 * Abre el modal de detalle del producto seleccionado y muestra el formulario de compra solo para CLIENTE.
 */
export function abrirModalProductoCatalogo(productId, doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return null;
    const prod = findProductoEnCache(productId);
    if (!prod) return null;

    const modalEl = doc.getElementById('modalDetalleCatalogo');
    if (!modalEl) return null;

    const setText = (id, value) => {
        const el = doc.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setText('modalCatalogoTitulo', `Producto #${prod.productId}`);
    setText('detCatalogoId', `#${prod.productId}`);
    setText('detCatalogoNombre', prod.productName);
    setText('detCatalogoPrecio', formatCurrency(prod.unitPrice));
    setText('detCatalogoStock', prod.unitsInStock);

    const estadoEl = doc.getElementById('detCatalogoEstado');
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

    showCompraAlert(doc, '', false);
    setElementVisibility(doc.getElementById('resumenCompraCatalogo'), false);
    resetValidacionCompra(doc);

    const usuario = typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
    const role = resolveConnectedRole(usuario, authService);
    const seccionCompra = doc.getElementById('seccionCompraCatalogo');
    const footerSoloLectura = doc.getElementById('footerSoloLecturaCatalogo');

    if (role === 'CLIENTE') {
        setElementVisibility(seccionCompra, true);
        setElementVisibility(footerSoloLectura, false);

        const hiddenId = doc.getElementById('compraProductoId');
        if (hiddenId) hiddenId.value = String(prod.productId);

        const txtCantidad = doc.getElementById('txtCantidadCompra');
        const txtNombre = doc.getElementById('txtEnvioNombre');
        const txtDir = doc.getElementById('txtEnvioDireccion');
        const txtCiudad = doc.getElementById('txtEnvioCiudad');
        const txtPais = doc.getElementById('txtEnvioPais');
        const btnComprar = doc.getElementById('btnConfirmarCompra');

        const puedeComprar = prod.unitsInStock > 0 && !prod.discontinued;
        if (txtCantidad) {
            txtCantidad.max = String(Math.max(1, prod.unitsInStock));
            txtCantidad.value = puedeComprar ? '1' : '0';
            txtCantidad.disabled = !puedeComprar;
        }
        if (txtNombre) {
            txtNombre.disabled = !puedeComprar;
            if (!String(txtNombre.value || '').trim() && usuario?.username) {
                txtNombre.value = String(usuario.username);
            }
        }
        if (txtDir) txtDir.disabled = !puedeComprar;
        if (txtCiudad) txtCiudad.disabled = !puedeComprar;
        if (txtPais) txtPais.disabled = !puedeComprar;
        if (btnComprar) btnComprar.disabled = !puedeComprar;

        if (!puedeComprar) {
            const motivo = prod.discontinued
                ? 'Este producto está descontinuado y no se encuentra disponible para compra.'
                : 'Este producto está agotado temporalmente.';
            showCompraAlert(doc, motivo, true, 'warning');
        }

        actualizarTotalCompra(doc);
    } else {
        setElementVisibility(seccionCompra, false);
        setElementVisibility(footerSoloLectura, true);
    }

    showModal(modalEl);
    return prod;
}

function aplicarFiltrosActivos(doc) {
    if (!doc) return;
    const txtBuscar = doc.getElementById('txtBuscarCatalogo');
    const txtPrecioMin = doc.getElementById('txtPrecioMinCatalogo');
    const txtPrecioMax = doc.getElementById('txtPrecioMaxCatalogo');
    const chkSoloDisponibles = doc.getElementById('chkSoloDisponibles');

    const filtrados = filtrarProductosCatalogo(productos, {
        texto: txtBuscar?.value || '',
        precioMin: txtPrecioMin?.value ?? null,
        precioMax: txtPrecioMax?.value ?? null,
        soloDisponibles: Boolean(chkSoloDisponibles?.checked)
    });
    renderizarTarjetas(filtrados, doc, { esFiltrado: true });
}

/**
 * Valida y procesa la compra del producto seleccionado descontando stock real vía PUT /api/Products/{id}.
 */
export async function procesarCompraCatalogo(event, doc = typeof document !== 'undefined' ? document : null) {
    event?.preventDefault?.();
    if (!doc) return false;

    const usuario = typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
    if (resolveConnectedRole(usuario, authService) !== 'CLIENTE') {
        showCompraAlert(doc, 'Solo las cuentas con perfil CLIENTE pueden realizar compras desde el catálogo.', true);
        return false;
    }

    const prodId = doc.getElementById('compraProductoId')?.value;
    const prod = findProductoEnCache(prodId);
    if (!prod) {
        showCompraAlert(doc, 'No se encontró el producto seleccionado.', true);
        return false;
    }

    if (prod.discontinued || prod.unitsInStock <= 0) {
        showCompraAlert(doc, 'Este producto ya no está disponible para compra.', true, 'warning');
        return false;
    }

    const txtCantidad = doc.getElementById('txtCantidadCompra');
    const txtNombre = doc.getElementById('txtEnvioNombre');
    const txtDir = doc.getElementById('txtEnvioDireccion');
    const txtCiudad = doc.getElementById('txtEnvioCiudad');
    const txtPais = doc.getElementById('txtEnvioPais');

    const qtyResult = validarCantidadCompra(txtCantidad?.value, prod.unitsInStock);
    setFieldValidationState(
        txtCantidad,
        !qtyResult.valid,
        doc.getElementById('feedbackCantidadCompra'),
        qtyResult.error || ''
    );

    const shipResult = validarDatosEnvio({
        shipName: txtNombre?.value,
        shipAddress: txtDir?.value,
        shipCity: txtCiudad?.value,
        shipCountry: txtPais?.value
    });

    setFieldValidationState(txtNombre, Boolean(shipResult.fieldErrors.shipName), doc.getElementById('feedbackEnvioNombre'), shipResult.fieldErrors.shipName || '');
    setFieldValidationState(txtDir, Boolean(shipResult.fieldErrors.shipAddress), doc.getElementById('feedbackEnvioDireccion'), shipResult.fieldErrors.shipAddress || '');
    setFieldValidationState(txtCiudad, Boolean(shipResult.fieldErrors.shipCity), doc.getElementById('feedbackEnvioCiudad'), shipResult.fieldErrors.shipCity || '');
    setFieldValidationState(txtPais, Boolean(shipResult.fieldErrors.shipCountry), doc.getElementById('feedbackEnvioPais'), shipResult.fieldErrors.shipCountry || '');

    if (!qtyResult.valid || !shipResult.valid) {
        const firstInvalid = !qtyResult.valid
            ? txtCantidad
            : (shipResult.fieldErrors.shipName
                ? txtNombre
                : (shipResult.fieldErrors.shipAddress
                    ? txtDir
                    : (shipResult.fieldErrors.shipCity ? txtCiudad : txtPais)));
        firstInvalid?.focus?.();
        return false;
    }

    const cantidad = qtyResult.value;
    const nuevoStock = prod.unitsInStock - cantidad;
    const btnComprar = doc.getElementById('btnConfirmarCompra');

    showCompraAlert(doc, '', false);
    if (btnComprar) {
        btnComprar.disabled = true;
        btnComprar.textContent = 'Procesando...';
    }

    try {
        const createdOrder = await orderService.create({
            items: [
                {
                    productId: prod.productId,
                    quantity: cantidad
                }
            ],
            shipName: shipResult.values.shipName,
            shipAddress: shipResult.values.shipAddress,
            shipCity: shipResult.values.shipCity,
            shipCountry: shipResult.values.shipCountry
        });

        productos = productos.map((item) => {
            const norm = normalizarProductoCatalogo(item);
            if (String(norm.productId) === String(prod.productId)) {
                return { ...norm, unitsInStock: nuevoStock };
            }
            return item;
        });

        aplicarFiltrosActivos(doc);

        const stockEl = doc.getElementById('detCatalogoStock');
        if (stockEl) stockEl.textContent = String(nuevoStock);

        const estadoEl = doc.getElementById('detCatalogoEstado');
        if (estadoEl && nuevoStock <= 0) {
            estadoEl.textContent = 'Agotado';
            estadoEl.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
        }

        const totalPagado = formatCurrency(
            createdOrder?.total > 0
                ? createdOrder.total
                : Math.round((cantidad * prod.unitPrice + Number.EPSILON) * 100) / 100
        );
        const { shipName, shipAddress, shipCity, shipCountry } = shipResult.values;

        const setResText = (id, val) => {
            const el = doc.getElementById(id);
            if (el) el.textContent = String(val);
        };
        setResText('resCompraOrdenId', createdOrder?.orderId ? `#${createdOrder.orderId}` : '-');
        setResText('resCompraProducto', `${prod.productName} (#${prod.productId})`);
        setResText('resCompraCantidad', cantidad);
        setResText('resCompraTotal', totalPagado);
        setResText('resCompraDestino', `${shipName} — ${shipAddress}, ${shipCity}, ${shipCountry}`);
        setResText('resCompraStockRestante', nuevoStock);

        setElementVisibility(doc.getElementById('seccionCompraCatalogo'), false);
        setElementVisibility(doc.getElementById('resumenCompraCatalogo'), true);
        setElementVisibility(doc.getElementById('footerSoloLecturaCatalogo'), true);
        return true;
    } catch (err) {
        showCompraAlert(doc, extractProblemMessage(err, 'No se pudo completar la compra. Intenta nuevamente.'), true);
        return false;
    } finally {
        if (btnComprar) {
            btnComprar.disabled = false;
            btnComprar.textContent = 'Comprar';
        }
    }
}

/**
 * Configura la apertura del modal al hacer clic/activar tarjetas y los eventos del formulario de compra.
 */
export function configurarModalCatalogo(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;

    const contenedor = doc.getElementById('contenedorCatalogo');
    if (contenedor && !contenedor._modalCatalogoBound) {
        contenedor._modalCatalogoBound = true;

        const resolveCardProductId = (target) => {
            const card = target?.closest?.('.card-producto[data-product-id]')
                || (target?.getAttribute?.('data-product-id') ? target : null);
            return card?.getAttribute?.('data-product-id') || null;
        };

        contenedor.addEventListener('click', (e) => {
            const productId = resolveCardProductId(e?.target);
            if (productId) {
                abrirModalProductoCatalogo(productId, doc);
            }
        });

        contenedor.addEventListener('keydown', (e) => {
            if (e?.key !== 'Enter' && e?.key !== ' ') return;
            const productId = resolveCardProductId(e?.target);
            if (productId) {
                e.preventDefault?.();
                abrirModalProductoCatalogo(productId, doc);
            }
        });
    }

    const txtCantidad = doc.getElementById('txtCantidadCompra');
    if (txtCantidad && !txtCantidad._compraBound) {
        txtCantidad._compraBound = true;
        txtCantidad.addEventListener('input', () => actualizarTotalCompra(doc));
        txtCantidad.addEventListener('change', () => actualizarTotalCompra(doc));
    }

    const clearFieldErrorOnInput = (id) => {
        const el = doc.getElementById(id);
        if (el && !el._compraClearBound) {
            el._compraClearBound = true;
            el.addEventListener('input', () => setFieldValidationState(el, false));
        }
    };
    clearFieldErrorOnInput('txtEnvioNombre');
    clearFieldErrorOnInput('txtEnvioDireccion');
    clearFieldErrorOnInput('txtEnvioCiudad');
    clearFieldErrorOnInput('txtEnvioPais');

    const formCompra = doc.getElementById('formCompraCatalogo');
    if (formCompra && !formCompra._compraBound) {
        formCompra._compraBound = true;
        formCompra.addEventListener('submit', (e) => procesarCompraCatalogo(e, doc));
    }

    const modalEl = doc.getElementById('modalDetalleCatalogo');
    if (modalEl) {
        bindModalDismiss(modalEl, () => {
            showCompraAlert(doc, '', false);
            resetValidacionCompra(doc);
        });
    }
}

/**
 * Inicializa la vista de catálogo comercial.
 */
export async function initCatalogController(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;

    const usuario = (typeof authService.getCurrentUser === 'function' && authService.getCurrentUser())
        || await authService.checkSession();
    if (!usuario) {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './login.html';
        }
        return;
    }

    initNavbar(usuario, authService);
    configurarFiltrosCatalogo(doc);
    configurarModalCatalogo(doc);
    await cargarCatalogo(doc);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (document.body?.getAttribute?.('data-auth-blocked') || !authService.isAuthenticated() || !authService.hasRole(['ADMIN', 'EMPLEADO', 'CLIENTE'])) {
            return;
        }
        await initCatalogController(document);
    });
}
