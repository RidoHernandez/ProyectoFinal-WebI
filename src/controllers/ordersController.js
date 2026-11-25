import { authGuard, authModel } from "../models/authModel.js";
import {
    orderModel,
    ORDER_STATUS,
    ORDER_STATUS_LIST,
    resolveOrderStatus,
    validateOrderId,
    canClientCancelStatus,
    validateOrderStatusTransition,
    formatPostalAddress
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
} from "./uiHelpers.js";

authGuard();

let allOrdersCache = [];
const ownedOrderIds = new Set();
const inFlightOrderIds = new Set();
let permisosActuales = {
    canViewAllOrders: false,
    canUpdateOrderStatus: false,
    canCancelOwnOrders: false
};
let tabla = null;
let currentModalOrderId = null;

function showAlert(id, message = '', visible = Boolean(message)) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = visible ? String(message) : '';
    setElementVisibility(el, visible);
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

function isOrderCancellableByClient(order, statusCode) {
    return Boolean(
        permisosActuales.canCancelOwnOrders &&
        canClientCancelStatus(statusCode) &&
        ownedOrderIds.has(Number(order?.orderId))
    );
}

function updateModalActionControls(order = null, status = null) {
    const adminWrapper = document.getElementById('adminEstadoOrdenWrapper');
    const selModalStatus = document.getElementById('selCambiarEstadoOrden');
    const btnGuardarEstado = document.getElementById('btnGuardarEstadoOrden');
    const lblAyuda = document.getElementById('lblEstadoOrdenAyuda');
    const btnCancelarModal = document.getElementById('btnCancelarPedidoModal');

    if (!order || !status) {
        setElementVisibility(adminWrapper, false);
        setElementVisibility(btnCancelarModal, false);
        if (lblAyuda) lblAyuda.textContent = '';
        return;
    }

    const canManage = permisosActuales.canUpdateOrderStatus;
    setElementVisibility(adminWrapper, canManage);

    if (canManage && selModalStatus) {
        const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
        const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
        selModalStatus.value = status.code;
        selModalStatus.disabled = isCancelled;
        if (btnGuardarEstado) btnGuardarEstado.disabled = isCancelled;

        for (const opt of selModalStatus.querySelectorAll('option')) {
            if (opt.value === ORDER_STATUS.CANCELADO.code) opt.disabled = isDelivered;
        }

        if (lblAyuda) {
            lblAyuda.textContent = isCancelled
                ? 'Este pedido fue cancelado y se encuentra en estado final irreversible.'
                : (isDelivered
                    ? 'Un pedido entregado no puede ser cancelado. Devolverlo a Pendiente requerirá confirmación.'
                    : 'Cancelar el pedido es irreversible y devuelve automáticamente el stock de los productos.');
        }
    }

    if (btnCancelarModal) {
        const canCancel = isOrderCancellableByClient(order, status.code);
        setElementVisibility(btnCancelarModal, canCancel);
        btnCancelarModal.disabled = !canCancel;
        if (canCancel) btnCancelarModal.dataset.id = String(order.orderId);
    }
}

function resetDetailModalState({ errorMessage = '', title = 'Detalle de Orden' } = {}) {
    currentModalOrderId = null;
    const titleEl = document.getElementById('modalDetalleOrdenTitulo');
    if (titleEl) titleEl.textContent = title;

    const badgeEl = document.getElementById('detOrdenEstatus');
    if (badgeEl) {
        badgeEl.textContent = '-';
        badgeEl.className = 'badge bg-secondary ms-2';
    }
    showAlert('alertDetalleOrden', errorMessage, Boolean(errorMessage));

    ['detOrdenId', 'detOrdenFecha', 'detOrdenRequerida', 'detOrdenEnvio', 'detOrdenFlete',
     'detOrdenDestinatario', 'detOrdenDireccion', 'detOrdenCiudad', 'detOrdenPais', 'detOrdenDireccionCompleta']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });

    const totalEl = document.getElementById('detOrdenTotal');
    if (totalEl) totalEl.textContent = '$0.00';

    clearTbody(document.getElementById('tbodyDetalleOrdenProductos'));
    setElementVisibility(document.getElementById('detOrdenProductosWrapper'), false);
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
        const subtotal = Number.isFinite(Number(item.subtotal))
            ? Number(item.subtotal)
            : Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0);
        computedTotal += subtotal;

        const tr = document.createElement('tr');
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
        tbodyItems.appendChild(tr);
    }

    if (totalEl) {
        totalEl.textContent = formatCurrency(Number(order?.total) > 0 ? Number(order.total) : computedTotal);
    }
    setElementVisibility(itemsWrapper, true);
}

