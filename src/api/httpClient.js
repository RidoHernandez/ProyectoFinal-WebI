export const DEFAULT_BASE_URL = 'http://localhost:5009';
export const DEFAULT_API_KEY = 'ROBE-LINGO-KEY-1234';

export function getBaseUrl() {
    return localStorage.getItem('northwind_api_url') || DEFAULT_BASE_URL;
}

export function getApiKey() {
    return localStorage.getItem('northwind_api_key') || DEFAULT_API_KEY;
}

export function setApiConfig(apiKey, baseUrl = null) {
    if (apiKey) localStorage.setItem('northwind_api_key', apiKey.trim());
    if (baseUrl) localStorage.setItem('northwind_api_url', baseUrl.trim());
}

export function clearApiConfig() {
    localStorage.removeItem('northwind_api_key');
}

export const BASE_URL = getBaseUrl();

export const httpClient = async (endpoint, options = {}) => {
    const url = `${getBaseUrl()}${endpoint}`;
    const apiKey = getApiKey();

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
    };

    const finalOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {})
        }
    };

    try {
        const response = await fetch(url, finalOptions);

        if (response.status === 401) {
            console.warn("401 Unauthorized: API Key ausente o inválida.");
        } else if (response.status === 404) {
            console.warn(`404 Not Found: El recurso en ${endpoint} no existe en la API.`);
        } else if (response.status === 500) {
            console.error("500 Server Error: Fallo interno del servidor API.");
        }

        return response;
    } catch (error) {
        console.error("Error de conexión con el servidor (fetch):", error);
        throw error;
    }
};

export function ajaxRequest(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${getBaseUrl()}${endpoint}`;
        const apiKey = getApiKey();

        xhr.open(method, url, true);

        // Cabeceras predeterminadas
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-API-KEY', apiKey);

        // Cabeceras adicionales
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

        xhr.onload = function () {
            const isOk = xhr.status >= 200 && xhr.status < 300;
            let responseData = null;
            try {
                responseData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                responseData = xhr.responseText;
            }

            resolve({
                ok: isOk,
                status: xhr.status,
                statusText: xhr.statusText,
                data: responseData,
                text: async () => xhr.responseText,
                json: async () => responseData
            });
        };

        xhr.onerror = function () {
            reject(new Error(`Error de red AJAX (XMLHttpRequest) al contactar ${url}`));
        };

        xhr.ontimeout = function () {
            reject(new Error(`Timeout en la petición AJAX a ${url}`));
        };

        if (body && typeof body === 'object') {
            xhr.send(JSON.stringify(body));
        } else {
            xhr.send(body);
        }
    });
}

export function promiseRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        const url = `${getBaseUrl()}${endpoint}`;
        const apiKey = getApiKey();

        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': apiKey,
                ...(options.headers || {})
            }
        };

        fetch(url, config)
            .then(response => {
                if (!response.ok) {
                    return response.text().then(errText => {
                        let parsed = null;
                        try { parsed = JSON.parse(errText); } catch { /* ignore */ }
                        const msg = (parsed && (parsed.detail || parsed.title)) || errText || `HTTP ${response.status}`;
                        throw new Error(msg);
                    });
                }
                return response.status === 204 ? null : response.json();
            })
            .then(data => resolve(data))
            .catch(err => reject(err));
    });
}

export function callbackRequest(endpoint, options = {}, callback) {
    if (typeof callback !== 'function') {
        throw new Error('Se requiere una función callback como tercer parámetro.');
    }

    const url = `${getBaseUrl()}${endpoint}`;
    const apiKey = getApiKey();
    const xhr = new XMLHttpRequest();

    const method = options.method || 'GET';
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-API-KEY', apiKey);

    if (options.headers) {
        Object.entries(options.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    }

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
            let errorMsg = `Error HTTP ${xhr.status}: ${xhr.statusText}`;
            try {
                const parsed = JSON.parse(xhr.responseText);
                if (parsed.detail) errorMsg = parsed.detail;
            } catch { /* ignore */ }
            callback(new Error(errorMsg), null);
        }
    };

    xhr.onerror = function () {
        callback(new Error(`Fallo de conexión de red al conectar a ${url}`), null);
    };

    const body = options.body;
    if (body && typeof body === 'object') {
        xhr.send(JSON.stringify(body));
    } else {
        xhr.send(body);
    }
}
