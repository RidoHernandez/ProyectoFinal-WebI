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
        responsive: true,
        columnDefs: [{ targets: -1, orderable: false, searchable: false }],
        columns: [
            { data: 'orderId', render: display(d => `<strong>#${escapeHtml(d)}</strong>`) },
            { data: 'orderDate', render: display(d => d ? new Date(d).toLocaleDateString() : 'N/A') },
            { data: 'requiredDate', render: display(d => d ? new Date(d).toLocaleDateString() : 'N/A') },
            { data: 'shippedDate', render: display(d => d ? new Date(d).toLocaleDateString() : '<span class="badge bg-warning text-dark">Pendiente</span>') },
            { data: 'freight', render: display(d => formatCurrency(d)) },
            { data: 'shipName', render: display(d => escapeHtml(d || '-')) },
            { data: 'shipCity', render: display(d => escapeHtml(d || '-')) },
            { data: 'shipCountry', render: display(d => escapeHtml(d || '-')) },
            {
                data: null,
                className: 'text-center text-nowrap',
                render: (_, __, row) => `
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="ver" data-id="${escapeHtml(row.orderId)}">Ver</button>
                `
            }
        ]
    }));
    // Delegated click handler for "Ver" button
    $('#tablaPedidos tbody').on('click', 'button[data-action="ver"]', async function () {
        const id = $(this).data('id');
        await verDetalleOrden(id);
    });
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

async async function listarPedidos() {
    if (!tabla) return;
    try {
        ordersCache = await orderService.getOrders();
        tabla.clear().rows.add(Array.isArray(ordersCache) ? ordersCache : []).draw();
        // Attach click handler for detail buttons
        tabla.off('click', 'button[data-action="ver"]');
        tabla.on('click', 'button[data-action="ver"]', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (!id) return;
            try {
                const detalle = await orderService.getOrderById(id);
                // Populate modal fields
                document.getElementById('detOrdenId').textContent = detalle.orderId || '';
                document.getElementById('detOrdenFecha').textContent = detalle.orderDate ? new Date(detalle.orderDate).toLocaleDateString() : '';
                document.getElementById('detOrdenRequerida').textContent = detalle.requiredDate ? new Date(detalle.requiredDate).toLocaleDateString() : '';
                document.getElementById('detOrdenEnvio').textContent = detalle.shippedDate ? new Date(detalle.shippedDate).toLocaleDateString() : 'Pendiente';
                document.getElementById('detOrdenFlete').textContent = detalle.freight != null ? `$${detalle.freight.toFixed(2)}` : '';
                document.getElementById('detOrdenDestinatario').textContent = detalle.shipName || '';
                document.getElementById('detOrdenDireccion').textContent = detalle.shipAddress || '';
                document.getElementById('detOrdenCiudad').textContent = detalle.shipCity || '';
                document.getElementById('detOrdenPais').textContent = detalle.shipCountry || '';
                // Update status badge
                const badge = document.getElementById('detOrdenEstatus');
                if (badge) {
                    const status = detalle.shippedDate ? 'Entregado' : 'Pendiente';
                    badge.textContent = status;
                    badge.className = `badge rounded-pill bg-${status === 'Entregado' ? 'success' : 'warning'} fs-6 mt-1`;
                }
                const modal = new bootstrap.Modal(document.getElementById('modalDetalleOrden'));
                modal.show();
            } catch (err) {
                console.warn('Error al obtener detalle de orden:', err.message);
            }
        });
    } catch (err) {
        console.warn("Aviso al listar pedidos:", err.message);
        tabla.clear().draw();
    }
}
    if (!tabla) return;
    try {
        ordersCache = await orderService.getOrders();
        tabla.clear().rows.add(Array.isArray(ordersCache) ? ordersCache : []).draw();
    } catch (err) {
        console.warn("Aviso al listar pedidos:", err.message);
        tabla.clear().draw();
    }
}
