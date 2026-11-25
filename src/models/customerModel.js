import { httpClient, ApiError, normalizeProblemDetails, safeParseJson, throwApiError, CUSTOMERS } from "./apiClient.js";

const CUSTOMER_ID_PATTERN = /^[A-Za-z0-9-]{1,20}$/;

export function validateCustomerId(id) {
    const clean = String(id ?? '').trim();
    if (!CUSTOMER_ID_PATTERN.test(clean)) {
        return { valid: false, error: 'El código de cliente no es válido.' };
    }
    return { valid: true, value: clean };
}

export const customerModel = Object.freeze({
    async getAll() {
        const response = await httpClient(CUSTOMERS, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        return Array.isArray(data) ? data : [];
    },

    async getById(id) {
        const validation = validateCustomerId(id);
        if (!validation.valid) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Código de cliente inválido',
                detail: validation.error
            }, 400));
        }

        const response = await httpClient(`${CUSTOMERS}/${encodeURIComponent(validation.value)}`, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 404);
        }

        return await safeParseJson(response);
    }
});
