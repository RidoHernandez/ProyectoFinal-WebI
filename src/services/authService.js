import {
    httpClient,
    ApiError,
    getApiKey as httpGetApiKey,
    setApiConfig,
    clearApiConfig,
    ENDPOINTS,
    STORAGE_KEYS
} from "../api/httpClient.js";

const SESSION_INTEGRITY_SALT = 'NW_DB_SESSION_INTEGRITY_SALT_2026_V3';
const SENSITIVE_LOCAL_KEYS = Object.freeze([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.AUTH_SESSION,
    STORAGE_KEYS.AUTH_FLASH_ERROR,
    'northwind_api_url',
    'api_key',
    'apiKey',
    'auth_token',
    'token',
    'user',
    'session',
    'password'
]);

const ALLOWED_VIEWS = new Set([
    './productos.html',
    './catalogo.html',
    './clientes.html',
    './pedidos.html',
    './ordenes.html'
]);

export const PERMISSION_KEYS = Object.freeze([
    'canViewProductsAdmin',
    'canCreateProducts',
    'canEditProductDetails',
    'canEditProductPricingStock',
    'canDeleteProducts',
    'canDiscontinueProducts',
    'canViewCustomers',
    'canViewAllOrders',
    'canUpdateOrderStatus',
    'canCancelOwnOrders',
    'canPurchaseCatalog'
]);

export function createEmptyPermissions() {
    const perms = {};
    for (const key of PERMISSION_KEYS) {
        perms[key] = false;
    }
    return perms;
}

export function normalizePermissions(raw = null) {
    const result = createEmptyPermissions();
    if (!raw || typeof raw !== 'object') {
        return result;
    }

    for (const key of PERMISSION_KEYS) {
        const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
        result[key] = Boolean(raw[key] ?? raw[pascalKey] ?? false);
    }

    return result;
}

export function normalizeDefaultView(rawView) {
    const clean = typeof rawView === 'string' ? rawView.trim() : '';
    return ALLOWED_VIEWS.has(clean) ? clean : './catalogo.html';
}

let inMemorySession = null;

export function purgeResidualLocalStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            for (const key of SENSITIVE_LOCAL_KEYS) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Ignore storage errors in restricted environments
    }
}

export function computeSessionSignature(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return '';
    }

    const perms = normalizePermissions(sessionData.permissions);
    const permFlags = PERMISSION_KEYS.map((k) => (perms[k] ? '1' : '0')).join('');

    const payload = [
        String(sessionData.userId ?? ''),
        String(sessionData.username ?? '').trim(),
        String(sessionData.apiKey ?? '').trim(),
        String(sessionData.expiresAt ?? '').trim(),
        String(sessionData.authenticatedAt ?? ''),
        normalizeDefaultView(sessionData.defaultView),
        permFlags,
        SESSION_INTEGRITY_SALT
    ].join('|');

    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;

    for (let i = 0; i < payload.length; i++) {
        const ch = payload.charCodeAt(i);
        h1 ^= ch;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= ch;
        h2 = Math.imul(h2, 0x85ebca6b);
    }

    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `sig_${hex1}${hex2}`;
}

export function verifySessionIntegrity(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return false;
    }

    const { userId, username, apiKey, expiresAt, authenticatedAt, signature } = sessionData;

    if (userId === undefined || userId === null) return false;
    if (!username || typeof username !== 'string' || username.trim() === '') return false;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') return false;
    if (!expiresAt || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return false;
    if (typeof authenticatedAt !== 'number' || !Number.isFinite(authenticatedAt)) return false;
    if (!signature || typeof signature !== 'string') return false;

    const expectedSignature = computeSessionSignature(sessionData);
    return signature === expectedSignature;
}

function saveSignedSession({ userId, username, apiKey, expiresAt, authenticatedAt, defaultView, permissions }) {
    purgeResidualLocalStorage();

    const cleanUsername = String(username).trim();
    const cleanApiKey = String(apiKey).trim();
    const normalizedUserId = userId ?? 0;
    const normalizedExpiresAt = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedAuthAt = typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt)
        ? authenticatedAt
        : Date.now();
    const normalizedView = normalizeDefaultView(defaultView);
    const normalizedPermissions = normalizePermissions(permissions);

    const sessionBase = {
        userId: normalizedUserId,
        username: cleanUsername,
        apiKey: cleanApiKey,
        expiresAt: normalizedExpiresAt,
        authenticatedAt: normalizedAuthAt,
        defaultView: normalizedView,
        permissions: normalizedPermissions
    };

    const signature = computeSessionSignature(sessionBase);
    const fullSession = {
        ...sessionBase,
        signature
    };

    setApiConfig(cleanApiKey);

    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(fullSession));
            sessionStorage.setItem(STORAGE_KEYS.API_KEY, cleanApiKey);
        }
    } catch {
        // Ignore storage errors
    }

    inMemorySession = fullSession;
    return fullSession;
}

