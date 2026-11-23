import { httpClient, getApiKey, setApiConfig, clearApiConfig, getBaseUrl } from "../api/httpClient.js";

export const authService = {
    checkSession: async () => {
        try {
            const apiKey = getApiKey();
            if (!apiKey) return null;

            const response = await httpClient('/api/Products');

            if (response.ok) {
                return {
                    autenticado: true,
                    rol: 'Administrador',
                    nombre: 'Administrador (API Key)',
                    apiKey: apiKey,
                    baseUrl: getBaseUrl()
                };
            }

            if (response.status === 401) {
                clearApiConfig();
                return null;
            }

            return {
                autenticado: true,
                rol: 'Administrador',
                nombre: 'Administrador (API Key)',
                apiKey: apiKey
            };
        } catch (error) {
            console.warn("No se pudo comprobar la sesión con el backend:", error);
            const localKey = localStorage.getItem('northwind_api_key');
            if (localKey) {
                return {
                    autenticado: true,
                    rol: 'Administrador (Offline)',
                    nombre: 'Admin (Servidor offline)',
                    apiKey: localKey
                };
            }
            return null;
        }
    },

    login: async (apiKey, baseUrl = null) => {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('Debes ingresar una API Key válida.');
        }

        const cleanKey = apiKey.trim();
        const cleanUrl = baseUrl ? baseUrl.trim() : null;

        setApiConfig(cleanKey, cleanUrl);

        try {
            const response = await httpClient('/api/Products');
            if (response.status === 401) {
                clearApiConfig();
                throw new Error('API Key no autorizada por el backend.');
            }
            if (!response.ok) {
                console.warn(`Respuesta del servidor: HTTP ${response.status}`);
            }
            return true;
        } catch (err) {
            clearApiConfig();
            throw err;
        }
    },
    logout: () => {
        clearApiConfig();
        window.location.href = './login.html';
    },

    getApiKey: () => getApiKey()
};
