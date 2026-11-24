export const ORDER_STATUS = Object.freeze({
    ENTREGADO: Object.freeze({
        code: 'ENTREGADO',
        label: 'Entregado',
        badgeClass: 'bg-success text-white'
    }),
    EN_TRANSITO: Object.freeze({
        code: 'EN_TRANSITO',
        label: 'En tránsito',
        badgeClass: 'bg-info text-dark'
    }),
    PENDIENTE: Object.freeze({
        code: 'PENDIENTE',
        label: 'Pendiente',
        badgeClass: 'bg-warning text-dark'
    })
});

const TRANSIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function validateOrderId(id) {
    if (id === null || id === undefined || typeof id === 'boolean' || typeof id === 'object') {
        return {
            valid: false,
            error: 'El número de orden debe ser un entero positivo válido.'
        };
    }

    const str = String(id ?? '').trim();
    if (!/^\d+$/.test(str)) {
        return {
            valid: false,
            error: 'El número de orden debe ser un entero positivo válido.'
        };
    }

    const num = Number(str);
    if (!Number.isSafeInteger(num) || num <= 0) {
        return {
            valid: false,
            error: 'El número de orden debe ser un entero positivo válido.'
        };
    }

    return { valid: true, value: num };
}

function normalizeDateField(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumberField(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeStringField(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export class OrderModel {
    constructor({
        orderId = null,
        orderDate = null,
        requiredDate = null,
        shippedDate = null,
        freight = null,
        shipName = '',
        shipAddress = '',
        shipCity = '',
        shipRegion = '',
        shipPostalCode = '',
        shipCountry = ''
    } = {}) {
        this.orderId = orderId;
        this.orderDate = orderDate;
        this.requiredDate = requiredDate;
        this.shippedDate = shippedDate;
        this.freight = freight;
        this.shipName = shipName;
        this.shipAddress = shipAddress;
        this.shipCity = shipCity;
        this.shipRegion = shipRegion;
        this.shipPostalCode = shipPostalCode;
        this.shipCountry = shipCountry;
    }

    static fromApiDto(raw = {}) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return new OrderModel();
        }

        const rawOrderId = raw.orderId ?? raw.OrderId;
        const parsedOrderId = rawOrderId !== null && rawOrderId !== undefined && typeof rawOrderId !== 'boolean' && String(rawOrderId).trim() !== ''
            ? Number(rawOrderId)
            : NaN;
        const orderId = Number.isFinite(parsedOrderId) && Number.isInteger(parsedOrderId)
            ? parsedOrderId
            : null;

        return new OrderModel({
            orderId,
            orderDate: normalizeDateField(raw.orderDate ?? raw.OrderDate),
            requiredDate: normalizeDateField(raw.requiredDate ?? raw.RequiredDate),
            shippedDate: normalizeDateField(raw.shippedDate ?? raw.ShippedDate),
            freight: normalizeNumberField(raw.freight ?? raw.Freight),
            shipName: normalizeStringField(raw.shipName ?? raw.ShipName),
            shipAddress: normalizeStringField(raw.shipAddress ?? raw.ShipAddress),
            shipCity: normalizeStringField(raw.shipCity ?? raw.ShipCity),
            shipRegion: normalizeStringField(raw.shipRegion ?? raw.ShipRegion),
            shipPostalCode: normalizeStringField(raw.shipPostalCode ?? raw.ShipPostalCode),
            shipCountry: normalizeStringField(raw.shipCountry ?? raw.ShipCountry)
        });
    }

    static resolveLogisticsStatus(order = {}, referenceDate = new Date()) {
        const source = order && typeof order === 'object' ? order : {};
        const shippedRaw = source.shippedDate ?? source.ShippedDate;
        const shippedMs = shippedRaw ? Date.parse(shippedRaw) : NaN;

        if (!shippedRaw || Number.isNaN(shippedMs)) {
            return ORDER_STATUS.PENDIENTE;
        }

        const parsedRefMs = referenceDate instanceof Date
            ? referenceDate.getTime()
            : Date.parse(referenceDate);
        const refMs = Number.isNaN(parsedRefMs) ? Date.now() : parsedRefMs;

        if (shippedMs > refMs) {
            return ORDER_STATUS.EN_TRANSITO;
        }

        const requiredRaw = source.requiredDate ?? source.RequiredDate;
        const requiredMs = requiredRaw ? Date.parse(requiredRaw) : NaN;
        if (!Number.isNaN(requiredMs)) {
            return refMs < requiredMs ? ORDER_STATUS.EN_TRANSITO : ORDER_STATUS.ENTREGADO;
        }

        return (refMs - shippedMs) <= TRANSIT_WINDOW_MS
            ? ORDER_STATUS.EN_TRANSITO
            : ORDER_STATUS.ENTREGADO;
    }

    static formatPostalAddress(order = {}) {
        const parts = [
            order?.shipAddress ?? order?.ShipAddress,
            order?.shipCity ?? order?.ShipCity,
            order?.shipRegion ?? order?.ShipRegion,
            order?.shipPostalCode ?? order?.ShipPostalCode,
            order?.shipCountry ?? order?.ShipCountry
        ]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean);

        return parts.length > 0 ? parts.join(', ') : 'Sin dirección postal registrada';
    }
}
