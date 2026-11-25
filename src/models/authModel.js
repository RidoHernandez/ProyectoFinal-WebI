import {
    httpClient,
    ApiError,
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    ENDPOINTS,
    STORAGE_KEYS,
    SENSITIVE_LOCAL_KEYS
} from "./apiClient.js";

const DEFAULT_TOKEN_TTL_MS = 120 * 60 * 1000;

const ALLOWED_VIEWS = new Set([
    './productos.html',
    './catalogo.html',
    './clientes.html',
    './pedidos.html'
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

function normalizePermissions(raw = null) {
    const result = {};
    for (const key of PERMISSION_KEYS) {
        result[key] = Boolean(raw?.[key]);
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
        const decoded = typeof atob === 'function'
            ? atob(padded)
            : (typeof Buffer !== 'undefined' ? Buffer.from(padded, 'base64').toString('utf8') : '');
        const payload = JSON.parse(decoded);
        if (typeof payload?.exp === 'number' && Number.isFinite(payload.exp)) {
            return payload.exp * 1000;
        }
    } catch {
        return null;
    }
    return null;
}

function resolveExpiresAtIso(rawExpiresAt, token) {
    if (typeof rawExpiresAt === 'string' && !Number.isNaN(Date.parse(rawExpiresAt))) {
        return rawExpiresAt;
    }
    const jwtExpMs = extractJwtExpirationMs(token);
    return new Date(jwtExpMs ?? (Date.now() + DEFAULT_TOKEN_TTL_MS)).toISOString();
}

function purgeResidualLocalStorage() {
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

function saveSession({ userId, username, token, tokenType = 'Bearer', expiresAt, defaultView, permissions }) {
    purgeResidualLocalStorage();

    const cleanToken = String(token).trim();
    const session = {
        userId: userId ?? 0,
        username: String(username).trim(),
        token: cleanToken,
        tokenType: String(tokenType || 'Bearer').trim() || 'Bearer',
        expiresAt: resolveExpiresAtIso(expiresAt, cleanToken),
        defaultView: normalizeDefaultView(defaultView),
        permissions: normalizePermissions(permissions)
    };

    setAuthToken(cleanToken);
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
        }
    } catch {
        // Ignore storage errors
    }

    return session;
}

function readValidSession() {
    purgeResidualLocalStorage();

    let rawSession = null;
    try {
        if (typeof sessionStorage !== 'undefined') {
            rawSession = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
        }
    } catch {
        return null;
    }

    if (!rawSession) return null;

    let session = null;
    try {
        session = JSON.parse(rawSession);
    } catch {
        clearAuthToken();
        return null;
    }

    const validShape = session
        && typeof session.username === 'string' && session.username.trim() !== ''
        && typeof session.token === 'string' && session.token.trim() !== ''
        && typeof session.expiresAt === 'string';

    if (!validShape) {
        clearAuthToken();
        return null;
    }

    const now = Date.now();
    const expiresMs = Date.parse(session.expiresAt);
    const jwtExpMs = extractJwtExpirationMs(session.token);
    if (Number.isNaN(expiresMs) || now >= expiresMs || (jwtExpMs !== null && now >= jwtExpMs)) {
        clearAuthToken();
        return null;
    }

    setAuthToken(session.token);
    return {
        ...session,
        defaultView: normalizeDefaultView(session.defaultView),
        permissions: normalizePermissions(session.permissions)
    };
}

purgeResidualLocalStorage();

export const authModel = {
    purgeResidualLocalStorage,

    isAuthenticated() {
        return readValidSession() !== null;
    },

    getCurrentUser() {
        return readValidSession();
    },

    getPermissions() {
        return normalizePermissions(readValidSession()?.permissions);
    },

    hasPermission(requiredPermissions = null) {
        const session = readValidSession();
        if (!session) return false;
        if (!requiredPermissions) return true;

        const keys = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
        return keys.length === 0 || keys.some((key) => Boolean(session.permissions[key]));
    },

    getDefaultView() {
        return normalizeDefaultView(readValidSession()?.defaultView);
    },

    getToken() {
        return readValidSession()?.token || getAuthToken();
    },

    async refreshProfile() {
        const current = readValidSession();
        if (!current) return null;

        try {
            const response = await httpClient(ENDPOINTS.AUTH_ME, { method: 'GET' });
            if (!response.ok) {
                return response.status === 401 ? null : current;
            }

            const data = await response.json();
            return saveSession({
                userId: data?.userId ?? current.userId,
                username: data?.username ?? current.username,
                token: current.token,
                tokenType: current.tokenType,
                expiresAt: current.expiresAt,
                defaultView: data?.defaultView ?? current.defaultView,
                permissions: data?.permissions ?? current.permissions
            });
        } catch {
            return current;
        }
    },

    async login(username, password) {
        purgeResidualLocalStorage();

        if (!username || typeof username !== 'string' || !username.trim()) {
            throw new Error('Debes ingresar tu nombre de usuario.');
        }
        if (!password || typeof password !== 'string' || !password.trim()) {
            throw new Error('Debes ingresar tu contraseña.');
        }

        const cleanUsername = username.trim();
        const response = await httpClient(ENDPOINTS.AUTH_LOGIN, {
            method: 'POST',
            body: JSON.stringify({ username: cleanUsername, password }),
            skipAuthRedirect: true
        });

        if (!response.ok) {
            throw new ApiError(response.problemDetails || {
                status: response.status || 401,
                title: 'Error de autenticación',
                detail: response.errorMessage || 'El usuario o la contraseña proporcionados son incorrectos.',
                message: response.errorMessage || 'El usuario o la contraseña proporcionados son incorrectos.'
            });
        }

        const data = await response.json();
        const token = String(data?.token ?? '').trim();
        if (!token) {
            throw new Error('El servidor no devolvió un token de autenticación válido.');
        }

        return saveSession({
            userId: data.userId,
            username: data.username ?? cleanUsername,
            token,
            tokenType: data.tokenType,
            expiresAt: data.expiresAt,
            defaultView: data.defaultView,
            permissions: data.permissions
        });
    },

    async register(username, email, password) {
        purgeResidualLocalStorage();

        if (!username || typeof username !== 'string' || !username.trim()) {
            throw new Error('El nombre de usuario es requerido.');
        }
        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            throw new Error('Debes ingresar un correo electrónico válido.');
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            throw new Error('La contraseña debe tener al menos 8 caracteres.');
        }

        const cleanUsername = username.trim();
        const response = await httpClient(ENDPOINTS.AUTH_REGISTER, {
            method: 'POST',
            body: JSON.stringify({ username: cleanUsername, email: email.trim(), password }),
            skipAuthRedirect: true
        });

        if (!response.ok) {
            throw new ApiError(response.problemDetails || {
                status: response.status || 400,
                title: 'Error en el registro',
                detail: response.errorMessage || 'No fue posible registrar la cuenta.',
                message: response.errorMessage || 'No fue posible registrar la cuenta.'
            });
        }

        const data = await response.json();
        const token = String(data?.token ?? '').trim();
        if (!token) {
            throw new Error('El servidor no devolvió un token de autenticación válido tras el registro.');
        }

        return saveSession({
            userId: data.userId,
            username: data.username ?? cleanUsername,
            token,
            tokenType: data.tokenType,
            expiresAt: data.expiresAt,
            defaultView: data.defaultView ?? './catalogo.html',
            permissions: data.permissions ?? { canCancelOwnOrders: true, canPurchaseCatalog: true }
        });
    },

    logout(reason = null) {
        clearAuthToken();
        purgeResidualLocalStorage();

        if (typeof window !== 'undefined' && window.location) {
            const suffix = reason && typeof reason === 'string' && reason.trim()
                ? `?reason=${encodeURIComponent(reason.trim())}`
                : '';
            window.location.href = `./login.html${suffix}`;
        }
    }
};

