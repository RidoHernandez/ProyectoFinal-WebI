const API_BASE_URL = 'https://api-nwind-ghbbh4bqh8ecabb7.westus3-01.azurewebsites.net/api';

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
export const CART = '/cart';
export const CART_ITEMS = '/cart/items';
export const CART_CHECKOUT = '/cart/checkout';

export const ENDPOINTS = Object.freeze({
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_ME,
    PRODUCTS,
    CUSTOMERS,
    ORDERS,
    ORDERS_MINE,
    CART,
    CART_ITEMS,
    CART_CHECKOUT
});

const STATUS_ERROR_MESSAGES = Object.freeze({
    400: 'Solicitud inválida. Verifica los datos ingresados.',
    401: 'Sesión no autorizada o expirada. Inicia sesión nuevamente.',
    403: 'No tienes permisos suficientes para realizar esta acción.',
    404: 'El recurso solicitado no fue encontrado.',
    409: 'La operación no pudo completarse por un conflicto con el estado actual.',
    500: 'Ocurrió un error al procesar la solicitud. Intenta nuevamente más tarde.'
});

const SENSITIVE_ERROR_PATTERN = /(System\.|Exception|StackTrace|Microsoft\.AspNetCore|EntityFramework|Pomelo|MySql|MariaDB|SqlException|SQLSTATE|InnerException|DbUpdateException|Kestrel|Text\.Json|Newtonsoft|Table\s+'[^']+'|Column\s+'[^']+'|SELECT\s+.+\s+FROM|ForeignKey|\sat\s+[A-Za-z0-9_.<>`]+\(|[A-Z]:\\[^\s]+|\/api\/[a-z0-9_/-]+|azurewebsites\.net|https?:\/\/[^\s]+)/i;

const GENERIC_HTTP_REASONS = new Set([
    'bad request',
    'unauthorized',
    'forbidden',
    'not found',
    'conflict',
    'internal server error'
]);

function isPublicEndpoint(endpoint = '') {
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
    const normalized = withLeadingSlash.startsWith('/api/') ? withLeadingSlash.slice(4) : withLeadingSlash;
    return normalized === AUTH_LOGIN || normalized === AUTH_REGISTER;
}

export function buildApiUrl(endpoint = '') {
    if (/^https?:\/\//i.test(endpoint)) {
        return endpoint;
    }

    const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const epLower = ep.toLowerCase();
    const normalized = epLower === '/api'
        ? ''
        : (epLower.startsWith('/api/') ? ep.slice(4) : ep);

    return `${API_BASE_URL}${normalized}`;
}

export class ApiError extends Error {
    constructor(problemDetails) {
        super(problemDetails.message || 'Error en la comunicación con el servidor.');
        this.name = 'ApiError';
        this.status = problemDetails.status;
        this.title = problemDetails.title;
        this.detail = problemDetails.detail;
        this.instance = problemDetails.instance;
        this.errors = problemDetails.errors || null;
        this.problemDetails = problemDetails;
    }
}

function sanitizeMessage(text, fallback = '') {
    if (!text || typeof text !== 'string') return fallback;
    const trimmed = text.trim();
    if (!trimmed || SENSITIVE_ERROR_PATTERN.test(trimmed)) {
        return fallback;
    }
    return trimmed;
}

function pickSafeNonGenericMessage(text) {
    const clean = sanitizeMessage(text, '');
    if (!clean || GENERIC_HTTP_REASONS.has(clean.toLowerCase())) {
        return '';
    }
    return clean;
}

export function extractProblemMessage(error, fallback = 'Ocurrió un error al procesar la solicitud.') {
    if (!error) return fallback;

    const pd = error.problemDetails || error;
    const status = Number(pd?.status || error?.status) || 0;
    if (status >= 500) {
        return STATUS_ERROR_MESSAGES[500];
    }

    const rawErrors = pd?.errors || error?.errors || null;
    if (rawErrors && typeof rawErrors === 'object') {
        const firstFieldMsg = Object.values(rawErrors)
            .flat()
            .map((msg) => pickSafeNonGenericMessage(String(msg ?? '')))
            .find(Boolean);
        if (firstFieldMsg) return firstFieldMsg;
    }

    return (
        pickSafeNonGenericMessage(pd?.detail) ||
        pickSafeNonGenericMessage(error?.detail) ||
        pickSafeNonGenericMessage(pd?.message) ||
        pickSafeNonGenericMessage(error?.message) ||
        pickSafeNonGenericMessage(pd?.title) ||
        pickSafeNonGenericMessage(error?.title) ||
        fallback
    );
}

export function normalizeProblemDetails(payload, status = 500) {
    const numericStatus = Number(payload?.status || status) || 500;
    const defaultMsg = STATUS_ERROR_MESSAGES[numericStatus]
        || (numericStatus >= 500
            ? STATUS_ERROR_MESSAGES[500]
            : 'No se pudo procesar la solicitud. Intenta nuevamente.');

    if (numericStatus >= 500) {
        return {
            status: numericStatus,
            title: 'Error interno del servidor',
            detail: STATUS_ERROR_MESSAGES[500],
            instance: null,
            type: null,
            errors: null,
            message: STATUS_ERROR_MESSAGES[500]
        };
    }

    const rawTitle = typeof payload === 'object' && payload !== null ? payload.title : null;
    const rawDetail = typeof payload === 'object' && payload !== null ? payload.detail : null;
    const rawErrors = typeof payload === 'object' && payload !== null && payload.errors ? payload.errors : null;

    const title = sanitizeMessage(rawTitle, defaultMsg);
    const detail = sanitizeMessage(rawDetail, title);

    let message = detail !== title ? detail : title;
    if (rawErrors && typeof rawErrors === 'object') {
        const firstFieldErrors = Object.values(rawErrors).flat().filter(Boolean);
        if (firstFieldErrors.length > 0 && typeof firstFieldErrors[0] === 'string') {
            message = sanitizeMessage(firstFieldErrors[0], message);
        }
    }

    return {
        status: numericStatus,
        title,
        detail,
        instance: null,
        type: (typeof payload === 'object' && payload !== null ? payload.type : null) || null,
        errors: rawErrors,
        message
    };
}

async function parseProblemDetails(response) {
    let payload = null;
    try {
        const cloned = typeof response.clone === 'function' ? response.clone() : response;
        const text = typeof cloned.text === 'function' ? await cloned.text() : '';
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { detail: text };
            }
        }
    } catch {
        payload = null;
    }
    return normalizeProblemDetails(payload, response.status);
}

export async function safeParseJson(response) {
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

export function throwApiError(response, fallbackStatus = 500) {
    const problemDetails = response?.problemDetails
        || normalizeProblemDetails(null, response?.status || fallbackStatus);
    throw new ApiError(problemDetails);
}

export function getAuthToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            const directToken = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
            if (directToken && directToken.trim() !== '') {
                return directToken.trim();
            }

            const rawSession = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
            if (rawSession) {
                try {
                    const parsed = JSON.parse(rawSession);
                    if (parsed?.token && typeof parsed.token === 'string') {
                        return parsed.token.trim();
                    }
                } catch {
                    // Ignore malformed session JSON
                }
            }
        }
    } catch {
        // Ignore storage errors
    }
    return null;
}

export function setAuthToken(token) {
    try {
        if (token && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token.trim());
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
            localStorage.removeItem('northwind_api_url');
        }
    } catch {
        // Ignore storage errors
    }
}

export function clearAuthToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_FLASH_ERROR);
            sessionStorage.clear?.();
        }
        if (typeof localStorage !== 'undefined') {
            for (const key of SENSITIVE_LOCAL_KEYS) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Ignore storage errors
    }
}

function isOnLoginPage() {
    if (typeof window === 'undefined' || !window.location) return false;
    const pathname = (window.location.pathname || '').toLowerCase();
    return pathname.endsWith('/login.html') || pathname === 'login.html' || pathname.endsWith('login.html');
}

function handleUnauthorized(endpoint, options = {}) {
    if (isPublicEndpoint(endpoint)) return;

    clearAuthToken();

    if (options.skipAuthRedirect) return;
    if (typeof window === 'undefined' || !window.location) return;
    if (isOnLoginPage()) return;

    window.location.href = './login.html?reason=session_expired';
}

function buildRequestHeaders(endpoint, customHeaders = {}, body = null) {
    const normalizedCustom = (typeof Headers !== 'undefined' && customHeaders instanceof Headers)
        ? Object.fromEntries(customHeaders.entries())
        : { ...customHeaders };

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const hasContentType = Object.keys(normalizedCustom).some(
        (key) => key.toLowerCase() === 'content-type'
    );

    const headers = {
        ...(!isFormData && !hasContentType ? { 'Content-Type': 'application/json' } : {}),
        ...normalizedCustom
    };

    const token = getAuthToken();
    const isPublic = isPublicEndpoint(endpoint);
    const hasAuthorizationHeader = Object.keys(headers).some(
        (key) => key.toLowerCase() === 'authorization' && Boolean(headers[key])
    );

    if (token && !isPublic && !hasAuthorizationHeader) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

export const httpClient = async (endpoint, options = {}) => {
    const url = buildApiUrl(endpoint);
    const headers = buildRequestHeaders(endpoint, options.headers || {}, options.body);

    try {
        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const publicAuth = isPublicEndpoint(endpoint);
            const problemDetails = response.status >= 500
                ? normalizeProblemDetails(null, response.status)
                : await parseProblemDetails(response);
            response.problemDetails = problemDetails;
            response.errorMessage = problemDetails.message;

            if (publicAuth) return response;

            if (response.status === 401) {
                handleUnauthorized(endpoint, options);
            }
        }

        return response;
    } catch {
        throw new Error('No fue posible conectar con el servicio. Intenta nuevamente más tarde.');
    }
};
