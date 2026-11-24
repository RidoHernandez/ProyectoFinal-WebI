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

/**
 * Normaliza un valor a texto plano seguro eliminando bloques y etiquetas HTML ejecutables.
 */
export function sanitizeText(value, fallback = '') {
    if (value === null || value === undefined) return String(fallback ?? '');
    const cleaned = String(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .trim();
    return cleaned === '' ? String(fallback ?? '') : cleaned;
}

/**
 * Asigna texto de forma segura a un elemento DOM exclusivamente mediante textContent.
 */
export function setSafeText(el, value, fallback = '') {
    if (!el) return '';
    const isEmpty = value === null || value === undefined || String(value).trim() === '';
    const text = isEmpty ? String(fallback ?? '') : String(value);
    el.textContent = text;
    return text;
}
