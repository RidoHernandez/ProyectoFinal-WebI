import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { formatCurrency, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

let productos = [];

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = await authService.checkSession();
    if (!usuario) {
        window.location.href = './login.html';
        return;
    }
    initNavbar(usuario, authService);

    await cargarCatalogo();
});

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

function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedorCatalogo');
    if (!contenedor) return;

    if (lista.length === 0) {
        contenedor.innerHTML = '<div class="col-12"><div class="alert alert-info">No hay productos disponibles.</div></div>';
        return;
    }

    contenedor.innerHTML = lista.map(p => `
        <div class="col">
            <div class="card h-100 shadow-sm border-0">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title fw-bold text-dark">${escapeHtml(p.productName)}</h5>
                    <p class="card-text text-primary fs-5 fw-semibold mb-2">
                        ${formatCurrency(p.unitPrice)}
                    </p>
                    <div class="mt-auto">
                        <span class="badge ${p.unitsInStock > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">
                            ${p.unitsInStock > 0 ? `Stock: ${escapeHtml(p.unitsInStock)}` : 'Agotado'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}
