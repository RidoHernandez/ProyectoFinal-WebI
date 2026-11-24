import { httpClient, ApiError, normalizeProblemDetails, CUSTOMERS } from "../api/httpClient.js";
import { CustomerModel, validateCustomerId } from "../models/customerModel.js";

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

export const customerService = Object.freeze({
    async getAll() {
        const response = await httpClient(CUSTOMERS, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data.map((item) => CustomerModel.fromApiDto(item)) : [];
    },

    async getById(id) {
        const validation = validateCustomerId(id);
        if (!validation.valid) {
            throw new ApiError(
                normalizeProblemDetails(
                    {
                        status: 400,
                        title: 'Código de cliente inválido',
                        detail: validation.error
                    },
                    400
                )
            );
        }

        const response = await httpClient(`${CUSTOMERS}/${encodeURIComponent(validation.value)}`, {
            method: 'GET'
        });
        if (!response.ok) {
            throwApiError(response, response.status || 404);
        }

        const data = await safeParseJson(response);
        return CustomerModel.fromApiDto(data);
    }
});
