import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

function createClassList(initial = []) {
    const set = new Set(initial);
    return {
        add(...tokens) {
            tokens.forEach((t) => t && set.add(t));
        },
        remove(...tokens) {
            tokens.forEach((t) => set.delete(t));
        },
        contains(token) {
            return set.has(token);
        },
        toggle(token, force) {
            if (force === true) {
                set.add(token);
                return true;
            }
            if (force === false) {
                set.delete(token);
                return false;
            }
            if (set.has(token)) {
                set.delete(token);
                return false;
            }
            set.add(token);
            return true;
        },
        toString() {
            return Array.from(set).join(' ');
        },
        _syncFromClassName(cls) {
            set.clear();
            String(cls || '')
                .split(/\s+/)
                .filter(Boolean)
                .forEach((c) => set.add(c));
        }
    };
}

class MockElement {
    constructor(tagName = 'div', id = '') {
        this.tagName = String(tagName).toUpperCase();
        this.id = id;
        this.value = '';
        this.textContent = '';
        this._innerHTML = '';
        this.disabled = false;
        this.readOnly = false;
        this.hidden = false;
        this.checked = false;
        this.style = { display: '' };
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.children = [];
        this.parentElement = null;
        this.onclick = null;
        this.classList = createClassList();
        if (id) {
            this.attributes.set('id', id);
        }
    }

    get className() {
        return this.classList.toString();
    }

