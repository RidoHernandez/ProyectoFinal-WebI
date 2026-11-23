// Traducción oficial de DataTables al español
export const DT_LANGUAGE_URL = 'https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-MX.json';

// Escapa texto proveniente de la API antes de insertarlo como HTML (evita XSS)
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Formatea un número como moneda USD
export function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Configuración base común para todas las tablas DataTables
export function baseTableOptions(extra = {}) {
    return {
        language: { url: DT_LANGUAGE_URL },
        responsive: true,
        pageLength: 10,
        lengthMenu: [5, 10, 25, 50, 100],
        data: [],
        ...extra
    };
}

// Inicializa el nombre del usuario y el botón de cerrar sesión del navbar
export function initNavbar(usuario, authService) {
    const lblUsuario = document.getElementById('lblUsuario');
    if (lblUsuario && usuario) {
        lblUsuario.textContent = usuario.nombre || usuario.apiKey || 'Administrador';
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout && authService) {
        btnLogout.onclick = () => {
            authService.logout();
        };
    }
}