function navigateReplace(url) {
    if (typeof window === 'undefined' || !window.location) return;
    if (typeof window.location.replace === 'function') {
        window.location.replace(url);
    } else {
        window.location.href = url;
    }
}

// Guardia de navegación síncrona para vistas protegidas
export function authGuard(requiredPermissions = null) {
    purgeResidualLocalStorage();

    if (!authModel.isAuthenticated()) {
        try {
            if (typeof document !== 'undefined' && document.body) {
                document.body.setAttribute('data-auth-blocked', '401');
                document.body.style.display = 'none';
            }
        } catch {
            // Ignore DOM errors in non-browser environments
        }

        navigateReplace('./login.html');
        return false;
    }

    const permList = typeof requiredPermissions === 'string'
        ? [requiredPermissions]
        : (Array.isArray(requiredPermissions) ? requiredPermissions : []);

    if (permList.length > 0 && !authModel.hasPermission(permList)) {
        const flashMessage = 'Acceso denegado (403): No tienes permisos para acceder a esa sección.';

        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(STORAGE_KEYS.AUTH_FLASH_ERROR, flashMessage);
            }
        } catch {
            // Ignore storage errors
        }

        try {
            if (typeof document !== 'undefined' && document.body) {
                document.body.setAttribute('data-auth-blocked', '403');
                document.body.style.display = 'none';
            }
        } catch {
            // Ignore DOM errors in non-browser environments
        }

        navigateReplace('./catalogo.html?error=403');

        return false;
    }

    return authModel.getCurrentUser();
}