    set className(val) {
        this.classList._syncFromClassName(val);
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(val) {
        this._innerHTML = String(val ?? '');
    }

    get firstChild() {
        return this.children[0] || null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
        if (name.startsWith('data-')) {
            const camel = name
                .slice(5)
                .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            this.dataset[camel] = String(value);
        }
    }

    getAttribute(name) {
        if (name === 'id') return this.id || null;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    appendChild(child) {
        if (child && typeof child === 'object') {
            child.parentElement = this;
            this.children.push(child);
        }
        return child;
    }

    insertBefore(newNode, referenceNode) {
        if (!newNode) return null;
        newNode.parentElement = this;
        const idx = this.children.indexOf(referenceNode);
        if (idx === -1) {
            this.children.push(newNode);
        } else {
            this.children.splice(idx, 0, newNode);
        }
        return newNode;
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(handler);
    }

    async dispatchEvent(type, eventInit = {}) {
        const handlers = this.listeners.get(type) || [];
        const evt = {
            type,
            target: this,
            preventDefault() {
                this.defaultPrevented = true;
            },
            ...eventInit
        };
        for (const h of handlers) {
            await h(evt);
        }
        return evt;
    }

    closest(selector) {
        if (selector.includes('button[data-action]')) {
            if (this.tagName === 'BUTTON' && (this.dataset?.action || this.getAttribute('data-action'))) {
                return this;
            }
        }
        if (selector.includes('.nav-item') || selector.includes('li')) {
            if (this.parentElement && (this.parentElement.tagName === 'LI' || this.parentElement.classList.contains('nav-item'))) {
                return this.parentElement;
            }
        }
        return this.parentElement;
    }

    reset() {
        this.children.forEach((child) => {
            if (typeof child.value === 'string') child.value = '';
            if (typeof child.checked === 'boolean') child.checked = false;
        });
    }
}

function createMockDocument() {
    const elementsById = new Map();
    const allElements = [];

    const doc = {
        body: new MockElement('body', 'body'),
        elementsById,
        allElements,
        registerElement(el) {
            allElements.push(el);
            if (el.id) {
                elementsById.set(el.id, el);
            }
            return el;
        },
        createElement(tag) {
            const el = new MockElement(tag);
            allElements.push(el);
            return new Proxy(el, {
                set(target, prop, value) {
                    target[prop] = value;
                    if (prop === 'id' && value) {
                        elementsById.set(String(value), target);
                    }
                    if (prop === 'innerHTML' && typeof value === 'string') {
                        const idRegex = /<([a-zA-Z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/g;
                        let match;
                        while ((match = idRegex.exec(value)) !== null) {
                            const [, childTag, childId] = match;
                            if (!elementsById.has(childId)) {
                                const childEl = new MockElement(childTag, childId);
                                elementsById.set(childId, childEl);
                                allElements.push(childEl);
                            }
                        }
                    }
                    return true;
                }
            });
        },
        createTextNode(text) {
            return { nodeType: 3, textContent: String(text) };
        },
        getElementById(id) {
            return elementsById.get(id) || null;
        },
        querySelector(sel) {
            if (sel === 'main') {
                return allElements.find((e) => e.tagName === 'MAIN') || doc.body;
            }
            if (sel.startsWith('#')) {
                return elementsById.get(sel.slice(1)) || null;
            }
            return null;
        },
        querySelectorAll(sel) {
            if (sel === 'a[href]') {
                return allElements.filter((e) => e.tagName === 'A' && e.getAttribute('href'));
            }
            if (sel === 'button[data-action="eliminar"]') {
                return allElements.filter(
                    (e) => e.tagName === 'BUTTON' && (e.dataset.action === 'eliminar' || e.getAttribute('data-action') === 'eliminar')
                );
            }
            if (sel === 'button[data-action="descontinuar"]') {
                return allElements.filter(
                    (e) => e.tagName === 'BUTTON' && (e.dataset.action === 'descontinuar' || e.getAttribute('data-action') === 'descontinuar')
                );
            }
            return [];
        },
        addEventListener() {}
    };

    doc.registerElement(doc.body);
    return doc;
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.window = {
    location: {
        pathname: '/src/views/productos.html',
        search: '',
        href: 'http://localhost:3000/src/views/productos.html'
    },
    confirm: () => true
};
globalThis.confirm = (...args) => globalThis.window.confirm(...args);
globalThis.document = createMockDocument();

const authMod = await import('../src/services/authService.js');
const guardMod = await import('../src/utils/authGuard.js');
const modelMod = await import('../src/models/productModel.js');
const serviceMod = await import('../src/services/productService.js');
const productsCtrl = await import('../src/controllers/productsController.js');
const catalogCtrl = await import('../src/controllers/catalogController.js');

const { authService } = authMod;
const { authGuard } = guardMod;
const { ProductModel, validateProduct, PRODUCT_CONSTRAINTS } = modelMod;
const { productService, clearDiscontinuedProductsCache } = serviceMod;

function resetEnvironment(pathname = '/src/views/productos.html', search = '') {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    clearDiscontinuedProductsCache();
    globalThis.document = createMockDocument();
    globalThis.window.location = {
        pathname,
        search,
        href: `http://localhost:3000${pathname}${search}`
    };
    globalThis.window.confirm = () => true;
}

function makeResponse({ status = 200, body = null, ok = status >= 200 && status < 300 }) {
    const textBody = body === null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    return {
        ok,
        status,
        statusText: String(status),
        clone() {
            return makeResponse({ status, body, ok });
        },
        async text() {
            return textBody;
        },
        async json() {
            return textBody ? JSON.parse(textBody) : null;
        }
    };
}

async function loginMockUser(username) {
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 1,
            username,
            apiKey: `ak_${username}_key`,
            expiresAt: futureExp
        }
    });
    const session = await authService.login(username, 'Password123!');
    globalThis.fetch = prevFetch;
    return session;
}

function registerProductosDomElements(doc) {
    const ids = [
        'lblUsuario', 'badgeRol', 'btnPerfilApiKey', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalProductos', 'btnNuevoProducto',
        'tablaProductos', 'tbodyProductos',
        'modalProducto', 'formProducto', 'modalTitulo', 'alertModalProducto',
        'prodId', 'prodName', 'prodPrice', 'prodStock', 'prodDiscontinued',
        'feedbackProdName', 'feedbackProdPrice', 'feedbackProdStock',
        'btnCancelarModalProducto', 'btnGuardar',
        'modalConflicto409', 'alertConflicto409', 'detalleConflicto409',
        'btnDescontinuarDesde409', 'btnCerrarConflicto409',
        'toastContainerProductos', 'toastProducto', 'toastProductoMensaje'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn') ? 'button' : (id.startsWith('form') ? 'form' : 'div');
        doc.registerElement(new MockElement(tag, id));
    }
    doc.getElementById('alertModalProducto').classList.add('d-none');
    doc.getElementById('modalConflicto409').classList.add('d-none');
    doc.getElementById('alertConflicto409').classList.add('d-none');
    doc.getElementById('toastProducto').classList.add('d-none');
}

function registerCatalogoDomElements(doc) {
    const ids = [
        'lblUsuario', 'badgeRol', 'btnPerfilApiKey', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalCatalogo',
        'txtBuscarCatalogo', 'txtPrecioMinCatalogo', 'txtPrecioMaxCatalogo',
        'chkSoloDisponibles', 'btnLimpiarFiltrosCatalogo',
        'contenedorCatalogo'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn') ? 'button' : (id.startsWith('txt') || id.startsWith('chk') ? 'input' : 'div');
        doc.registerElement(new MockElement(tag, id));
    }
}

test('TASK-F3-01: productService (getAll con ProductsSummaryDto, getById, create, update, delete y discontinue)', async () => {
    resetEnvironment('/src/views/productos.html');
    await loginMockUser('admin');

    const captured = [];

    // 1. getAll() consume GET /api/Products y maneja ProductsSummaryDto ({ totalProducts, products })
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        return makeResponse({
            status: 200,
            body: {
                totalProducts: 2,
                products: [
                    { ProductId: 1, ProductName: 'Chai', UnitPrice: 18.00, UnitsInStock: 39 },
                    { productId: 2, productName: 'Chang', unitPrice: 19.50, unitsInStock: 0 }
                ]
            }
        });
    };

    const products = await productService.getAll();
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products');
    assert.equal(captured.at(-1).options.method, 'GET');
    assert.equal(captured.at(-1).options.headers['X-API-KEY'], 'ak_admin_key');
    assert.equal(Array.isArray(products), true);
    assert.equal(products.length, 2);
    assert.equal(products.totalProducts, 2);
    assert.equal(productService.lastTotalProducts, 2);
    assert.deepEqual(products[0], {
        productId: 1,
        productName: 'Chai',
        unitPrice: 18,
        unitsInStock: 39,
        discontinued: false
    });
    assert.deepEqual(products[1], {
        productId: 2,
        productName: 'Chang',
        unitPrice: 19.5,
        unitsInStock: 0,
        discontinued: false
    });

    const summary = await productService.getSummary();
    assert.equal(summary.totalProducts, 2);
    assert.equal(summary.products.length, 2);

    // 2. getById(id) consume GET /api/Products/{id} y retorna ProductDto o lanza ApiError 404
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        return makeResponse({
            status: 200,
            body: { ProductId: 1, ProductName: 'Chai', UnitPrice: 18.00, UnitsInStock: 39 }
        });
    };

    const single = await productService.getById(1);
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products/1');
    assert.equal(captured.at(-1).options.method, 'GET');
    assert.equal(single.productId, 1);
    assert.equal(single.productName, 'Chai');

    globalThis.fetch = async () => makeResponse({
        status: 404,
        body: { status: 404, title: 'Not Found', detail: 'Producto no encontrado.' }
    });
    await assert.rejects(
        () => productService.getById(999),
        (err) => err.status === 404 && err.problemDetails?.status === 404
    );

    // 3. create(data) envía POST /api/Products con ProductUpsertDto
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        const sent = JSON.parse(options.body);
        return makeResponse({
            status: 201,
            body: {
                productId: 78,
                productName: sent.productName,
                unitPrice: sent.unitPrice,
                unitsInStock: sent.unitsInStock
            }
        });
    };

