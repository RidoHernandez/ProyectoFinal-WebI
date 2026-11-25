import { httpClient, ApiError, normalizeProblemDetails, safeParseJson, throwApiError, ORDERS, ORDERS_MINE } from "./apiClient.js";

export const ORDER_STATUS = Object.freeze({
    PENDIENTE: Object.freeze({ code: 'PENDIENTE', label: 'Pendiente', badgeClass: 'bg-warning text-dark' }),
    PENDIENTE_ENVIO: Object.freeze({ code: 'PENDIENTE_ENVIO', label: 'Pendiente de envío', badgeClass: 'bg-secondary text-white' }),
    EN_TRANSITO: Object.freeze({ code: 'EN_TRANSITO', label: 'En tránsito', badgeClass: 'bg-info text-dark' }),
    ENTREGADO: Object.freeze({ code: 'ENTREGADO', label: 'Entregado', badgeClass: 'bg-success text-white' }),
    CANCELADO: Object.freeze({ code: 'CANCELADO', label: 'Cancelado', badgeClass: 'bg-danger text-white' })
});

export const ORDER_STATUS_LIST = Object.freeze(Object.values(ORDER_STATUS));

const CLIENT_CANCELLABLE = new Set(['PENDIENTE', 'PENDIENTE_ENVIO', 'EN_TRANSITO']);

function normalizeOrderStatusCode(rawStatus) {
    if (!rawStatus) return null;
    const normalized = String(rawStatus)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

    if (normalized === 'PENDIENTE_DE_ENVIO') return 'PENDIENTE_ENVIO';
    return ORDER_STATUS[normalized] ? normalized : null;
}

export function resolveOrderStatus(order) {
    const code = normalizeOrderStatusCode(order?.status);
    return (code && ORDER_STATUS[code]) || ORDER_STATUS.PENDIENTE;
}

export function canClientCancelStatus(statusCode) {
    return CLIENT_CANCELLABLE.has(normalizeOrderStatusCode(statusCode));
}

export function validateOrderStatusTransition(currentStatus, targetStatus, orderId = null) {
    const currentCode = normalizeOrderStatusCode(currentStatus);
    const targetCode = normalizeOrderStatusCode(targetStatus);
    const orderLabel = orderId != null ? `#${orderId}` : 'seleccionado';

    if (!targetCode) {
        return { valid: false, error: 'El estado destino seleccionado no es válido.' };
    }
    if (currentCode === 'CANCELADO') {
        return { valid: false, error: 'Un pedido cancelado queda en estado final irreversible y no puede reactivarse ni cambiar de estado.' };
    }
    if (currentCode === 'ENTREGADO' && targetCode === 'CANCELADO') {
        return { valid: false, error: 'Un pedido ya entregado no puede ser cancelado.' };
    }
    if (currentCode === targetCode) {
        return { valid: true, noOp: true, requiresConfirmation: false, targetCode };
    }
    if ((currentCode === 'EN_TRANSITO' || currentCode === 'ENTREGADO') && (targetCode === 'PENDIENTE' || targetCode === 'PENDIENTE_ENVIO')) {
        return {
            valid: true,
            requiresConfirmation: true,
            targetCode,
            confirmMessage: `El pedido ${orderLabel} ya se encuentra en estado "${ORDER_STATUS[currentCode].label}". ¿Confirmas que deseas devolverlo a "${ORDER_STATUS[targetCode].label}"?`
        };
    }
    if (CLIENT_CANCELLABLE.has(currentCode) && targetCode === 'CANCELADO') {
        return {
            valid: true,
            requiresConfirmation: true,
            targetCode,
            confirmMessage: `¿Confirmas que deseas cancelar el pedido ${orderLabel}? Esta acción es irreversible y devolverá las unidades de los productos a su stock original.`
        };
    }

    return { valid: true, requiresConfirmation: false, targetCode };
}

export function validateOrderId(id) {
    const str = String(id ?? '').trim();
    const num = Number(str);
    if (!/^\d+$/.test(str) || !Number.isSafeInteger(num) || num <= 0) {
        return { valid: false, error: 'El número de orden debe ser un entero positivo válido.' };
    }
    return { valid: true, value: num };
}

function validateCreateOrderPayload(dto = {}) {
    const rawItems = Array.isArray(dto?.items) ? dto.items : [];
    if (rawItems.length === 0) {
        return { valid: false, error: 'Debes incluir al menos un producto en el pedido.' };
    }

    const items = [];
    for (const item of rawItems) {
        const productId = Number(item?.productId);
        const quantity = Number(item?.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return { valid: false, error: 'El identificador del producto debe ser un entero positivo.' };
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 32767) {
            return { valid: false, error: 'La cantidad de cada producto debe ser un entero entre 1 y 32,767.' };
        }
        items.push({ productId, quantity });
    }

    const shipName = String(dto?.shipName ?? '').trim();
    const shipAddress = String(dto?.shipAddress ?? '').trim();
    const shipCity = String(dto?.shipCity ?? '').trim();
    const shipCountry = String(dto?.shipCountry ?? '').trim();

    if (shipName.length < 2 || shipName.length > 80) return { valid: false, error: 'El destinatario es obligatorio (2 a 80 caracteres).' };
    if (shipAddress.length < 4 || shipAddress.length > 200) return { valid: false, error: 'La dirección de envío es obligatoria (4 a 200 caracteres).' };
    if (shipCity.length < 2 || shipCity.length > 60) return { valid: false, error: 'La ciudad de envío es obligatoria (2 a 60 caracteres).' };
    if (shipCountry.length < 2 || shipCountry.length > 60) return { valid: false, error: 'El país de envío es obligatorio (2 a 60 caracteres).' };

    return { valid: true, payload: { items, shipName, shipAddress, shipCity, shipCountry } };
}

export function formatPostalAddress(order = {}) {
    const parts = [order?.shipAddress, order?.shipCity, order?.shipCountry]
        .map((p) => String(p ?? '').trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Sin dirección postal registrada';
}

export const orderModel = Object.freeze({
    async getAll() {
        const response = await httpClient(ORDERS, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data : [];
    },

    async getMine() {
        const response = await httpClient(ORDERS_MINE, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data : [];
    },

    async getById(id) {
        const validation = validateOrderId(id);
        if (!validation.valid) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Número de orden inválido',
                detail: validation.error
            }, 400));
        }

        const response = await httpClient(`${ORDERS}/${encodeURIComponent(validation.value)}`, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 404);
        }

        return await safeParseJson(response);
    },

    async create(dto) {
        const validation = validateCreateOrderPayload(dto);
        if (!validation.valid) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Datos de pedido inválidos',
                detail: validation.error
            }, 400));
        }

        const response = await httpClient(ORDERS, {
            method: 'POST',
            body: JSON.stringify(validation.payload)
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }

        return await safeParseJson(response);
    },

    async updateStatus(id, status) {
        const validation = validateOrderId(id);
        if (!validation.valid) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Número de orden inválido',
                detail: validation.error
            }, 400));
        }

        const normalizedStatus = normalizeOrderStatusCode(status);
        if (!normalizedStatus) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Estado inválido',
                detail: 'El estado debe ser Pendiente, Pendiente de envío, En tránsito, Entregado o Cancelado.'
            }, 400));
        }

        const response = await httpClient(`${ORDERS}/${encodeURIComponent(validation.value)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: normalizedStatus })
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }

        return await safeParseJson(response);
    }
});
