import { authService, ROLES, purgeResidualLocalStorage } from "../services/authService.js";
import { STORAGE_KEYS } from "../api/config.js";

export { ROLES };

export function consumeAuthFlashError() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            const msg = sessionStorage.getItem(STORAGE_KEYS.AUTH_FLASH_ERROR);
            if (msg) {
                sessionStorage.removeItem(STORAGE_KEYS.AUTH_FLASH_ERROR);
                return msg;
            }
        }
    } catch {
        // Ignore storage errors
    }
    return null;
}

export function authGuard(allowedRoles = []) {
    purgeResidualLocalStorage();

    if (!authService.isAuthenticated()) {
        try {
            if (typeof document !== 'undefined' && document.body) {
                document.body.setAttribute('data-auth-blocked', '401');
                document.body.style.display = 'none';
            }
        } catch {
            // Ignore DOM errors in non-browser environments
        }

        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './login.html';
        }
        return false;
    }

    const rolesList = typeof allowedRoles === 'string'
        ? [allowedRoles]
        : (Array.isArray(allowedRoles) ? allowedRoles : []);

    if (rolesList.length > 0 && !authService.hasRole(rolesList)) {
        const currentRole = authService.getUserRole() || 'USUARIO';
        const flashMessage = `Acceso denegado (403): Tu perfil (${currentRole}) no tiene permisos para acceder a esa sección.`;

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

        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './catalogo.html?error=403';
        }

        return false;
    }

    return authService.getCurrentUser();
}

export default authGuard;