    const created = await productService.create({
        productName: '  Café Orgánico  ',
        unitPrice: '25.50',
        unitsInStock: '120',
        discontinued: false
    });
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products');
    assert.equal(captured.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(captured.at(-1).options.body), {
        productName: 'Café Orgánico',
        unitPrice: 25.5,
        unitsInStock: 120,
        discontinued: false
    });
    assert.equal(created.productId, 78);
    assert.equal(created.productName, 'Café Orgánico');
    assert.equal(created.status, 201);

    // 4. update(id, data) envía PUT /api/Products/{id} con ProductUpsertDto
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        return makeResponse({ status: 204, body: null });
    };

    const updated = await productService.update(78, {
        productName: 'Café Orgánico Gourmet',
        unitPrice: 28.00,
        unitsInStock: 100,
        discontinued: false
    });
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products/78');
    assert.equal(captured.at(-1).options.method, 'PUT');
    assert.equal(updated.ok, true);
    assert.equal(updated.status, 204);
    assert.equal(updated.productName, 'Café Orgánico Gourmet');

    // 5. discontinue(id, currentData) invoca update(id, { ...currentData, discontinued: true })
    const discontinuedRes = await productService.discontinue(78, {
        productName: 'Café Orgánico Gourmet',
        unitPrice: 28.00,
        unitsInStock: 100,
        discontinued: false
    });
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products/78');
    assert.equal(captured.at(-1).options.method, 'PUT');
    assert.equal(JSON.parse(captured.at(-1).options.body).discontinued, true);
    assert.equal(discontinuedRes.discontinued, true);
    assert.equal(productService.isDiscontinued(78), true);

    // Al volver a consultar getById(78), preserva la bandera discontinued = true en la sesión
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { ProductId: 78, ProductName: 'Café Orgánico Gourmet', UnitPrice: 28.00, UnitsInStock: 100 }
    });
    const afterDisc = await productService.getById(78);
    assert.equal(afterDisc.discontinued, true);

    // 6. delete(id) envía DELETE /api/Products/{id} y propaga ApiError 409 en conflicto
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        return makeResponse({ status: 204, body: null });
    };
    const delOk = await productService.delete(78);
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/Products/78');
    assert.equal(captured.at(-1).options.method, 'DELETE');
    assert.equal(delOk.ok, true);
    assert.equal(delOk.status, 204);

    globalThis.fetch = async () => makeResponse({
        status: 409,
        body: {
            status: 409,
            title: 'Conflicto de integridad referencial',
            detail: 'El producto tiene ordenes asociadas.'
        }
    });
    await assert.rejects(
        () => productService.delete(1),
        (err) => err.status === 409 && err.problemDetails?.status === 409
    );
});

