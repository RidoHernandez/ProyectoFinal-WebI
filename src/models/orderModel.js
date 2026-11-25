export const ORDER_STATUS = Object.freeze({
    PENDIENTE: Object.freeze({
        code: 'PENDIENTE',
        label: 'Pendiente',
        badgeClass: 'bg-warning text-dark'
    }),
    PENDIENTE_ENVIO: Object.freeze({
        code: 'PENDIENTE_ENVIO',
        label: 'Pendiente de envío',
        badgeClass: 'bg-secondary text-white'
    }),
    EN_TRANSITO: Object.freeze({
        code: 'EN_TRANSITO',
        label: 'En tránsito',
        badgeClass: 'bg-info text-dark'
    }),
    ENTREGADO: Object.freeze({
        code: 'ENTREGADO',
        label: 'Entregado',
        badgeClass: 'bg-success text-white'
    }),
    CANCELADO: Object.freeze({
        code: 'CANCELADO',
        label: 'Cancelado',
        badgeClass: 'bg-danger text-white'
    })
});

export const ORDER_STATUS_LIST = Object.freeze([
    ORDER_STATUS.PENDIENTE,
    ORDER_STATUS.PENDIENTE_ENVIO,
    ORDER_STATUS.EN_TRANSITO,
    ORDER_STATUS.ENTREGADO,
    ORDER_STATUS.CANCELADO
]);

export const CLIENT_CANCELLABLE_STATUSES = Object.freeze([
    ORDER_STATUS.PENDIENTE.code,
    ORDER_STATUS.PENDIENTE_ENVIO.code,
    ORDER_STATUS.EN_TRANSITO.code
]);

const TRANSIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeOrderStatusCode(rawStatus) {
    if (rawStatus === null || rawStatus === undefined) return null;
    const text = String(rawStatus).trim();
    if (!text) return null;

    const normalized = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_');

    switch (normalized) {
        case 'PENDIENTE':
            return ORDER_STATUS.PENDIENTE.code;
        case 'PENDIENTE_ENVIO':
        case 'PENDIENTE_DE_ENVIO':
            return ORDER_STATUS.PENDIENTE_ENVIO.code;
        case 'EN_TRANSITO':
            return ORDER_STATUS.EN_TRANSITO.code;
        case 'ENTREGADO':
            return ORDER_STATUS.ENTREGADO.code;
        case 'CANCELADO':
            return ORDER_STATUS.CANCELADO.code;
        default:
            return null;
    }
}

export function canClientCancelStatus(statusOrCode) {
    const code = typeof statusOrCode === 'object' && statusOrCode !== null
        ? normalizeOrderStatusCode(statusOrCode.code ?? statusOrCode.status ?? statusOrCode.Status)
        : normalizeOrderStatusCode(statusOrCode);
    return Boolean(code && CLIENT_CANCELLABLE_STATUSES.includes(code));
}

export function validateOrderStatusTransition(currentStatus, targetStatus, orderId = null) {
    const currentCode = normalizeOrderStatusCode(currentStatus);
    const targetCode = normalizeOrderStatusCode(targetStatus);
    const orderLabel = orderId !== null && orderId !== undefined ? `#${orderId}` : 'seleccionado';

    if (!targetCode || !ORDER_STATUS[targetCode]) {
        return {
            valid: false,
            requiresConfirmation: false,
            error: 'El estado destino seleccionado no es válido.'
        };
    }

    if (currentCode === ORDER_STATUS.CANCELADO.code) {
        return {
            valid: false,
            requiresConfirmation: false,
            error: 'Un pedido cancelado queda en estado final irreversible y no puede reactivarse ni cambiar de estado.'
        };
    }

    if (currentCode === ORDER_STATUS.ENTREGADO.code && targetCode === ORDER_STATUS.CANCELADO.code) {
        return {
            valid: false,
            requiresConfirmation: false,
            error: 'Un pedido ya entregado no puede ser cancelado.'
        };
    }

    if (currentCode === targetCode) {
        return {
            valid: true,
            noOp: true,
            requiresConfirmation: false,
            targetCode
        };
    }

    if (
        (currentCode === ORDER_STATUS.EN_TRANSITO.code || currentCode === ORDER_STATUS.ENTREGADO.code) &&
        (targetCode === ORDER_STATUS.PENDIENTE.code || targetCode === ORDER_STATUS.PENDIENTE_ENVIO.code)
    ) {
        const currentLabel = ORDER_STATUS[currentCode]?.label || currentCode;
        const targetLabel = ORDER_STATUS[targetCode]?.label || targetCode;
        return {
            valid: true,
            requiresConfirmation: true,
            targetCode,
            confirmMessage: `El pedido ${orderLabel} ya se encuentra en estado "${currentLabel}". ¿Confirmas que deseas devolverlo a "${targetLabel}"?`
        };
    }

    if (
        CLIENT_CANCELLABLE_STATUSES.includes(currentCode) &&
        targetCode === ORDER_STATUS.CANCELADO.code
    ) {
        return {
            valid: true,
            requiresConfirmation: true,
            targetCode,
            confirmMessage: `¿Confirmas que deseas cancelar el pedido ${orderLabel}? Esta acción es irreversible y devolverá las unidades de los productos a su stock original.`
        };
    }

    return {
        valid: true,
        requiresConfirmation: false,
        targetCode
    };
}

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

