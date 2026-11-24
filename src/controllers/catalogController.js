import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { formatCurrency, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

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

    const minVal = parsePriceBound(precioMin !== null ? precioMin : minPrice);
    const maxVal = parsePriceBound(precioMax !== null ? precioMax : maxPrice);
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

    if (Array.isArray(contenedor.children)) {
        contenedor.children.length = 0;
        contenedor.innerHTML = '';
    }
    contenedor.textContent = '';

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
        if (!contenedor.innerHTML) {
            contenedor.innerHTML = emptyHtml;
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

            if (!colEl.innerHTML) {
                colEl.innerHTML = cardHtml;
            }
            contenedor.appendChild(colEl);
        }
    }

    const joinedHtml = htmlCards.join('');
    if (!contenedor.innerHTML) {
        contenedor.innerHTML = joinedHtml;
    }

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
            if (Array.isArray(contenedor.children)) {
                contenedor.children.length = 0;
                contenedor.innerHTML = '';
            }
            contenedor.textContent = '';
            const warnHtml = '<div class="col-12"><div class="alert alert-warning mb-0">No se pudieron cargar los productos.</div></div>';
            if (doc && typeof doc.createElement === 'function') {
                const colWarn = doc.createElement('div');
                colWarn.className = 'col-12';
                const alertWarn = doc.createElement('div');
                alertWarn.className = 'alert alert-warning mb-0';
                alertWarn.textContent = 'No se pudieron cargar los productos.';
                colWarn.appendChild(alertWarn);
                contenedor.appendChild(colWarn);
            }
            if (!contenedor.innerHTML) {
                contenedor.innerHTML = warnHtml;
            }
        }
        return [];
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
    await cargarCatalogo(doc);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initCatalogController(document);
    });
}
