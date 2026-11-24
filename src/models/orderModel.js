export const LOGISTICS_STATUS = Object.freeze({
    DELIVERED: 'Entregado',
    IN_TRANSIT: 'En tránsito',
    PENDING: 'Pendiente'
});

export const ORDER_DTO_FIELDS = Object.freeze([
    'orderId',
    'orderDate',
    'requiredDate',
    'shippedDate',
    'freight',
    'shipName',
    'shipAddress',
    'shipCity',
    'shipRegion',
    'shipPostalCode',
    'shipCountry'
]);

/**
 * Determina el estatus logístico de una orden de forma determinista (TASK-F4-03 / TASK-F4-04):
 * - 'Pendiente': cuando la orden no tiene fecha de envío (`!shippedDate`).
 * - 'En tránsito': cuando tiene `shippedDate`, pero el envío fue posterior a `requiredDate`,
 *   o la fecha de envío es futura respecto a `referenceDate`, o trae estatus explícito en tránsito.
 * - 'Entregado': cuando tiene `shippedDate` válida despachada a tiempo y en o antes de `referenceDate`.
 */
export function resolveLogisticsStatus(order, { referenceDate = null } = {}) {
    if (!order || typeof order !== 'object') {
        return LOGISTICS_STATUS.PENDING;
    }

    const explicitStatus = String(order.logisticsStatus ?? order.estatusLogistico ?? '').trim().toLowerCase();
    if (explicitStatus === 'en tránsito' || explicitStatus === 'en transito') {
        return LOGISTICS_STATUS.IN_TRANSIT;
    }
    if (explicitStatus === 'entregado') {
        return LOGISTICS_STATUS.DELIVERED;
    }
    if (explicitStatus === 'pendiente') {
        return LOGISTICS_STATUS.PENDING;
    }

    const rawShipped = order.shippedDate ?? order.ShippedDate ?? null;
    if (rawShipped === null || rawShipped === undefined || String(rawShipped).trim() === '') {
        return LOGISTICS_STATUS.PENDING;
    }

    const shippedMs = Date.parse(String(rawShipped));
    if (Number.isNaN(shippedMs)) {
        return LOGISTICS_STATUS.PENDING;
    }

    const refMs = referenceDate ? Date.parse(String(referenceDate)) : Date.now();
    if (!Number.isNaN(refMs) && shippedMs > refMs) {
        return LOGISTICS_STATUS.IN_TRANSIT;
    }

    const rawRequired = order.requiredDate ?? order.RequiredDate ?? null;
    if (rawRequired !== null && rawRequired !== undefined && String(rawRequired).trim() !== '') {
        const requiredMs = Date.parse(String(rawRequired));
        if (!Number.isNaN(requiredMs) && shippedMs > requiredMs) {
            return LOGISTICS_STATUS.IN_TRANSIT;
        }
    }

    return LOGISTICS_STATUS.DELIVERED;
}

export function getLogisticsStatusBadgeClass(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'entregado') {
        return 'bg-success';
    }
    if (normalized === 'en tránsito' || normalized === 'en transito') {
        return 'bg-info text-dark';
    }
    return 'bg-warning text-dark';
}

function normalizeNullableDate(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export class OrderModel {
    constructor({
        orderId = null,
        orderDate = null,
        requiredDate = null,
        shippedDate = null,
        freight = 0,
        shipName = '',
        shipAddress = '',
        shipCity = '',
        shipRegion = '',
        shipPostalCode = '',
        shipCountry = ''
    } = {}) {
        const numId = (orderId !== null && orderId !== undefined && orderId !== '')
            ? Number(orderId)
            : NaN;
        const numFreight = (freight !== null && freight !== undefined && freight !== '' && typeof freight !== 'boolean')
            ? Number(freight)
            : 0;

        this.orderId = Number.isFinite(numId) ? numId : (orderId ?? null);
        this.orderDate = normalizeNullableDate(orderDate);
        this.requiredDate = normalizeNullableDate(requiredDate);
        this.shippedDate = normalizeNullableDate(shippedDate);
        this.freight = Number.isFinite(numFreight) ? numFreight : 0;
        this.shipName = normalizeText(shipName);
        this.shipAddress = normalizeText(shipAddress);
        this.shipCity = normalizeText(shipCity);
        this.shipRegion = normalizeText(shipRegion);
        this.shipPostalCode = normalizeText(shipPostalCode);
        this.shipCountry = normalizeText(shipCountry);
    }

    /**
     * Proyecta estrictamente los 11 campos de OrderDto del backend congelado (REQ-SEC-003),
     * descartando propiedades de navegación o llaves foráneas no requeridas.
     */
    static fromApiDto(raw = {}) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return new OrderModel({
            orderId: source.orderId ?? source.OrderId ?? null,
            orderDate: source.orderDate ?? source.OrderDate ?? null,
            requiredDate: source.requiredDate ?? source.RequiredDate ?? null,
            shippedDate: source.shippedDate ?? source.ShippedDate ?? null,
            freight: source.freight ?? source.Freight ?? 0,
            shipName: source.shipName ?? source.ShipName ?? '',
            shipAddress: source.shipAddress ?? source.ShipAddress ?? '',
            shipCity: source.shipCity ?? source.ShipCity ?? '',
            shipRegion: source.shipRegion ?? source.ShipRegion ?? '',
            shipPostalCode: source.shipPostalCode ?? source.ShipPostalCode ?? '',
            shipCountry: source.shipCountry ?? source.ShipCountry ?? ''
        });
    }

    static resolveLogisticsStatus(order, options = {}) {
        return resolveLogisticsStatus(order, options);
    }
}
