import {
    httpClient,
    ApiError,
    getAuthToken as httpGetAuthToken,
    setAuthToken,
    clearAuthToken,
    ENDPOINTS,
    STORAGE_KEYS,
    SENSITIVE_LOCAL_KEYS
} from "../api/httpClient.js";

const SESSION_INTEGRITY_SALT = 'NW_JWT_SESSION_INTEGRITY_SALT_2026_V4';
const DEFAULT_TOKEN_TTL_MS = 120 * 60 * 1000;

const ALLOWED_VIEWS = new Set([
    './productos.html',
    './catalogo.html',
    './clientes.html',
    './pedidos.html',
    './ordenes.html'
]);

const PERMISSION_KEYS = Object.freeze([
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

function createEmptyPermissions() {
    const perms = {};
    for (const key of PERMISSION_KEYS) {
        perms[key] = false;
    }
    return perms;
}

function normalizePermissions(raw = null) {
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

function normalizeDefaultView(rawView) {
    const clean = typeof rawView === 'string' ? rawView.trim() : '';
    return ALLOWED_VIEWS.has(clean) ? clean : './catalogo.html';
}

function extractJwtExpirationMs(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;

    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        let decoded = '';
        if (typeof atob === 'function') {
            decoded = atob(padded);
        } else if (typeof Buffer !== 'undefined') {
            decoded = Buffer.from(padded, 'base64').toString('utf8');
        } else {
            return null;
        }
        const payload = JSON.parse(decoded);
        if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
            return payload.exp * 1000;
        }
    } catch {
        return null;
    }

    return null;
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

function computeSessionSignature(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return '';
    }

    const perms = normalizePermissions(sessionData.permissions);
    const permFlags = PERMISSION_KEYS.map((k) => (perms[k] ? '1' : '0')).join('');

    const payload = [
        String(sessionData.userId ?? ''),
        String(sessionData.username ?? '').trim(),
        String(sessionData.token ?? '').trim(),
        String(sessionData.tokenType ?? 'Bearer').trim(),
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

function verifySessionIntegrity(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return false;
    }

    const { userId, username, token, tokenType, expiresAt, authenticatedAt, signature } = sessionData;

    if (userId === undefined || userId === null) return false;
    if (!username || typeof username !== 'string' || username.trim() === '') return false;
    if (!token || typeof token !== 'string' || token.trim() === '') return false;
    if (!tokenType || typeof tokenType !== 'string' || tokenType.trim() !== 'Bearer') return false;
    if (!expiresAt || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return false;
    if (typeof authenticatedAt !== 'number' || !Number.isFinite(authenticatedAt)) return false;
    if (!signature || typeof signature !== 'string') return false;

    const expectedSignature = computeSessionSignature(sessionData);
    return signature === expectedSignature;
}

function resolveExpiresAtIso(rawExpiresAt, token) {
    if (rawExpiresAt && typeof rawExpiresAt === 'string' && !Number.isNaN(Date.parse(rawExpiresAt))) {
        return rawExpiresAt;
    }
    const jwtExpMs = extractJwtExpirationMs(token);
    if (jwtExpMs !== null) {
        return new Date(jwtExpMs).toISOString();
    }
    return new Date(Date.now() + DEFAULT_TOKEN_TTL_MS).toISOString();
}

function saveSignedSession({ userId, username, token, tokenType = 'Bearer', expiresAt, authenticatedAt, defaultView, permissions }) {
    purgeResidualLocalStorage();

    const cleanUsername = String(username).trim();
    const cleanToken = String(token).trim();
    const cleanTokenType = String(tokenType || 'Bearer').trim() || 'Bearer';
    const normalizedUserId = userId ?? 0;
    const normalizedExpiresAt = resolveExpiresAtIso(expiresAt, cleanToken);
    const normalizedAuthAt = typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt)
        ? authenticatedAt
        : Date.now();
    const normalizedView = normalizeDefaultView(defaultView);
    const normalizedPermissions = normalizePermissions(permissions);

    const sessionBase = {
        userId: normalizedUserId,
        username: cleanUsername,
        token: cleanToken,
        tokenType: cleanTokenType,
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

    setAuthToken(cleanToken);

    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(fullSession));
            sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, cleanToken);
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
    extractJwtExpirationMs,
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

        const now = Date.now();
        const expiresTimestamp = Date.parse(parsed.expiresAt);
        const jwtExpMs = extractJwtExpirationMs(parsed.token);
        if (
            Number.isNaN(expiresTimestamp) ||
            now >= expiresTimestamp ||
            (jwtExpMs !== null && now >= jwtExpMs)
        ) {
            this.logout();
            return false;
        }

        try {
            if (typeof sessionStorage !== 'undefined') {
                const syncedToken = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
                if (syncedToken !== parsed.token) {
                    sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, parsed.token);
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
            token: inMemorySession.token,
            tokenType: inMemorySession.tokenType || 'Bearer',
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

    getToken() {
        const user = this.getCurrentUser();
        if (user && user.token) {
            return user.token;
        }
        return httpGetAuthToken();
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
            token: user.token,
            tokenType: user.tokenType,
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
                token: current.token,
                tokenType: current.tokenType || 'Bearer',
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
        const token = String(data?.token ?? data?.Token ?? '').trim();
        const tokenType = String(data?.tokenType ?? data?.TokenType ?? 'Bearer').trim() || 'Bearer';
        const expiresAt = resolveExpiresAtIso(data?.expiresAt ?? data?.ExpiresAt, token);
        const defaultView = normalizeDefaultView(data?.defaultView ?? data?.DefaultView);
        const permissions = normalizePermissions(data?.permissions ?? data?.Permissions);

        if (!token) {
            throw new Error('El servidor no devolvió un token de autenticación válido.');
        }

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            token,
            tokenType,
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
        const token = String(data?.token ?? data?.Token ?? '').trim();
        const tokenType = String(data?.tokenType ?? data?.TokenType ?? 'Bearer').trim() || 'Bearer';
        const expiresAt = resolveExpiresAtIso(data?.expiresAt ?? data?.ExpiresAt, token);
        const defaultView = normalizeDefaultView(data?.defaultView ?? data?.DefaultView ?? './catalogo.html');
        const permissions = normalizePermissions(
            data?.permissions ?? data?.Permissions ?? {
                canCancelOwnOrders: true,
                canPurchaseCatalog: true
            }
        );

        if (!token) {
            throw new Error('El servidor no devolvió un token de autenticación válido tras el registro.');
        }

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            token,
            tokenType,
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
        clearAuthToken();
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