function populateDetailModal(order) {
    if (!order) return;
    currentModalOrderId = Number(order.orderId) || null;
    const status = resolveOrderStatus(order);

    const fields = {
        modalDetalleOrdenTitulo: `Detalle de Orden #${order.orderId ?? '-'}`,
        detOrdenId: order.orderId != null ? `#${order.orderId}` : '-',
        detOrdenFecha: formatDate(order.orderDate),
        detOrdenRequerida: formatDate(order.requiredDate),
        detOrdenEnvio: status.code === ORDER_STATUS.CANCELADO.code
            ? 'Cancelado'
            : (order.shippedDate ? formatDate(order.shippedDate) : 'Pendiente de envío'),
        detOrdenFlete: order.freight != null ? formatCurrency(order.freight) : '-',
        detOrdenDestinatario: order.shipName || '-',
        detOrdenDireccion: order.shipAddress || '-',
        detOrdenCiudad: order.shipCity || '-',
        detOrdenPais: order.shipCountry || '-',
        detOrdenDireccionCompleta: formatPostalAddress(order)
    };
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    }

    const badgeEl = document.getElementById('detOrdenEstatus');
    if (badgeEl) {
        badgeEl.textContent = status.label;
        badgeEl.className = `badge ms-2 ${status.badgeClass}`;
    }

    showAlert('alertDetalleOrden', '', false);
    renderDetailOrderItems(order);
    updateModalActionControls(order, status);
}

function buildAdminStatusSelectHtml(orderId, status) {
    const isCancelled = status.code === ORDER_STATUS.CANCELADO.code;
    const isDelivered = status.code === ORDER_STATUS.ENTREGADO.code;
    const options = ORDER_STATUS_LIST.map((item) => {
        const selected = item.code === status.code ? ' selected' : '';
        const disabled = isDelivered && item.code === ORDER_STATUS.CANCELADO.code ? ' disabled' : '';
        return `<option value="${escapeHtml(item.code)}"${selected}${disabled}>${escapeHtml(item.label)}</option>`;
    }).join('');
    return `<select class="form-select form-select-sm d-inline-block w-auto ms-1" data-action="cambiar-estado" data-id="${escapeHtml(orderId)}" aria-label="Cambiar estado de orden #${escapeHtml(orderId)}"${isCancelled ? ' disabled' : ''}>${options}</select>`;
}

function aplicarFiltrosOrdenes() {
    const selectedStatus = (document.getElementById('selEstadoOrden')?.value || 'ALL').toUpperCase();
    const visible = selectedStatus === 'ALL'
        ? allOrdersCache
        : allOrdersCache.filter((order) => resolveOrderStatus(order).code === selectedStatus);

    const lblTotal = document.getElementById('lblTotalOrdenes');
    if (lblTotal) lblTotal.textContent = String(visible.length);

    if (tabla) {
        tabla.clear().rows.add(visible).draw();
    } else if (visible.length === 0) {
        setOrdersTableMessage(
            permisosActuales.canViewAllOrders
                ? 'No se encontraron órdenes con los criterios seleccionados.'
                : 'No hay órdenes asociadas a tu cuenta visibles actualmente.'
        );
    }
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
                    if (type !== 'display') return String(d ?? '');
                    if (resolveOrderStatus(row).code === ORDER_STATUS.CANCELADO.code) return 'Cancelado';
                    return escapeHtml(d ? formatDate(d) : 'Pendiente');
                }
            },
            {
                data: null,
                render: (_, type, row) => {
                    const status = resolveOrderStatus(row);
                    return type === 'display'
                        ? `<span class="badge ${escapeHtml(status.badgeClass)}">${escapeHtml(status.label)}</span>`
                        : status.label;
                }
            },
            {
                data: 'freight',
                render: (d, type) => (type === 'display' ? (d != null ? escapeHtml(formatCurrency(d)) : '-') : Number(d ?? 0))
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
                    const status = resolveOrderStatus(row);
                    let html = `<button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(orderId)}">Ver Detalle</button>`;
                    if (permisosActuales.canUpdateOrderStatus) {
                        html += buildAdminStatusSelectHtml(orderId, status);
                    } else if (isOrderCancellableByClient(row, status.code)) {
                        html += `<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-action="cancelar" data-id="${escapeHtml(orderId)}">Cancelar Compra</button>`;
                    }
                    return html;
                }
            }
        ]
    }));
}

