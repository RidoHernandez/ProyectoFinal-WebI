import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { customerService } from "../services/customerService.js";
import { validateCustomerId } from "../models/customerModel.js";
import {
    baseTableOptions,
    escapeHtml,
    safeTextRender,
    initNavbar,
    clearTbody,
    setElementVisibility,
    extractProblemMessage,
    showModal,
    bindModalDismiss
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04 / TASK-F4-02)
authGuard(['ADMIN', 'EMPLEADO']);

const ALLOWED_ROLES = ['ADMIN', 'EMPLEADO'];

let customersCache = [];
let tabla = null;

function getDoc(customDoc = null) {
    if (customDoc) return customDoc;
    return typeof document !== 'undefined' ? document : null;
}

function showCustomersAlert(doc, message = '', visible = Boolean(message)) {
    const alertEl = doc?.getElementById('alertClientes');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function setDetailModalState(
    doc,
    {
        customerId = '-',
        companyName = '-',
        contactName = '-',
        errorMessage = ''
    } = {}
) {
    if (!doc) return;
    const idEl = doc.getElementById('detClienteId');
    const empresaEl = doc.getElementById('detClienteEmpresa');
    const contactoEl = doc.getElementById('detClienteContacto');
    const alertEl = doc.getElementById('alertDetalleCliente');

    if (idEl) idEl.textContent = String(customerId || '-');
    if (empresaEl) empresaEl.textContent = String(companyName || '-');
    if (contactoEl) contactoEl.textContent = String(contactName || '-');
    if (alertEl) {
        alertEl.textContent = errorMessage ? String(errorMessage) : '';
        setElementVisibility(alertEl, Boolean(errorMessage));
    }
}

export function setCustomersCache(lista = []) {
    customersCache = Array.isArray(lista) ? [...lista] : [];
    return customersCache;
}

export function getCustomersCache() {
    return customersCache;
}

export function resetCustomersState() {
    customersCache = [];
    tabla = null;
}

// Filtro puro de clientes por código, empresa o contacto
export function filtrarClientes(lista = customersCache, termino = '') {
    if (!Array.isArray(lista)) return [];
    const query = String(termino ?? '').trim().toLowerCase();
    if (!query) return [...lista];

    return lista.filter((cliente) => {
        if (!cliente || typeof cliente !== 'object') return false;
        const id = String(cliente.customerId ?? '').toLowerCase();
        const company = String(cliente.companyName ?? '').toLowerCase();
        const contact = String(cliente.contactName ?? '').toLowerCase();
        return id.includes(query) || company.includes(query) || contact.includes(query);
    });
}

// Renderiza la tabla sin DataTables usando únicamente createElement y textContent (anti-XSS)
export function renderizarTablaClientesFallback(lista = customersCache, customDoc = null) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    const tbody = doc.getElementById('tbodyClientes');
    if (!tbody) return;

    clearTbody(tbody);
    const items = Array.isArray(lista) ? lista : [];

    if (items.length === 0) {
        const trEmpty = doc.createElement('tr');
        trEmpty.setAttribute?.('data-empty', 'true');
        const tdEmpty = doc.createElement('td');
        tdEmpty.colSpan = 4;
        tdEmpty.setAttribute?.('colspan', '4');
        tdEmpty.className = 'text-center text-muted py-3';
        tdEmpty.textContent = 'No se encontraron clientes.';
        trEmpty.appendChild(tdEmpty);
        tbody.appendChild(trEmpty);
        return;
    }

    for (const cliente of items) {
        const customerId = String(cliente?.customerId ?? '');
        const companyName = String(cliente?.companyName || '-');
        const contactName = String(cliente?.contactName || 'Sin contacto');

        const tr = doc.createElement('tr');
        tr.setAttribute?.('data-customer-id', customerId);

        const tdId = doc.createElement('td');
        const strongId = doc.createElement('strong');
        strongId.textContent = customerId;
        tdId.appendChild(strongId);

        const tdCompany = doc.createElement('td');
        tdCompany.textContent = companyName;

        const tdContact = doc.createElement('td');
        tdContact.textContent = contactName;

        const tdActions = doc.createElement('td');
        tdActions.className = 'text-center text-nowrap';
        const btnVer = doc.createElement('button');
        btnVer.type = 'button';
        btnVer.className = 'btn btn-sm btn-outline-primary';
        btnVer.setAttribute('data-action', 'ver');
        btnVer.setAttribute('data-id', customerId);
        btnVer.textContent = 'Ver Detalle';
        tdActions.appendChild(btnVer);

        tr.appendChild(tdId);
        tr.appendChild(tdCompany);
        tr.appendChild(tdContact);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    }
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') {
        tabla = null;
        return;
    }

    tabla = new DataTable('#tablaClientes', baseTableOptions({
        order: [[0, 'asc']],
        columns: [
            {
                data: 'customerId',
                render: (d, type) => (type === 'display' ? `<strong>${escapeHtml(d)}</strong>` : String(d ?? ''))
            },
            { data: 'companyName', render: safeTextRender('-') },
            { data: 'contactName', render: safeTextRender('Sin contacto') },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center text-nowrap',
                render: (_, __, row) =>
                    `<button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row?.customerId ?? '')}">Ver Detalle</button>`
            }
        ]
    }));
}

