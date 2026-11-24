import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { orderService } from "../services/orderService.js";
import { baseTableOptions, escapeHtml, formatCurrency, initNavbar } from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04)
authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);

let ordersCache = [];
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
        await listarPedidos();
    });
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') return;
    tabla = new DataTable('#tablaPedidos', baseTableOptions({
        order: [[0, 'desc']],
        columns: [
            { data: 'orderId', render: display(d => `<strong>#${escapeHtml(d)}</strong>`) },
            {
                data: 'orderDate',
                render: display(d => d ? new Date(d).toLocaleDateString() : 'N/A')
            },
            {
                data: 'requiredDate',
                render: display(d => d ? new Date(d).toLocaleDateString() : 'N/A')
            },
            {
                data: 'shippedDate',
                render: display(d => d ? new Date(d).toLocaleDateString() : '<span class="badge bg-warning text-dark">Pendiente</span>')
            },
            {
                data: 'freight',
                render: display(d => formatCurrency(d))
            },
            { data: 'shipName', render: display(d => escapeHtml(d || '-')) },
            { data: 'shipCity', render: display(d => escapeHtml(d || '-')) },
            { data: 'shipCountry', render: display(d => escapeHtml(d || '-')) },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center text-nowrap',
                render: (_, __, row) => `
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row.orderId)}">Ver</button>
                `
            }
        ]
    }));
}

async function listarPedidos() {
    if (!tabla) return;
    try {
        ordersCache = await orderService.getOrders();
        tabla.clear().rows.add(Array.isArray(ordersCache) ? ordersCache : []).draw();
    } catch (err) {
        console.warn("Aviso al listar pedidos:", err.message);
        tabla.clear().draw();
    }
}