function upsertOrderInCache(updatedOrder) {
    const idNum = Number(updatedOrder?.orderId);
    if (!Number.isFinite(idNum)) return;
    const idx = allOrdersCache.findIndex((o) => Number(o.orderId) === idNum);
    if (idx >= 0) allOrdersCache[idx] = updatedOrder;
    else allOrdersCache = [updatedOrder, ...allOrdersCache];
}

async function cambiarEstadoOrden(orderId, targetStatus, sourceSelect = null) {
    showAlert('alertOrdenes', '', false);
    showAlert('alertOrdenesExito', '', false);

    if (!permisosActuales.canUpdateOrderStatus) {
        showAlert('alertOrdenes', 'No tienes permisos para cambiar el estado de los pedidos.', true);
        return;
    }

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showAlert('alertOrdenes', validation.error, true);
        return;
    }

    const validId = validation.value;
    const existingOrder = allOrdersCache.find((o) => Number(o.orderId) === validId);
    const currentStatus = resolveOrderStatus(existingOrder);

    const revertSelect = () => {
        if (sourceSelect) sourceSelect.value = currentStatus.code;
        const modalSelect = document.getElementById('selCambiarEstadoOrden');
        if (modalSelect && currentModalOrderId === validId) modalSelect.value = currentStatus.code;
    };

    const transition = validateOrderStatusTransition(currentStatus.code, targetStatus, validId);
    if (!transition.valid) {
        revertSelect();
        showAlert('alertOrdenes', transition.error, true);
        if (currentModalOrderId === validId) showAlert('alertDetalleOrden', transition.error, true);
        return;
    }
    if (transition.noOp || inFlightOrderIds.has(validId)) return;

    if (transition.requiresConfirmation && !confirmAction(transition.confirmMessage)) {
        revertSelect();
        return;
    }

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderModel.updateStatus(validId, transition.targetCode);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes();

        const newStatus = resolveOrderStatus(updated);
        if (currentModalOrderId === validId) populateDetailModal(updated);

        const successMsg = newStatus.code === ORDER_STATUS.CANCELADO.code
            ? `El pedido #${validId} fue cancelado y las unidades de los productos fueron devueltas al stock.`
            : `El estado del pedido #${validId} se actualizó a "${newStatus.label}".`;
        showAlert('alertOrdenesExito', successMsg, true);
    } catch (err) {
        revertSelect();
        const msg = extractProblemMessage(err, 'No se pudo actualizar el estado del pedido.');
        showAlert('alertOrdenes', msg, true);
        if (currentModalOrderId === validId) showAlert('alertDetalleOrden', msg, true);
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

async function cancelarPedidoCliente(orderId) {
    showAlert('alertOrdenes', '', false);
    showAlert('alertOrdenesExito', '', false);

    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showAlert('alertOrdenes', validation.error, true);
        return;
    }

    const validId = validation.value;
    const existingOrder = allOrdersCache.find((o) => Number(o.orderId) === validId);
    const currentStatus = resolveOrderStatus(existingOrder);

    if (!permisosActuales.canCancelOwnOrders || !ownedOrderIds.has(validId)) {
        showAlert('alertOrdenes', 'No tienes permiso para cancelar un pedido que no pertenece a tu cuenta.', true);
        return;
    }
    if (!canClientCancelStatus(currentStatus.code)) {
        const msg = currentStatus.code === ORDER_STATUS.CANCELADO.code
            ? 'Este pedido ya fue cancelado anteriormente.'
            : 'Un pedido ya entregado no puede ser cancelado.';
        showAlert('alertOrdenes', msg, true);
        if (currentModalOrderId === validId) showAlert('alertDetalleOrden', msg, true);
        return;
    }
    if (inFlightOrderIds.has(validId)) return;

    const confirmed = confirmAction(
        `¿Confirmas que deseas cancelar tu compra del pedido #${validId}? Esta acción es irreversible y devolverá las unidades de los productos a su stock original.`
    );
    if (!confirmed) return;

    inFlightOrderIds.add(validId);
    try {
        const updated = await orderModel.updateStatus(validId, ORDER_STATUS.CANCELADO.code);
        upsertOrderInCache(updated);
        aplicarFiltrosOrdenes();
        if (currentModalOrderId === validId) populateDetailModal(updated);
        showAlert('alertOrdenesExito', `Tu pedido #${validId} ha sido cancelado y las unidades fueron devueltas al inventario.`, true);
    } catch (err) {
        const msg = extractProblemMessage(err, 'No se pudo cancelar el pedido.');
        showAlert('alertOrdenes', msg, true);
        if (currentModalOrderId === validId) showAlert('alertDetalleOrden', msg, true);
    } finally {
        inFlightOrderIds.delete(validId);
    }
}

