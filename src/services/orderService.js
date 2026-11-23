import { httpClient } from "../api/httpClient.js";

export const orderService = {
    getOrders: async () => {
        try {
            const response = await httpClient('/api/Orders', { method: 'GET' });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: No se pudieron cargar los pedidos`);
            }
            return await response.json();
        } catch (error) {
            console.error("[orderService.getOrders] Error:", error);
            throw error;
        }
    },

    getOrderById: async (id) => {
        try {
            const response = await httpClient(`/api/Orders/${id}`, { method: 'GET' });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: No se encontró el pedido ${id}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`[orderService.getOrderById] Error para ID ${id}:`, error);
            throw error;
        }
    }
};
