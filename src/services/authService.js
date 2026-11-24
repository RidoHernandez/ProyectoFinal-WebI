import {
    httpClient,
    ApiError,
    getApiKey as httpGetApiKey,
    setApiConfig,
    clearApiConfig,
    getBaseUrl,
    ENDPOINTS,
    STORAGE_KEYS,
    ROLES,
    ADMIN_WHITELIST,
    EMPLOYEE_WHITELIST,
    EMPLOYEE_PREFIX
} from "../api/httpClient.js";

export {
    ROLES,
    ADMIN_WHITELIST,
    EMPLOYEE_WHITELIST,
    EMPLOYEE_PREFIX
};

const SESSION_INTEGRITY_SALT = 'NW_FROZEN_RBAC_INTEGRITY_SALT_2026_V2';
const SENSITIVE_LOCAL_KEYS = Object.freeze([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.AUTH_SESSION,
    'api_key',
    'apiKey',
    'auth_token',
    'token',
    'user',
    'session',
    'password'
]);

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

export function resolveUserRole(username, options = {}) {
    const isRegistration = typeof options === 'boolean'
        ? options
        : Boolean(options?.isRegistration);

    if (isRegistration) {
        return ROLES.CLIENTE;
    }

    if (!username || typeof username !== 'string') {
        return ROLES.CLIENTE;
    }

    const normalized = username.trim().toLowerCase();
    if (!normalized) {
        return ROLES.CLIENTE;
    }

    if (ADMIN_WHITELIST.includes(normalized)) {
        return ROLES.ADMIN;
    }

    if (normalized.startsWith(EMPLOYEE_PREFIX) || EMPLOYEE_WHITELIST.includes(normalized)) {
        return ROLES.EMPLEADO;
    }

    return ROLES.CLIENTE;
}

