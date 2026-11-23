import { httpClient } from "../api/httpClient.js";

export const customerService = {
    getCustomers: async () => {
        try {
            const response = await httpClient('/api/Customers', { method: 'GET' });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: No se pudieron cargar los clientes`);
            }
            return await response.json();
        } catch (error) {
            console.error("[customerService.getCustomers] Error:", error);
            throw error;
        }
    },

    getCustomerById: async (id) => {
        try {
            const response = await httpClient(`/api/Customers/${id}`, { method: 'GET' });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: No se encontró el cliente ${id}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`[customerService.getCustomerById] Error para ID ${id}:`, error);
            throw error;
        }
    }
};
