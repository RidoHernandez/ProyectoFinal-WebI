import { authService } from "../services/authService.js";
import { STORAGE_KEYS } from "../api/httpClient.js";
import {
    getBruteForceState,
    recordFailedLoginAttempt,
    resetBruteForceState,
    isLockedOut,
    getRemainingLockoutMs,
    formatCountdown,
    isCaptchaRequired,
    markCaptchaSolved,
    generateCaptchaChallenge,
    verifyCaptchaAnswer
} from "../utils/bruteForceProtection.js";

let activeLockoutInterval = null;

function clearActiveLockoutInterval() {
    if (activeLockoutInterval !== null) {
        clearInterval(activeLockoutInterval);
        activeLockoutInterval = null;
    }
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SENSITIVE_ERROR_PATTERN = /(System\.|Exception|StackTrace|Microsoft\.AspNetCore|MySql|SqlException|InnerException|DbUpdateException|Table\s+'[^']+'|Column\s+'[^']+'|SELECT\s+.+\s+FROM|ForeignKey|\sat\s+[A-Za-z0-9_.<>`]+\(|[A-Z]:\\[^\s]+|\/api\/[a-z0-9_/-]+|https?:\/\/localhost(?::\d+)?)/i;
const GENERIC_HTTP_REASONS = new Set(['bad request', 'unauthorized', 'forbidden', 'not found']);

/**
 * Determina la ruta de redirección usando la vista inicial autorizada por el backend.
 */
export function resolveRedirectPath(sessionOrView = null) {
    if (typeof sessionOrView === 'string' && sessionOrView.startsWith('./') && sessionOrView.endsWith('.html')) {
        return sessionOrView;
    }
    if (sessionOrView && typeof sessionOrView === 'object' && typeof sessionOrView.defaultView === 'string') {
        return sessionOrView.defaultView;
    }
    if (typeof authService.getDefaultView === 'function') {
        return authService.getDefaultView();
    }
    return './catalogo.html';
}

/**
 * Sanitiza un texto de error para garantizar que nunca se expongan trazas técnicas.
 */
function sanitizeErrorText(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed || SENSITIVE_ERROR_PATTERN.test(trimmed)) {
        return '';
    }
    return trimmed;
}

function normalizeNonGenericText(text) {
    const clean = sanitizeErrorText(text);
    if (!clean) return '';
    return GENERIC_HTTP_REASONS.has(clean.toLowerCase()) ? '' : clean;
}

/**
 * Extrae un mensaje amigable desde ProblemDetails (RFC 7807) o desde un objeto Error.
 */
export function extractProblemMessage(error, fallback = 'Ocurrió un error al procesar la solicitud.') {
    if (!error) return fallback;

    const pd = error.problemDetails || error;
    const status = Number(pd?.status || error?.status) || 0;

    if (status >= 500) {
        return 'Ocurrió un error interno en el servidor. Intenta nuevamente más tarde.';
    }

    const rawErrors = pd?.errors || error?.errors || null;
    if (rawErrors && typeof rawErrors === 'object') {
        const flatMessages = Object.values(rawErrors)
            .flat()
            .map((msg) => sanitizeErrorText(String(msg || '')))
            .filter(Boolean);
        if (flatMessages.length > 0) {
            return flatMessages[0];
        }
    }

    const detail = normalizeNonGenericText(pd?.detail || error?.detail);
    const message = normalizeNonGenericText(pd?.message || error?.message);
    const title = normalizeNonGenericText(pd?.title || error?.title);

    if (detail) {
        return detail;
    }
    if (message) {
        return message;
    }
    if (status === 401) {
        return 'Credenciales inválidas. Verifica tu nombre de usuario y contraseña.';
    }
    if (status === 400) {
        return title || 'Solicitud inválida. Revisa los campos marcados en el formulario.';
    }

    return title || fallback;
}

/**
 * Identifica qué campos del formulario de registro están en conflicto ante un error HTTP 400 ProblemDetails.
 * Retorna un arreglo con los identificadores lógicos: 'username' | 'email' | 'password'.
 */
export function detectConflictingFields(error) {
    const conflicts = new Set();
    if (!error) return [];

    const pd = error.problemDetails || error;
    const rawErrors = pd?.errors || error?.errors || null;

    if (rawErrors && typeof rawErrors === 'object') {
        for (const key of Object.keys(rawErrors)) {
            if (/user(name)?|usuario/i.test(key)) conflicts.add('username');
            if (/e-?mail|correo/i.test(key)) conflicts.add('email');
            if (/pass(word)?|contrase|clave/i.test(key)) conflicts.add('password');
        }
    }

    const combinedText = [
        pd?.detail,
        pd?.message,
        pd?.title,
        error?.detail,
        error?.message,
        error?.title
    ]
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .join(' ');

    if (/usuario|username|user\s*name/i.test(combinedText)) {
        conflicts.add('username');
    }
    if (/correo|e-?mail/i.test(combinedText)) {
        conflicts.add('email');
    }
    if (/contrase[ñn]a|password|clave/i.test(combinedText)) {
        conflicts.add('password');
    }

    return Array.from(conflicts);
}

/**
 * Valida los campos del formulario de Inicio de Sesión.
 */
export function validateLoginInput({ username = '', password = '' } = {}) {
    const errors = {};
    const cleanUser = String(username ?? '').trim();
    const rawPass = String(password ?? '');

    if (!cleanUser) {
        errors.username = 'El nombre de usuario es obligatorio.';
    }

    if (!rawPass || rawPass.trim() === '') {
        errors.password = 'La contraseña es obligatoria.';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors
    };
}

/**
 * Valida los campos del formulario de Registro Autónomo de Clientes.
 */
export function validateRegisterInput({ username = '', email = '', password = '' } = {}) {
    const errors = {};
    const cleanUser = String(username ?? '').trim();
    const cleanEmail = String(email ?? '').trim();
    const rawPass = String(password ?? '');

    if (!cleanUser) {
        errors.username = 'El nombre de usuario es obligatorio.';
    } else if (/\s/.test(cleanUser)) {
        errors.username = 'El nombre de usuario no puede contener espacios.';
    } else if (cleanUser.length < 3 || cleanUser.length > 50) {
        errors.username = 'El nombre de usuario debe tener entre 3 y 50 caracteres.';
    }

    if (!cleanEmail) {
        errors.email = 'El correo electrónico es obligatorio.';
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
        errors.email = 'Ingresa un correo electrónico con formato válido (ejemplo@dominio.com).';
    }

    if (!rawPass) {
        errors.password = 'La contraseña es obligatoria.';
    } else if (rawPass.length < 8) {
        errors.password = 'La contraseña debe tener al menos 8 caracteres.';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors
    };
}

function setFieldInvalid(inputEl, feedbackEl, message) {
    if (inputEl) {
        inputEl.classList.remove('is-valid');
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
    }
    if (feedbackEl && message) {
        feedbackEl.textContent = message;
    }
}

function setFieldValid(inputEl) {
    if (inputEl) {
        inputEl.classList.remove('is-invalid');
        inputEl.classList.add('is-valid');
        inputEl.removeAttribute('aria-invalid');
    }
}

function clearFieldValidation(inputEl) {
    if (inputEl) {
        inputEl.classList.remove('is-invalid', 'is-valid');
        inputEl.removeAttribute('aria-invalid');
    }
}

function showAlert(alertEl, message) {
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
}

function hideAlert(alertEl) {
    if (!alertEl) return;
    alertEl.textContent = '';
    alertEl.classList.add('d-none');
}

export async function initLoginController(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
    clearActiveLockoutInterval();

    // 1. Si el usuario ya tiene sesión válida y activa, redirigir a la vista inicial autorizada por el backend
    let alreadyAuthenticated = false;
    if (typeof authService.isAuthenticated === 'function') {
        alreadyAuthenticated = Boolean(authService.isAuthenticated());
    } else if (typeof authService.checkSession === 'function') {
        const current = await authService.checkSession();
        alreadyAuthenticated = Boolean(current && current.autenticado);
    }

    if (alreadyAuthenticated) {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = resolveRedirectPath();
        }
        return;
    }

    // Elementos del DOM
    const tabLogin = doc.getElementById('tabLogin');
    const tabRegister = doc.getElementById('tabRegister');
    const paneLogin = doc.getElementById('paneLogin');
    const paneRegister = doc.getElementById('paneRegister');

    const formLogin = doc.getElementById('formLogin');
    const txtLoginUsername = doc.getElementById('txtLoginUsername');
    const txtLoginPassword = doc.getElementById('txtLoginPassword');
    const errLoginUsername = doc.getElementById('errLoginUsername');
    const errLoginPassword = doc.getElementById('errLoginPassword');
    const btnLogin = doc.getElementById('btnLogin');
    const lockoutBanner = doc.getElementById('lockoutBanner');
    const lblLockoutCountdown = doc.getElementById('lblLockoutCountdown');
    const captchaContainer = doc.getElementById('captchaContainer');
    const lblCaptchaQuestion = doc.getElementById('lblCaptchaQuestion');
    const txtCaptchaAnswer = doc.getElementById('txtCaptchaAnswer');
    const btnRefreshCaptcha = doc.getElementById('btnRefreshCaptcha');
    const errCaptcha = doc.getElementById('errCaptcha');

    const formRegister = doc.getElementById('formRegister');
    const txtRegUsername = doc.getElementById('txtRegUsername');
    const txtRegEmail = doc.getElementById('txtRegEmail');
    const txtRegPassword = doc.getElementById('txtRegPassword');
    const errRegUsername = doc.getElementById('errRegUsername');
    const errRegEmail = doc.getElementById('errRegEmail');
    const errRegPassword = doc.getElementById('errRegPassword');
    const btnRegister = doc.getElementById('btnRegister');

    const alertError = doc.getElementById('alertError');
    const alertSuccess = doc.getElementById('alertSuccess');

    // 2. Verificar parámetros de URL (ej. ?reason=session_expired)
    if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search || '');
        const reason = params.get('reason');
        if (reason === 'session_expired') {
            showAlert(
                alertError,
                'Tu sesión ha expirado o las credenciales ya no son válidas. Por favor, inicia sesión nuevamente.'
            );
        } else if (reason === 'unauthorized') {
            showAlert(alertError, 'Debes iniciar sesión para acceder a este recurso.');
        }
    }

    // 4. Alternancia fluida entre pestañas de Login y Registro (compatible sin Bootstrap JS)
    function activateTab(mode) {
        hideAlert(alertError);
        hideAlert(alertSuccess);

        if (mode === 'register') {
            tabLogin?.classList.remove('active');
            tabLogin?.setAttribute('aria-selected', 'false');
            tabRegister?.classList.add('active');
            tabRegister?.setAttribute('aria-selected', 'true');

            paneLogin?.classList.remove('show', 'active');
            paneRegister?.classList.add('show', 'active');
        } else {
            tabRegister?.classList.remove('active');
            tabRegister?.setAttribute('aria-selected', 'false');
            tabLogin?.classList.add('active');
            tabLogin?.setAttribute('aria-selected', 'true');

            paneRegister?.classList.remove('show', 'active');
            paneLogin?.classList.add('show', 'active');
        }
    }

    tabLogin?.addEventListener('click', () => activateTab('login'));
    tabRegister?.addEventListener('click', () => activateTab('register'));

    // 5. Validación en tiempo real para Login
    txtLoginUsername?.addEventListener('input', () => {
        const { errors } = validateLoginInput({
            username: txtLoginUsername.value,
            password: txtLoginPassword?.value || 'placeholder'
        });
        if (errors.username) {
            setFieldInvalid(txtLoginUsername, errLoginUsername, errors.username);
        } else {
            setFieldValid(txtLoginUsername);
        }
    });

    txtLoginPassword?.addEventListener('input', () => {
        const { errors } = validateLoginInput({
            username: txtLoginUsername?.value || 'placeholder',
            password: txtLoginPassword.value
        });
        if (errors.password) {
            setFieldInvalid(txtLoginPassword, errLoginPassword, errors.password);
        } else {
            setFieldValid(txtLoginPassword);
        }
    });

    // 6. Validación en tiempo real para Registro
    txtRegUsername?.addEventListener('input', () => {
        delete txtRegUsername.dataset.conflictValue;
        const { errors } = validateRegisterInput({
            username: txtRegUsername.value,
            email: 'valid@example.com',
            password: 'ValidPassword123'
        });
        if (errors.username) {
            setFieldInvalid(txtRegUsername, errRegUsername, errors.username);
        } else {
            setFieldValid(txtRegUsername);
        }
    });

    txtRegEmail?.addEventListener('input', () => {
        delete txtRegEmail.dataset.conflictValue;
        const { errors } = validateRegisterInput({
            username: 'valid_user',
            email: txtRegEmail.value,
            password: 'ValidPassword123'
        });
        if (errors.email) {
            setFieldInvalid(txtRegEmail, errRegEmail, errors.email);
        } else {
            setFieldValid(txtRegEmail);
        }
    });

    txtRegPassword?.addEventListener('input', () => {
        const { errors } = validateRegisterInput({
            username: 'valid_user',
            email: 'valid@example.com',
            password: txtRegPassword.value
        });
        if (errors.password) {
            setFieldInvalid(txtRegPassword, errRegPassword, errors.password);
        } else {
            setFieldValid(txtRegPassword);
        }
    });

    // 6.5 Protección contra fuerza bruta (REQ-SEC-006): bloqueo temporal y reto CAPTCHA
    let currentCaptcha = null;

    function setLoginFormDisabled(disabled) {
        if (txtLoginUsername) txtLoginUsername.disabled = disabled;
        if (txtLoginPassword) txtLoginPassword.disabled = disabled;
        if (btnLogin) btnLogin.disabled = disabled;
    }

    function refreshCaptchaChallenge() {
        currentCaptcha = generateCaptchaChallenge();
        if (lblCaptchaQuestion) {
            lblCaptchaQuestion.textContent = currentCaptcha.question;
        }
        if (txtCaptchaAnswer) {
            txtCaptchaAnswer.value = '';
            clearFieldValidation(txtCaptchaAnswer);
        }
    }

    function showCaptchaUI() {
        if (captchaContainer) {
            captchaContainer.classList.remove('d-none');
        }
        refreshCaptchaChallenge();
    }

    function hideCaptchaUI() {
        currentCaptcha = null;
        if (captchaContainer) {
            captchaContainer.classList.add('d-none');
        }
        if (lblCaptchaQuestion) {
            lblCaptchaQuestion.textContent = '';
        }
        if (txtCaptchaAnswer) {
            txtCaptchaAnswer.value = '';
            clearFieldValidation(txtCaptchaAnswer);
        }
    }

    function syncBruteForceUI() {
        const bfState = getBruteForceState();

        if (bfState.isLockedOut) {
            setLoginFormDisabled(true);
            if (lockoutBanner) {
                lockoutBanner.classList.remove('d-none');
            }
            if (lblLockoutCountdown) {
                lblLockoutCountdown.textContent = formatCountdown(bfState.remainingMs);
            }
            hideCaptchaUI();

            clearActiveLockoutInterval();
            activeLockoutInterval = setInterval(() => {
                const remaining = getRemainingLockoutMs();
                if (remaining <= 0) {
                    clearActiveLockoutInterval();
                    if (lockoutBanner) {
                        lockoutBanner.classList.add('d-none');
                    }
                    if (lblLockoutCountdown) {
                        lblLockoutCountdown.textContent = formatCountdown(0);
                    }
                    setLoginFormDisabled(false);
                    if (isCaptchaRequired()) {
                        showCaptchaUI();
                    }
                    return;
                }
                if (lblLockoutCountdown) {
                    lblLockoutCountdown.textContent = formatCountdown(remaining);
                }
            }, 1000);
            activeLockoutInterval.unref?.();
            return;
        }

        clearActiveLockoutInterval();
        if (lockoutBanner) {
            lockoutBanner.classList.add('d-none');
        }
        setLoginFormDisabled(false);

        if (bfState.captchaRequired) {
            if (!currentCaptcha) {
                showCaptchaUI();
            } else if (captchaContainer) {
                captchaContainer.classList.remove('d-none');
            }
        } else {
            hideCaptchaUI();
        }
    }

    btnRefreshCaptcha?.addEventListener('click', () => {
        refreshCaptchaChallenge();
    });

    txtCaptchaAnswer?.addEventListener('input', () => {
        clearFieldValidation(txtCaptchaAnswer);
    });

    syncBruteForceUI();

    // 7. Envío del formulario de Inicio de Sesión
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert(alertError);
        hideAlert(alertSuccess);

        if (isLockedOut()) {
            syncBruteForceUI();
            const remainingText = formatCountdown(getRemainingLockoutMs());
            showAlert(
                alertError,
                `Demasiados intentos fallidos. Acceso bloqueado temporalmente. Intenta nuevamente en ${remainingText}.`
            );
            return;
        }

        const captchaNeeded = isCaptchaRequired();
        if (captchaNeeded) {
            if (!currentCaptcha) {
                showCaptchaUI();
            }
            const captchaInput = txtCaptchaAnswer ? txtCaptchaAnswer.value : '';
            if (!verifyCaptchaAnswer(captchaInput, currentCaptcha?.answer)) {
                const captchaMsg = 'Respuesta de verificación incorrecta. Resuelve el nuevo reto para continuar.';
                refreshCaptchaChallenge();
                setFieldInvalid(txtCaptchaAnswer, errCaptcha, captchaMsg);
                showAlert(alertError, captchaMsg);
                return;
            }
            clearFieldValidation(txtCaptchaAnswer);
        }

        const username = txtLoginUsername ? txtLoginUsername.value.trim() : '';
        const password = txtLoginPassword ? txtLoginPassword.value : '';

        const validation = validateLoginInput({ username, password });
        if (!validation.valid) {
            if (validation.errors.username) {
                setFieldInvalid(txtLoginUsername, errLoginUsername, validation.errors.username);
            } else {
                setFieldValid(txtLoginUsername);
            }
            if (validation.errors.password) {
                setFieldInvalid(txtLoginPassword, errLoginPassword, validation.errors.password);
            } else {
                setFieldValid(txtLoginPassword);
            }
            const firstMsg = validation.errors.username || validation.errors.password;
            showAlert(alertError, firstMsg);
            return;
        }

        if (captchaNeeded) {
            markCaptchaSolved();
            hideCaptchaUI();
        }

        clearFieldValidation(txtLoginUsername);
        clearFieldValidation(txtLoginPassword);

        if (btnLogin) {
            btnLogin.disabled = true;
            btnLogin.textContent = 'Validando credenciales...';
        }

        try {
            const session = await authService.login(username, password);
            resetBruteForceState();
            clearActiveLockoutInterval();
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = resolveRedirectPath(session);
            }
        } catch (error) {
            const status = Number(error?.status || error?.problemDetails?.status) || 0;
            const friendlyMsg = extractProblemMessage(
                error,
                'No fue posible iniciar sesión. Verifica tus credenciales o la conexión con el servidor.'
            );
            setFieldInvalid(txtLoginUsername, errLoginUsername, friendlyMsg);
            setFieldInvalid(txtLoginPassword, errLoginPassword, friendlyMsg);

            if (status === 401) {
                const bfState = recordFailedLoginAttempt();
                if (bfState.isLockedOut) {
                    syncBruteForceUI();
                }
            }

            showAlert(alertError, friendlyMsg);
        } finally {
            if (btnLogin) {
                btnLogin.textContent = 'Iniciar Sesión';
                btnLogin.disabled = isLockedOut();
            }
        }
    });

    // 8. Envío del formulario de Registro Autónomo de Clientes
    formRegister?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert(alertError);
        hideAlert(alertSuccess);

        const username = txtRegUsername ? txtRegUsername.value.trim() : '';
        const email = txtRegEmail ? txtRegEmail.value.trim() : '';
        const password = txtRegPassword ? txtRegPassword.value : '';

        const validation = validateRegisterInput({ username, email, password });

        // Verificar si el usuario intenta reenviar exactamente el mismo valor previamente rechazado por duplicado
        if (
            !validation.errors.username &&
            txtRegUsername?.dataset?.conflictValue &&
            txtRegUsername.dataset.conflictValue === username.toLowerCase()
        ) {
            validation.errors.username = 'Este nombre de usuario ya fue reportado como registrado.';
            validation.valid = false;
        }
        if (
            !validation.errors.email &&
            txtRegEmail?.dataset?.conflictValue &&
            txtRegEmail.dataset.conflictValue === email.toLowerCase()
        ) {
            validation.errors.email = 'Este correo electrónico ya fue reportado como registrado.';
            validation.valid = false;
        }

        if (!validation.valid) {
            if (validation.errors.username) {
                setFieldInvalid(txtRegUsername, errRegUsername, validation.errors.username);
            } else {
                setFieldValid(txtRegUsername);
            }

            if (validation.errors.email) {
                setFieldInvalid(txtRegEmail, errRegEmail, validation.errors.email);
            } else {
                setFieldValid(txtRegEmail);
            }

            if (validation.errors.password) {
                setFieldInvalid(txtRegPassword, errRegPassword, validation.errors.password);
            } else {
                setFieldValid(txtRegPassword);
            }

            const firstError = validation.errors.username || validation.errors.email || validation.errors.password;
            showAlert(alertError, firstError);
            return;
        }

        clearFieldValidation(txtRegUsername);
        clearFieldValidation(txtRegEmail);
        clearFieldValidation(txtRegPassword);

        if (btnRegister) {
            btnRegister.disabled = true;
            btnRegister.textContent = 'Registrando cuenta...';
        }

        try {
            const regResult = await authService.register(username, email, password);

            showAlert(alertSuccess, 'Cuenta registrada exitosamente. Redirigiendo al catálogo...');
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = resolveRedirectPath(regResult);
            }
        } catch (error) {
            const friendlyMsg = extractProblemMessage(
                error,
                'No se pudo completar el registro. Verifica los datos ingresados.'
            );
            const conflicts = detectConflictingFields(error);
            const status = Number(error?.status || error?.problemDetails?.status) || 0;

            if (conflicts.includes('username')) {
                if (txtRegUsername) txtRegUsername.dataset.conflictValue = username.toLowerCase();
                setFieldInvalid(txtRegUsername, errRegUsername, friendlyMsg);
            }
            if (conflicts.includes('email')) {
                if (txtRegEmail) txtRegEmail.dataset.conflictValue = email.toLowerCase();
                setFieldInvalid(txtRegEmail, errRegEmail, friendlyMsg);
            }
            if (conflicts.includes('password')) {
                setFieldInvalid(txtRegPassword, errRegPassword, friendlyMsg);
            }

            // Si es HTTP 400 y no se identificó campo específico, resaltar usuario y correo
            if (status === 400 && conflicts.length === 0) {
                setFieldInvalid(txtRegUsername, errRegUsername, friendlyMsg);
                setFieldInvalid(txtRegEmail, errRegEmail, friendlyMsg);
            }

            showAlert(alertError, friendlyMsg);
        } finally {
            if (btnRegister) {
                btnRegister.disabled = false;
                btnRegister.textContent = 'Crear Cuenta';
            }
        }
    });
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        initLoginController(document);
    });
}
