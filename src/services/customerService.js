import { httpClient, ApiError, normalizeProblemDetails, safeParseJson, throwApiError, CUSTOMERS } from "../api/httpClient.js";
import { CustomerModel, validateCustomerId } from "../models/customerModel.js";

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
