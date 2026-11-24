import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { orderService } from "../services/orderService.js";
import { OrderModel, ORDER_STATUS, validateOrderId } from "../models/orderModel.js";
import {
    baseTableOptions,
    escapeHtml,
    safeTextRender,
    formatCurrency,
    formatDate,
    initNavbar,
    resolveConnectedRole,
    clearTbody,
    setElementVisibility,
    extractProblemMessage,
    showModal,
    bindModalDismiss
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04 / TASK-F4-04)
authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);

const ALLOWED_ROLES = ['ADMIN', 'EMPLEADO', 'CLIENTE'];

let allOrdersCache = [];
let visibleOrdersCache = [];
const consultedOrderIds = new Set();
let rolActual = 'CLIENTE';
let usuarioActual = null;
let tabla = null;

function getDoc(customDoc = null) {
    if (customDoc) return customDoc;
    return typeof document !== 'undefined' ? document : null;
}

function showOrdersAlert(doc, message = '', visible = Boolean(message)) {
    const alertEl = doc?.getElementById('alertOrdenes');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function resetDetailModalState(doc, { errorMessage = '', title = 'Detalle de Orden' } = {}) {
    if (!doc) return;

    const titleEl = doc.getElementById('modalDetalleOrdenTitulo');
    const badgeEl = doc.getElementById('detOrdenEstatus');
    const alertEl = doc.getElementById('alertDetalleOrden');

    if (titleEl) titleEl.textContent = title;
    if (badgeEl) {
        badgeEl.textContent = '-';
        badgeEl.className = 'badge bg-secondary ms-2';
    }
    if (alertEl) {
        alertEl.textContent = errorMessage ? String(errorMessage) : '';
        setElementVisibility(alertEl, Boolean(errorMessage));
    }

    const detailIds = [
        'detOrdenId',
        'detOrdenFecha',
        'detOrdenRequerida',
        'detOrdenEnvio',
        'detOrdenFlete',
        'detOrdenDestinatario',
        'detOrdenDireccion',
        'detOrdenCiudad',
        'detOrdenRegion',
        'detOrdenCodigoPostal',
        'detOrdenPais',
        'detOrdenDireccionCompleta'
    ];
    for (const id of detailIds) {
        const el = doc.getElementById(id);
        if (el) el.textContent = '-';
    }
}

function populateDetailModal(doc, order, referenceDate = new Date()) {
    if (!doc || !order) return ORDER_STATUS.PENDIENTE;

    const status = OrderModel.resolveLogisticsStatus(order, referenceDate);
    const fullAddress = OrderModel.formatPostalAddress(order);

    const setField = (id, value) => {
        const el = doc.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setField('modalDetalleOrdenTitulo', `Detalle de Orden #${order.orderId ?? '-'}`);
    setField('detOrdenId', order.orderId !== null && order.orderId !== undefined ? `#${order.orderId}` : '-');
    setField('detOrdenFecha', formatDate(order.orderDate));
    setField('detOrdenRequerida', formatDate(order.requiredDate));
    setField('detOrdenEnvio', order.shippedDate ? formatDate(order.shippedDate) : 'Pendiente de envío');
    setField(
        'detOrdenFlete',
        order.freight !== null && order.freight !== undefined ? formatCurrency(order.freight) : '-'
    );
    setField('detOrdenDestinatario', order.shipName || '-');
    setField('detOrdenDireccion', order.shipAddress || '-');
    setField('detOrdenCiudad', order.shipCity || '-');
    setField('detOrdenRegion', order.shipRegion || 'N/A');
    setField('detOrdenCodigoPostal', order.shipPostalCode || 'N/A');
    setField('detOrdenPais', order.shipCountry || '-');
    setField('detOrdenDireccionCompleta', fullAddress);

    const badgeEl = doc.getElementById('detOrdenEstatus');
    if (badgeEl) {
        badgeEl.textContent = status.label;
        badgeEl.className = `badge ms-2 ${status.badgeClass}`;
    }

    const alertEl = doc.getElementById('alertDetalleOrden');
    if (alertEl) {
        alertEl.textContent = '';
        setElementVisibility(alertEl, false);
    }

    return status;
}

export function resetOrdersState() {
    allOrdersCache = [];
    visibleOrdersCache = [];
    consultedOrderIds.clear();
    rolActual = 'CLIENTE';
    usuarioActual = null;
    tabla = null;
}

export function getAllOrdersCache() {
    return allOrdersCache;
}

export function getVisibleOrdersCache() {
    return visibleOrdersCache;
}

export function getConsultedOrderIds() {
    return new Set(consultedOrderIds);
}

// Determina si una orden pertenece a la cuenta del cliente conectado
export function isOrderOwnedByClient(order, usuario) {
    if (!order || typeof order !== 'object' || !usuario || typeof usuario !== 'object') {
        return false;
    }

    const rawUsername = String(usuario.username || usuario.nombre || '').trim().toLowerCase();
    if (!rawUsername) return false;

    const orderCustomerId = String(order.customerId ?? order.CustomerId ?? '').trim().toLowerCase();
    if (orderCustomerId && orderCustomerId === rawUsername) {
        return true;
    }

    if (rawUsername.length < 3) {
        return false;
    }

    const shipName = String(order.shipName ?? order.ShipName ?? '').trim().toLowerCase();
    if (!shipName) return false;

    const compactUser = rawUsername.replace(/[\s_-]+/g, '');
    const compactShip = shipName.replace(/[\s_-]+/g, '');
    return shipName.includes(rawUsername) || (compactUser.length >= 3 && compactShip === compactUser);
}

// Filtra las órdenes según el rol: ADMIN/EMPLEADO ven todas; CLIENTE solo propias o consultadas por ID
export function filtrarOrdenesPorRol(orders = [], usuario = usuarioActual, consultedIds = consultedOrderIds) {
    if (!Array.isArray(orders)) return [];

    const role = resolveConnectedRole(usuario, authService);
    if (role === 'ADMIN' || role === 'EMPLEADO') {
        return [...orders];
    }

    const idSet = consultedIds instanceof Set
        ? consultedIds
        : new Set(Array.isArray(consultedIds) ? consultedIds.map((v) => Number(v)) : []);

    return orders.filter((order) => {
        if (!order || typeof order !== 'object') return false;
        const idNum = Number(order.orderId ?? order.OrderId);
        return (Number.isFinite(idNum) && idSet.has(idNum)) || isOrderOwnedByClient(order, usuario);
    });
}

// Filtro puro por estatus logístico (ALL | ENTREGADO | EN_TRANSITO | PENDIENTE)
export function filtrarOrdenesPorEstado(orders = [], statusCode = 'ALL', referenceDate = new Date()) {
    if (!Array.isArray(orders)) return [];
    const normalized = String(statusCode || 'ALL').trim().toUpperCase();
    if (!normalized || normalized === 'ALL') {
        return [...orders];
    }

    return orders.filter((order) => OrderModel.resolveLogisticsStatus(order, referenceDate).code === normalized);
}

// Renderiza la tabla sin DataTables usando únicamente createElement y textContent (anti-XSS)
export function renderizarTablaOrdenesFallback(
    lista = visibleOrdersCache,
    customDoc = null,
    referenceDate = new Date()
) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    const tbody = doc.getElementById('tbodyPedidos');
    if (!tbody) return;

    clearTbody(tbody);
    const items = Array.isArray(lista) ? lista : [];

    if (items.length === 0) {
        const trEmpty = doc.createElement('tr');
        trEmpty.setAttribute?.('data-empty', 'true');
        const tdEmpty = doc.createElement('td');
        tdEmpty.colSpan = 9;
        tdEmpty.setAttribute?.('colspan', '9');
        tdEmpty.className = 'text-center text-muted py-3';
        tdEmpty.textContent = rolActual === 'CLIENTE'
            ? 'No hay órdenes asociadas a tu cuenta visibles actualmente. Ingresa tu N° de Orden en el buscador para consultarla.'
            : 'No se encontraron órdenes con los criterios seleccionados.';
        trEmpty.appendChild(tdEmpty);
        tbody.appendChild(trEmpty);
        return;
    }

    for (const order of items) {
        const orderId = order?.orderId ?? '';
        const status = OrderModel.resolveLogisticsStatus(order, referenceDate);

        const tr = doc.createElement('tr');
        tr.setAttribute?.('data-order-id', String(orderId));

        const tdId = doc.createElement('td');
        const strongId = doc.createElement('strong');
        strongId.textContent = `#${orderId}`;
        tdId.appendChild(strongId);

        const tdOrderDate = doc.createElement('td');
        tdOrderDate.textContent = formatDate(order?.orderDate);

        const tdShippedDate = doc.createElement('td');
        tdShippedDate.textContent = order?.shippedDate ? formatDate(order.shippedDate) : 'Pendiente';

        const tdStatus = doc.createElement('td');
        const spanStatus = doc.createElement('span');
        spanStatus.className = `badge ${status.badgeClass}`;
        spanStatus.textContent = status.label;
        tdStatus.appendChild(spanStatus);

        const tdFreight = doc.createElement('td');
        tdFreight.textContent = order?.freight !== null && order?.freight !== undefined
            ? formatCurrency(order.freight)
            : '-';

        const tdShipName = doc.createElement('td');
        tdShipName.textContent = String(order?.shipName || '-');

        const tdShipCity = doc.createElement('td');
        tdShipCity.textContent = String(order?.shipCity || '-');

        const tdShipCountry = doc.createElement('td');
        tdShipCountry.textContent = String(order?.shipCountry || '-');

        const tdActions = doc.createElement('td');
        tdActions.className = 'text-center text-nowrap';
        const btnVer = doc.createElement('button');
        btnVer.type = 'button';
        btnVer.className = 'btn btn-sm btn-outline-primary';
        btnVer.setAttribute('data-action', 'ver');
        btnVer.setAttribute('data-id', String(orderId));
        btnVer.textContent = 'Ver Detalle';
        tdActions.appendChild(btnVer);

        tr.appendChild(tdId);
        tr.appendChild(tdOrderDate);
        tr.appendChild(tdShippedDate);
        tr.appendChild(tdStatus);
        tr.appendChild(tdFreight);
        tr.appendChild(tdShipName);
        tr.appendChild(tdShipCity);
        tr.appendChild(tdShipCountry);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    }
}

export function aplicarFiltrosOrdenes(customDoc = null, referenceDate = new Date()) {
    const doc = getDoc(customDoc);
    const selEstado = doc?.getElementById('selEstadoOrden');
    const selectedStatus = selEstado?.value || 'ALL';

    const byRole = filtrarOrdenesPorRol(allOrdersCache, usuarioActual, consultedOrderIds);
    visibleOrdersCache = filtrarOrdenesPorEstado(byRole, selectedStatus, referenceDate);

    const lblTotal = doc?.getElementById('lblTotalOrdenes');
    if (lblTotal) {
        lblTotal.textContent = String(visibleOrdersCache.length);
    }

    if (tabla) {
        tabla.clear().rows.add(visibleOrdersCache).draw();
    } else {
        renderizarTablaOrdenesFallback(visibleOrdersCache, doc, referenceDate);
    }

    return visibleOrdersCache;
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') {
        tabla = null;
        return;
    }

    tabla = new DataTable('#tablaPedidos', baseTableOptions({
        order: [[0, 'desc']],
        columns: [
            {
                data: 'orderId',
                render: (d, type) => (type === 'display' ? `<strong>#${escapeHtml(d)}</strong>` : Number(d || 0))
            },
            {
                data: 'orderDate',
                render: (d, type) => (type === 'display' ? escapeHtml(formatDate(d)) : String(d ?? ''))
            },
            {
                data: 'shippedDate',
                render: (d, type) => (type === 'display' ? escapeHtml(d ? formatDate(d) : 'Pendiente') : String(d ?? ''))
            },
            {
                data: null,
                render: (_, type, row) => {
                    const status = OrderModel.resolveLogisticsStatus(row);
                    if (type !== 'display') return status.label;
                    return `<span class="badge ${escapeHtml(status.badgeClass)}">${escapeHtml(status.label)}</span>`;
                }
            },
            {
                data: 'freight',
                render: (d, type) => {
                    if (type !== 'display') return Number(d ?? 0);
                    return d !== null && d !== undefined ? escapeHtml(formatCurrency(d)) : '-';
                }
            },
            { data: 'shipName', render: safeTextRender('-') },
            { data: 'shipCity', render: safeTextRender('-') },
            { data: 'shipCountry', render: safeTextRender('-') },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center text-nowrap',
                render: (_, __, row) =>
                    `<button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row?.orderId ?? '')}">Ver Detalle</button>`
            }
        ]
    }));
}

