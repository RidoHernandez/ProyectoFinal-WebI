const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const STORAGE_KEYS_BF = Object.freeze({
    ATTEMPTS: 'login_attempts',
    LOCKOUT_UNTIL: 'lockout_until',
    CAPTCHA_REQUIRED: 'login_captcha_required'
});

function readStorage(key) {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, String(value));
    } catch {
        // Ignorar errores de almacenamiento en entornos restringidos
    }
}

function removeStorage(key) {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
    } catch {
        // Ignorar errores de almacenamiento en entornos restringidos
    }
}

function parsePositiveInt(raw) {
    const num = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

export function getRemainingLockoutMs(now = Date.now()) {
    const lockoutUntil = parsePositiveInt(readStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL));
    if (!lockoutUntil || lockoutUntil <= now) {
        return 0;
    }
    return lockoutUntil - now;
}

export function isLockedOut(now = Date.now()) {
    return getRemainingLockoutMs(now) > 0;
}

export function isCaptchaRequired(now = Date.now()) {
    if (isLockedOut(now)) {
        return false;
    }
    return readStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED) === 'true';
}

export function getBruteForceState(now = Date.now()) {
    const attempts = parsePositiveInt(readStorage(STORAGE_KEYS_BF.ATTEMPTS));
    const lockoutUntilRaw = parsePositiveInt(readStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL));
    const lockoutUntil = lockoutUntilRaw > 0 ? lockoutUntilRaw : null;
    const remainingMs = lockoutUntil && lockoutUntil > now ? lockoutUntil - now : 0;
    const locked = remainingMs > 0;
    const captchaRequired = !locked && readStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED) === 'true';

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
    if (current.isLockedOut) {
        return current;
    }

    let baseAttempts = current.attempts;
    if (current.lockoutUntil !== null && now >= current.lockoutUntil) {
        baseAttempts = 0;
        removeStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL);
    }

    const attempts = baseAttempts + 1;
    writeStorage(STORAGE_KEYS_BF.ATTEMPTS, attempts);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = now + LOCKOUT_DURATION_MS;
        writeStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL, lockoutUntil);
        writeStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED, 'true');
    }

    return getBruteForceState(now);
}

export function resetBruteForceState() {
    removeStorage(STORAGE_KEYS_BF.ATTEMPTS);
    removeStorage(STORAGE_KEYS_BF.LOCKOUT_UNTIL);
    removeStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED);
    return getBruteForceState();
}

export function markCaptchaSolved() {
    removeStorage(STORAGE_KEYS_BF.CAPTCHA_REQUIRED);
}

export function formatCountdown(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generateCaptchaChallenge() {
    const a = Math.floor(Math.random() * 11) + 2;
    const b = Math.floor(Math.random() * 11) + 2;
    return {
        question: `¿Cuánto es ${a} + ${b}?`,
        answer: a + b
    };
}

export function verifyCaptchaAnswer(input, expectedAnswer) {
    const expected = Number(expectedAnswer);
    if (!Number.isFinite(expected)) return false;
    const trimmed = String(input ?? '').trim();
    if (!/^-?\d+$/.test(trimmed)) return false;
    return Number(trimmed) === expected;
}
