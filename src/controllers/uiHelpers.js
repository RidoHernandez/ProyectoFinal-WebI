import { extractProblemMessage } from '../models/apiClient.js';

export { extractProblemMessage };

const DT_LANGUAGE_URL = 'https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-MX.json';

// Escapa caracteres HTML especiales (&, <, >, ", ') antes de interpolar en cadenas HTML
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Confirmación centralizada de acciones sensibles en navegador
export function confirmAction(message) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return Boolean(window.confirm(message));
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
        return Boolean(globalThis.confirm(message));
    }
    return false;
}

// Renderizador seguro para columnas de texto en DataTables (DataTable.render.text() + respaldo escapeHtml)
export function safeTextRender(fallback = '-') {
    return (data, type) => {
        const isEmpty = data === null || data === undefined || String(data).trim() === '';
        const raw = isEmpty ? fallback : String(data);
        if (type !== 'display') {
            return raw;
        }
        if (typeof DataTable !== 'undefined' && DataTable.render && typeof DataTable.render.text === 'function') {
            const renderer = DataTable.render.text();
            if (renderer && typeof renderer.display === 'function') {
                return renderer.display(raw);
            }
            if (typeof renderer === 'function') {
                return renderer(raw, type);
            }
        }
        return escapeHtml(raw);
    };
}

// Formatea fechas ISO o YYYY-MM-DD de forma segura en español (es-MX)
export function formatDate(value, fallback = 'N/A') {
    if (value === null || value === undefined) return fallback;
    const raw = typeof value === 'string' ? value.trim() : value;
    if (raw === '') return fallback;

    let dateObj = null;
    if (typeof raw === 'string') {
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (dateOnlyMatch) {
            const year = Number(dateOnlyMatch[1]);
            const month = Number(dateOnlyMatch[2]);
            const day = Number(dateOnlyMatch[3]);
            const candidate = new Date(year, month - 1, day);
            if (
                candidate.getFullYear() === year &&
                candidate.getMonth() === month - 1 &&
                candidate.getDate() === day
            ) {
                dateObj = candidate;
            }
        }
    }

    if (!dateObj) {
        const parsed = raw instanceof Date ? raw.getTime() : Date.parse(raw);
        if (Number.isNaN(parsed)) return fallback;
        dateObj = new Date(parsed);
    }

    try {
        return dateObj.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        });
    } catch {
        return dateObj.toISOString().slice(0, 10);
    }
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

// Obtiene las banderas de permisos de UI del usuario conectado (provenientes del backend)
export function resolveConnectedPermissions(usuario, authModel) {
    if (usuario?.permissions && typeof usuario.permissions === 'object') {
        return usuario.permissions;
    }
    if (typeof authModel?.getPermissions === 'function') {
        return authModel.getPermissions();
    }
    return {};
}

export function clearTbody(tbody) {
    if (!tbody) return;
    tbody.textContent = '';
}

export function setElementVisibility(el, visible) {
    if (!el) return;
    if (visible) {
        if (el.classList) el.classList.remove('d-none');
        el.hidden = false;
        if (el.style) el.style.display = '';
    } else {
        if (el.classList) el.classList.add('d-none');
        el.hidden = true;
        if (el.style) el.style.display = 'none';
    }
}

// Abre un modal Bootstrap 5 con respaldo visual cuando Bootstrap JS no está cargado
export function showModal(modalEl) {
    if (!modalEl) return null;
    setElementVisibility(modalEl, true);
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        try {
            const instance = bootstrap.Modal.getOrCreateInstance
                ? bootstrap.Modal.getOrCreateInstance(modalEl)
                : new bootstrap.Modal(modalEl);
            instance.show();
            return instance;
        } catch {
            // Aplicar respaldo visual directo si Bootstrap falla
        }
    }
    modalEl.classList?.add('show');
    if (modalEl.style) modalEl.style.display = 'block';
    modalEl.setAttribute?.('aria-hidden', 'false');
    return null;
}