test('TASK-F3-02: ProductModel y validateProduct(dto) validando cotas exactas del backend y duplicados', () => {
    assert.deepEqual(PRODUCT_CONSTRAINTS, {
        NAME_MIN_LENGTH: 2,
        NAME_MAX_LENGTH: 40,
        PRICE_MIN: 0.01,
        PRICE_MAX: 100000.00,
        STOCK_MIN: 0,
        STOCK_MAX: 32767
    });

    // Producto válido en límites exactos inferiores y superiores
    const validMin = validateProduct({
        productName: 'Te',
        unitPrice: 0.01,
        unitsInStock: 0,
        discontinued: false
    });
    assert.equal(Array.isArray(validMin), true);
    assert.equal(validMin.length, 0);
    assert.equal(validMin.valid, true);

    const validMax = ProductModel.validateProduct({
        ProductName: 'A'.repeat(40),
        UnitPrice: 100000.00,
        UnitsInStock: 32767,
        Discontinued: true
    });
    assert.equal(validMax.length, 0);
    assert.equal(validMax.valid, true);

    // Violaciones de ProductName (vacío, < 2 chars, > 40 chars)
    const errEmptyName = validateProduct({ productName: '   ', unitPrice: 10, unitsInStock: 5 });
    assert.equal(errEmptyName.valid, false);
    assert.ok(errEmptyName.fieldErrors.productName);

    const errShortName = validateProduct({ productName: 'A', unitPrice: 10, unitsInStock: 5 });
    assert.equal(errShortName.valid, false);
    assert.ok(errShortName.fieldErrors.productName);

    const errLongName = validateProduct({ productName: 'X'.repeat(41), unitPrice: 10, unitsInStock: 5 });
    assert.equal(errLongName.valid, false);
    assert.ok(errLongName.fieldErrors.productName);

    // Prevención de nombres duplicados (REQ-BIZ-002)
    const existingProducts = [
        { productId: 1, productName: 'Chai Imperial' },
        { productId: 2, productName: 'Aniseed Syrup' }
    ];
    const errDup = validateProduct(
        { productName: '  chai imperial ', unitPrice: 15, unitsInStock: 10 },
        { existingProducts }
    );
    assert.equal(errDup.valid, false);
    assert.ok(errDup.fieldErrors.productName);

    // En edición del mismo producto (excludeProductId = 1), permite conservar su propio nombre
    const okSelfEdit = validateProduct(
        { productName: 'Chai Imperial', unitPrice: 15, unitsInStock: 10 },
        { existingProducts, excludeProductId: 1 }
    );
    assert.equal(okSelfEdit.valid, true);

    // Violaciones de UnitPrice (< 0.01, > 100000.00, NaN)
    const errZeroPrice = validateProduct({ productName: 'Cafe', unitPrice: 0, unitsInStock: 5 });
    assert.equal(errZeroPrice.valid, false);
    assert.ok(errZeroPrice.fieldErrors.unitPrice);

    const errHighPrice = validateProduct({ productName: 'Cafe', unitPrice: 100000.01, unitsInStock: 5 });
    assert.equal(errHighPrice.valid, false);
    assert.ok(errHighPrice.fieldErrors.unitPrice);

    const errNanPrice = validateProduct({ productName: 'Cafe', unitPrice: 'abc', unitsInStock: 5 });
    assert.equal(errNanPrice.valid, false);
    assert.ok(errNanPrice.fieldErrors.unitPrice);

    // Violaciones de UnitsInStock (negativo, decimal, > 32767)
    const errNegStock = validateProduct({ productName: 'Cafe', unitPrice: 10, unitsInStock: -1 });
    assert.equal(errNegStock.valid, false);
    assert.ok(errNegStock.fieldErrors.unitsInStock);

    const errDecStock = validateProduct({ productName: 'Cafe', unitPrice: 10, unitsInStock: 4.5 });
    assert.equal(errDecStock.valid, false);
    assert.ok(errDecStock.fieldErrors.unitsInStock);

    const errMaxStock = validateProduct({ productName: 'Cafe', unitPrice: 10, unitsInStock: 32768 });
    assert.equal(errMaxStock.valid, false);
    assert.ok(errMaxStock.fieldErrors.unitsInStock);

    // Violación de Discontinued (no booleano)
    const errDisc = validateProduct({ productName: 'Cafe', unitPrice: 10, unitsInStock: 5, discontinued: 'si' });
    assert.equal(errDisc.valid, false);
    assert.ok(errDisc.fieldErrors.discontinued);
});

