import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { orderService } from "../services/orderService.js";
import {
    OrderModel,
    ORDER_STATUS,
    ORDER_STATUS_LIST,
    validateOrderId,
    canClientCancelStatus,
    validateOrderStatusTransition
} from "../models/orderModel.js";
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
const ownedOrderIds = new Set();
const inFlightOrderIds = new Set();
let rolActual = 'CLIENTE';
let usuarioActual = null;
let tabla = null;
let currentModalOrderId = null;

function getDoc(customDoc = null) {
    if (customDoc) return customDoc;
    return typeof document !== 'undefined' ? document : null;
}

function askConfirmation(message) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
        return Boolean(globalThis.confirm(message));
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return Boolean(window.confirm(message));
    }
    return false;
}

function showOrdersAlert(doc, message = '', visible = Boolean(message)) {
    const alertEl = doc?.getElementById('alertOrdenes');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function showOrdersSuccess(doc, message = '', visible = Boolean(message)) {
    const alertEl = doc?.getElementById('alertOrdenesExito');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function showDetailModalAlert(doc, message = '', visible = Boolean(message)) {
    const alertEl = doc?.getElementById('alertDetalleOrden');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function isOrderCancellableByCurrentClient(order, statusCode) {
    if (rolActual !== 'CLIENTE' || !order) return false;
    if (!canClientCancelStatus(statusCode)) return false;

    const orderId = Number(order.orderId ?? order.OrderId);
    if (Number.isFinite(orderId) && ownedOrderIds.has(orderId)) {
        return true;
    }
    return isOrderOwnedByClient(order, usuarioActual);
}

function updateModalActionControls(doc, order = null, status = null) {
    if (!doc) return;

    const adminWrapper = doc.getElementById('adminEstadoOrdenWrapper');
    const selModalStatus = doc.getElementById('selCambiarEstadoOrden');
    const btnGuardarEstado = doc.getElementById('btnGuardarEstadoOrden');
    const lblAyuda = doc.getElementById('lblEstadoOrdenAyuda');
    const btnCancelarModal = doc.getElementById('btnCancelarPedidoModal');

    if (!order || !status) {
        if (adminWrapper) setElementVisibility(adminWrapper, false);
        if (btnCancelarModal) setElementVisibility(btnCancelarModal, false);
        if (lblAyuda) lblAyuda.textContent = '';
        return;
    }

    const isAdmin = rolActual === 'ADMIN';
    if (adminWrapper) {
        setElementVisibility(adminWrapper, isAdmin);
    }

    if (isAdmin && selModalStatus) {
        selModalStatus.value = status.code;
        const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
        const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
        selModalStatus.disabled = isCancelled;
        if (btnGuardarEstado) {
            btnGuardarEstado.disabled = isCancelled;
        }

        if (Array.isArray(selModalStatus.children)) {
            for (const opt of selModalStatus.children) {
                if (opt?.value === ORDER_STATUS.CANCELADO.code) {
                    opt.disabled = isDelivered;
                }
            }
        } else if (typeof selModalStatus.querySelectorAll === 'function') {
            const opts = selModalStatus.querySelectorAll('option');
            for (const opt of opts) {
                if (opt?.value === ORDER_STATUS.CANCELADO.code) {
                    opt.disabled = isDelivered;
                }
            }
        }

        if (lblAyuda) {
            if (isCancelled) {
                lblAyuda.textContent = 'Este pedido fue cancelado y se encuentra en estado final irreversible.';
            } else if (isDelivered) {
                lblAyuda.textContent = 'Un pedido entregado no puede ser cancelado. Devolverlo a Pendiente requerirá confirmación.';
            } else {
                lblAyuda.textContent = 'Cancelar el pedido es irreversible y devuelve automáticamente el stock de los productos.';
            }
        }
    }

    if (btnCancelarModal) {
        const canCancel = isOrderCancellableByCurrentClient(order, status.code);
        setElementVisibility(btnCancelarModal, canCancel);
        btnCancelarModal.disabled = !canCancel;
        if (canCancel) {
            btnCancelarModal.setAttribute?.('data-id', String(order.orderId ?? ''));
        }
    }
}

function resetDetailModalState(doc, { errorMessage = '', title = 'Detalle de Orden' } = {}) {
    if (!doc) return;
    currentModalOrderId = null;

    const titleEl = doc.getElementById('modalDetalleOrdenTitulo');
    const badgeEl = doc.getElementById('detOrdenEstatus');

    if (titleEl) titleEl.textContent = title;
    if (badgeEl) {
        badgeEl.textContent = '-';
        badgeEl.className = 'badge bg-secondary ms-2';
    }
    showDetailModalAlert(doc, errorMessage, Boolean(errorMessage));

    const detailIds = [
        'detOrdenId',
        'detOrdenFecha',
        'detOrdenRequerida',
        'detOrdenEnvio',
        'detOrdenFlete',
        'detOrdenDestinatario',
        'detOrdenDireccion',
        'detOrdenCiudad',
        'detOrdenPais',
        'detOrdenDireccionCompleta'
    ];
    for (const id of detailIds) {
        const el = doc.getElementById(id);
        if (el) el.textContent = '-';
    }

    const totalEl = doc.getElementById('detOrdenTotal');
    if (totalEl) totalEl.textContent = '$0.00';

    const tbodyItems = doc.getElementById('tbodyDetalleOrdenProductos');
    if (tbodyItems) clearTbody(tbodyItems);

    const itemsWrapper = doc.getElementById('detOrdenProductosWrapper');
    if (itemsWrapper) setElementVisibility(itemsWrapper, false);

    updateModalActionControls(doc, null, null);
}

function renderDetailOrderItems(doc, order) {
    const itemsWrapper = doc.getElementById('detOrdenProductosWrapper');
    const tbodyItems = doc.getElementById('tbodyDetalleOrdenProductos');
    const totalEl = doc.getElementById('detOrdenTotal');

    if (!itemsWrapper || !tbodyItems) return;

    clearTbody(tbodyItems);
    const items = Array.isArray(order?.items) ? order.items : [];

    if (items.length === 0) {
        setElementVisibility(itemsWrapper, false);
        return;
    }

    let computedTotal = 0;
    for (const item of items) {
        const tr = doc.createElement('tr');

        const tdProd = doc.createElement('td');
        tdProd.textContent = String(item?.productName || `Producto #${item?.productId ?? ''}`);

        const tdPrice = doc.createElement('td');
        tdPrice.className = 'text-end';
        tdPrice.textContent = formatCurrency(item?.unitPrice ?? 0);

        const tdQty = doc.createElement('td');
        tdQty.className = 'text-end';
        tdQty.textContent = String(item?.quantity ?? 0);

        const subtotal = Number.isFinite(Number(item?.subtotal))
            ? Number(item.subtotal)
            : Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0);
        computedTotal += subtotal;

        const tdSubtotal = doc.createElement('td');
        tdSubtotal.className = 'text-end fw-semibold';
        tdSubtotal.textContent = formatCurrency(subtotal);

        tr.appendChild(tdProd);
        tr.appendChild(tdPrice);
        tr.appendChild(tdQty);
        tr.appendChild(tdSubtotal);
        tbodyItems.appendChild(tr);
    }

    const totalFinal = Number.isFinite(Number(order?.total)) && Number(order.total) > 0
        ? Number(order.total)
        : computedTotal;
    if (totalEl) totalEl.textContent = formatCurrency(totalFinal);
    setElementVisibility(itemsWrapper, true);
}

function populateDetailModal(doc, order, referenceDate = new Date()) {
    if (!doc || !order) return ORDER_STATUS.PENDIENTE;

    currentModalOrderId = Number(order.orderId ?? order.OrderId) || null;
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
    setField(
        'detOrdenEnvio',
        status.code === ORDER_STATUS.CANCELADO.code
            ? 'Cancelado'
            : (order.shippedDate ? formatDate(order.shippedDate) : 'Pendiente de envío')
    );
    setField(
        'detOrdenFlete',
        order.freight !== null && order.freight !== undefined ? formatCurrency(order.freight) : '-'
    );
    setField('detOrdenDestinatario', order.shipName || '-');
    setField('detOrdenDireccion', order.shipAddress || '-');
    setField('detOrdenCiudad', order.shipCity || '-');
    setField('detOrdenPais', order.shipCountry || '-');
    setField('detOrdenDireccionCompleta', fullAddress);

    const badgeEl = doc.getElementById('detOrdenEstatus');
    if (badgeEl) {
        badgeEl.textContent = status.label;
        badgeEl.className = `badge ms-2 ${status.badgeClass}`;
    }

    showDetailModalAlert(doc, '', false);
    renderDetailOrderItems(doc, order);
    updateModalActionControls(doc, order, status);

    return status;
}

export function resetOrdersState() {
    allOrdersCache = [];
    visibleOrdersCache = [];
    consultedOrderIds.clear();
    ownedOrderIds.clear();
    inFlightOrderIds.clear();
    rolActual = 'CLIENTE';
    usuarioActual = null;
    tabla = null;
    currentModalOrderId = null;
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
        return (Number.isFinite(idNum) && (idSet.has(idNum) || ownedOrderIds.has(idNum))) || isOrderOwnedByClient(order, usuario);
    });
}

