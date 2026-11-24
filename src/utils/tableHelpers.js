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

function setElementVisibility(el, visible) {
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
    modalEl.classList?.remove('show');
    if (modalEl.style) modalEl.style.display = 'none';
    modalEl.setAttribute?.('aria-hidden', 'true');
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

        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-dark text-white">
                        <h5 class="modal-title fw-bold" id="modalApiKeyTitulo">Credencial API Key Activa</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <span class="text-muted small d-block">Rol Autorizado</span>
                            <span id="lblApiKeyRol" class="badge bg-secondary"></span>
                        </div>
                        <div class="mb-3">
                            <span class="text-muted small d-block">API Key Activa (Truncada por seguridad)</span>
                            <code id="lblApiKeyTruncada" class="fs-6 fw-bold text-dark bg-light border rounded px-2 py-1 d-inline-block mt-1"></code>
                        </div>
                        <div class="mb-3">
                            <span class="text-muted small d-block">Fecha de Expiración</span>
                            <strong id="lblApiKeyExpiracion" class="text-secondary small"></strong>
                        </div>
                        <div id="alertApiKeyWarning" class="alert alert-warning py-2 px-3 small mb-0">
                            <strong>Advertencia:</strong> Al regenerar tu API Key mediante <code>POST /api/apikeys/regenerate</code>, la llave anterior quedará invalidada de inmediato en el servidor y se actualizará automáticamente en tu sesión activa.
                        </div>
                        <div id="alertApiKeyResultado" class="alert d-none py-2 px-3 small mb-0 mt-3" role="status"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" id="btnRegenerarApiKey" class="btn btn-warning btn-sm fw-semibold">Regenerar API Key</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }

    if (!modalEl.dataset) modalEl.dataset = {};
    if (!modalEl.dataset.bsModalBound) {
        modalEl.dataset.bsModalBound = 'true';

        modalEl.addEventListener?.('hidden.bs.modal', () => {
            const alertResultado = document.getElementById('alertApiKeyResultado');
            if (alertResultado) {
                setElementVisibility(alertResultado, false);
            }
            modalEl.setAttribute?.('aria-hidden', 'true');
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
                hideApiKeyModalFallback(modalEl);
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
