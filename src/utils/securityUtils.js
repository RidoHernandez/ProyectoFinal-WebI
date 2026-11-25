// Utilidades centralizadas de prevención XSS y manipulación segura del DOM (REQ-SEC-005)

/**
 * Escapa caracteres HTML especiales (&, <, >, ", ') antes de interpolar en cadenas HTML.
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
