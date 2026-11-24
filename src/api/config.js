export const API_BASE_URL = 'https://localhost:7039/api';
export const DEFAULT_BASE_URL = 'https://localhost:7039';

export const STORAGE_KEYS = Object.freeze({
    API_URL: 'northwind_api_url',
    API_KEY: 'northwind_api_key',
    AUTH_SESSION: 'auth_session'
});

export const AUTH_LOGIN = '/auth/login';
export const AUTH_REGISTER = '/auth/register';
export const APIKEYS_REGENERATE = '/apikeys/regenerate';
export const PRODUCTS = '/Products';
export const CUSTOMERS = '/customers';
export const ORDERS = '/orders';

export const ENDPOINTS = Object.freeze({
    AUTH_LOGIN,
    AUTH_REGISTER,
    APIKEYS_REGENERATE,
    PRODUCTS,
    CUSTOMERS,
    ORDERS
});

export const PUBLIC_ENDPOINTS = Object.freeze([
    AUTH_LOGIN,
    AUTH_REGISTER,
    '/api/auth/login',
    '/api/auth/register'
]);

export function getBaseUrl() {
    try {
        const stored = typeof localStorage !== 'undefined'
            ? localStorage.getItem(STORAGE_KEYS.API_URL)
            : null;
        if (stored && stored.trim() !== '') {
            return stored.trim().replace(/\/+$/, '');
        }
    } catch {
        // Ignore storage access errors in restricted environments
    }
    return API_BASE_URL;
}

export function isPublicEndpoint(endpoint = '') {
    if (!endpoint || typeof endpoint !== 'string') return false;
    let path = endpoint.trim();
    if (/^https?:\/\//i.test(path)) {
        try {
            path = new URL(path).pathname;
        } catch {
            return false;
        }
    }
    const cleanPath = path.split('?')[0].split('#')[0].trim().toLowerCase().replace(/\/+$/, '');
    const withLeadingSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    const normalized = withLeadingSlash.startsWith('/api/')
        ? withLeadingSlash.slice(4)
        : withLeadingSlash;
    return normalized === AUTH_LOGIN || normalized === AUTH_REGISTER;
}

export function buildApiUrl(endpoint = '') {
    if (/^https?:\/\//i.test(endpoint)) {
        return endpoint;
    }

    const base = getBaseUrl().replace(/\/+$/, '');
    const baseLower = base.toLowerCase();
    const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const epLower = ep.toLowerCase();

    if (baseLower.endsWith('/api') && (epLower === '/api' || epLower.startsWith('/api/'))) {
        return `${base}${ep.slice(4)}`;
    }

    if (!baseLower.endsWith('/api') && epLower !== '/api' && !epLower.startsWith('/api/')) {
        return `${base}/api${ep}`;
    }

    return `${base}${ep}`;
}