export function computeSessionSignature(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return '';
    }

    const payload = [
        String(sessionData.userId ?? ''),
        String(sessionData.username ?? '').trim(),
        String(sessionData.role ?? '').trim().toUpperCase(),
        String(sessionData.apiKey ?? '').trim(),
        String(sessionData.expiresAt ?? '').trim(),
        String(sessionData.authenticatedAt ?? ''),
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

    const { userId, username, role, apiKey, expiresAt, authenticatedAt, signature } = sessionData;

    if (userId === undefined || userId === null) return false;
    if (!username || typeof username !== 'string' || username.trim() === '') return false;
    if (!role || typeof role !== 'string' || !Object.values(ROLES).includes(role)) return false;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') return false;
    if (!expiresAt || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return false;
    if (typeof authenticatedAt !== 'number' || !Number.isFinite(authenticatedAt)) return false;
    if (!signature || typeof signature !== 'string') return false;

    const expectedSignature = computeSessionSignature(sessionData);
    if (signature !== expectedSignature) {
        return false;
    }

    // Prevent privilege escalation if someone attempts to assign ADMIN/EMPLEADO to a non-eligible username
    const maxEligibleRole = resolveUserRole(username, { isRegistration: false });
    if (role !== ROLES.CLIENTE && role !== maxEligibleRole) {
        return false;
    }

    return true;
}

function saveSignedSession({ userId, username, role, apiKey, expiresAt, authenticatedAt }, baseUrl = null) {
    purgeResidualLocalStorage();

    const cleanUsername = String(username).trim();
    const cleanApiKey = String(apiKey).trim();
    const normalizedUserId = userId ?? 0;
    const normalizedExpiresAt = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedAuthAt = typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt)
        ? authenticatedAt
        : Date.now();

    const sessionBase = {
        userId: normalizedUserId,
        username: cleanUsername,
        role,
        apiKey: cleanApiKey,
        expiresAt: normalizedExpiresAt,
        authenticatedAt: normalizedAuthAt
    };

    const signature = computeSessionSignature(sessionBase);
    const fullSession = {
        ...sessionBase,
        signature
    };

    setApiConfig(cleanApiKey, baseUrl);

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
    ROLES,
    ADMIN_WHITELIST,
    EMPLOYEE_WHITELIST,
    resolveUserRole,
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

        const user = {
            userId: inMemorySession.userId,
            username: inMemorySession.username,
            role: inMemorySession.role,
            apiKey: inMemorySession.apiKey,
            expiresAt: inMemorySession.expiresAt,
            authenticatedAt: inMemorySession.authenticatedAt
        };

        Object.defineProperties(user, {
            nombre: { value: inMemorySession.username, enumerable: false },
            rol: { value: inMemorySession.role, enumerable: false },
            autenticado: { value: true, enumerable: false },
            baseUrl: { value: getBaseUrl(), enumerable: false }
        });

        return user;
    },

    getUserRole() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    },

    hasRole(allowedRoles = []) {
        if (!this.isAuthenticated()) {
            return false;
        }

        const currentRole = this.getUserRole();
        if (!currentRole) {
            return false;
        }

        if (allowedRoles === undefined || allowedRoles === null) {
            return true;
        }

        const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        if (rolesArray.length === 0) {
            return true;
        }

        const normalizedAllowed = rolesArray
            .map((r) => String(r || '').trim().toUpperCase())
            .filter(Boolean);

        return normalizedAllowed.includes(currentRole.toUpperCase());
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
            role: user.role,
            rol: user.role,
            apiKey: user.apiKey,
            expiresAt: user.expiresAt,
            authenticatedAt: user.authenticatedAt,
            baseUrl: getBaseUrl()
        };
    },

    async login(username, password, baseUrl = null) {
        purgeResidualLocalStorage();

        if (!username || typeof username !== 'string' || username.trim() === '') {
            throw new Error('Debes ingresar tu nombre de usuario.');
        }

        if (!password || typeof password !== 'string' || password.trim() === '') {
            throw new Error('Debes ingresar tu contraseña.');
        }

        const cleanUsername = username.trim();
        const cleanUrl = baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== ''
            ? baseUrl.trim().replace(/\/+$/, '')
            : null;

        if (cleanUrl && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(STORAGE_KEYS.API_URL, cleanUrl);
            } catch {
                // Ignore storage errors
            }
        }

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

        if (!apiKey) {
            throw new Error('El servidor no devolvió una API Key válida.');
        }

        const role = resolveUserRole(resolvedUsername, { isRegistration: false });

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            role,
            apiKey,
            expiresAt,
            authenticatedAt: Date.now()
        }, cleanUrl);
    },

    async register(username, email, password, baseUrl = null) {
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
        const cleanUrl = baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== ''
            ? baseUrl.trim().replace(/\/+$/, '')
            : null;

        if (cleanUrl && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(STORAGE_KEYS.API_URL, cleanUrl);
            } catch {
                // Ignore storage errors
            }
        }

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

        if (!apiKey) {
            throw new Error('El servidor no devolvió una API Key válida tras el registro.');
        }

        // Autonomous registration strictly enforces the CLIENTE role
        const role = resolveUserRole(resolvedUsername, { isRegistration: true });

        return saveSignedSession({
            userId,
            username: resolvedUsername,
            role,
            apiKey,
            expiresAt,
            authenticatedAt: Date.now()
        }, cleanUrl);
    },

    async regenerateApiKey() {
        if (!this.isAuthenticated()) {
            throw new Error('No hay una sesión activa válida para regenerar la API Key.');
        }

        if (!this.hasRole([ROLES.ADMIN, ROLES.EMPLEADO])) {
            throw new ApiError({
                status: 403,
                title: 'Acceso denegado',
                detail: 'Solo los perfiles ADMIN y EMPLEADO están autorizados para regenerar su API Key.',
                message: 'Solo los perfiles ADMIN y EMPLEADO están autorizados para regenerar su API Key.'
            });
        }

        const currentSession = this.getCurrentUser();

        const response = await httpClient(ENDPOINTS.APIKEYS_REGENERATE, {
            method: 'POST'
        });

        if (!response.ok) {
            const problem = response.problemDetails || {
                status: response.status || 400,
                title: 'Error al regenerar API Key',
                detail: response.errorMessage || 'No fue posible regenerar la API Key.',
                message: response.errorMessage || 'No fue posible regenerar la API Key.'
            };
            throw new ApiError(problem);
        }

        const data = await response.json();
        const id = data?.id ?? data?.Id ?? null;
        const clientIdentifier = data?.clientIdentifier ?? data?.ClientIdentifier ?? currentSession.username;
        const newApiKey = String(data?.apiKey ?? data?.ApiKey ?? '').trim();
        const createdAt = data?.createdAt ?? data?.CreatedAt ?? new Date().toISOString();
        const isActive = data?.isActive ?? data?.IsActive ?? true;
        const newExpiresAt = data?.expiresAt ?? data?.ExpiresAt ?? currentSession.expiresAt;

        if (!newApiKey) {
            throw new Error('El servidor no devolvió una nueva API Key válida.');
        }

        const updatedSession = saveSignedSession({
            userId: currentSession.userId,
            username: currentSession.username,
            role: currentSession.role,
            apiKey: newApiKey,
            expiresAt: newExpiresAt,
            authenticatedAt: currentSession.authenticatedAt
        });

        return {
            ...updatedSession,
            id,
            clientIdentifier,
            createdAt,
            isActive
        };
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