// Purge any residual sensitive keys from localStorage immediately on startup/import
purgeResidualLocalStorage();

export const authService = {
    PERMISSION_KEYS,
    createEmptyPermissions,
    normalizePermissions,
    computeSessionSignature,
    verifySessionIntegrity,
    purgeResidualLocalStorage,

    isAuthenticated() {
        purgeResidualLocalStorage();

        let rawSession = null;
        try {
            if (typeof sessionStorage !== 'undefined') {
                rawSession = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
            }
        } catch {
            return false;
        }

        if (!rawSession) {
            inMemorySession = null;
            return false;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(rawSession);
        } catch {
            this.logout();
            return false;
        }

        if (!verifySessionIntegrity(parsed)) {
            this.logout();
            return false;
        }

        const expiresTimestamp = Date.parse(parsed.expiresAt);
        if (Number.isNaN(expiresTimestamp) || Date.now() >= expiresTimestamp) {
            this.logout();
            return false;
        }

        try {
            if (typeof sessionStorage !== 'undefined') {
                const syncedKey = sessionStorage.getItem(STORAGE_KEYS.API_KEY);
                if (syncedKey !== parsed.apiKey) {
                    sessionStorage.setItem(STORAGE_KEYS.API_KEY, parsed.apiKey);
                }
            }
        } catch {
            // Ignore storage sync errors
        }

        inMemorySession = parsed;
        return true;
    },

    getCurrentUser() {
        if (!this.isAuthenticated() || !inMemorySession) {
            return null;
        }

        const permissions = normalizePermissions(inMemorySession.permissions);
        const defaultView = normalizeDefaultView(inMemorySession.defaultView);

        const user = {
            userId: inMemorySession.userId,
            username: inMemorySession.username,
            apiKey: inMemorySession.apiKey,
            expiresAt: inMemorySession.expiresAt,
            authenticatedAt: inMemorySession.authenticatedAt,
            defaultView,
            permissions
        };

        Object.defineProperties(user, {
            nombre: { value: inMemorySession.username, enumerable: false },
            autenticado: { value: true, enumerable: false }
        });

        return user;
    },

    getPermissions() {
        const user = this.getCurrentUser();
        return user ? normalizePermissions(user.permissions) : createEmptyPermissions();
    },

    hasPermission(requiredPermissions = null) {
        if (!this.isAuthenticated()) {
            return false;
        }

        if (!requiredPermissions) {
            return true;
        }

        const perms = this.getPermissions();
        const keys = Array.isArray(requiredPermissions)
            ? requiredPermissions
            : [requiredPermissions];

        if (keys.length === 0) {
            return true;
        }

        return keys.some((key) => Boolean(perms[key]));
    },

    getDefaultView() {
        const user = this.getCurrentUser();
        return normalizeDefaultView(user?.defaultView);
    },

    getApiKey() {
        const user = this.getCurrentUser();
        if (user && user.apiKey) {
            return user.apiKey;
        }
        return httpGetApiKey();
    },

    async checkSession() {
        const user = this.getCurrentUser();
        if (!user) {
            return null;
        }

        return {
            autenticado: true,
            userId: user.userId,
            username: user.username,
            nombre: user.username,
            apiKey: user.apiKey,
            expiresAt: user.expiresAt,
            authenticatedAt: user.authenticatedAt,
            defaultView: user.defaultView,
            permissions: user.permissions
        };
    },

    async refreshProfile() {
        const current = this.getCurrentUser();
        if (!current) {
            return null;
        }

        try {
            const response = await httpClient(ENDPOINTS.AUTH_ME, {
                method: 'GET'
            });

            if (!response.ok) {
                if (response.status === 401) {
                    return null;
                }
                return current;
            }

            const data = await response.json();
            const updatedUsername = String(data?.username ?? data?.Username ?? current.username).trim();
            const updatedUserId = data?.userId ?? data?.UserId ?? current.userId;
            const updatedView = normalizeDefaultView(data?.defaultView ?? data?.DefaultView ?? current.defaultView);
            const updatedPermissions = normalizePermissions(data?.permissions ?? data?.Permissions ?? current.permissions);

            saveSignedSession({
                userId: updatedUserId,
                username: updatedUsername,
                apiKey: current.apiKey,
                expiresAt: current.expiresAt,
                authenticatedAt: current.authenticatedAt,
                defaultView: updatedView,
                permissions: updatedPermissions
            });

            return this.getCurrentUser();
        } catch {
            return current;
        }
    },

    async login(username, password) {
        purgeResidualLocalStorage();

        if (!username || typeof username !== 'string' || username.trim() === '') {
            throw new Error('Debes ingresar tu nombre de usuario.');
        }

        if (!password || typeof password !== 'string' || password.trim() === '') {
            throw new Error('Debes ingresar tu contraseña.');
        }

        const cleanUsername = username.trim();

        const response = await httpClient(ENDPOINTS.AUTH_LOGIN, {
            method: 'POST',
            body: JSON.stringify({
                username: cleanUsername,
                password
            }),
            skipAuthRedirect: true
        });

        if (!response.ok) {
            const problem = response.problemDetails || {
                status: response.status || 401,
                title: 'Error de autenticación',
                detail: response.errorMessage || 'El usuario o la contraseña proporcionados son incorrectos.',
                message: response.errorMessage || 'El usuario o la contraseña proporcionados son incorrectos.'
            };
            throw new ApiError(problem);
        }

        const data = await response.json();
        const userId = data?.userId ?? data?.UserId ?? 0;
        const resolvedUsername = String(data?.username ?? data?.Username ?? cleanUsername).trim();
        const apiKey = String(data?.apiKey ?? data?.ApiKey ?? '').trim();
        const expiresAt = data?.expiresAt ?? data?.ExpiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const defaultView = normalizeDefaultView(data?.defaultView ?? data?.DefaultView);
        const permissions = normalizePermissions(data?.permissions ?? data?.Permissions);

        if (!apiKey) {
            throw new Error('El servidor no devolvió una credencial válida.');
        }

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            apiKey,
            expiresAt,
            authenticatedAt: Date.now(),
            defaultView,
            permissions
        });
    },

    async register(username, email, password) {
        purgeResidualLocalStorage();

        if (!username || typeof username !== 'string' || username.trim() === '') {
            throw new Error('El nombre de usuario es requerido.');
        }

        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            throw new Error('Debes ingresar un correo electrónico válido.');
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            throw new Error('La contraseña debe tener al menos 8 caracteres.');
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.trim();

        const response = await httpClient(ENDPOINTS.AUTH_REGISTER, {
            method: 'POST',
            body: JSON.stringify({
                username: cleanUsername,
                email: cleanEmail,
                password
            }),
            skipAuthRedirect: true
        });

        if (!response.ok) {
            const problem = response.problemDetails || {
                status: response.status || 400,
                title: 'Error en el registro',
                detail: response.errorMessage || 'No fue posible registrar la cuenta.',
                message: response.errorMessage || 'No fue posible registrar la cuenta.'
            };
            throw new ApiError(problem);
        }

        const data = await response.json();
        const userId = data?.userId ?? data?.UserId ?? 0;
        const resolvedUsername = String(data?.username ?? data?.Username ?? cleanUsername).trim();
        const apiKey = String(data?.apiKey ?? data?.ApiKey ?? '').trim();
        const expiresAt = data?.expiresAt ?? data?.ExpiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const defaultView = normalizeDefaultView(data?.defaultView ?? data?.DefaultView ?? './catalogo.html');
        const permissions = normalizePermissions(
            data?.permissions ?? data?.Permissions ?? {
                canCancelOwnOrders: true,
                canPurchaseCatalog: true
            }
        );

        if (!apiKey) {
            throw new Error('El servidor no devolvió una credencial válida tras el registro.');
        }

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            apiKey,
            expiresAt,
            authenticatedAt: Date.now(),
            defaultView,
            permissions
        });
    },

    handleSessionExpired() {
        this.logout('session_expired');
    },

    logout(reason = null) {
        inMemorySession = null;
        clearApiConfig();
        purgeResidualLocalStorage();

        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear?.();
            }
        } catch {
            // Ignore storage errors in restricted environments
        }

        if (typeof window !== 'undefined' && window.location) {
            if (reason && typeof reason === 'string' && reason.trim() !== '') {
                window.location.href = `./login.html?reason=${encodeURIComponent(reason.trim())}`;
            } else {
                window.location.href = './login.html';
            }
        }
    }
};

export default authService;
