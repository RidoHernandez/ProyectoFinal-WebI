import {
    API_BASE_URL,
    DEFAULT_BASE_URL,
    STORAGE_KEYS,
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_ME,
    PRODUCTS,
    CUSTOMERS,
    ORDERS,
    ORDERS_MINE,
    ENDPOINTS,
    getBaseUrl,
    isPublicEndpoint,
    buildApiUrl
} from './config.js';

export {
    API_BASE_URL,
    DEFAULT_BASE_URL,
    STORAGE_KEYS,
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_ME,
    PRODUCTS,
    CUSTOMERS,
    ORDERS,
    ORDERS_MINE,
    ENDPOINTS,
    getBaseUrl,
    isPublicEndpoint,
    buildApiUrl
};

export const BASE_URL = getBaseUrl();

const STATUS_ERROR_MESSAGES = Object.freeze({
    400: 'Solicitud inválida. Verifica los datos ingresados.',
    401: 'Sesión no autorizada o expirada. Inicia sesión nuevamente.',
    403: 'No tienes permisos suficientes para realizar esta acción.',
    404: 'El recurso solicitado no fue encontrado.',
    409: 'Conflicto de integridad: el recurso tiene registros vinculados y no puede eliminarse.',
    500: 'Ocurrió un error interno en el servidor. Intenta nuevamente más tarde.'
});

const SENSITIVE_PATTERN = /(System\.|Exception|StackTrace|Microsoft\.AspNetCore|MySql|SqlException|InnerException|DbUpdateException|Table\s+'[^']+'|Column\s+'[^']+'|SELECT\s+.+\s+FROM|ForeignKey|\sat\s+[A-Za-z0-9_.<>`]+\(|[A-Z]:\\[^\s]+|\/api\/[a-z0-9_/-]+|https?:\/\/localhost(?::\d+)?)/i;

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

function sanitizeMessage(text, fallback) {
    if (!text || typeof text !== 'string') return fallback;
    const trimmed = text.trim();
    if (!trimmed || SENSITIVE_PATTERN.test(trimmed)) {
        return fallback;
    }
    return trimmed;
}

export function normalizeProblemDetails(payload, status = 500) {
    const numericStatus = Number(payload?.status || status) || 500;
    const defaultMsg = STATUS_ERROR_MESSAGES[numericStatus]
        || (numericStatus >= 500
            ? STATUS_ERROR_MESSAGES[500]
            : `Error HTTP ${numericStatus} al procesar la solicitud.`);

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

export async function parseProblemDetails(response) {
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

const SENSITIVE_LOCAL_KEYS = Object.freeze([
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

export function clearAuthToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_FLASH_ERROR);
            sessionStorage.removeItem('northwind_discontinued_products');
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

    const finalOptions = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, finalOptions);

        if (!response.ok) {
            const problemDetails = await parseProblemDetails(response);
            response.problemDetails = problemDetails;
            response.errorMessage = problemDetails.message;

            if (response.status === 401) {
                console.warn('401 Unauthorized:', problemDetails.message);
                handleUnauthorized(endpoint, options);
            } else if (response.status === 403) {
                console.warn('403 Forbidden:', problemDetails.message);
            } else if (response.status === 404) {
                console.warn('404 Not Found:', problemDetails.message);
            } else if (response.status === 409) {
                console.warn('409 Conflict:', problemDetails.message);
            } else if (response.status >= 500) {
                console.error(`HTTP ${response.status} Server Error:`, problemDetails.message);
            }
        }

        return response;
    } catch (error) {
        console.error('Error de conexión con el servidor:', error?.message || 'Fallo de red');
        throw error;
    }
};

export function ajaxRequest(endpoint, { method = 'GET', body = null, headers = {}, skipAuthRedirect = false } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = buildApiUrl(endpoint);
        const requestHeaders = buildRequestHeaders(endpoint, headers, body);

        xhr.open(method, url, true);
        Object.entries(requestHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));

        xhr.onload = function () {
            const isOk = xhr.status >= 200 && xhr.status < 300;
            let responseData = null;
            try {
                responseData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                responseData = xhr.responseText;
            }

            let problemDetails = null;
            if (!isOk) {
                problemDetails = normalizeProblemDetails(
                    typeof responseData === 'object' ? responseData : { detail: responseData },
                    xhr.status
                );
                if (xhr.status === 401) {
                    handleUnauthorized(endpoint, { skipAuthRedirect });
                }
            }

            resolve({
                ok: isOk,
                status: xhr.status,
                statusText: xhr.statusText,
                data: responseData,
                problemDetails,
                errorMessage: problemDetails?.message || null,
                text: async () => xhr.responseText,
                json: async () => responseData
            });
        };

        xhr.onerror = function () {
            reject(new Error('Error de red al comunicarse con el servidor.'));
        };

        xhr.ontimeout = function () {
            reject(new Error('Tiempo de espera agotado al comunicarse con el servidor.'));
        };

        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        if (body && typeof body === 'object' && !isFormData) {
            xhr.send(JSON.stringify(body));
        } else {
            xhr.send(body);
        }
    });
}

export function promiseRequest(endpoint, options = {}) {
    const url = buildApiUrl(endpoint);
    const headers = buildRequestHeaders(endpoint, options.headers || {}, options.body);
    const config = {
        ...options,
        headers
    };

    return fetch(url, config).then(async response => {
        if (!response.ok) {
            const problemDetails = await parseProblemDetails(response);
            if (response.status === 401) {
                handleUnauthorized(endpoint, options);
            }
            throw new ApiError(problemDetails);
        }
        return response.status === 204 ? null : response.json();
    });
}

export function callbackRequest(endpoint, options = {}, callback) {
    if (typeof callback !== 'function') {
        throw new Error('Se requiere una función callback como tercer parámetro.');
    }

    const url = buildApiUrl(endpoint);
    const xhr = new XMLHttpRequest();
    const method = options.method || 'GET';
    const body = options.body;
    const requestHeaders = buildRequestHeaders(endpoint, options.headers || {}, body);

    xhr.open(method, url, true);
    Object.entries(requestHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            let parsed = null;
            try {
                parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                parsed = xhr.responseText;
            }
            callback(null, parsed);
        } else {
            let parsed = null;
            try {
                parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                parsed = { detail: xhr.responseText };
            }
            const problemDetails = normalizeProblemDetails(parsed, xhr.status);
            if (xhr.status === 401) {
                handleUnauthorized(endpoint, options);
            }
            callback(new ApiError(problemDetails), null);
        }
    };

    xhr.onerror = function () {
        callback(new Error('Fallo de conexión de red al comunicarse con el servidor.'), null);
    };

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body && typeof body === 'object' && !isFormData) {
        xhr.send(JSON.stringify(body));
    } else {
        xhr.send(body);
    }
}