test('TASK-F3-03: Vista administrativa de productos (authGuard, permisos ADMIN vs EMPLEADO y restriccion de edicion)', async () => {
    // 1. Bloqueo directo a CLIENTE con authGuard(['ADMIN', 'EMPLEADO'])
    resetEnvironment('/src/views/productos.html');
    await loginMockUser('cliente_juan');
    const guardClient = authGuard(['ADMIN', 'EMPLEADO']);
    assert.equal(guardClient, false);
    assert.equal(globalThis.window.location.href, './catalogo.html?error=403');

    // 2. Permisos para ADMIN: botones de creación, edición, descontinuación y eliminación visibles
    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;
    registerProductosDomElements(doc);
    await loginMockUser('admin');

    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            totalProducts: 2,
            products: [
                { productId: 10, productName: 'Ikura', unitPrice: 31.00, unitsInStock: 31 },
                { productId: 11, productName: 'Queso Cabrales', unitPrice: 21.00, unitsInStock: 22 }
            ]
        }
    });

    await productsCtrl.initProductsController(doc);

    assert.equal(doc.getElementById('btnNuevoProducto').hidden, false);
    assert.equal(doc.getElementById('btnNuevoProducto').classList.contains('d-none'), false);

    const adminActionsHtml = productsCtrl.renderAccionesProducto(
        { productId: 10, productName: 'Ikura', unitPrice: 31, unitsInStock: 31, discontinued: false },
        'ADMIN'
    );
    assert.ok(adminActionsHtml.includes('data-action="editar"'));
    assert.ok(adminActionsHtml.includes('data-action="descontinuar"'));
    assert.ok(adminActionsHtml.includes('data-action="eliminar"'));

    // Al abrir modal de edición como ADMIN, todos los campos están habilitados
    productsCtrl.editarProducto(10);
    assert.equal(doc.getElementById('prodName').disabled, false);
    assert.equal(doc.getElementById('prodPrice').disabled, false);
    assert.equal(doc.getElementById('prodStock').disabled, false);
    assert.equal(doc.getElementById('prodDiscontinued').disabled, false);

    // 3. Permisos para EMPLEADO: ocultar botón de creación, descontinuación y eliminación;
    // permitir únicamente edición de precio y existencias
    resetEnvironment('/src/views/productos.html');
    const empDoc = globalThis.document;
    registerProductosDomElements(empDoc);
    await loginMockUser('emp_operador');

    const capturedPut = [];
    globalThis.fetch = async (url, options) => {
        if (options?.method === 'PUT') {
            capturedPut.push({ url, body: JSON.parse(options.body) });
            return makeResponse({ status: 204, body: null });
        }
        return makeResponse({
            status: 200,
            body: {
                totalProducts: 1,
                products: [
                    { productId: 10, productName: 'Ikura', unitPrice: 31.00, unitsInStock: 31 }
                ]
            }
        });
    };

    await productsCtrl.initProductsController(empDoc);

    // Botón "+ Nuevo Producto" oculto para EMPLEADO
    assert.equal(empDoc.getElementById('btnNuevoProducto').hidden, true);
    assert.equal(empDoc.getElementById('btnNuevoProducto').classList.contains('d-none'), true);

    // Acciones de fila para EMPLEADO solo incluyen Editar (sin Eliminar ni Descontinuar)
    const empActionsHtml = productsCtrl.renderAccionesProducto(
        { productId: 10, productName: 'Ikura', unitPrice: 31, unitsInStock: 31, discontinued: false },
        'EMPLEADO'
    );
    assert.ok(empActionsHtml.includes('data-action="editar"'));
    assert.equal(empActionsHtml.includes('data-action="eliminar"'), false);
    assert.equal(empActionsHtml.includes('data-action="descontinuar"'), false);

    // En modal de edición, EMPLEADO tiene bloqueados #prodName y #prodDiscontinued, pero habilitados #prodPrice y #prodStock
    productsCtrl.editarProducto(10);
    assert.equal(empDoc.getElementById('prodName').disabled, true);
    assert.equal(empDoc.getElementById('prodName').readOnly, true);
    assert.equal(empDoc.getElementById('prodDiscontinued').disabled, true);
    assert.equal(empDoc.getElementById('prodPrice').disabled, false);
    assert.equal(empDoc.getElementById('prodStock').disabled, false);

    // Aunque se intente alterar #prodName en el DOM, guardarProductoModal preserva el nombre original para EMPLEADO
    empDoc.getElementById('prodName').value = 'Nombre Manipulado';
    empDoc.getElementById('prodPrice').value = '35.50';
    empDoc.getElementById('prodStock').value = '45';

    const saveEmpRes = await productsCtrl.guardarProductoModal();
    assert.equal(saveEmpRes.ok, true);
    assert.equal(saveEmpRes.status, 204);
    assert.equal(capturedPut.length, 1);
    assert.deepEqual(capturedPut[0].body, {
        productId: 10,
        productName: 'Ikura',
        unitPrice: 35.5,
        unitsInStock: 45,
        discontinued: false
    });

    // EMPLEADO tampoco puede eliminar ni descontinuar por invocación directa
    const empDel = await productsCtrl.manejarEliminacionProducto(10);
    assert.equal(empDel.ok, false);
    assert.equal(empDel.status, 403);
});