export async function listarClientes(customDoc = null) {
    const doc = getDoc(customDoc);
    showCustomersAlert(doc, '', false);

    try {
        const data = await customerService.getAll();
        customersCache = Array.isArray(data) ? data : [];

        const lblTotal = doc?.getElementById('lblTotalClientes');
        if (lblTotal) {
            lblTotal.textContent = String(customersCache.length);
        }

        if (tabla) {
            tabla.clear().rows.add(customersCache).draw();
        } else {
            renderizarTablaClientesFallback(customersCache, doc);
        }

        return customersCache;
    } catch (err) {
        customersCache = [];
        const lblTotal = doc?.getElementById('lblTotalClientes');
        if (lblTotal) {
            lblTotal.textContent = '0';
        }

        if (tabla) {
            tabla.clear().draw();
        } else {
            renderizarTablaClientesFallback([], doc);
        }

        const msg = extractProblemMessage(err, 'No se pudieron cargar los clientes.');
        showCustomersAlert(doc, msg, true);
        return [];
    }
}

export async function verDetalleCliente(customerId, customDoc = null) {
    const doc = getDoc(customDoc);
    const validation = validateCustomerId(customerId);

    if (!validation.valid) {
        showCustomersAlert(doc, validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const modalEl = doc?.getElementById('modalDetalleCliente');
    showModal(modalEl);
    setDetailModalState(doc, {
        customerId: validation.value,
        companyName: 'Cargando...',
        contactName: 'Cargando...',
        errorMessage: ''
    });

    try {
        const customer = await customerService.getById(validation.value);
        setDetailModalState(doc, {
            customerId: customer?.customerId || validation.value,
            companyName: customer?.companyName || 'Sin empresa',
            contactName: customer?.contactName || 'Sin contacto registrado',
            errorMessage: ''
        });
        return { ok: true, status: 200, data: customer };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cargar el detalle del cliente.');
        setDetailModalState(doc, {
            customerId: validation.value,
            companyName: '-',
            contactName: '-',
            errorMessage: msg
        });
        return { ok: false, status, message: msg };
    }
}

function configurarEventos(doc) {
    if (!doc) return;

    const tablaEl = doc.getElementById('tablaClientes');
    if (tablaEl) {
        if (!tablaEl.dataset) tablaEl.dataset = {};
        if (tablaEl.dataset.customersBound !== 'true') {
            tablaEl.dataset.customersBound = 'true';
            tablaEl.addEventListener('click', async (e) => {
                const target = e?.target;
                const btn = target && typeof target.closest === 'function'
                    ? target.closest('button[data-action]')
                    : target;
                if (!btn) return;

                const action = btn.dataset?.action || btn.getAttribute?.('data-action');
                const customerId = btn.dataset?.id || btn.getAttribute?.('data-id');
                if (action === 'ver' && customerId) {
                    await verDetalleCliente(customerId, doc);
                }
            });
        }
    }

    const modalEl = doc.getElementById('modalDetalleCliente');
    if (modalEl) {
        bindModalDismiss(modalEl, () => setDetailModalState(doc));
    }
}

export async function initCustomersController(customDoc = null) {
    const doc = getDoc(customDoc);
    if (!doc) return;

    if (!authService.isAuthenticated() || !authService.hasRole(ALLOWED_ROLES)) {
        return;
    }

    const usuario = authService.getCurrentUser() || await authService.checkSession();
    if (!usuario) return;

    resetCustomersState();
    initNavbar(usuario, authService);
    inicializarTabla();
    configurarEventos(doc);
    await listarClientes(doc);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authService.isAuthenticated() ||
            !authService.hasRole(ALLOWED_ROLES)
        ) {
            return;
        }
        await initCustomersController(document);
    });
}