function hideModal(modalEl) {
    if (!modalEl) return;
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        try {
            const instance = bootstrap.Modal.getInstance?.(modalEl);
            instance?.hide();
        } catch {
            // Continuar con limpieza visual directa
        }
    }
    modalEl.classList?.remove('show');
    if (modalEl.style) modalEl.style.display = 'none';
    modalEl.setAttribute?.('aria-hidden', 'true');
}

// Vincula cierre limpio de modal tanto en Bootstrap JS como en entorno fallback sin Bootstrap
export function bindModalDismiss(modalEl, onHide = null) {
    if (!modalEl) return;
    if (!modalEl.dataset) modalEl.dataset = {};
    if (modalEl.dataset.dismissBound === 'true') return;
    modalEl.dataset.dismissBound = 'true';

    modalEl.addEventListener?.('hidden.bs.modal', () => {
        modalEl.setAttribute?.('aria-hidden', 'true');
        if (typeof onHide === 'function') onHide();
    });

    modalEl.addEventListener?.('click', (e) => {
        const target = e?.target;
        const directDismiss = target?.getAttribute?.('data-bs-dismiss') === 'modal'
            || target?.dataset?.bsDismiss === 'modal';
        let dismissTrigger = directDismiss ? target : null;
        if (!dismissTrigger && typeof target?.closest === 'function') {
            const candidate = target.closest('[data-bs-dismiss="modal"]');
            if (
                candidate &&
                (candidate.getAttribute?.('data-bs-dismiss') === 'modal' || candidate.dataset?.bsDismiss === 'modal')
            ) {
                dismissTrigger = candidate;
            }
        }
        if (dismissTrigger && (typeof bootstrap === 'undefined' || !bootstrap.Modal)) {
            hideModal(modalEl);
            if (typeof onHide === 'function') onHide();
        }
    });
}

// Muestra alerta 403 si existe mensaje flash en sessionStorage o parámetro ?error=403 en la URL
function renderFlashErrorBanner() {
    if (typeof document === 'undefined') return null;

    let flashMsg = null;
    try {
        if (typeof sessionStorage !== 'undefined') {
            flashMsg = sessionStorage.getItem('auth_flash_error');
            if (flashMsg) {
                sessionStorage.removeItem('auth_flash_error');
            }
        }
    } catch {
        // Ignorar errores de acceso a sessionStorage
    }

    const search = (typeof window !== 'undefined' && window.location && window.location.search)
        ? window.location.search
        : '';
    const has403Param = search.includes('error=403');

    if (!flashMsg && !has403Param) return null;

    const mensajeFinal = flashMsg || 'Acceso denegado (403): No tienes permisos para acceder a la sección solicitada.';

    let alertEl = document.getElementById('alertAccesoDenegado');
    if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.id = 'alertAccesoDenegado';
        alertEl.setAttribute('role', 'alert');

        const host = document.getElementById('alertContainer403')
            || document.querySelector('main')
            || document.body;

        if (host) {
            if (host.firstChild) {
                host.insertBefore(alertEl, host.firstChild);
            } else {
                host.appendChild(alertEl);
            }
        }
    }

    alertEl.className = 'alert alert-danger alert-dismissible fade show shadow-sm mb-3';
    alertEl.textContent = '';

    const strongEl = document.createElement('strong');
    strongEl.textContent = 'Acceso Restringido (403): ';
    alertEl.appendChild(strongEl);

    const spanMsg = document.createElement('span');
    spanMsg.id = 'lblMensaje403';
    spanMsg.textContent = mensajeFinal;
    alertEl.appendChild(spanMsg);

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'btn-close';
    btnClose.setAttribute('data-bs-dismiss', 'alert');
    btnClose.setAttribute('aria-label', 'Cerrar');
    btnClose.onclick = () => setElementVisibility(alertEl, false);
    alertEl.appendChild(btnClose);

    setElementVisibility(alertEl, true);
    return alertEl;
}

