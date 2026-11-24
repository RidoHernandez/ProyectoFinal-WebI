import { authGuard } from "../utils/authGuard.js";
import { authService } from "../services/authService.js";
import { productService } from "../services/productService.js";
import { ProductModel } from "../models/productModel.js";
import { baseTableOptions, escapeHtml, initNavbar, resolveConnectedRole } from "../utils/tableHelpers.js";

// Guardia de navegación síncrona como primera instrucción ejecutable (TASK-F2-04)
authGuard(['ADMIN', 'EMPLEADO']);

let productosCache = [];
let modalInstancia = null;
let tabla = null;
let rolActual = 'EMPLEADO';

// Renderiza sólo en modo 'display'; para ordenar/buscar se usa el valor crudo
const display = (fn) => (data, type, row) => type === 'display' ? fn(data, row) : data;

// Genera los botones de acción de cada fila según el rol (ADMIN: Editar y Eliminar; EMPLEADO: solo Editar)
export function renderAccionesProducto(row, rol = rolActual) {
    const idSeguro = escapeHtml(row?.productId);
    const esAdmin = String(rol || '').toUpperCase() === 'ADMIN';
    const btnEditar = `<button type="button" class="btn btn-sm btn-outline-primary${esAdmin ? ' me-1' : ''}" data-action="editar" data-id="${idSeguro}">Editar</button>`;
    const btnEliminar = esAdmin
        ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" data-id="${idSeguro}">Eliminar</button>`
        : '';
    return `${btnEditar}${btnEliminar}`;
}

// Adapta dinámicamente los controles de la vista de productos según el rol conectado (TASK-F2-06 / REQ-AUTH-002)
export function aplicarPermisosRolProductos(rol = rolActual) {
    rolActual = String(rol || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'EMPLEADO';
    const esAdmin = rolActual === 'ADMIN';

    if (typeof document === 'undefined') return;

    const btnNuevo = document.getElementById('btnNuevoProducto');
    if (btnNuevo) {
        if (esAdmin) {
            btnNuevo.classList?.remove('d-none');
            btnNuevo.hidden = false;
            if (btnNuevo.style) btnNuevo.style.display = '';
        } else {
            btnNuevo.classList?.add('d-none');
            btnNuevo.hidden = true;
            if (btnNuevo.style) btnNuevo.style.display = 'none';
        }
    }

    if (typeof document.querySelectorAll === 'function') {
        const botonesEliminar = document.querySelectorAll('button[data-action="eliminar"]');
        for (const btn of botonesEliminar) {
            if (esAdmin) {
                btn.classList?.remove('d-none');
                btn.hidden = false;
                if (btn.style) btn.style.display = '';
            } else {
                btn.classList?.add('d-none');
                btn.hidden = true;
                if (btn.style) btn.style.display = 'none';
            }
        }
    }
}

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

        rolActual = resolveConnectedRole(usuario, authService);
        initNavbar(usuario, authService);
        aplicarPermisosRolProductos(rolActual);

        const modalEl = document.getElementById('modalProducto');
        if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            modalInstancia = new bootstrap.Modal(modalEl);
        }

        inicializarTabla();
        configurarEventos();

        await listarProductos();
    });
}

function inicializarTabla() {
    if (typeof DataTable === 'undefined') return;
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
              render: (_, __, row) => renderAccionesProducto(row, rolActual) }
        ]
    }));
}

async function listarProductos() {
    if (!tabla) return;
    try {
        productosCache = await productService.getProducts();
        tabla.clear().rows.add(Array.isArray(productosCache) ? productosCache : []).draw();
        aplicarPermisosRolProductos(rolActual);
    } catch (err) {
        tabla.clear().draw();
        if (typeof alert === 'function') {
            alert('Error al listar productos: ' + err.message);
        }
    }
}

function configurarEventos() {
    const form = document.getElementById('formProducto');
    const btnNuevo = document.getElementById('btnNuevoProducto');

    if (btnNuevo && form) {
        btnNuevo.addEventListener('click', () => {
            if (rolActual !== 'ADMIN') return;
            form.reset();
            form.classList.remove('was-validated');
            document.getElementById('prodId').value = '';
            document.getElementById('modalTitulo').textContent = 'Nuevo Producto';
            modalInstancia?.show();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!form.checkValidity() || document.getElementById('prodName').value.trim() === '') {
                form.classList.add('was-validated');
                return;
            }

            const btnGuardar = document.getElementById('btnGuardar');
            const id = document.getElementById('prodId').value;
            const esEdicion = Boolean(id);

            if (!esEdicion && rolActual !== 'ADMIN') {
                if (typeof alert === 'function') {
                    alert('Operación no permitida: Solo un Administrador puede crear nuevos productos.');
                }
                return;
            }

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

                modalInstancia?.hide();
                await listarProductos();
                if (typeof alert === 'function') {
                    alert(esEdicion ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');
                }
            } catch (err) {
                if (typeof alert === 'function') {
                    alert('Error al guardar: ' + err.message);
                }
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.textContent = 'Guardar';
            }
        });
    }

    const tablaEl = document.getElementById('tablaProductos');
    if (tablaEl) {
        tablaEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            if (btn.dataset.action === 'editar') editarProducto(id);
            if (btn.dataset.action === 'eliminar' && rolActual === 'ADMIN') eliminarProducto(id, btn);
        });
    }
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
    modalInstancia?.show();
}

async function eliminarProducto(id, btnElement = null) {
    if (rolActual !== 'ADMIN') return;

    const confirmar = typeof confirm === 'function'
        ? confirm(`¿Estás seguro de eliminar el producto #${id}?`)
        : true;
    if (!confirmar) return;

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
    }

    try {
        const resp = await productService.deleteProduct(id);
        if (!resp.ok) {
            let msg = `No se pudo eliminar (HTTP ${resp.status})`;
            if (resp.data && resp.data.detail) msg = resp.data.detail;
            throw new Error(msg);
        }
        await listarProductos();
        if (typeof alert === 'function') {
            alert('Producto eliminado exitosamente');
        }
    } catch (err) {
        if (typeof alert === 'function') {
            alert(err.message);
        }
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.textContent = 'Eliminar';
        }
    }
}
