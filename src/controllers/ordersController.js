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
    confirmAction,
    escapeHtml,
    safeTextRender,
    formatCurrency,
    formatDate,
    initAuthenticatedView,
    resolveConnectedPermissions,
    clearTbody,
    setElementVisibility,
    extractProblemMessage,
    showModal,
    bindModalDismiss
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable
authGuard();

let allOrdersCache = [];
let visibleOrdersCache = [];
const consultedOrderIds = new Set();
const ownedOrderIds = new Set();
const inFlightOrderIds = new Set();
let permisosActuales = {
    canViewAllOrders: false,
    canUpdateOrderStatus: false,
    canCancelOwnOrders: false
};
let usuarioActual = null;
let tabla = null;
let currentModalOrderId = null;

function showOrdersAlert(message = '', visible = Boolean(message)) {
    const alertEl = document.getElementById('alertOrdenes');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function showOrdersSuccess(message = '', visible = Boolean(message)) {
    const alertEl = document.getElementById('alertOrdenesExito');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function showDetailModalAlert(message = '', visible = Boolean(message)) {
    const alertEl = document.getElementById('alertDetalleOrden');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function setOrdersTableMessage(message) {
    const tbody = document.getElementById('tbodyPedidos');
    if (!tbody) return;
    clearTbody(tbody);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9;
    td.className = 'text-center text-muted py-3';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function isOrderCancellableByCurrentUser(order, statusCode) {
    if (!permisosActuales.canCancelOwnOrders || !order) return false;
    if (!canClientCancelStatus(statusCode)) return false;

    const orderId = Number(order.orderId ?? order.OrderId);
    if (Number.isFinite(orderId) && ownedOrderIds.has(orderId)) {
        return true;
    }
    return isOrderOwnedByClient(order, usuarioActual);
}

function updateModalActionControls(order = null, status = null) {
    const adminWrapper = document.getElementById('adminEstadoOrdenWrapper');
    const selModalStatus = document.getElementById('selCambiarEstadoOrden');
    const btnGuardarEstado = document.getElementById('btnGuardarEstadoOrden');
    const lblAyuda = document.getElementById('lblEstadoOrdenAyuda');
    const btnCancelarModal = document.getElementById('btnCancelarPedidoModal');

    if (!order || !status) {
        if (adminWrapper) setElementVisibility(adminWrapper, false);
        if (btnCancelarModal) setElementVisibility(btnCancelarModal, false);
        if (lblAyuda) lblAyuda.textContent = '';
        return;
    }

    const canManageStatus = Boolean(permisosActuales.canUpdateOrderStatus);
    if (adminWrapper) {
        setElementVisibility(adminWrapper, canManageStatus);
    }

    if (canManageStatus && selModalStatus) {
        selModalStatus.value = status.code;
        const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
        const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
        selModalStatus.disabled = isCancelled;
        if (btnGuardarEstado) {
            btnGuardarEstado.disabled = isCancelled;
        }

        for (const opt of selModalStatus.querySelectorAll('option')) {
            if (opt.value === ORDER_STATUS.CANCELADO.code) {
                opt.disabled = isDelivered;
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
        const canCancel = isOrderCancellableByCurrentUser(order, status.code);
        setElementVisibility(btnCancelarModal, canCancel);
        btnCancelarModal.disabled = !canCancel;
        if (canCancel) {
            btnCancelarModal.setAttribute('data-id', String(order.orderId ?? ''));
        }
    }
}

function resetDetailModalState({ errorMessage = '', title = 'Detalle de Orden' } = {}) {
    currentModalOrderId = null;

    const titleEl = document.getElementById('modalDetalleOrdenTitulo');
    const badgeEl = document.getElementById('detOrdenEstatus');

    if (titleEl) titleEl.textContent = title;
    if (badgeEl) {
        badgeEl.textContent = '-';
        badgeEl.className = 'badge bg-secondary ms-2';
    }
    showDetailModalAlert(errorMessage, Boolean(errorMessage));

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
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    }

    const totalEl = document.getElementById('detOrdenTotal');
    if (totalEl) totalEl.textContent = '$0.00';

    const tbodyItems = document.getElementById('tbodyDetalleOrdenProductos');
    if (tbodyItems) clearTbody(tbodyItems);

    const itemsWrapper = document.getElementById('detOrdenProductosWrapper');
    if (itemsWrapper) setElementVisibility(itemsWrapper, false);

    updateModalActionControls(null, null);
}

function renderDetailOrderItems(order) {
    const itemsWrapper = document.getElementById('detOrdenProductosWrapper');
    const tbodyItems = document.getElementById('tbodyDetalleOrdenProductos');
    const totalEl = document.getElementById('detOrdenTotal');

    if (!itemsWrapper || !tbodyItems) return;

    clearTbody(tbodyItems);
    const items = Array.isArray(order?.items) ? order.items : [];

    if (items.length === 0) {
        setElementVisibility(itemsWrapper, false);
        return;
    }

    let computedTotal = 0;
    for (const item of items) {
        const tr = document.createElement('tr');

        const tdProd = document.createElement('td');
        tdProd.textContent = String(item?.productName || `Producto #${item?.productId ?? ''}`);

        const tdPrice = document.createElement('td');
        tdPrice.className = 'text-end';
        tdPrice.textContent = formatCurrency(item?.unitPrice ?? 0);

        const tdQty = document.createElement('td');
        tdQty.className = 'text-end';
        tdQty.textContent = String(item?.quantity ?? 0);

        const subtotal = Number.isFinite(Number(item?.subtotal))
            ? Number(item.subtotal)
            : Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0);
        computedTotal += subtotal;

        const tdSubtotal = document.createElement('td');
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

function populateDetailModal(order, referenceDate = new Date()) {
    if (!order) return ORDER_STATUS.PENDIENTE;

    currentModalOrderId = Number(order.orderId ?? order.OrderId) || null;
    const status = OrderModel.resolveLogisticsStatus(order, referenceDate);
    const fullAddress = OrderModel.formatPostalAddress(order);

    const setField = (id, value) => {
        const el = document.getElementById(id);
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

    const badgeEl = document.getElementById('detOrdenEstatus');
    if (badgeEl) {
        badgeEl.textContent = status.label;
        badgeEl.className = `badge ms-2 ${status.badgeClass}`;
    }

    showDetailModalAlert('', false);
    renderDetailOrderItems(order);
    updateModalActionControls(order, status);

    return status;
}

function resetOrdersState() {
    allOrdersCache = [];
    visibleOrdersCache = [];
    consultedOrderIds.clear();
    ownedOrderIds.clear();
    inFlightOrderIds.clear();
    permisosActuales = {
        canViewAllOrders: false,
        canUpdateOrderStatus: false,
        canCancelOwnOrders: false
    };
    usuarioActual = null;
    tabla = null;
    currentModalOrderId = null;
}

// Determina si una orden pertenece a la cuenta del cliente conectado
function isOrderOwnedByClient(order, usuario) {
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

// Filtra las órdenes según los permisos autorizados por el backend
function filtrarOrdenesPorPermisos(orders = [], usuario = usuarioActual, consultedIds = consultedOrderIds) {
    if (!Array.isArray(orders)) return [];

    const perms = resolveConnectedPermissions(usuario, authService);
    if (perms.canViewAllOrders) {
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
function filtrarOrdenesPorEstado(orders = [], statusCode = 'ALL', referenceDate = new Date()) {
    if (!Array.isArray(orders)) return [];
    const normalized = String(statusCode || 'ALL').trim().toUpperCase();
    if (!normalized || normalized === 'ALL') {
        return [...orders];
    }

    return orders.filter((order) => OrderModel.resolveLogisticsStatus(order, referenceDate).code === normalized);
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

function aplicarFiltrosOrdenes(referenceDate = new Date()) {
    const selEstado = document.getElementById('selEstadoOrden');
    const selectedStatus = selEstado?.value || 'ALL';

    const byPermission = filtrarOrdenesPorPermisos(allOrdersCache, usuarioActual, consultedOrderIds);
    visibleOrdersCache = filtrarOrdenesPorEstado(byPermission, selectedStatus, referenceDate);

    const lblTotal = document.getElementById('lblTotalOrdenes');
    if (lblTotal) {
        lblTotal.textContent = String(visibleOrdersCache.length);
    }

    if (tabla) {
        tabla.clear().rows.add(visibleOrdersCache).draw();
    } else if (visibleOrdersCache.length === 0) {
        setOrdersTableMessage(
            !permisosActuales.canViewAllOrders
                ? 'No hay órdenes asociadas a tu cuenta visibles actualmente. Ingresa tu N° de Orden en el buscador para consultarla.'
                : 'No se encontraron órdenes con los criterios seleccionados.'
        );
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
                    if (permisosActuales.canUpdateOrderStatus) {
                        html += buildAdminStatusSelectHtml(orderId, status);
                    } else if (isOrderCancellableByCurrentUser(row, status.code)) {
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

async function cambiarEstadoOrden(orderId, targetStatus, sourceSelect = null) {
    showOrdersAlert('', false);
    showOrdersSuccess('', false);

    if (!permisosActuales.canUpdateOrderStatus) {
        const deniedMsg = 'No tienes permisos para cambiar el estado de los pedidos.';
        showOrdersAlert(deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showOrdersAlert(validation.error, true);
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
        const modalSelect = document.getElementById('selCambiarEstadoOrden');
        if (modalSelect && currentModalOrderId === validId) {
            modalSelect.value = currentStatusObj.code;
        }
    };

    const transition = validateOrderStatusTransition(currentStatusObj.code, targetStatus, validId);
    if (!transition.valid) {
        revertSelect();
        showOrdersAlert(transition.error, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(transition.error, true);
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
        const confirmed = confirmAction(transition.confirmMessage);
        if (!confirmed) {
            revertSelect();
            return { ok: false, cancelled: true, status: 0, message: 'Cambio de estado cancelado por el usuario.' };
        }
    }

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderService.updateStatus(validId, transition.targetCode);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes();

        const newStatus = OrderModel.resolveLogisticsStatus(updated);
        if (currentModalOrderId === validId) {
            populateDetailModal(updated);
        }

        const successMsg = newStatus.code === ORDER_STATUS.CANCELADO.code
            ? `El pedido #${validId} fue cancelado y las unidades de los productos fueron devueltas al stock.`
            : `El estado del pedido #${validId} se actualizó a "${newStatus.label}".`;
        showOrdersSuccess(successMsg, true);

        return { ok: true, status: 200, data: updated, logisticsStatus: newStatus };
    } catch (err) {
        revertSelect();
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo actualizar el estado del pedido.');
        showOrdersAlert(msg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(msg, true);
        }
        return { ok: false, status, message: msg };
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

async function cancelarPedidoCliente(orderId) {
    showOrdersAlert('', false);
    showOrdersSuccess('', false);

    if (!permisosActuales.canCancelOwnOrders) {
        const deniedMsg = 'No tienes permisos para cancelar pedidos desde esta acción.';
        showOrdersAlert(deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showOrdersAlert(validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const validId = validation.value;
    const existingOrder = allOrdersCache.find((o) => Number(o?.orderId ?? o?.OrderId) === validId);
    const currentStatusObj = existingOrder
        ? OrderModel.resolveLogisticsStatus(existingOrder)
        : null;

    if (!existingOrder || (!ownedOrderIds.has(validId) && !isOrderOwnedByClient(existingOrder, usuarioActual))) {
        const deniedMsg = 'No tienes permiso para cancelar un pedido que no pertenece a tu cuenta.';
        showOrdersAlert(deniedMsg, true);
        return { ok: false, status: 403, message: deniedMsg };
    }

    if (!currentStatusObj || !canClientCancelStatus(currentStatusObj.code)) {
        const conflictMsg = currentStatusObj?.code === ORDER_STATUS.CANCELADO.code
            ? 'Este pedido ya fue cancelado anteriormente.'
            : 'Un pedido ya entregado no puede ser cancelado.';
        showOrdersAlert(conflictMsg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(conflictMsg, true);
        }
        return { ok: false, status: 409, message: conflictMsg };
    }

    if (inFlightOrderIds.has(validId)) {
        return { ok: false, busy: true, status: 429, message: 'Ya existe una cancelación en curso para este pedido.' };
    }

    const confirmed = confirmAction(
        `¿Confirmas que deseas cancelar tu compra del pedido #${validId}? Esta acción es irreversible y devolverá las unidades de los productos a su stock original.`
    );
    if (!confirmed) {
        return { ok: false, cancelled: true, status: 0, message: 'Cancelación abortada por el usuario.' };
    }

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderService.updateStatus(validId, ORDER_STATUS.CANCELADO.code);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes();

        if (currentModalOrderId === validId) {
            populateDetailModal(updated);
        }

        const successMsg = `Tu pedido #${validId} ha sido cancelado y las unidades fueron devueltas al inventario.`;
        showOrdersSuccess(successMsg, true);
        return { ok: true, status: 200, data: updated };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cancelar el pedido.');
        showOrdersAlert(msg, true);
        if (currentModalOrderId === validId) {
            showDetailModalAlert(msg, true);
        }
        return { ok: false, status, message: msg };
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

async function listarOrdenes() {
    showOrdersAlert('', false);
    showOrdersSuccess('', false);

    try {
        const useMine = !permisosActuales.canViewAllOrders;
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
        return aplicarFiltrosOrdenes();
    } catch (err) {
        allOrdersCache = [];
        visibleOrdersCache = [];

        const lblTotal = document.getElementById('lblTotalOrdenes');
        if (lblTotal) {
            lblTotal.textContent = '0';
        }

        if (tabla) {
            tabla.clear().draw();
        } else {
            setOrdersTableMessage('No se pudieron cargar las órdenes.');
        }

        const msg = extractProblemMessage(err, 'No se pudieron cargar las órdenes.');
        showOrdersAlert(msg, true);
        return [];
    }
}

async function verDetalleOrden(orderId, preloadedOrder = null) {
    const validation = validateOrderId(orderId);

    if (!validation.valid) {
        showOrdersAlert(validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const validId = validation.value;

    if (!permisosActuales.canViewAllOrders && !preloadedOrder) {
        const isConsulted = consultedOrderIds.has(validId);
        const isVisible = visibleOrdersCache.some((o) => Number(o?.orderId) === validId);
        const cachedMatch = allOrdersCache.find((o) => Number(o?.orderId) === validId);
        const isOwned = ownedOrderIds.has(validId) || Boolean(cachedMatch && isOrderOwnedByClient(cachedMatch, usuarioActual));

        if (!isConsulted && !isVisible && !isOwned) {
            const deniedMsg = 'No tienes permiso para acceder directamente a una orden ajena.';
            showOrdersAlert(deniedMsg, true);
            return { ok: false, status: 403, message: deniedMsg };
        }
    }

    const modalEl = document.getElementById('modalDetalleOrden');
    showModal(modalEl);
    resetDetailModalState({
        title: `Detalle de Orden #${validId}`,
        errorMessage: ''
    });

    try {
        const order = preloadedOrder || await orderService.getById(validId);
        if (!preloadedOrder && order) {
            upsertOrderInCache(order);
        }
        const status = populateDetailModal(order);
        return { ok: true, status: 200, data: order, logisticsStatus: status };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cargar el detalle de la orden.');
        resetDetailModalState({
            title: `Detalle de Orden #${validId}`,
            errorMessage: msg
        });
        return { ok: false, status, message: msg };
    }
}

async function buscarOrdenPorId(rawId) {
    const validation = validateOrderId(rawId);

    if (!validation.valid) {
        showOrdersAlert(validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    showOrdersAlert('', false);

    try {
        const order = await orderService.getById(validation.value);
        const resolvedId = Number(order?.orderId ?? validation.value);

        consultedOrderIds.add(resolvedId);
        upsertOrderInCache(order);

        const selEstado = document.getElementById('selEstadoOrden');
        if (selEstado) {
            selEstado.value = 'ALL';
        }

        aplicarFiltrosOrdenes();
        await verDetalleOrden(resolvedId, order);

        return { ok: true, status: 200, data: order };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 404;
        const msg = extractProblemMessage(err, 'No se encontró la orden solicitada.');
        showOrdersAlert(msg, true);
        return { ok: false, status, message: msg };
    }
}

function adaptarVistaPorPermisos() {
    const soloPropias = !permisosActuales.canViewAllOrders;
    const puedeActualizarEstado = Boolean(permisosActuales.canUpdateOrderStatus);
    const infoCliente = document.getElementById('infoFiltroCliente');
    if (infoCliente) {
        setElementVisibility(infoCliente, soloPropias);
    }

    const lblSubtitulo = document.getElementById('lblSubtituloOrdenes');
    if (lblSubtitulo) {
        if (puedeActualizarEstado) {
            lblSubtitulo.textContent = 'Gestión integral de órdenes, seguimiento y actualización de estados logísticos';
        } else if (soloPropias) {
            lblSubtitulo.textContent = 'Consulta de tus órdenes, seguimiento y cancelación de pedidos activos';
        } else {
            lblSubtitulo.textContent = 'Consulta integral de órdenes y logística de envíos de solo lectura';
        }
    }
}

function bindOnce(el, eventName, handler) {
    if (!el || typeof el.addEventListener !== 'function') return;
    const boundKey = `ordersBound_${eventName}`;
    if (el.dataset[boundKey] === 'true') return;
    el.dataset[boundKey] = 'true';
    el.addEventListener(eventName, handler);
}

function configurarEventos() {
    const formBuscar = document.getElementById('formBuscarOrdenId');
    const txtBuscar = document.getElementById('txtBuscarOrdenId');
    const btnLimpiar = document.getElementById('btnLimpiarOrdenId');
    const selEstado = document.getElementById('selEstadoOrden');
    const tablaEl = document.getElementById('tablaPedidos');
    const modalEl = document.getElementById('modalDetalleOrden');
    const btnGuardarEstado = document.getElementById('btnGuardarEstadoOrden');
    const selModalEstado = document.getElementById('selCambiarEstadoOrden');
    const btnCancelarModal = document.getElementById('btnCancelarPedidoModal');

    bindOnce(formBuscar, 'submit', async (e) => {
        e?.preventDefault?.();
        await buscarOrdenPorId(txtBuscar?.value);
    });

    bindOnce(btnLimpiar, 'click', () => {
        if (txtBuscar) txtBuscar.value = '';
        if (selEstado) selEstado.value = 'ALL';
        showOrdersAlert('', false);
        showOrdersSuccess('', false);
        aplicarFiltrosOrdenes();
    });

    bindOnce(selEstado, 'change', () => {
        aplicarFiltrosOrdenes();
    });

    bindOnce(tablaEl, 'click', async (e) => {
        const btn = e?.target?.closest?.('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const orderId = btn.dataset.id;
        if (action === 'ver' && orderId) {
            await verDetalleOrden(orderId);
        } else if (action === 'cancelar' && orderId) {
            await cancelarPedidoCliente(orderId);
        }
    });

    bindOnce(tablaEl, 'change', async (e) => {
        const select = e?.target?.closest?.('select[data-action="cambiar-estado"]');
        if (!select) return;

        const orderId = select.dataset.id;
        if (orderId) {
            await cambiarEstadoOrden(orderId, select.value, select);
        }
    });

    bindOnce(btnGuardarEstado, 'click', async () => {
        if (currentModalOrderId && selModalEstado) {
            await cambiarEstadoOrden(currentModalOrderId, selModalEstado.value, selModalEstado);
        }
    });

    bindOnce(btnCancelarModal, 'click', async () => {
        const targetId = currentModalOrderId || btnCancelarModal?.dataset?.id;
        if (targetId) {
            await cancelarPedidoCliente(targetId);
        }
    });

    if (modalEl) {
        bindModalDismiss(modalEl, () => resetDetailModalState());
    }
}

async function initOrdersController() {
    const usuario = await initAuthenticatedView({ authService });
    if (!usuario) return;

    resetOrdersState();
    usuarioActual = usuario;
    const resolvedPerms = resolveConnectedPermissions(usuario, authService);
    permisosActuales = {
        canViewAllOrders: Boolean(resolvedPerms.canViewAllOrders),
        canUpdateOrderStatus: Boolean(resolvedPerms.canUpdateOrderStatus),
        canCancelOwnOrders: Boolean(resolvedPerms.canCancelOwnOrders)
    };

    adaptarVistaPorPermisos();
    inicializarTabla();
    configurarEventos();
    await listarOrdenes();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authService.isAuthenticated()
        ) {
            return;
        }
        await initOrdersController();
    });
}