test('TASK-F3-04: Formulario modal unificado (atributos HTML5, limpieza de validaciones, prevencion de duplicados y Toast 201/204)', async () => {
    // 1. Verificar atributos HTML5 en src/views/productos.html reflejando ProductUpsertDto
    const productosHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/productos.html'), 'utf8');
    assert.match(productosHtml, /id="prodName"[^>]*minlength="2"[^>]*maxlength="40"[^>]*required/);
    assert.match(productosHtml, /id="prodPrice"[^>]*min="0\.01"[^>]*max="100000"[^>]*step="0\.01"[^>]*required/);
    assert.match(productosHtml, /id="prodStock"[^>]*min="0"[^>]*max="32767"[^>]*step="1"[^>]*required/);
    assert.match(productosHtml, /<input[^>]*type="checkbox"[^>]*id="prodDiscontinued"/);

    // 2. Flujo de creación (201 Created), prevención de duplicados, edición (204 NoContent) y limpieza al cerrar modal
    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;
    registerProductosDomElements(doc);
    await loginMockUser('admin');

    let serverProducts = [
        { productId: 1, productName: 'Chai', unitPrice: 18.00, unitsInStock: 39 }
    ];

    globalThis.fetch = async (url, options) => {
        if (!options || options.method === 'GET') {
            return makeResponse({
                status: 200,
                body: { totalProducts: serverProducts.length, products: serverProducts }
            });
        }
        if (options.method === 'POST') {
            const body = JSON.parse(options.body);
            const created = { productId: 2, ...body };
            serverProducts.push(created);
            return makeResponse({ status: 201, body: created });
        }
        if (options.method === 'PUT') {
            const body = JSON.parse(options.body);
            serverProducts = serverProducts.map((p) => (p.productId === body.productId ? { ...p, ...body } : p));
            return makeResponse({ status: 204, body: null });
        }
        return makeResponse({ status: 200, body: {} });
    };

    await productsCtrl.initProductsController(doc);

    // Abrir modal en modo Crear
    productsCtrl.abrirModalNuevoProducto();
    assert.equal(doc.getElementById('modalTitulo').textContent, 'Nuevo Producto');
    assert.equal(doc.getElementById('prodId').value, '');

    // Intentar crear producto con nombre duplicado ("Chai") -> bloqueado en cliente
    doc.getElementById('prodName').value = 'chai';
    doc.getElementById('prodPrice').value = '20.00';
    doc.getElementById('prodStock').value = '15';

    const dupRes = await productsCtrl.guardarProductoModal();
    assert.equal(dupRes.ok, false);
    assert.equal(doc.getElementById('prodName').classList.contains('is-invalid'), true);
    assert.equal(doc.getElementById('alertModalProducto').hidden, false);

    // Al cerrar el modal (evento hidden.bs.modal), se limpian automáticamente las validaciones
    await doc.getElementById('modalProducto').dispatchEvent('hidden.bs.modal');
    assert.equal(doc.getElementById('prodName').classList.contains('is-invalid'), false);
    assert.equal(doc.getElementById('formProducto').classList.contains('was-validated'), false);
    assert.equal(doc.getElementById('alertModalProducto').hidden, true);

    // Crear producto válido -> 201 Created, muestra Toast y recarga tabla
    doc.getElementById('prodName').value = 'Matcha Premium';
    doc.getElementById('prodPrice').value = '42.50';
    doc.getElementById('prodStock').value = '80';

    const createRes = await productsCtrl.guardarProductoModal();
    assert.equal(createRes.ok, true);
    assert.equal(createRes.status, 201);
    assert.equal(doc.getElementById('lblTotalProductos').textContent, '2');
    assert.ok(doc.getElementById('toastProductoMensaje').textContent.includes('creado exitosamente'));

    // Abrir modal en modo Editar -> 204 NoContent, muestra Toast y recarga tabla
    productsCtrl.editarProducto(2);
    assert.equal(doc.getElementById('modalTitulo').textContent, 'Editar Producto #2');
    doc.getElementById('prodPrice').value = '45.00';
    doc.getElementById('prodStock').value = '90';

    const editRes = await productsCtrl.guardarProductoModal();
    assert.equal(editRes.ok, true);
    assert.equal(editRes.status, 204);
    assert.ok(doc.getElementById('toastProductoMensaje').textContent.includes('actualizado exitosamente'));
    assert.equal(productsCtrl.getProductosCache().find((p) => p.productId === 2).unitPrice, 45);
});