function normalizeOrderItem(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const productId = Number(raw.productId ?? raw.ProductId);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    const productName = normalizeStringField(raw.productName ?? raw.ProductName) || `Producto #${productId}`;
    const unitPriceNum = normalizeNumberField(raw.unitPrice ?? raw.UnitPrice);
    const unitPrice = unitPriceNum !== null ? unitPriceNum : 0;
    const qtyNum = normalizeNumberField(raw.quantity ?? raw.Quantity);
    const quantity = qtyNum !== null ? Math.trunc(qtyNum) : 0;
    const subtotalNum = normalizeNumberField(raw.subtotal ?? raw.Subtotal);
    const subtotal = subtotalNum !== null
        ? subtotalNum
        : Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100;

    return {
        productId: Math.trunc(productId),
        productName,
        unitPrice,
        quantity,
        subtotal
    };
}

function normalizeOrderItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems.map(normalizeOrderItem).filter(Boolean);
}

export function validateCreateOrderPayload(dto = {}) {
    const input = dto && typeof dto === 'object' ? dto : {};
    const rawItems = Array.isArray(input.items ?? input.Items) ? (input.items ?? input.Items) : [];

    if (rawItems.length === 0) {
        return { valid: false, error: 'Debes incluir al menos un producto en el pedido.' };
    }

    const items = [];
    for (const rawItem of rawItems) {
        const productId = Number(rawItem?.productId ?? rawItem?.ProductId);
        const quantity = Number(rawItem?.quantity ?? rawItem?.Quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return { valid: false, error: 'El identificador del producto debe ser un entero positivo.' };
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 32767) {
            return { valid: false, error: 'La cantidad de cada producto debe ser un entero entre 1 y 32,767.' };
        }
        items.push({ productId, quantity });
    }

    const shipName = normalizeStringField(input.shipName ?? input.ShipName);
    const shipAddress = normalizeStringField(input.shipAddress ?? input.ShipAddress);
    const shipCity = normalizeStringField(input.shipCity ?? input.ShipCity);
    const shipCountry = normalizeStringField(input.shipCountry ?? input.ShipCountry);

    if (shipName.length < 2 || shipName.length > 80) {
        return { valid: false, error: 'El destinatario es obligatorio (2 a 80 caracteres).' };
    }
    if (shipAddress.length < 4 || shipAddress.length > 200) {
        return { valid: false, error: 'La dirección de envío es obligatoria (4 a 200 caracteres).' };
    }
    if (shipCity.length < 2 || shipCity.length > 60) {
        return { valid: false, error: 'La ciudad de envío es obligatoria (2 a 60 caracteres).' };
    }
    if (shipCountry.length < 2 || shipCountry.length > 60) {
        return { valid: false, error: 'El país de envío es obligatorio (2 a 60 caracteres).' };
    }

    return {
        valid: true,
        payload: {
            items,
            shipName,
            shipAddress,
            shipCity,
            shipCountry
        }
    };
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
        shipCountry = '',
        status = null,
        total = 0,
        items = []
    } = {}) {
        this.orderId = orderId;
        this.orderDate = orderDate;
        this.requiredDate = requiredDate;
        this.shippedDate = shippedDate;
        this.freight = freight;
        this.shipName = shipName;
        this.shipAddress = shipAddress;
        this.shipCity = shipCity;
        this.shipCountry = shipCountry;
        this.status = status;
        this.total = total;
        this.items = items;
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

        const items = normalizeOrderItems(raw.items ?? raw.Items);
        const rawTotal = normalizeNumberField(raw.total ?? raw.Total);
        const computedTotal = items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
        const total = rawTotal !== null
            ? rawTotal
            : Math.round((computedTotal + Number.EPSILON) * 100) / 100;

        return new OrderModel({
            orderId,
            orderDate: normalizeDateField(raw.orderDate ?? raw.OrderDate),
            requiredDate: normalizeDateField(raw.requiredDate ?? raw.RequiredDate),
            shippedDate: normalizeDateField(raw.shippedDate ?? raw.ShippedDate),
            freight: normalizeNumberField(raw.freight ?? raw.Freight),
            shipName: normalizeStringField(raw.shipName ?? raw.ShipName),
            shipAddress: normalizeStringField(raw.shipAddress ?? raw.ShipAddress),
            shipCity: normalizeStringField(raw.shipCity ?? raw.ShipCity),
            shipCountry: normalizeStringField(raw.shipCountry ?? raw.ShipCountry),
            status: normalizeOrderStatusCode(raw.status ?? raw.Status),
            total,
            items
        });
    }

    static resolveLogisticsStatus(order = {}, referenceDate = new Date()) {
        const source = order && typeof order === 'object' ? order : {};
        const explicitCode = normalizeOrderStatusCode(source.status ?? source.Status);
        if (explicitCode && ORDER_STATUS[explicitCode]) {
            return ORDER_STATUS[explicitCode];
        }

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
            order?.shipCountry ?? order?.ShipCountry
        ]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean);

        return parts.length > 0 ? parts.join(', ') : 'Sin dirección postal registrada';
    }
}