// Protección contra fuerza bruta en login (3 intentos fallidos -> 15 min bloqueo + captcha matemático)
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const STORAGE_KEYS_BF = Object.freeze({
    ATTEMPTS: 'login_attempts',
    LOCKOUT_UNTIL: 'lockout_until',
    CAPTCHA_REQUIRED: 'login_captcha_required'
});

function readBfStorage(key) {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeBfStorage(key, value) {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
    } catch {
        // Ignore storage errors
    }
}

function removeBfStorage(key) {
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
        // Ignore storage errors
    }
}

function parsePositiveInt(raw) {
    const num = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

export function getRemainingLockoutMs(now = Date.now()) {
    const lockoutUntil = parsePositiveInt(readBfStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL));
    return lockoutUntil > now ? lockoutUntil - now : 0;
}

export function isLockedOut(now = Date.now()) {
    return getRemainingLockoutMs(now) > 0;
}

export function isCaptchaRequired(now = Date.now()) {
    return !isLockedOut(now) && readBfStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED) === 'true';
}

export function getBruteForceState(now = Date.now()) {
    const attempts = parsePositiveInt(readBfStorage(STORAGE_KEYS_BF.ATTEMPTS));
    const lockoutUntilRaw = parsePositiveInt(readBfStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL));
    const lockoutUntil = lockoutUntilRaw > 0 ? lockoutUntilRaw : null;
    const remainingMs = lockoutUntil && lockoutUntil > now ? lockoutUntil - now : 0;
    const locked = remainingMs > 0;
    const captchaRequired = !locked && readBfStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED) === 'true';

    return {
        attempts,
        remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - attempts),
        lockoutUntil,
        remainingMs,
        isLockedOut: locked,
        captchaRequired
    };
}

export function recordFailedLoginAttempt(now = Date.now()) {
    const current = getBruteForceState(now);
    if (current.isLockedOut) return current;

    let baseAttempts = current.attempts;
    if (current.lockoutUntil !== null && now >= current.lockoutUntil) {
        baseAttempts = 0;
        removeBfStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL);
    }

    const attempts = baseAttempts + 1;
    writeBfStorage(STORAGE_KEYS_BF.ATTEMPTS, attempts);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
        writeBfStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL, now + LOCKOUT_DURATION_MS);
        writeBfStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED, 'true');
    }

    return getBruteForceState(now);
}

export function resetBruteForceState() {
    removeBfStorage(STORAGE_KEYS_BF.ATTEMPTS);
    removeBfStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL);
    removeBfStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED);
    return getBruteForceState();
}

export function markCaptchaSolved() {
    removeBfStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED);
}

export function formatCountdown(ms) {
    const totalSeconds = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generateCaptchaChallenge() {
    const a = Math.floor(Math.random() * 11) + 2;
    const b = Math.floor(Math.random() * 11) + 2;
    return { question: `¿Cuánto es ${a} + ${b}?`, answer: a + b };
}

export function verifyCaptchaAnswer(input, expectedAnswer) {
    const expected = Number(expectedAnswer);
    const trimmed = String(input ?? '').trim();
    return Number.isFinite(expected) && /^-?\d+$/.test(trimmed) && Number(trimmed) === expected;
}