// Filtro puro por estatus logístico (ALL | PENDIENTE | PENDIENTE_ENVIO | EN_TRANSITO | ENTREGADO | CANCELADO)
export function filtrarOrdenesPorEstado(orders = [], statusCode = 'ALL', referenceDate = new Date()) {
    if (!Array.isArray(orders)) return [];
    const normalized = String(statusCode || 'ALL').trim().toUpperCase();
    if (!normalized || normalized === 'ALL') {
        return [...orders];
    }

    return orders.filter((order) => OrderModel.resolveLogisticsStatus(order, referenceDate).code === normalized);
}

function buildAdminStatusSelectElement(doc, orderId, status) {
    const select = doc.createElement('select');
    select.className = 'form-select form-select-sm d-inline-block w-auto ms-1';
    select.setAttribute('data-action', 'cambiar-estado');
    select.setAttribute('data-id', String(orderId));
    select.setAttribute('aria-label', `Cambiar estado de orden #${orderId}`);

    const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
    const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
    select.disabled = isCancelled;

    for (const item of ORDER_STATUS_LIST) {
        const opt = doc.createElement('option');
        opt.value = item.code;
        opt.textContent = item.label;
        if (item.code === status.code) {
            opt.selected = true;
        }
        if (isDelivered && item.code === ORDER_STATUS.CANCELADO.code) {
            opt.disabled = true;
        }
        select.appendChild(opt);
    }

    select.value = status.code;
    return select;
}

