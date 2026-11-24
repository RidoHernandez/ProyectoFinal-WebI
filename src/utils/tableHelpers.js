import { escapeHtml } from './securityUtils.js';

export { escapeHtml };

// Traducción oficial de DataTables al español
export const DT_LANGUAGE_URL = 'https://cdn.datatables.net/plug-ins/2.1.8/i18n/es-MX.json';

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

const SENSITIVE_ERROR_PATTERN = /(System\.|Exception|StackTrace|Microsoft\.AspNetCore|MySql|SqlException|InnerException|DbUpdateException|Table\s+'[^']+'|Column\s+'[^']+'|SELECT\s+.+\s+FROM|ForeignKey|\sat\s+[A-Za-z0-9_.<>`]+\(|[A-Z]:\\[^\s]+)/i;
const GENERIC_HTTP_REASONS = new Set([
    'bad request',
    'unauthorized',
    'forbidden',
    'not found',
    'conflict',
    'internal server error'
]);

function pickSafeMessage(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed || SENSITIVE_ERROR_PATTERN.test(trimmed)) return '';
    if (GENERIC_HTTP_REASONS.has(trimmed.toLowerCase())) return '';
    return trimmed;
}

// Extrae mensajes seguros desde ApiError / ProblemDetails (RFC 7807)
export function extractProblemMessage(error, fallback = 'Ocurrió un error al procesar la solicitud.') {
    if (!error) return fallback;

    const pd = error.problemDetails || error;
    const status = Number(pd?.status || error?.status) || 0;
    if (status >= 500) {
        return 'Ocurrió un error interno en el servidor. Intenta nuevamente más tarde.';
    }

    const rawErrors = pd?.errors || error?.errors || null;
    if (rawErrors && typeof rawErrors === 'object') {
        const firstFieldMsg = Object.values(rawErrors)
            .flat()
            .map((msg) => pickSafeMessage(String(msg ?? '')))
            .find(Boolean);
        if (firstFieldMsg) return firstFieldMsg;
    }

    return (
        pickSafeMessage(pd?.detail) ||
        pickSafeMessage(error?.detail) ||
        pickSafeMessage(pd?.message) ||
        pickSafeMessage(error?.message) ||
        pickSafeMessage(pd?.title) ||
        pickSafeMessage(error?.title) ||
        fallback
    );
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

// Trunca de forma segura una API Key activa (ej. ak_8f4a...9c12) sin exponer el secreto completo
export function truncateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return 'No disponible';
    const clean = apiKey.trim();
    if (!clean) return 'No disponible';
    if (clean.length <= 11) {
        return `${clean.slice(0, 3)}...${clean.slice(-2)}`;
    }
    return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
}

// Formatea de manera legible la fecha de expiración de la API Key
export function formatExpirationDate(expiresAt) {
    if (!expiresAt) return 'Sin expiración definida';
    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) return String(expiresAt);
    try {
        return new Date(parsed).toLocaleString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return new Date(parsed).toISOString();
    }
}

// Devuelve la clase visual de Bootstrap para el badge de cada rol
export function getRoleBadgeClass(role) {
    const normalized = String(role || '').toUpperCase();
    if (normalized === 'ADMIN') return 'bg-danger text-white';
    if (normalized === 'EMPLEADO') return 'bg-warning text-dark';
    return 'bg-info text-dark';
}

// Normaliza el rol del usuario conectado a ADMIN | EMPLEADO | CLIENTE
export function resolveConnectedRole(usuario, authService) {
    const rawRole = usuario?.role || usuario?.rol || authService?.getUserRole?.() || 'CLIENTE';
    const upper = String(rawRole).toUpperCase().trim();
    if (upper === 'ADMIN' || upper.startsWith('ADMINISTRADOR')) return 'ADMIN';
    if (upper === 'EMPLEADO') return 'EMPLEADO';
    return 'CLIENTE';
}

export function clearTbody(tbody) {
    if (!tbody) return;
    if (Array.isArray(tbody.children)) {
        tbody.children.length = 0;
    }
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

// Oculta un modal Bootstrap 5 o su respaldo visual directo
export function hideModal(modalEl) {
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
export function renderFlashErrorBanner() {
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

function updateModalApiKeyInfo(usuario, authService) {
    if (typeof document === 'undefined') return;
    const current = authService?.getCurrentUser?.() || usuario || {};
    const apiKey = current.apiKey || authService?.getApiKey?.() || '';
    const expiresAt = current.expiresAt || '';
    const role = resolveConnectedRole(current, authService);

    const lblTruncada = document.getElementById('lblApiKeyTruncada');
    if (lblTruncada) {
        lblTruncada.textContent = truncateApiKey(apiKey);
    }

    const lblExpiracion = document.getElementById('lblApiKeyExpiracion');
    if (lblExpiracion) {
        lblExpiracion.textContent = formatExpirationDate(expiresAt);
    }

    const lblRolModal = document.getElementById('lblApiKeyRol');
    if (lblRolModal) {
        lblRolModal.textContent = role;
    }
}

// Ejecuta la regeneración de API Key y actualiza el DOM y sessionStorage sin requerir re-login
export async function handleRegenerateApiKey(authService, skipConfirm = false) {
    if (!authService || typeof authService.regenerateApiKey !== 'function') {
        throw new Error('El servicio de regeneración de API Key no está disponible.');
    }

    const role = resolveConnectedRole(authService.getCurrentUser?.(), authService);
    if (role !== 'ADMIN' && role !== 'EMPLEADO') {
        throw new Error('Acceso denegado: Solo ADMIN y EMPLEADO pueden regenerar su API Key.');
    }

    if (!skipConfirm) {
        const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function')
            ? window.confirm.bind(window)
            : (typeof confirm === 'function' ? confirm : null);
        if (confirmFn) {
            const ok = confirmFn('¿Estás seguro de regenerar tu API Key? La llave actual quedará invalidada de inmediato.');
            if (ok === false) return null;
        }
    }

    const btnRegenerar = typeof document !== 'undefined' ? document.getElementById('btnRegenerarApiKey') : null;
    const alertResultado = typeof document !== 'undefined' ? document.getElementById('alertApiKeyResultado') : null;

    if (btnRegenerar) {
        btnRegenerar.disabled = true;
        btnRegenerar.textContent = 'Regenerando...';
    }

    try {
        const result = await authService.regenerateApiKey();
        const updatedUser = authService.getCurrentUser?.() || result || {};
        const newApiKey = result?.apiKey || result?.ApiKey || updatedUser.apiKey || authService.getApiKey?.() || '';
        const newExpiresAt = result?.expiresAt || result?.ExpiresAt || updatedUser.expiresAt || '';

        const lblTruncada = typeof document !== 'undefined' ? document.getElementById('lblApiKeyTruncada') : null;
        if (lblTruncada) {
            lblTruncada.textContent = truncateApiKey(newApiKey);
        }

        const lblExpiracion = typeof document !== 'undefined' ? document.getElementById('lblApiKeyExpiracion') : null;
        if (lblExpiracion) {
            lblExpiracion.textContent = formatExpirationDate(newExpiresAt);
        }

        if (alertResultado) {
            alertResultado.className = 'alert alert-success py-2 px-3 small mb-0 mt-3';
            alertResultado.textContent = 'API Key regenerada exitosamente. Tu sesión activa fue actualizada sin necesidad de volver a iniciar sesión.';
            setElementVisibility(alertResultado, true);
        }

        return result;
    } catch (err) {
        if (alertResultado) {
            alertResultado.className = 'alert alert-danger py-2 px-3 small mb-0 mt-3';
            alertResultado.textContent = err?.message || 'No se pudo regenerar la API Key.';
            setElementVisibility(alertResultado, true);
        }
        throw err;
    } finally {
        if (btnRegenerar) {
            btnRegenerar.disabled = false;
            btnRegenerar.textContent = 'Regenerar API Key';
        }
    }
}

// Oculta el modal de API Key en modo fallback (sin Bootstrap JS) y limpia su alerta
export function hideApiKeyModalFallback(modalEl) {
    if (!modalEl) return;
    hideModal(modalEl);
    const alertResultado = typeof document !== 'undefined' ? document.getElementById('alertApiKeyResultado') : null;
    if (alertResultado) {
        setElementVisibility(alertResultado, false);
    }
}

// Inyecta o actualiza el modal de gestión de API Key para roles administrativos (ADMIN / EMPLEADO)
export function ensureApiKeyModal(usuario, authService) {
    if (typeof document === 'undefined' || !document.body) return null;

    let modalEl = document.getElementById('modalApiKey');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = 'modalApiKey';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-labelledby', 'modalApiKeyTitulo');
        modalEl.setAttribute('aria-hidden', 'true');

        const dialogEl = document.createElement('div');
        dialogEl.className = 'modal-dialog modal-dialog-centered';

        const contentEl = document.createElement('div');
        contentEl.className = 'modal-content border-0 shadow';

        // Header
        const headerEl = document.createElement('div');
        headerEl.className = 'modal-header bg-dark text-white';

        const titleEl = document.createElement('h5');
        titleEl.className = 'modal-title fw-bold';
        titleEl.id = 'modalApiKeyTitulo';
        titleEl.textContent = 'Credencial API Key Activa';

        const btnCloseHeader = document.createElement('button');
        btnCloseHeader.type = 'button';
        btnCloseHeader.className = 'btn-close btn-close-white';
        btnCloseHeader.setAttribute('data-bs-dismiss', 'modal');
        btnCloseHeader.setAttribute('aria-label', 'Cerrar');

        headerEl.appendChild(titleEl);
        headerEl.appendChild(btnCloseHeader);

        // Body
        const bodyEl = document.createElement('div');
        bodyEl.className = 'modal-body';

        const rolGroup = document.createElement('div');
        rolGroup.className = 'mb-3';
        const rolLabel = document.createElement('span');
        rolLabel.className = 'text-muted small d-block';
        rolLabel.textContent = 'Rol Autorizado';
        const lblRol = document.createElement('span');
        lblRol.id = 'lblApiKeyRol';
        lblRol.className = 'badge bg-secondary';
        rolGroup.appendChild(rolLabel);
        rolGroup.appendChild(lblRol);

        const keyGroup = document.createElement('div');
        keyGroup.className = 'mb-3';
        const keyLabel = document.createElement('span');
        keyLabel.className = 'text-muted small d-block';
        keyLabel.textContent = 'API Key Activa (Truncada por seguridad)';
        const lblTruncada = document.createElement('code');
        lblTruncada.id = 'lblApiKeyTruncada';
        lblTruncada.className = 'fs-6 fw-bold text-dark bg-light border rounded px-2 py-1 d-inline-block mt-1';
        keyGroup.appendChild(keyLabel);
        keyGroup.appendChild(lblTruncada);

        const expGroup = document.createElement('div');
        expGroup.className = 'mb-3';
        const expLabel = document.createElement('span');
        expLabel.className = 'text-muted small d-block';
        expLabel.textContent = 'Fecha de Expiración';
        const lblExpiracion = document.createElement('strong');
        lblExpiracion.id = 'lblApiKeyExpiracion';
        lblExpiracion.className = 'text-secondary small';
        expGroup.appendChild(expLabel);
        expGroup.appendChild(lblExpiracion);

        const alertWarning = document.createElement('div');
        alertWarning.id = 'alertApiKeyWarning';
        alertWarning.className = 'alert alert-warning py-2 px-3 small mb-0';
        const strongWarn = document.createElement('strong');
        strongWarn.textContent = 'Advertencia:';
        alertWarning.appendChild(strongWarn);
        alertWarning.appendChild(document.createTextNode(' Al regenerar tu API Key mediante '));
        const codeEndpoint = document.createElement('code');
        codeEndpoint.textContent = 'POST /api/apikeys/regenerate';
        alertWarning.appendChild(codeEndpoint);
        alertWarning.appendChild(
            document.createTextNode(', la llave anterior quedará invalidada de inmediato en el servidor y se actualizará automáticamente en tu sesión activa.')
        );

        const alertResultado = document.createElement('div');
        alertResultado.id = 'alertApiKeyResultado';
        alertResultado.className = 'alert d-none py-2 px-3 small mb-0 mt-3';
        alertResultado.setAttribute('role', 'status');

        bodyEl.appendChild(rolGroup);
        bodyEl.appendChild(keyGroup);
        bodyEl.appendChild(expGroup);
        bodyEl.appendChild(alertWarning);
        bodyEl.appendChild(alertResultado);

        // Footer
        const footerEl = document.createElement('div');
        footerEl.className = 'modal-footer';

        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'btn btn-secondary btn-sm';
        btnCerrar.setAttribute('data-bs-dismiss', 'modal');
        btnCerrar.textContent = 'Cerrar';

        const btnRegenerarFooter = document.createElement('button');
        btnRegenerarFooter.type = 'button';
        btnRegenerarFooter.id = 'btnRegenerarApiKey';
        btnRegenerarFooter.className = 'btn btn-warning btn-sm fw-semibold';
        btnRegenerarFooter.textContent = 'Regenerar API Key';

        footerEl.appendChild(btnCerrar);
        footerEl.appendChild(btnRegenerarFooter);

        contentEl.appendChild(headerEl);
        contentEl.appendChild(bodyEl);
        contentEl.appendChild(footerEl);
        dialogEl.appendChild(contentEl);
        modalEl.appendChild(dialogEl);

        document.body.appendChild(modalEl);
    }

    if (!modalEl.dataset) modalEl.dataset = {};
    if (!modalEl.dataset.bsModalBound) {
        modalEl.dataset.bsModalBound = 'true';
        bindModalDismiss(modalEl, () => {
            const alertResultado = document.getElementById('alertApiKeyResultado');
            if (alertResultado) {
                setElementVisibility(alertResultado, false);
            }
        });
    }

    updateModalApiKeyInfo(usuario, authService);

    const btnRegenerar = document.getElementById('btnRegenerarApiKey');
    if (btnRegenerar && authService) {
        btnRegenerar.onclick = async () => {
            try {
                await handleRegenerateApiKey(authService);
            } catch {
                // El error ya se presenta en #alertApiKeyResultado
            }
        };
    }

    return modalEl;
}

// Inicializa el navbar dinámicamente según el rol conectado (TASK-F2-06 y TASK-F2-07)
export function initNavbar(usuario, authService) {
    if (typeof document === 'undefined') return;

    const currentUser = authService?.getCurrentUser?.() || usuario || null;
    const username = currentUser?.username || currentUser?.nombre || usuario?.username || usuario?.nombre || 'Usuario';
    const role = resolveConnectedRole(currentUser || usuario, authService);
    const isAdminOrEmpleado = role === 'ADMIN' || role === 'EMPLEADO';

    // 1. Mostrar nombre de usuario con textContent
    const lblUsuario = document.getElementById('lblUsuario');
    if (lblUsuario) {
        lblUsuario.textContent = username;
    }

    // 2. Mostrar badge del rol conectado (#badgeRol)
    let badgeRol = document.getElementById('badgeRol');
    if (!badgeRol && lblUsuario && lblUsuario.parentElement) {
        badgeRol = document.createElement('span');
        badgeRol.id = 'badgeRol';
        lblUsuario.parentElement.appendChild(document.createTextNode(' '));
        lblUsuario.parentElement.appendChild(badgeRol);
    }
    if (badgeRol) {
        badgeRol.textContent = role;
        badgeRol.className = `badge rounded-pill ms-1 ${getRoleBadgeClass(role)}`;
        badgeRol.setAttribute('data-role', role);
    }

    // 3. Adaptar visibilidad de enlaces del menú de navegación según el rol
    const navLinks = typeof document.querySelectorAll === 'function'
        ? Array.from(document.querySelectorAll('a[href]'))
        : [];

    for (const link of navLinks) {
        const href = (link.getAttribute('href') || '').toLowerCase();
        const isBrand = link.classList && link.classList.contains('navbar-brand');

        if (isBrand) {
            link.setAttribute('href', isAdminOrEmpleado ? './productos.html' : './catalogo.html');
            continue;
        }

        const isRestrictedAdminLink = href.includes('productos.html') || href.includes('clientes.html');
        const isSharedLink = href.includes('catalogo.html') || href.includes('pedidos.html') || href.includes('ordenes.html');

        if (isRestrictedAdminLink) {
            setElementVisibility(link, isAdminOrEmpleado);
            const parentLi = link.closest ? link.closest('.nav-item, li') : null;
            if (parentLi) setElementVisibility(parentLi, isAdminOrEmpleado);
        } else if (isSharedLink) {
            setElementVisibility(link, true);
            const parentLi = link.closest ? link.closest('.nav-item, li') : null;
            if (parentLi) setElementVisibility(parentLi, true);
        }
    }

    // Soporte adicional por IDs de elementos de navegación si existen en la vista
    const adminNavIds = ['navProductos', 'navItemProductos', 'navClientes', 'navItemClientes'];
    for (const id of adminNavIds) {
        const el = document.getElementById(id);
        if (el) setElementVisibility(el, isAdminOrEmpleado);
    }
    const clientAllowedNavIds = ['navCatalogo', 'navItemCatalogo', 'navPedidos', 'navItemPedidos', 'navOrdenes', 'navItemOrdenes'];
    for (const id of clientAllowedNavIds) {
        const el = document.getElementById(id);
        if (el) setElementVisibility(el, true);
    }

    // 4. Botón y modal de regeneración de API Key (solo para ADMIN y EMPLEADO; oculto para CLIENTE)
    const btnLogout = document.getElementById('btnLogout');
    let btnPerfilApiKey = document.getElementById('btnPerfilApiKey');
    if (!btnPerfilApiKey && btnLogout && btnLogout.parentElement) {
        btnPerfilApiKey = document.createElement('button');
        btnPerfilApiKey.type = 'button';
        btnPerfilApiKey.id = 'btnPerfilApiKey';
        btnPerfilApiKey.className = 'btn btn-outline-warning btn-sm';
        btnPerfilApiKey.textContent = 'Mi API Key';
        btnLogout.parentElement.insertBefore(btnPerfilApiKey, btnLogout);
    }

    if (btnPerfilApiKey) {
        setElementVisibility(btnPerfilApiKey, isAdminOrEmpleado);
        if (isAdminOrEmpleado) {
            ensureApiKeyModal(currentUser || usuario, authService);
            btnPerfilApiKey.onclick = () => {
                const modalEl = ensureApiKeyModal(currentUser || usuario, authService);
                const alertResultado = document.getElementById('alertApiKeyResultado');
                if (alertResultado) setElementVisibility(alertResultado, false);
                if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    const instance = bootstrap.Modal.getOrCreateInstance
                        ? bootstrap.Modal.getOrCreateInstance(modalEl)
                        : new bootstrap.Modal(modalEl);
                    instance.show();
                } else if (modalEl) {
                    modalEl.classList.add('show');
                    if (modalEl.style) modalEl.style.display = 'block';
                    modalEl.setAttribute?.('aria-hidden', 'false');
                }
            };
        } else {
            btnPerfilApiKey.onclick = null;
            const modalEl = document.getElementById('modalApiKey');
            if (modalEl) {
                hideApiKeyModalFallback(modalEl);
            }
        }
    }

    // 5. Botón de cerrar sesión con confirmación rápida
    if (btnLogout && authService) {
        btnLogout.onclick = (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function')
                ? window.confirm.bind(window)
                : (typeof confirm === 'function' ? confirm : null);
            if (confirmFn) {
                const confirmado = confirmFn('¿Deseas cerrar tu sesión activa?');
                if (confirmado === false) return;
            }
            authService.logout();
        };
    }

    // 6. Mostrar alerta 403 si hubo redirección por permisos insuficientes
    renderFlashErrorBanner();
}
