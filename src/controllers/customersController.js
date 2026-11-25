import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { customerService } from "../services/customerService.js";
import { validateCustomerId } from "../models/customerModel.js";
import {
    baseTableOptions,
    escapeHtml,
    safeTextRender,
    initAuthenticatedView,
    setElementVisibility,
    extractProblemMessage,
    showModal,
    bindModalDismiss
} from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable
authGuard('canViewCustomers');

const REQUIRED_PERMISSION = 'canViewCustomers';

let tabla = null;

function showCustomersAlert(message = '', visible = Boolean(message)) {
    const alertEl = document.getElementById('alertClientes');
    if (!alertEl) return;
    alertEl.textContent = visible ? String(message || '') : '';
    setElementVisibility(alertEl, visible);
}

function setTableStatusMessage(message) {
    const tbody = document.getElementById('tbodyClientes');
    if (!tbody) return;
    tbody.textContent = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'text-center text-muted py-3';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function setDetailModalState({
    customerId = '-',
    companyName = '-',
    contactName = '-',
    errorMessage = ''
} = {}) {
    const idEl = document.getElementById('detClienteId');
    const empresaEl = document.getElementById('detClienteEmpresa');
    const contactoEl = document.getElementById('detClienteContacto');
    const alertEl = document.getElementById('alertDetalleCliente');

    if (idEl) idEl.textContent = String(customerId || '-');
    if (empresaEl) empresaEl.textContent = String(companyName || '-');
    if (contactoEl) contactoEl.textContent = String(contactName || '-');
    if (alertEl) {
        alertEl.textContent = errorMessage ? String(errorMessage) : '';
        setElementVisibility(alertEl, Boolean(errorMessage));
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

async function listarClientes() {
    showCustomersAlert('', false);

    try {
        const data = await customerService.getAll();
        const customers = Array.isArray(data) ? data : [];

        const lblTotal = document.getElementById('lblTotalClientes');
        if (lblTotal) {
            lblTotal.textContent = String(customers.length);
        }

        if (tabla) {
            tabla.clear().rows.add(customers).draw();
        } else if (customers.length === 0) {
            setTableStatusMessage('No se encontraron clientes.');
        }

        return customers;
    } catch (err) {
        const lblTotal = document.getElementById('lblTotalClientes');
        if (lblTotal) {
            lblTotal.textContent = '0';
        }

        if (tabla) {
            tabla.clear().draw();
        } else {
            setTableStatusMessage('No se pudieron cargar los clientes.');
        }

        const msg = extractProblemMessage(err, 'No se pudieron cargar los clientes.');
        showCustomersAlert(msg, true);
        return [];
    }
}

async function verDetalleCliente(customerId) {
    const validation = validateCustomerId(customerId);

    if (!validation.valid) {
        showCustomersAlert(validation.error, true);
        return { ok: false, status: 400, message: validation.error };
    }

    const modalEl = document.getElementById('modalDetalleCliente');
    showModal(modalEl);
    setDetailModalState({
        customerId: validation.value,
        companyName: 'Cargando...',
        contactName: 'Cargando...',
        errorMessage: ''
    });

    try {
        const customer = await customerService.getById(validation.value);
        setDetailModalState({
            customerId: customer?.customerId || validation.value,
            companyName: customer?.companyName || 'Sin empresa',
            contactName: customer?.contactName || 'Sin contacto registrado',
            errorMessage: ''
        });
        return { ok: true, status: 200, data: customer };
    } catch (err) {
        const status = Number(err?.status || err?.problemDetails?.status) || 500;
        const msg = extractProblemMessage(err, 'No se pudo cargar el detalle del cliente.');
        setDetailModalState({
            customerId: validation.value,
            companyName: '-',
            contactName: '-',
            errorMessage: msg
        });
        return { ok: false, status, message: msg };
    }
}

function configurarEventos() {
    const tablaEl = document.getElementById('tablaClientes');
    if (tablaEl && tablaEl.dataset.customersBound !== 'true') {
        tablaEl.dataset.customersBound = 'true';
        tablaEl.addEventListener('click', async (e) => {
            const btn = e?.target?.closest?.('button[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const customerId = btn.dataset.id;
            if (action === 'ver' && customerId) {
                await verDetalleCliente(customerId);
            }
        });
    }

    const modalEl = document.getElementById('modalDetalleCliente');
    if (modalEl) {
        bindModalDismiss(modalEl, () => setDetailModalState());
    }
}

async function initCustomersController() {
    const usuario = await initAuthenticatedView({
        authService,
        requiredPermission: REQUIRED_PERMISSION
    });
    if (!usuario) return;

    tabla = null;
    inicializarTabla();
    configurarEventos();
    await listarClientes();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (
            document.body?.getAttribute?.('data-auth-blocked') ||
            !authService.isAuthenticated() ||
            !authService.hasPermission(REQUIRED_PERMISSION)
        ) {
            return;
        }
        await initCustomersController();
    });
}