test('TASK-F3-05: Politica de descontinuacion y manejo de error HTTP 409 Conflict con accion rapida', async () => {
    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;
    registerProductosDomElements(doc);
    await loginMockUser('admin');

    const requests = [];
    const serverProducts = [
        { productId: 5, productName: 'Chef Anton Gumbo Mix', unitPrice: 21.35, unitsInStock: 0 }
    ];

    globalThis.fetch = async (url, options = {}) => {
        requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });

        if (options.method === 'DELETE') {
            return makeResponse({
                status: 409,
                body: {
                    type: 'https://tools.ietf.org/html/rfc7807',
                    title: 'Conflicto de integridad referencial',
                    status: 409,
                    detail: 'No se puede eliminar el producto porque existen detalles de ordenes vinculados.'
                }
            });
        }
        if (options.method === 'PUT') {
            return makeResponse({ status: 204, body: null });
        }
        return makeResponse({
            status: 200,
            body: { totalProducts: serverProducts.length, products: serverProducts }
        });
    };

    await productsCtrl.initProductsController(doc);

    // 1. ADMIN intenta eliminar producto #5 y el backend responde 409 Conflict
    const delConflict = await productsCtrl.manejarEliminacionProducto(5);
    assert.equal(delConflict.ok, false);
    assert.equal(delConflict.status, 409);
    assert.equal(delConflict.conflict, true);

    const expectedMessage =
        'No se puede eliminar fisicamente el producto porque tiene ordenes historicas vinculadas. Se ha mantenido en el registro para preservar la integridad historica.';
    assert.equal(delConflict.message, expectedMessage);
    assert.equal(doc.getElementById('alertConflicto409').textContent, expectedMessage);
    assert.equal(doc.getElementById('modalConflicto409').hidden, false);
    assert.equal(doc.getElementById('alertConflicto409').hidden, false);

    // 2. La alerta/modal 409 ofrece la acción rápida (#btnDescontinuarDesde409) para descontinuarlo
    const btnQuickDiscontinue = doc.getElementById('btnDescontinuarDesde409');
    assert.ok(btnQuickDiscontinue);
    assert.equal(btnQuickDiscontinue.dataset.id, '5');

    await btnQuickDiscontinue.dispatchEvent('click');

    const putReq = requests.find((r) => r.method === 'PUT' && r.url.endsWith('/Products/5'));
    assert.ok(putReq, 'Debe haberse ejecutado PUT /api/Products/5 para descontinuar el producto');
    assert.equal(putReq.body.discontinued, true);
    assert.equal(putReq.body.productName, 'Chef Anton Gumbo Mix');

    // El modal 409 se oculta tras descontinuar y el producto queda marcado como descontinuado
    assert.equal(doc.getElementById('modalConflicto409').hidden, true);
    assert.equal(productsCtrl.getProductosCache()[0].discontinued, true);
    assert.ok(doc.getElementById('toastProductoMensaje').textContent.includes('descontinuado'));
});

