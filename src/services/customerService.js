import {
    httpClient,
    ApiError,
    normalizeProblemDetails,
    CUSTOMERS
} from "../api/httpClient.js";
import { CustomerModel } from "../models/customerModel.js";

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

// [TASK-F4-01] Servicio de Clientes (estrictamente de solo lectura: GET /api/customers y GET /api/customers/{id})
export const customerService = Object.freeze({
    // Consume GET /api/customers, retorna lista normalizada de CustomerDto ({ customerId, companyName, contactName })
    getAll: async () => {
        const response = await httpClient(CUSTOMERS, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        const rawList = Array.isArray(data)
            ? data
            : (Array.isArray(data?.customers)
                ? data.customers
                : (Array.isArray(data?.Customers) ? data.Customers : []));

        return rawList.map((item) => CustomerModel.fromApiDto(item));
    },

    // Consume GET /api/customers/{id}, retorna el CustomerDto solicitado o lanza ApiError (ej. 404 Not Found)
    getById: async (id) => {
        const cleanId = String(id ?? '').trim();
        if (!cleanId) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Identificador inválido',
                        detail: 'El identificador del cliente (5 caracteres) es obligatorio.'
                    },
                    400
                )
            );
        }

        const response = await httpClient(`${CUSTOMERS}/${encodeURIComponent(cleanId)}`, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 404);
        }

        const data = await safeParseJson(response);

        if (Array.isArray(data)) {
            const targetUpper = cleanId.toUpperCase();
            const matched = data.find(
                (item) => String(item?.customerId ?? item?.CustomerId ?? '').trim().toUpperCase() === targetUpper
            );
            if (!matched) {
                throw new ApiError(
                    normalizeProblemDetails(
                        {
                            status: 404,
                            title: 'Cliente no encontrado',
                            detail: `No se encontró el cliente con código ${cleanId}.`
                        },
                        404
                    )
                );
            }
            return CustomerModel.fromApiDto(matched);
        }

        return CustomerModel.fromApiDto(
            data && typeof data === 'object' ? data : { customerId: cleanId }
        );
    },

    // Alias retrocompatibles de solo lectura
    getCustomers: async () => customerService.getAll(),
    getCustomerById: async (id) => customerService.getById(id)
});