export async function listarOrdenes(customDoc = null) {
    const doc = getDoc(customDoc);
    showOrdersAlert(doc, '', false);

    try {
        const data = await orderService.getAll();
        allOrdersCache = Array.isArray(data) ? data : [];
        return aplicarFiltrosOrdenes(doc);
    } catch (err) {
        allOrdersCache = [];
        visibleOrdersCache = [];

        const lblTotal = doc?.getElementById('lblTotalOrdenes');
        if (lblTotal) {
            lblTotal.textContent = '0';
        }

        if (tabla) {
            tabla.clear().draw();
        } else {
            renderizarTablaOrdenesFallback([], doc);
        }

        const msg = extractProblemMessage(err, 'No se pudieron cargar las órdenes.');
        showOrdersAlert(doc, msg, true);
        return [];
    }
}

export async function verDetalleOrden(orderId, customDoc = null, preloadedOrder = null) {
    const doc = getDoc(customDoc);
    const validation = validateOrderId(orderId);

    if (!validation.valid) {
        showOrdersAlert(doc, validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const validId = validation.value;

    if (rolActual === 'CLIENTE' && !preloadedOrder) {
        const isConsulted = consultedOrderIds.has(validId);
        const isVisible = visibleOrdersCache.some((o) => Number(o?.orderId) === validId);
        const cachedMatch = allOrdersCache.find((o) => Number(o?.orderId) === validId);
        const isOwned = Boolean(cachedMatch && isOrderOwnedByClient(cachedMatch, usuarioActual));

        if (!isConsulted && !isVisible && !isOwned) {
            const deniedMsg = 'No tienes permiso para acceder directamente a una orden ajena.';
            showOrdersAlert(doc, deniedMsg, true);
            return { ok: false, status: 403, message: deniedMsg };
        }
    }

    const modalEl = doc?.getElementById('modalDetalleOrden');
    showModal(modalEl);
    resetDetailModalState(doc, {
        title: `Detalle de Orden #${validId}`,
        errorMessage: ''
    });

    try {
        const order = preloadedOrder || await orderService.getById(validId);
        const status = populateDetailModal(doc, order);
        return { ok: true, status: 200, data: order, logisticsStatus: status };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cargar el detalle de la orden.');
        resetDetailModalState(doc, {
            title: `Detalle de Orden #${validId}`,
            errorMessage: msg
        });
        return { ok: false, status, message: msg };
    }
}

export async function buscarOrdenPorId(rawId, customDoc = null) {
    const doc = getDoc(customDoc);
    const validation = validateOrderId(rawId);

    if (!validation.valid) {
        showOrdersAlert(doc, validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    showOrdersAlert(doc, '', false);

    try {
        const order = await orderService.getById(validation.value);
        const resolvedId = Number(order?.orderId ?? validation.value);

        consultedOrderIds.add(resolvedId);

        const existingIndex = allOrdersCache.findIndex((o) => Number(o?.orderId) === resolvedId);
        if (existingIndex >= 0) {
            allOrdersCache[existingIndex] = order;
        } else {
            allOrdersCache = [order, ...allOrdersCache];
        }

        const selEstado = doc?.getElementById('selEstadoOrden');
        if (selEstado) {
            selEstado.value = 'ALL';
        }

        aplicarFiltrosOrdenes(doc);
        await verDetalleOrden(resolvedId, doc, order);

        return { ok: true, status: 200, data: order };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 404;
        const msg = extractProblemMessage(err, 'No se encontró la orden solicitada.');
        showOrdersAlert(doc, msg, true);
        return { ok: false, status, message: msg };
    }
}

function adaptarVistaPorRol(doc) {
    if (!doc) return;

    const esCliente = rolActual === 'CLIENTE';
    const infoCliente = doc.getElementById('infoFiltroCliente');
    if (infoCliente) {
        setElementVisibility(infoCliente, esCliente);
    }

    const lblSubtitulo = doc.getElementById('lblSubtituloOrdenes');
    if (lblSubtitulo) {
        lblSubtitulo.textContent = esCliente
            ? 'Consulta de tus órdenes y seguimiento por N° de Orden (Solo lectura — /api/orders)'
            : 'Consulta integral de órdenes y logística de envíos de solo lectura (Backend: /api/orders)';
    }
}

function bindOnce(el, eventName, handler) {
    if (!el || typeof el.addEventListener !== 'function') return;
    if (!el.dataset) el.dataset = {};
    if (el.dataset.ordersBound === 'true') return;
    el.dataset.ordersBound = 'true';
    el.addEventListener(eventName, handler);
}

function configurarEventos(doc) {
    if (!doc) return;

    const formBuscar = doc.getElementById('formBuscarOrdenId');
    const txtBuscar = doc.getElementById('txtBuscarOrdenId');
    const btnLimpiar = doc.getElementById('btnLimpiarOrdenId');
    const selEstado = doc.getElementById('selEstadoOrden');
    const tablaEl = doc.getElementById('tablaPedidos');
    const modalEl = doc.getElementById('modalDetalleOrden');

    bindOnce(formBuscar, 'submit', async (e) => {
        e?.preventDefault?.();
        await buscarOrdenPorId(txtBuscar?.value, doc);
    });

    bindOnce(btnLimpiar, 'click', () => {
        if (txtBuscar) txtBuscar.value = '';
        if (selEstado) selEstado.value = 'ALL';
        showOrdersAlert(doc, '', false);
        aplicarFiltrosOrdenes(doc);
    });

    bindOnce(selEstado, 'change', () => {
        aplicarFiltrosOrdenes(doc);
    });

    bindOnce(tablaEl, 'click', async (e) => {
        const target = e?.target;
        const btn = target && typeof target.closest === 'function'
            ? target.closest('button[data-action]')
            : target;
        if (!btn) return;

        const action = btn.dataset?.action || btn.getAttribute?.('data-action');
        const orderId = btn.dataset?.id || btn.getAttribute?.('data-id');
        if (action === 'ver' && orderId) {
            await verDetalleOrden(orderId, doc);
        }
    });

    if (modalEl) {
        bindModalDismiss(modalEl, () => resetDetailModalState(doc));
    }
}

export async function initOrdersController(customDoc = null) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    if (!authService.isAuthenticated() || !authService.hasRole(ALLOWED_ROLES)) {
        return;
    }

    const usuario = authService.getCurrentUser() || await authService.checkSession();
    if (!usuario) return;

    resetOrdersState();
    usuarioActual = usuario;
    rolActual = resolveConnectedRole(usuario, authService);

    initNavbar(usuario, authService);
    adaptarVistaPorRol(doc);
    inicializarTabla();
    configurarEventos(doc);
    await listarOrdenes(doc);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authService.isAuthenticated() ||
            !authService.hasRole(ALLOWED_ROLES)
        ) {
            return;
        }
        await initOrdersController(document);
    });
}
