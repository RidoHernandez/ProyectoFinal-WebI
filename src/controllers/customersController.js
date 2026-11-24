import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { customerService } from "../services/customerService.js";
import { baseTableOptions, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04)
authGuard(['ADMIN', 'EMPLEADO']);

let customersCache = [];
let tabla = null;

const display = (fn) => (data, type, row) => type === 'display' ? fn(data, row) : data;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        const usuario = (typeof authService.getCurrentUser === 'function' && authService.getCurrentUser())
            || await authService.checkSession();
        if (!usuario) {
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = './login.html';
            }
            return;
        }
        initNavbar(usuario, authService);

        inicializarTabla();
        await listarClientes();
    });
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') return;
    tabla = new DataTable('#tablaClientes', baseTableOptions({
        order: [[0, 'asc']],
        columns: [
            { data: 'customerId', render: display(d => `<strong>${escapeHtml(d)}</strong>`) },
            { data: 'companyName', render: display(d => escapeHtml(d)) },
            { data: 'contactName', render: display(d => escapeHtml(d || 'Sin contacto')) },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center text-nowrap',
                render: (_, __, row) => `
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row.customerId)}">Ver Detalle</button>
                `
            }
        ]
    }));
}

async function listarClientes() {
    if (!tabla) return;
    try {
        customersCache = await customerService.getCustomers();
        tabla.clear().rows.add(Array.isArray(customersCache) ? customersCache : []).draw();
    } catch (err) {
        console.warn("Aviso al listar clientes:", err.message);
        tabla.clear().draw();
    }
}