async function listarOrdenes() {
    showAlert('alertOrdenes', '', false);
    showAlert('alertOrdenesExito', '', false);

    try {
        const useMine = !permisosActuales.canViewAllOrders;
        allOrdersCache = useMine ? await orderModel.getMine() : await orderModel.getAll();
        ownedOrderIds.clear();
        if (useMine) {
            for (const o of allOrdersCache) {
                if (Number.isFinite(Number(o.orderId))) ownedOrderIds.add(Number(o.orderId));
            }
        }
        aplicarFiltrosOrdenes();
    } catch (err) {
        allOrdersCache = [];
        const lblTotal = document.getElementById('lblTotalOrdenes');
        if (lblTotal) lblTotal.textContent = '0';

        if (tabla) tabla.clear().draw();
        else setOrdersTableMessage('No se pudieron cargar las órdenes.');

        showAlert('alertOrdenes', extractProblemMessage(err, 'No se pudieron cargar las órdenes.'), true);
    }
}

async function verDetalleOrden(orderId, preloadedOrder = null) {
    const validation = validateOrderId(orderId);
    if (!validation.valid) {
        showAlert('alertOrdenes', validation.error, true);
        return;
    }

    const validId = validation.value;
    if (!permisosActuales.canViewAllOrders && !preloadedOrder && !ownedOrderIds.has(validId)) {
        showAlert('alertOrdenes', 'No tienes permiso para acceder directamente a una orden ajena.', true);
        return;
    }

    showModal(document.getElementById('modalDetalleOrden'));
    resetDetailModalState({ title: `Detalle de Orden #${validId}` });

    try {
        const order = preloadedOrder || await orderModel.getById(validId);
        if (!preloadedOrder && order) upsertOrderInCache(order);
        populateDetailModal(order);
    } catch (err) {
        resetDetailModalState({
            title: `Detalle de Orden #${validId}`,
            errorMessage: extractProblemMessage(err, 'No se pudo cargar el detalle de la orden.')
        });
    }
}

async function buscarOrdenPorId(rawId) {
    const validation = validateOrderId(rawId);
    if (!validation.valid) {
        showAlert('alertOrdenes', validation.error, true);
        return;
    }

    showAlert('alertOrdenes', '', false);
    try {
        const order = await orderModel.getById(validation.value);
        const resolvedId = Number(order?.orderId ?? validation.value);
        if (!permisosActuales.canViewAllOrders) ownedOrderIds.add(resolvedId);
        upsertOrderInCache(order);

        const selEstado = document.getElementById('selEstadoOrden');
        if (selEstado) selEstado.value = 'ALL';
        aplicarFiltrosOrdenes();
        await verDetalleOrden(resolvedId, order);
    } catch (err) {
        showAlert('alertOrdenes', extractProblemMessage(err, 'No se encontró la orden solicitada.'), true);
    }
}