function buildAdminStatusSelectHtml(orderId, status) {
    const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
    const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
    const disabledAttr = isCancelled ? ' disabled' : '';
    const optionsHtml = ORDER_STATUS_LIST.map((item) => {
        const selectedAttr = item.code === status.code ? ' selected' : '';
        const optDisabledAttr = isDelivered && item.code === ORDER_STATUS.CANCELADO.code ? ' disabled' : '';
        return `<option value="${escapeHtml(item.code)}"${selectedAttr}${optDisabledAttr}>${escapeHtml(item.label)}</option>`;
    }).join('');

    return `<select class="form-select form-select-sm d-inline-block w-auto ms-1" data-action="cambiar-estado" data-id="${escapeHtml(orderId)}" aria-label="Cambiar estado de orden #${escapeHtml(orderId)}"${disabledAttr}>${optionsHtml}</select>`;
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
        tdShippedDate.textContent = status.code === ORDER_STATUS.CANCELADO.code
            ? 'Cancelado'
            : (order?.shippedDate ? formatDate(order.shippedDate) : 'Pendiente');

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

        if (rolActual === 'ADMIN') {
            tdActions.appendChild(buildAdminStatusSelectElement(doc, orderId, status));
        } else if (isOrderCancellableByCurrentClient(order, status.code)) {
            const btnCancelar = doc.createElement('button');
            btnCancelar.type = 'button';
            btnCancelar.className = 'btn btn-sm btn-outline-danger ms-1';
            btnCancelar.setAttribute('data-action', 'cancelar');
            btnCancelar.setAttribute('data-id', String(orderId));
            btnCancelar.textContent = 'Cancelar Compra';
            tdActions.appendChild(btnCancelar);
        }

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
                render: (d, type, row) => {
                    const status = OrderModel.resolveLogisticsStatus(row);
                    if (type !== 'display') return String(d ?? '');
                    if (status.code === ORDER_STATUS.CANCELADO.code) return 'Cancelado';
                    return escapeHtml(d ? formatDate(d) : 'Pendiente');
                }
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
                render: (_, __, row) => {
                    const orderId = row?.orderId ?? '';
                    const status = OrderModel.resolveLogisticsStatus(row);
                    let html = `<button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(orderId)}">Ver Detalle</button>`;
                    if (rolActual === 'ADMIN') {
                        html += buildAdminStatusSelectHtml(orderId, status);
                    } else if (isOrderCancellableByCurrentClient(row, status.code)) {
                        html += `<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-action="cancelar" data-id="${escapeHtml(orderId)}">Cancelar Compra</button>`;
                    }
                    return html;
                }
            }
        ]
    }));
}

function upsertOrderInCache(updatedOrder) {
    if (!updatedOrder) return;
    const idNum = Number(updatedOrder.orderId ?? updatedOrder.OrderId);
    if (!Number.isFinite(idNum)) return;

    const idx = allOrdersCache.findIndex((o) => Number(o?.orderId ?? o?.OrderId) === idNum);
    if (idx >= 0) {
        allOrdersCache[idx] = updatedOrder;
    } else {
        allOrdersCache = [updatedOrder, ...allOrdersCache];
    }
}

