import {
    httpClient,
    ApiError,
    normalizeProblemDetails,
    ORDERS
} from "../api/httpClient.js";
import { OrderModel } from "../models/orderModel.js";

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

function buildApiError(response, fallbackStatus = 500) {
    const pd = response?.problemDetails || normalizeProblemDetails(null, response?.status || fallbackStatus);
    return new ApiError(pd);
}

/**
 * Servicio de consulta de órdenes comerciales (TASK-F4-03 / REQ-CORE-001 / REQ-SEC-003).
 * Contrato estricto de solo lectura sincronizado con OrdersController del backend congelado
 * (no expone métodos create, update ni delete).
 */
export const orderService = {
    // [TASK-F4-03] getAll(): consume GET /api/orders y retorna colección normalizada de OrderDto
    getAll: async () => {
        const response = await httpClient(ORDERS, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        const rawList = Array.isArray(data)
            ? data
            : (Array.isArray(data?.orders)
                ? data.orders
                : (Array.isArray(data?.Orders) ? data.Orders : []));

        return rawList.map((item) => OrderModel.fromApiDto(item));
    },

    // [TASK-F4-03] getById(id): consume GET /api/orders/{id} y retorna OrderDto con detalle de envío o lanza ApiError (404)
    getById: async (id) => {
        const cleanId = id !== null && id !== undefined ? String(id).trim() : '';
        if (!cleanId) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Identificador de orden inválido',
                        detail: 'El identificador de la orden es obligatorio.'
                    },
                    400
                )
            );
        }

        const response = await httpClient(`${ORDERS}/${encodeURIComponent(cleanId)}`, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 404);
        }

        const data = await safeParseJson(response);
        if (!data || typeof data !== 'object') {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 404,
                        title: 'Orden no encontrada',
                        detail: `No se encontró la orden con identificador ${cleanId}.`
                    },
                    404
                )
            );
        }

        return OrderModel.fromApiDto(data);
    },

    // Alias retrocompatibles de solo lectura
    getOrders: async () => orderService.getAll(),
    getOrderById: async (id) => orderService.getById(id)
};