function adaptarVistaPorPermisos() {
    const soloPropias = !permisosActuales.canViewAllOrders;
    setElementVisibility(document.getElementById('infoFiltroCliente'), soloPropias);

    const lblSubtitulo = document.getElementById('lblSubtituloOrdenes');
    if (lblSubtitulo) {
        lblSubtitulo.textContent = permisosActuales.canUpdateOrderStatus
            ? 'Gestión integral de órdenes, seguimiento y actualización de estados logísticos'
            : (soloPropias
                ? 'Consulta de tus órdenes, seguimiento y cancelación de pedidos activos'
                : 'Consulta integral de órdenes y logística de envíos de solo lectura');
    }
}

function bindOnce(el, eventName, handler) {
    if (!el || typeof el.addEventListener !== 'function') return;
    const key = `ordersBound_${eventName}`;
    if (el.dataset[key] === 'true') return;
    el.dataset[key] = 'true';
    el.addEventListener(eventName, handler);
}

function configurarEventos() {
    const txtBuscar = document.getElementById('txtBuscarOrdenId');
    const selEstado = document.getElementById('selEstadoOrden');
    const tablaEl = document.getElementById('tablaPedidos');
    const selModalEstado = document.getElementById('selCambiarEstadoOrden');
    const btnCancelarModal = document.getElementById('btnCancelarPedidoModal');

    bindOnce(document.getElementById('formBuscarOrdenId'), 'submit', async (e) => {
        e.preventDefault();
        await buscarOrdenPorId(txtBuscar?.value);
    });

    bindOnce(document.getElementById('btnLimpiarOrdenId'), 'click', () => {
        if (txtBuscar) txtBuscar.value = '';
        if (selEstado) selEstado.value = 'ALL';
        showAlert('alertOrdenes', '', false);
        showAlert('alertOrdenesExito', '', false);
        aplicarFiltrosOrdenes();
    });

    bindOnce(selEstado, 'change', aplicarFiltrosOrdenes);

    bindOnce(tablaEl, 'click', async (e) => {
        const btn = e.target?.closest?.('button[data-action]');
        if (!btn?.dataset.id) return;
        if (btn.dataset.action === 'ver') await verDetalleOrden(btn.dataset.id);
        else if (btn.dataset.action === 'cancelar') await cancelarPedidoCliente(btn.dataset.id);
    });

    bindOnce(tablaEl, 'change', async (e) => {
        const select = e.target?.closest?.('select[data-action="cambiar-estado"]');
        if (select?.dataset.id) await cambiarEstadoOrden(select.dataset.id, select.value, select);
    });

    bindOnce(document.getElementById('btnGuardarEstadoOrden'), 'click', async () => {
        if (currentModalOrderId && selModalEstado) {
            await cambiarEstadoOrden(currentModalOrderId, selModalEstado.value, selModalEstado);
        }
    });

    bindOnce(btnCancelarModal, 'click', async () => {
        const targetId = currentModalOrderId || btnCancelarModal?.dataset?.id;
        if (targetId) await cancelarPedidoCliente(targetId);
    });

    bindModalDismiss(document.getElementById('modalDetalleOrden'), () => resetDetailModalState());
}

async function initOrdersController() {
    const usuario = await initAuthenticatedView({ authModel });
    if (!usuario) return;

    allOrdersCache = [];
    ownedOrderIds.clear();
    inFlightOrderIds.clear();
    tabla = null;
    currentModalOrderId = null;

    const perms = resolveConnectedPermissions(usuario, authModel);
    permisosActuales = {
        canViewAllOrders: Boolean(perms.canViewAllOrders),
        canUpdateOrderStatus: Boolean(perms.canUpdateOrderStatus),
        canCancelOwnOrders: Boolean(perms.canCancelOwnOrders)
    };

    adaptarVistaPorPermisos();
    inicializarTabla();
    configurarEventos();
    await listarOrdenes();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (document.body?.getAttribute?.('data-auth-blocked') || !authModel.isAuthenticated()) {
            return;
        }
        await initOrdersController();
    });
}