// Inicializa el navbar dinámicamente según las capacidades de UI devueltas por el backend (sin exponer roles)
function initNavbar(usuario, authModel) {
    if (typeof document === 'undefined') return;

    const currentUser = authModel?.getCurrentUser?.() || usuario || null;
    const username = currentUser?.username || usuario?.username || 'Usuario';
    const perms = resolveConnectedPermissions(currentUser || usuario, authModel);
    const canViewProductsAdmin = Boolean(perms.canViewProductsAdmin);
    const canViewCustomers = Boolean(perms.canViewCustomers);
    const defaultView = currentUser?.defaultView || authModel?.getDefaultView?.() || './catalogo.html';

    const lblUsuario = document.getElementById('lblUsuario');
    if (lblUsuario) {
        lblUsuario.textContent = username;
    }

    const navLinks = typeof document.querySelectorAll === 'function'
        ? Array.from(document.querySelectorAll('a[href]'))
        : [];

    for (const link of navLinks) {
        const href = (link.getAttribute('href') || '').toLowerCase();
        const isBrand = link.classList && link.classList.contains('navbar-brand');

        if (isBrand) {
            link.setAttribute('href', defaultView);
            continue;
        }

        const isProductsLink = href.includes('productos.html');
        const isCustomersLink = href.includes('clientes.html');
        const isSharedLink = href.includes('catalogo.html') || href.includes('pedidos.html');

        if (isProductsLink) {
            setElementVisibility(link, canViewProductsAdmin);
            const parentLi = link.closest ? link.closest('.nav-item, li') : null;
            if (parentLi) setElementVisibility(parentLi, canViewProductsAdmin);
        } else if (isCustomersLink) {
            setElementVisibility(link, canViewCustomers);
            const parentLi = link.closest ? link.closest('.nav-item, li') : null;
            if (parentLi) setElementVisibility(parentLi, canViewCustomers);
        } else if (isSharedLink) {
            setElementVisibility(link, true);
            const parentLi = link.closest ? link.closest('.nav-item, li') : null;
            if (parentLi) setElementVisibility(parentLi, true);
        }
    }

    for (const id of ['navProductos', 'navItemProductos']) {
        const el = document.getElementById(id);
        if (el) setElementVisibility(el, canViewProductsAdmin);
    }
    for (const id of ['navClientes', 'navItemClientes']) {
        const el = document.getElementById(id);
        if (el) setElementVisibility(el, canViewCustomers);
    }
    for (const id of ['navCatalogo', 'navItemCatalogo', 'navPedidos', 'navItemPedidos']) {
        const el = document.getElementById(id);
        if (el) setElementVisibility(el, true);
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout && authModel) {
        btnLogout.onclick = (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (!confirmAction('¿Deseas cerrar tu sesión activa?')) return;
            authModel.logout();
        };
    }

    renderFlashErrorBanner();
}

function navigateReplace(url) {
    if (typeof window === 'undefined' || !window.location) return;
    if (typeof window.location.replace === 'function') {
        window.location.replace(url);
    } else {
        window.location.href = url;
    }
}

// Arranque común de vistas autenticadas: inicializa navbar inmediato, revela vista y refresca perfil en segundo plano
export async function initAuthenticatedView({ authModel, requiredPermission = null } = {}) {
    if (typeof document === 'undefined' || !authModel) return null;

    if (!authModel.isAuthenticated()) {
        return null;
    }
    if (requiredPermission && !authModel.hasPermission(requiredPermission)) {
        return null;
    }

    const cachedUser = authModel.getCurrentUser();
    if (cachedUser) {
        initNavbar(cachedUser, authModel);
        if (document.body) {
            setElementVisibility(document.body, true);
        }
    }

    const usuario = (await authModel.refreshProfile()) || authModel.getCurrentUser();
    if (!usuario) {
        if (document.body) {
            setElementVisibility(document.body, false);
        }
        if (
            typeof window !== 'undefined' &&
            window.location &&
            !String(window.location.href || '').includes('login.html')
        ) {
            navigateReplace('./login.html');
        }
        return null;
    }

    if (requiredPermission && !authModel.hasPermission(requiredPermission)) {
        if (document.body) {
            setElementVisibility(document.body, false);
        }
        navigateReplace('./catalogo.html?error=403');
        return null;
    }

    initNavbar(usuario, authModel);
    if (document.body) {
        setElementVisibility(document.body, true);
    }
    return usuario;
}
