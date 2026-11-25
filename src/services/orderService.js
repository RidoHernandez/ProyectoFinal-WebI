import { httpClient, ApiError, normalizeProblemDetails, ORDERS, ORDERS_MINE } from "../api/httpClient.js";
import { OrderModel, validateOrderId, validateCreateOrderPayload, normalizeOrderStatusCode } from "../models/orderModel.js";

async function safeParseJson(response) {
    if (!response || response.status === 204) return null;
    try {
        if (typeof response.json === 'function') {
            return await response.json();
        }
        if (typeof response.text === 'function') {
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        }
    } catch {
        return null;
    }
    return null;
}

function throwApiError(response, fallbackStatus = 500) {
    const problemDetails = response?.problemDetails
        || normalizeProblemDetails(null, response?.status || fallbackStatus);
    throw new ApiError(problemDetails);
}

export const orderService = Object.freeze({
    async getAll() {
        const response = await httpClient(ORDERS, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data.map((item) => OrderModel.fromApiDto(item)) : [];
    },

    async getMine() {
        const response = await httpClient(ORDERS_MINE, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data.map((item) => OrderModel.fromApiDto(item)) : [];
    },

    async getById(id) {
        const validation = validateOrderId(id);
        if (!validation.valid) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Número de orden inválido',
                        detail: validation.error
                    },
                    400
                )
            );
        }

        const response = await httpClient(`${ORDERS}/${encodeURIComponent(validation.value)}`, {
            method: 'GET'
        });
        if (!response.ok) {
            throwApiError(response, response.status || 404);
        }

        const data = await safeParseJson(response);
        return OrderModel.fromApiDto(data);
    },

    async create(dto) {
        const validation = validateCreateOrderPayload(dto);
        if (!validation.valid) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Datos de pedido inválidos',
                        detail: validation.error
                    },
                    400
                )
            );
        }

        const response = await httpClient(ORDERS, {
            method: 'POST',
            body: JSON.stringify(validation.payload)
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }

        const data = await safeParseJson(response);
        return OrderModel.fromApiDto(data);
    },

    async updateStatus(id, status) {
        const validation = validateOrderId(id);
        if (!validation.valid) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Número de orden inválido',
                        detail: validation.error
                    },
                    400
                )
            );
        }

        const normalizedStatus = normalizeOrderStatusCode(status);
        if (!normalizedStatus) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Estado inválido',
                        detail: 'El estado debe ser Pendiente, Pendiente de envío, En tránsito, Entregado o Cancelado.'
                    },
                    400
                )
            );
        }

        const response = await httpClient(`${ORDERS}/${encodeURIComponent(validation.value)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: normalizedStatus })
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }

        const data = await safeParseJson(response);
        return OrderModel.fromApiDto(data);
    }
});
