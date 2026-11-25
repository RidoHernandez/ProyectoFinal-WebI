import { authGuard, authModel } from "../models/authModel.js";
import { customerModel, validateCustomerId } from "../models/customerModel.js";
import {
    baseTableOptions,
    escapeHtml,
    safeTextRender,
    initAuthenticatedView,
    setElementVisibility,
    extractProblemMessage,
    showModal,
    bindModalDismiss
} from "./uiHelpers.js";

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

function setDetailModalState({ customerId = '-', companyName = '-', contactName = '-', errorMessage = '' } = {}) {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value || '-');
    };
    setText('detClienteId', customerId);
    setText('detClienteEmpresa', companyName);
    setText('detClienteContacto', contactName);

    const alertEl = document.getElementById('alertDetalleCliente');
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
        const customers = await customerModel.getAll();
        const lblTotal = document.getElementById('lblTotalClientes');
        if (lblTotal) lblTotal.textContent = String(customers.length);

        if (tabla) {
            tabla.clear().rows.add(customers).draw();
        } else if (customers.length === 0) {
            setTableStatusMessage('No se encontraron clientes.');
        }
    } catch (err) {
        const lblTotal = document.getElementById('lblTotalClientes');
        if (lblTotal) lblTotal.textContent = '0';

        if (tabla) tabla.clear().draw();
        else setTableStatusMessage('No se pudieron cargar los clientes.');

        showCustomersAlert(extractProblemMessage(err, 'No se pudieron cargar los clientes.'), true);
    }
}

async function verDetalleCliente(customerId) {
    const validation = validateCustomerId(customerId);
    if (!validation.valid) {
        showCustomersAlert(validation.error, true);
        return;
    }

    showModal(document.getElementById('modalDetalleCliente'));
    setDetailModalState({
        customerId: validation.value,
        companyName: 'Cargando...',
        contactName: 'Cargando...'
    });

    try {
        const customer = await customerModel.getById(validation.value);
        setDetailModalState({
            customerId: customer?.customerId || validation.value,
            companyName: customer?.companyName || 'Sin empresa',
            contactName: customer?.contactName || 'Sin contacto registrado'
        });
    } catch (err) {
        setDetailModalState({
            customerId: validation.value,
            errorMessage: extractProblemMessage(err, 'No se pudo cargar el detalle del cliente.')
        });
    }
}

function configurarEventos() {
    const tablaEl = document.getElementById('tablaClientes');
    if (tablaEl && tablaEl.dataset.customersBound !== 'true') {
        tablaEl.dataset.customersBound = 'true';
        tablaEl.addEventListener('click', async (e) => {
            const btn = e?.target?.closest?.('button[data-action="ver"]');
            if (btn?.dataset.id) {
                await verDetalleCliente(btn.dataset.id);
            }
        });
    }

    bindModalDismiss(document.getElementById('modalDetalleCliente'), () => setDetailModalState());
}

async function initCustomersController() {
    const usuario = await initAuthenticatedView({ authModel, requiredPermission: REQUIRED_PERMISSION });
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
            !authModel.isAuthenticated() ||
            !authModel.hasPermission(REQUIRED_PERMISSION)
        ) {
            return;
        }
        await initCustomersController();
    });
}
