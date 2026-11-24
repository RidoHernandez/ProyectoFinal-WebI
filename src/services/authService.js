import {
    httpClient,
    getApiKey,
    setApiConfig,
    clearApiConfig,
    getBaseUrl,
    ENDPOINTS,
    STORAGE_KEYS
} from "../api/httpClient.js";

function clearResidualLocalApiKey() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
        }
    } catch {
        // Ignore storage errors
    }
}

export const authService = {
    checkSession: async () => {
        clearResidualLocalApiKey();

        try {
            const apiKey = getApiKey();
            if (!apiKey) return null;

            const response = await httpClient(ENDPOINTS.PRODUCTS, {
                method: 'GET',
                skipAuthRedirect: true
            });

            if (response.ok) {
                return {
                    autenticado: true,
                    rol: 'Administrador',
                    nombre: 'Administrador (API Key)',
                    apiKey,
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
                apiKey,
                baseUrl: getBaseUrl()
            };
        } catch (error) {
            console.warn("No se pudo comprobar la sesión con el backend:", error);
            const activeKey = getApiKey();
            if (activeKey) {
                return {
                    autenticado: true,
                    rol: 'Administrador (Offline)',
                    nombre: 'Admin (Servidor offline)',
                    apiKey: activeKey,
                    baseUrl: getBaseUrl()
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
            const response = await httpClient(ENDPOINTS.PRODUCTS, {
                method: 'GET',
                skipAuthRedirect: true
            });
            if (response.status === 401) {
                clearApiConfig();
                throw new Error(response.errorMessage || 'API Key no autorizada por el backend.');
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

    handleSessionExpired: () => {
        clearApiConfig();
        if (typeof window !== 'undefined' && window.location) {
            const pathname = (window.location.pathname || '').toLowerCase();
            if (!pathname.endsWith('login.html')) {
                window.location.href = './login.html?reason=session_expired';
            }
        }
    },

    logout: () => {
        clearApiConfig();
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './login.html';
        }
    },

    getApiKey: () => getApiKey()
};
