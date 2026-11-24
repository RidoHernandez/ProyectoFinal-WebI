import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { formatCurrency, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04)
authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);

let productos = [];

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
        configurarFiltrosCatalogo();

        await cargarCatalogo();
    });
}

function configurarFiltrosCatalogo() {
    const txtBuscar = document.getElementById('txtBuscarCatalogo');
    const txtPrecioMax = document.getElementById('txtPrecioMaxCatalogo');
    const chkSoloDisponibles = document.getElementById('chkSoloDisponibles');

    const aplicarFiltros = () => {
        const termino = (txtBuscar?.value || '').trim().toLowerCase();
        const precioMax = txtPrecioMax?.value ? parseFloat(txtPrecioMax.value) : null;
        const soloStock = Boolean(chkSoloDisponibles?.checked);

        const filtrados = (Array.isArray(productos) ? productos : []).filter(p => {
            const nombre = String(p.productName || '').toLowerCase();
            const cumpleTexto = !termino || nombre.includes(termino);
            const precio = Number(p.unitPrice ?? 0);
            const cumplePrecio = precioMax === null || Number.isNaN(precioMax) || precio <= precioMax;
            const stock = Number(p.unitsInStock ?? 0);
            const cumpleStock = !soloStock || stock > 0;
            return cumpleTexto && cumplePrecio && cumpleStock;
        });

        renderizarTarjetas(filtrados);
    };

    txtBuscar?.addEventListener('input', aplicarFiltros);
    txtPrecioMax?.addEventListener('input', aplicarFiltros);
    chkSoloDisponibles?.addEventListener('change', aplicarFiltros);
}

async function cargarCatalogo() {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (!contenedor) return;

    try {
        productos = await productService.getProducts();
        renderizarTarjetas(Array.isArray(productos) ? productos : []);
    } catch (err) {
        console.warn("Aviso al cargar catálogo:", err.message);
        contenedor.innerHTML = '<div class="col-12"><div class="alert alert-warning">No se pudieron cargar los productos.</div></div>';
    }
}

export function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (!contenedor) return;

    const lblContador = document.getElementById('lblTotalCatalogo');
    if (lblContador) {
        lblContador.textContent = `${lista.length} producto(s)`;
    }

    if (lista.length === 0) {
        contenedor.innerHTML = '<div class="col-12"><div class="alert alert-info">No hay productos disponibles con los criterios seleccionados.</div></div>';
        return;
    }

    contenedor.innerHTML = lista.map(p => {
        const stock = Number(p.unitsInStock ?? 0);
        const disponible = stock > 0;
        return `
        <div class="col">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title fw-bold text-dark mb-0">${escapeHtml(p.productName)}</h5>
                        <span class="badge bg-light text-secondary border">#${escapeHtml(p.productId)}</span>
                    </div>
                    <p class="card-text text-primary fs-5 fw-semibold mb-3">
                        ${formatCurrency(p.unitPrice)}
                    </p>
                    <div class="mt-auto d-flex justify-content-between align-items-center">
                        <span class="badge ${disponible ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">
                            ${disponible ? `Stock disponible: ${escapeHtml(stock)}` : 'Agotado'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}
