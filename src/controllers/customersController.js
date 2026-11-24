// Customers Controller
import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { customerService } from "../services/customerService.js";
import { baseTableOptions, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

// Primera instrucción ejecutable: protección de rutas (ADMIN, EMPLEADO)
authGuard(['ADMIN', 'EMPLEADO']);

let customersCache = [];
let tabla = null;

// Helper for DataTables display rendering
const display = (fn) => (data, type, row) => (type === 'display' ? fn(data, row) : data);

/** Initialize DataTable with base options */
function inicializarTabla() {
    if (typeof DataTable === 'undefined') return;
    tabla = new DataTable('#tablaClientes', baseTableOptions({
        order: [[0, 'asc']],
        responsive: true,
        columnDefs: [{ targets: -1, orderable: false, searchable: false }],
        columns: [
            { data: 'customerId', render: display(d => `<strong>${escapeHtml(d)}</strong>`) },
            { data: 'companyName', render: display(d => escapeHtml(d)) },
            { data: 'contactName', render: display(d => escapeHtml(d || 'Sin contacto')) },
            {
                data: null,
                className: 'text-center text-nowrap',
                render: (_, __, row) => `
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row.customerId)}">Ver Detalle</button>
                `
            }
        ]
    }));

    // Delegated click handler for "Ver Detalle"
    $('#tablaClientes tbody').on('click', 'button[data-action="ver"]', async function () {
        const id = $(this).data('id');
        await verDetalleCliente(id);
    });
}

/** Listar todos los clientes y rellenar la tabla */
export async function listarClientes() {
    if (!tabla) return;
    try {
        customersCache = await customerService.getCustomers();
        tabla.clear().rows.add(Array.isArray(customersCache) ? customersCache : []).draw();
        actualizarContador();
    } catch (err) {
        console.warn('Aviso al listar clientes:', err.message);
        tabla.clear().draw();
        actualizarContador();
    }
}

/** Actualiza el label con el total de clientes */
function actualizarContador() {
    const lbl = document.getElementById('lblTotalClientes');
    if (lbl) lbl.textContent = (customersCache && customersCache.length) || 0;
}

/** Mostrar detalle de un cliente en modal */
export async function verDetalleCliente(id) {
    let cliente = customersCache.find(c => c.customerId === id);
    if (!cliente) {
        try {
            cliente = await customerService.getById(id);
        } catch (e) {
            console.warn('Error al obtener detalle del cliente:', e.message);
            return;
        }
    }
    // Populate modal fields (safe textContent)
    const modalEl = document.getElementById('modalDetalleCliente');
    if (!modalEl) return;
    document.getElementById('detClienteId').textContent = cliente.customerId;
    document.getElementById('detClienteEmpresa').textContent = cliente.companyName;
    document.getElementById('detClienteContacto').textContent = cliente.contactName || '-';
    // Estado estático (solo lectura)
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

/** Filtrar clientes por término (uso interno y tests) */
export function filtrarClientes(lista, termino) {
    if (!termino) return lista;
    const t = termino.toString().trim().toLowerCase();
    return lista.filter(c =>
        (c.customerId && c.customerId.toLowerCase().includes(t)) ||
        (c.companyName && c.companyName.toLowerCase().includes(t)) ||
        (c.contactName && c.contactName.toLowerCase().includes(t))
    );
}

/** Render fallback table when DataTables no está disponible (tests) */
export function renderizarTablaClientesFallback(lista, doc = document) {
    const tbody = doc.getElementById('tbodyClientes');
    if (!tbody) return;
    tbody.innerHTML = '';
    (Array.isArray(lista) ? lista : []).forEach(row => {
        const tr = doc.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(row.customerId)}</strong></td>
            <td>${escapeHtml(row.companyName)}</td>
            <td>${escapeHtml(row.contactName || 'Sin contacto')}</td>
            <td class="text-center text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row.customerId)}">Ver Detalle</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    // Re‑attach click handler for fallback rows
    tbody.querySelectorAll('button[data-action="ver"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            await verDetalleCliente(id);
        });
    });
    actualizarContador();
}

/** Cache helpers */
export function setCustomersCache(lista) { customersCache = lista; }
export function getCustomersCache() { return customersCache; }

/** Init controller – called on DOMContentLoaded */
export async function initCustomersController(doc = document) {
    const usuario = (typeof authService.getCurrentUser === 'function' && authService.getCurrentUser()) || await authService.checkSession();
    if (!usuario) {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = './login.html';
        }
        return;
    }
    initNavbar(usuario, authService);
    inicializarTabla();
    await listarClientes();
    // Search bar handling
    const txtBuscar = doc.getElementById('txtBuscarCliente');
    const btnLimpiar = doc.getElementById('btnLimpiarBusquedaCliente');
    if (txtBuscar) {
        txtBuscar.addEventListener('input', () => {
            const term = txtBuscar.value;
            const filtered = filtrarClientes(customersCache, term);
            renderizarTablaClientesFallback(filtered, doc);
        });
    }
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (txtBuscar) txtBuscar.value = '';
            renderizarTablaClientesFallback(customersCache, doc);
        });
    }
}

// Auto‑ejecución cuando el script se carga en el navegador
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => initCustomersController());
}
