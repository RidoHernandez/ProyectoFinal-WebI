import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { ProductModel } from "../models/productModel.js";
import { baseTableOptions, escapeHtml, initNavbar } from "../utils/tableHelpers.js";

let productosCache = [];
let modalInstancia = null;
let tabla = null;

// Renderiza sólo en modo 'display'; para ordenar/buscar se usa el valor crudo
const display = (fn) => (data, type, row) => type === 'display' ? fn(data, row) : data;

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = await authService.checkSession();
    if (!usuario) {
        window.location.href = './login.html';
        return;
    }
    initNavbar(usuario, authService);

    modalInstancia = new bootstrap.Modal(document.getElementById('modalProducto'));

    inicializarTabla();
    configurarEventos();

    await listarProductos();
});

function inicializarTabla() {
    tabla = new DataTable('#tablaProductos', baseTableOptions({
        order: [[0, 'asc']],
        columns: [
            { data: 'productId', render: display(d => `<strong>${escapeHtml(d)}</strong>`) },
            { data: 'productName', render: display(d => escapeHtml(d)) },
            { data: 'unitPrice', defaultContent: 0,
              render: display(d => `$${d != null ? parseFloat(d).toFixed(2) : '0.00'}`) },
            { data: 'unitsInStock', defaultContent: 0, render: display(d => escapeHtml(d ?? 0)) },
            { data: 'discontinued', defaultContent: false,
              render: (d, type) => {
                  const texto = d ? 'Descontinuado' : 'Activo';
                  if (type !== 'display') return texto;
                  return d
                      ? '<span class="badge bg-danger">Descontinuado</span>'
                      : '<span class="badge bg-success">Activo</span>';
              } },
            { data: null, orderable: false, searchable: false, className: 'text-center text-nowrap',
              render: (_, __, row) => `
                <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="editar" data-id="${escapeHtml(row.productId)}">Editar</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" data-id="${escapeHtml(row.productId)}">Eliminar</button>` }
        ]
    }));
}

async function listarProductos() {
    try {
        productosCache = await productService.getProducts();
        tabla.clear().rows.add(Array.isArray(productosCache) ? productosCache : []).draw();
    } catch (err) {
        tabla.clear().draw();
        alert('Error al listar productos: ' + err.message);
    }
}

function configurarEventos() {
    const form = document.getElementById('formProducto');

    document.getElementById('btnNuevoProducto').addEventListener('click', () => {
        form.reset();
        form.classList.remove('was-validated');
        document.getElementById('prodId').value = '';
        document.getElementById('modalTitulo').textContent = 'Nuevo Producto';
        modalInstancia.show();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validación nativa del formulario con estilos de Bootstrap
        if (!form.checkValidity() || document.getElementById('prodName').value.trim() === '') {
            form.classList.add('was-validated');
            return;
        }

        const btnGuardar = document.getElementById('btnGuardar');
        const id = document.getElementById('prodId').value;
        const esEdicion = Boolean(id);

        const payload = ProductModel.createPayload({
            productId: id,
            productName: document.getElementById('prodName').value,
            unitPrice: document.getElementById('prodPrice').value,
            unitsInStock: document.getElementById('prodStock').value,
            discontinued: document.getElementById('prodDiscontinued').checked
        });

        try {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Guardando...';

            const resp = esEdicion 
                ? await productService.updateProduct(id, payload)
                : await productService.createProduct(payload);

            if (!resp.ok) {
                const detalle = typeof resp.text === 'function' ? await resp.text() : resp.statusText;
                throw new Error(detalle || `HTTP ${resp.status}`);
            }

            modalInstancia.hide();
            await listarProductos();
            alert(esEdicion ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');
        } catch (err) {
            alert('Error al guardar: ' + err.message);
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar';
        }
    });

    document.getElementById('tablaProductos').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = parseInt(btn.dataset.id, 10);
        if (btn.dataset.action === 'editar') editarProducto(id);
        if (btn.dataset.action === 'eliminar') eliminarProducto(id, btn);
    });
}

function editarProducto(id) {
    const prod = productosCache.find(p => p.productId === id);
    if (!prod) return;

    const form = document.getElementById('formProducto');
    form.classList.remove('was-validated');

    document.getElementById('prodId').value = prod.productId;
    document.getElementById('prodName').value = prod.productName;
    document.getElementById('prodPrice').value = prod.unitPrice ?? '';
    document.getElementById('prodStock').value = prod.unitsInStock ?? 0;
    document.getElementById('prodDiscontinued').checked = Boolean(prod.discontinued);

    document.getElementById('modalTitulo').textContent = `Editar Producto #${prod.productId}`;
    modalInstancia.show();
}

async function eliminarProducto(id, btnElement = null) {
    const confirmar = confirm(`¿Estás seguro de eliminar el producto #${id}?`);
    if (!confirmar) return;

    // Desactivar botón y notificar proceso en curso para evitar clicks múltiples
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
    }

    try {
        // Enfoque 3: AJAX clásico (XMLHttpRequest)
        const resp = await productService.deleteProduct(id);
        if (!resp.ok) {
            let msg = `No se pudo eliminar (HTTP ${resp.status})`;
            if (resp.data && resp.data.detail) msg = resp.data.detail;
            throw new Error(msg);
        }
        await listarProductos();
        alert('Producto eliminado exitosamente');
    } catch (err) {
        alert(err.message);
    } finally {
        // Reactivación del botón al terminar (éxito o error)
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.textContent = 'Eliminar';
        }
    }
}
