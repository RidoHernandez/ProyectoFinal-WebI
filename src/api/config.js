const API_BASE_URL = 'https://localhost:7039/api';

export const STORAGE_KEYS = Object.freeze({
    AUTH_TOKEN: 'northwind_jwt_token',
    AUTH_SESSION: 'auth_session',
    AUTH_FLASH_ERROR: 'auth_flash_error'
});

export const SENSITIVE_LOCAL_KEYS = Object.freeze([
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.AUTH_SESSION,
    STORAGE_KEYS.AUTH_FLASH_ERROR,
    'northwind_api_url',
    'auth_token',
    'token',
    'jwt',
    'access_token',
    'user',
    'session',
    'password'
]);

const AUTH_LOGIN = '/auth/login';
const AUTH_REGISTER = '/auth/register';
const AUTH_ME = '/auth/me';
export const PRODUCTS = '/Products';
export const CUSTOMERS = '/customers';
export const ORDERS = '/orders';
export const ORDERS_MINE = '/orders/mine';

export const ENDPOINTS = Object.freeze({
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_ME,
    PRODUCTS,
    CUSTOMERS,
    ORDERS,
    ORDERS_MINE
});

function getBaseUrl() {
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