test('TASK-F3-06: Vista de catalogo comercial (authGuard, tarjetas, filtros en tiempo real, solo lectura e indicador de agotado)', async () => {
    // 1. Verificación estática de src/views/catalogo.html: vista estrictamente de lectura
    const catalogoHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/catalogo.html'), 'utf8');
    assert.equal(catalogoHtml.includes('btnNuevoProducto'), false);
    assert.equal(catalogoHtml.includes('formProducto'), false);
    assert.equal(catalogoHtml.includes('data-action="eliminar"'), false);
    assert.equal(catalogoHtml.includes('data-action="editar"'), false);
    assert.equal(catalogoHtml.includes('data-action="descontinuar"'), false);

    // 2. Acceso permitido a ADMIN, EMPLEADO y CLIENTE mediante authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE'])
    resetEnvironment('/src/views/catalogo.html');
    const doc = globalThis.document;
    registerCatalogoDomElements(doc);
    await loginMockUser('cliente_autoservicio');

    const guardRes = authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);
    assert.ok(guardRes);
    assert.equal(guardRes.role, 'CLIENTE');

    const mockCatalogProducts = [
        { ProductId: 1, ProductName: 'Chai', UnitPrice: 18.00, UnitsInStock: 39 },
        { ProductId: 2, ProductName: 'Chang Agotado', UnitPrice: 19.00, UnitsInStock: 0 },
        { ProductId: 3, ProductName: 'Cote de Blaye', UnitPrice: 263.50, UnitsInStock: 17 }
    ];

    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { totalProducts: 3, products: mockCatalogProducts }
    });

    await catalogCtrl.initCatalogController(doc);

    // 3. Renderizado de tarjetas con nombre, precio formateado, stock e indicador distintivo de agotado
    const contenedor = doc.getElementById('contenedorCatalogo');
    assert.equal(contenedor.children.length, 3);
    assert.equal(doc.getElementById('lblTotalCatalogo').textContent, '3 producto(s)');

    const renderedHtml = catalogCtrl.renderizarTarjetas(catalogCtrl.getProductosCatalogo(), doc);
    assert.ok(renderedHtml.includes('Chai'));
    assert.ok(renderedHtml.includes('$18.00'));
    assert.ok(renderedHtml.includes('Disponible (Stock: 39)'));
    assert.ok(renderedHtml.includes('badge-disponible'));

    // Indicador visual distintivo para producto agotado (unitsInStock == 0)
    assert.ok(renderedHtml.includes('Chang Agotado'));
    assert.ok(renderedHtml.includes('Agotado'));
    assert.ok(renderedHtml.includes('badge-agotado'));
    assert.ok(renderedHtml.includes('card-agotado'));
    assert.ok(renderedHtml.includes('data-stock-status="agotado"'));

    // Vista estrictamente de lectura: las tarjetas no contienen botones de acción CRUD
    assert.equal(renderedHtml.includes('data-action='), false);
    assert.equal(renderedHtml.includes('<button'), false);

    // 4. Filtros en tiempo real por texto de búsqueda, rango de precios (min/max) y disponibilidad
    const txtBuscar = doc.getElementById('txtBuscarCatalogo');
    const txtMin = doc.getElementById('txtPrecioMinCatalogo');
    const txtMax = doc.getElementById('txtPrecioMaxCatalogo');
    const chkDisp = doc.getElementById('chkSoloDisponibles');
    const btnLimpiar = doc.getElementById('btnLimpiarFiltrosCatalogo');

    // Filtrar por texto "blaye"
    txtBuscar.value = 'blaye';
    await txtBuscar.dispatchEvent('input');
    assert.equal(contenedor.children.length, 1);
    assert.equal(doc.getElementById('lblTotalCatalogo').textContent, '1 producto(s)');

    // Limpiar y filtrar por rango de precio (18.50 a 30.00 -> solo Chang Agotado de $19.00)
    await btnLimpiar.dispatchEvent('click');
    assert.equal(contenedor.children.length, 3);

    txtMin.value = '18.50';
    txtMax.value = '30.00';
    await txtMin.dispatchEvent('input');
    assert.equal(contenedor.children.length, 1);

    // Activar filtro "Solo con stock disponible" -> excluye Chang Agotado (0 resultados)
    chkDisp.checked = true;
    await chkDisp.dispatchEvent('change');
    assert.equal(doc.getElementById('lblTotalCatalogo').textContent, '0 producto(s)');
});