export async function cambiarEstadoOrden(orderId, targetStatus, customDoc = null, sourceSelect = null) {
    const doc = getDoc(customDoc);
    showOrdersAlert(doc, '', false);
    showOrdersSuccess(doc, '', false);

    if (rolActual !== 'ADMIN') {
        const deniedMsg = 'Solo los administradores pueden cambiar el estado de los pedidos.';
        showOrdersAlert(doc, deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showOrdersAlert(doc, validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const validId = validation.value;
    const existingOrder = allOrdersCache.find((o) => Number(o?.orderId ?? o?.OrderId) === validId);
    const currentStatusObj = existingOrder
        ? OrderModel.resolveLogisticsStatus(existingOrder)
        : ORDER_STATUS.PENDIENTE;

    const revertSelect = () => {
        if (sourceSelect) {
            sourceSelect.value = currentStatusObj.code;
        }
        const modalSelect = doc?.getElementById('selCambiarEstadoOrden');
        if (modalSelect && currentModalOrderId === validId) {
            modalSelect.value = currentStatusObj.code;
        }
    };

    const transition = validateOrderStatusTransition(currentStatusObj.code, targetStatus, validId);
    if (!transition.valid) {
        revertSelect();
        showOrdersAlert(doc, transition.error, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(doc, transition.error, true);
        }
        return { ok: false, status: 409, message: transition.error };
    }

    if (transition.noOp) {
        return { ok: true, status: 200, noOp: true, data: existingOrder };
    }

    if (inFlightOrderIds.has(validId)) {
        return { ok: false, busy: true, status: 429, message: 'Ya existe una actualización en curso para este pedido.' };
    }

    if (transition.requiresConfirmation) {
        const confirmed = askConfirmation(transition.confirmMessage);
        if (!confirmed) {
            revertSelect();
            return { ok: false, cancelled: true, status: 0, message: 'Cambio de estado cancelado por el usuario.' };
        }
    }

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderService.updateStatus(validId, transition.targetCode);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes(doc);

        const newStatus = OrderModel.resolveLogisticsStatus(updated);
        if (currentModalOrderId === validId) {
            populateDetailModal(doc, updated);
        }

        const successMsg = newStatus.code === ORDER_STATUS.CANCELADO.code
            ? `El pedido #${validId} fue cancelado y las unidades de los productos fueron devueltas al stock.`
            : `El estado del pedido #${validId} se actualizó a "${newStatus.label}".`;
        showOrdersSuccess(doc, successMsg, true);

        return { ok: true, status: 200, data: updated, logisticsStatus: newStatus };
    } catch (err) {
        revertSelect();
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo actualizar el estado del pedido.');
        showOrdersAlert(doc, msg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(doc, msg, true);
        }
        return { ok: false, status, message: msg };
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

export async function cancelarPedidoCliente(orderId, customDoc = null) {
    const doc = getDoc(customDoc);
    showOrdersAlert(doc, '', false);
    showOrdersSuccess(doc, '', false);

    if (rolActual !== 'CLIENTE') {
        const deniedMsg = 'Esta acción está disponible únicamente para clientes sobre sus propios pedidos.';
        showOrdersAlert(doc, deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showOrdersAlert(doc, validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const validId = validation.value;
    const existingOrder = allOrdersCache.find((o) => Number(o?.orderId ?? o?.OrderId) === validId);
    const currentStatusObj = existingOrder
        ? OrderModel.resolveLogisticsStatus(existingOrder)
        : null;

    if (!existingOrder || (!ownedOrderIds.has(validId) && !isOrderOwnedByClient(existingOrder, usuarioActual))) {
        const deniedMsg = 'No tienes permiso para cancelar un pedido que no pertenece a tu cuenta.';
        showOrdersAlert(doc, deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    if (!currentStatusObj || !canClientCancelStatus(currentStatusObj.code)) {
        const conflictMsg = currentStatusObj?.code === ORDER_STATUS.CANCELADO.code
            ? 'Este pedido ya fue cancelado anteriormente.'
            : 'Un pedido ya entregado no puede ser cancelado.';
        showOrdersAlert(doc, conflictMsg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(doc, conflictMsg, true);
        }
        return { ok: false, status: 409, message: conflictMsg };
    }

    if (inFlightOrderIds.has(validId)) {
        return { ok: false, busy: true, status: 429, message: 'Ya existe una cancelación en curso para este pedido.' };
    }

    const confirmed = askConfirmation(
        `¿Confirmas que deseas cancelar tu compra del pedido #${validId}? Esta acción es irreversible y devolverá las unidades de los productos a su stock original.`
    );
    if (!confirmed) {
        return { ok: false, cancelled: true, status: 0, message: 'Cancelación abortada por el usuario.' };
    }

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderService.updateStatus(validId, ORDER_STATUS.CANCELADO.code);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes(doc);

        if (currentModalOrderId === validId) {
            populateDetailModal(doc, updated);
        }

        const successMsg = `Tu pedido #${validId} ha sido cancelado y las unidades fueron devueltas al inventario.`;
        showOrdersSuccess(doc, successMsg, true);
        return { ok: true, status: 200, data: updated };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cancelar el pedido.');
        showOrdersAlert(doc, msg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(doc, msg, true);
        }
        return { ok: false, status, message: msg };
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

export async function listarOrdenes(customDoc = null) {
    const doc = getDoc(customDoc);
    showOrdersAlert(doc, '', false);
    showOrdersSuccess(doc, '', false);

    try {
        const useMine = rolActual === 'CLIENTE' && typeof orderService.getMine === 'function';
        const data = useMine ? await orderService.getMine() : await orderService.getAll();
        allOrdersCache = Array.isArray(data) ? data : [];
        if (useMine) {
            ownedOrderIds.clear();
            for (const o of allOrdersCache) {
                const idNum = Number(o?.orderId ?? o?.OrderId);
                if (Number.isFinite(idNum) && idNum > 0) {
                    ownedOrderIds.add(idNum);
                }
            }
        }
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
        if (!preloadedOrder && order) {
            upsertOrderInCache(order);
        }
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
        upsertOrderInCache(order);

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
    const esAdmin = rolActual === 'ADMIN';
    const infoCliente = doc.getElementById('infoFiltroCliente');
    if (infoCliente) {
        setElementVisibility(infoCliente, esCliente);
    }

    const lblSubtitulo = doc.getElementById('lblSubtituloOrdenes');
    if (lblSubtitulo) {
        if (esAdmin) {
            lblSubtitulo.textContent = 'Gestión integral de órdenes, seguimiento y cambio de estados logísticos (Backend: /api/orders)';
        } else if (esCliente) {
            lblSubtitulo.textContent = 'Consulta de tus órdenes, seguimiento y cancelación de pedidos activos (Backend: /api/orders)';
        } else {
            lblSubtitulo.textContent = 'Consulta integral de órdenes y logística de envíos de solo lectura (Backend: /api/orders)';
        }
    }
}

function bindOnce(el, eventName, handler) {
    if (!el || typeof el.addEventListener !== 'function') return;
    if (!el.dataset) el.dataset = {};
    const boundKey = `ordersBound_${eventName}`;
    if (el.dataset[boundKey] === 'true') return;
    el.dataset[boundKey] = 'true';
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
    const btnGuardarEstado = doc.getElementById('btnGuardarEstadoOrden');
    const selModalEstado = doc.getElementById('selCambiarEstadoOrden');
    const btnCancelarModal = doc.getElementById('btnCancelarPedidoModal');

    bindOnce(formBuscar, 'submit', async (e) => {
        e?.preventDefault?.();
        await buscarOrdenPorId(txtBuscar?.value, doc);
    });

    bindOnce(btnLimpiar, 'click', () => {
        if (txtBuscar) txtBuscar.value = '';
        if (selEstado) selEstado.value = 'ALL';
        showOrdersAlert(doc, '', false);
        showOrdersSuccess(doc, '', false);
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
        } else if (action === 'cancelar' && orderId) {
            await cancelarPedidoCliente(orderId, doc);
        }
    });

    bindOnce(tablaEl, 'change', async (e) => {
        const target = e?.target;
        const select = target && typeof target.closest === 'function'
            ? target.closest('select[data-action="cambiar-estado"]')
            : target;
        if (!select) return;

        const action = select.dataset?.action || select.getAttribute?.('data-action');
        const orderId = select.dataset?.id || select.getAttribute?.('data-id');
        if (action === 'cambiar-estado' && orderId) {
            await cambiarEstadoOrden(orderId, select.value, doc, select);
        }
    });

    bindOnce(btnGuardarEstado, 'click', async () => {
        if (currentModalOrderId && selModalEstado) {
            await cambiarEstadoOrden(currentModalOrderId, selModalEstado.value, doc, selModalEstado);
        }
    });

    bindOnce(btnCancelarModal, 'click', async () => {
        const targetId = currentModalOrderId
            || btnCancelarModal?.dataset?.id
            || btnCancelarModal?.getAttribute?.('data-id');
        if (targetId) {
            await cancelarPedidoCliente(targetId, doc);
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
