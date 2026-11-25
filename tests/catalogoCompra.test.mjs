import test from 'node:test';
import assert from 'node:assert/strict';

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };
}

function createClassList() {
    const set = new Set();
    return {
        add: (...tokens) => tokens.forEach((t) => t && set.add(t)),
        remove: (...tokens) => tokens.forEach((t) => set.delete(t)),
        contains: (token) => set.has(token),
        toggle: (token, force) => {
            if (force === true) { set.add(token); return true; }
            if (force === false) { set.delete(token); return false; }
            if (set.has(token)) { set.delete(token); return false; }
            set.add(token); return true;
        },
        _syncFromClassName: (cls) => {
            set.clear();
            String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => set.add(c));
        }
    };
}

class MockElement {
    constructor(tagName = 'div', id = '') {
        this.tagName = String(tagName).toUpperCase();
        this.id = id;
        this.value = '';
        this.textContent = '';
        this.disabled = false;
        this.hidden = false;
        this.checked = false;
        this.style = { display: '' };
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.children = [];
        this.parentElement = null;
        this.classList = createClassList();
        if (id) this.attributes.set('id', id);
    }
    set className(val) {
        this._className = String(val || '');
        this.classList._syncFromClassName(this._className);
    }
    get className() {
        return this._className || '';
    }
    setAttribute(name, val) {
        this.attributes.set(name, String(val));
        if (name === 'id') this.id = String(val);
    }
    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }
    addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
    }
    async dispatchEvent(type, eventObj = {}) {
        const list = this.listeners.get(type) || [];
        const evt = { type, target: this, preventDefault() {}, ...eventObj };
        for (const fn of list) {
            await fn(evt);
        }
    }
    focus() {}
    closest(selector) {
        if (selector.includes('.card-producto') && this.getAttribute('data-product-id')) {
            return this;
        }
        return this.parentElement?.closest?.(selector) || null;
    }
}

class MockDocument {
    constructor() {
        this.elements = new Map();
        this.body = new MockElement('body');
        this.listeners = new Map();
    }
    register(el) {
        if (el.id) this.elements.set(el.id, el);
        return el;
    }
    getElementById(id) {
        return this.elements.get(id) || null;
    }
    createElement(tag) {
        return new MockElement(tag);
    }
    addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
    }
}

function setupCatalogDom(doc) {
    const ids = [
        'lblUsuario', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalCatalogo',
        'txtBuscarCatalogo', 'txtPrecioMinCatalogo', 'txtPrecioMaxCatalogo',
        'chkSoloDisponibles', 'btnLimpiarFiltrosCatalogo', 'contenedorCatalogo',
        'modalDetalleCatalogo', 'modalCatalogoTitulo', 'detCatalogoId',
        'detCatalogoEstado', 'detCatalogoPrecio', 'detCatalogoNombre',
        'detCatalogoStock', 'alertCompraCatalogo', 'resumenCompraCatalogo',
        'resCompraOrdenId', 'resCompraProducto', 'resCompraCantidad', 'resCompraTotal',
        'resCompraDestino', 'resCompraStockRestante', 'lnkVerMisPedidos', 'seccionCompraCatalogo',
        'formCompraCatalogo', 'compraProductoId', 'txtCantidadCompra',
        'feedbackCantidadCompra', 'lblTotalCompra', 'txtEnvioNombre',
        'feedbackEnvioNombre', 'txtEnvioDireccion', 'feedbackEnvioDireccion',
        'txtEnvioCiudad', 'feedbackEnvioCiudad', 'txtEnvioPais',
        'feedbackEnvioPais', 'btnConfirmarCompra', 'footerSoloLecturaCatalogo'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn') ? 'button' : (id.startsWith('txt') ? 'input' : 'div');
        doc.register(new MockElement(tag, id));
    }
    doc.getElementById('seccionCompraCatalogo').classList.add('d-none');
    doc.getElementById('seccionCompraCatalogo').hidden = true;
    doc.getElementById('resumenCompraCatalogo').classList.add('d-none');
    doc.getElementById('resumenCompraCatalogo').hidden = true;
}

function makeResponse({ status = 200, body = null } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => 'application/json' },
        json: async () => body,
        text: async () => (body === null ? '' : JSON.stringify(body))
    };
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.document = new MockDocument();
globalThis.window = {
    location: { pathname: '/src/views/catalogo.html', href: '', search: '' }
};

const { authService } = await import('../src/services/authService.js');
const catalogCtrl = await import('../src/controllers/catalogController.js');

function makeMockJwt(username) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const body = Buffer.from(JSON.stringify({ sub: '10', unique_name: username, exp })).toString('base64url');
    return `${header}.${body}.sig_${username}`;
}

async function loginAs(username) {
    const isAdmin = username === 'admin';
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 10,
            username,
            token: makeMockJwt(username),
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            defaultView: isAdmin ? './productos.html' : './catalogo.html',
            permissions: isAdmin
                ? { canViewProductsAdmin: true, canCreateProducts: true, canEditProductDetails: true, canEditProductPricingStock: true, canDeleteProducts: true, canDiscontinueProducts: true, canViewCustomers: true, canViewAllOrders: true, canUpdateOrderStatus: true, canCancelOwnOrders: false, canPurchaseCatalog: false }
                : { canViewProductsAdmin: false, canCreateProducts: false, canEditProductDetails: false, canEditProductPricingStock: false, canDeleteProducts: false, canDiscontinueProducts: false, canViewCustomers: false, canViewAllOrders: false, canUpdateOrderStatus: false, canCancelOwnOrders: true, canPurchaseCatalog: true }
        }
    });
    await authService.login(username, 'Password123!');
}

test('validarCantidadCompra rechaza negativos, cero, decimales y exceso de stock', () => {
    assert.equal(catalogCtrl.validarCantidadCompra('-3', 10).valid, false);
    assert.equal(catalogCtrl.validarCantidadCompra('0', 10).valid, false);
    assert.equal(catalogCtrl.validarCantidadCompra('2.5', 10).valid, false);
    assert.equal(catalogCtrl.validarCantidadCompra('abc', 10).valid, false);
    assert.equal(catalogCtrl.validarCantidadCompra('11', 10).valid, false);
    assert.equal(catalogCtrl.validarCantidadCompra('1', 0).valid, false);
    assert.deepEqual(catalogCtrl.validarCantidadCompra('4', 10), { valid: true, value: 4 });
});

test('validarDatosEnvio exige destinatario, direccion, ciudad y pais validos', () => {
    const bad = catalogCtrl.validarDatosEnvio({ shipName: 'A', shipAddress: '12', shipCity: '', shipCountry: ' ' });
    assert.equal(bad.valid, false);
    assert.ok(bad.fieldErrors.shipName);
    assert.ok(bad.fieldErrors.shipAddress);
    assert.ok(bad.fieldErrors.shipCity);
    assert.ok(bad.fieldErrors.shipCountry);

    const ok = catalogCtrl.validarDatosEnvio({
        shipName: 'Ana López',
        shipAddress: 'Av. Reforma 123',
        shipCity: 'CDMX',
        shipCountry: 'México'
    });
    assert.equal(ok.valid, true);
});

test('Modal muestra formulario Comprar solo a CLIENTE y lo oculta para ADMIN', async () => {
    const doc = new MockDocument();
    setupCatalogDom(doc);
    globalThis.document = doc;

    catalogCtrl.setProductosCatalogo([
        { productId: 1, productName: 'Chai', unitPrice: 18.0, unitsInStock: 15, discontinued: false },
        { productId: 2, productName: 'Chang Agotado', unitPrice: 19.0, unitsInStock: 0, discontinued: false }
    ]);

    // 1. CLIENTE ve sección de compra habilitada en producto disponible
    await loginAs('cliente_demo');
    catalogCtrl.abrirModalProductoCatalogo(1, doc);
    assert.equal(doc.getElementById('seccionCompraCatalogo').hidden, false);
    assert.equal(doc.getElementById('btnConfirmarCompra').disabled, false);
    assert.equal(doc.getElementById('lblTotalCompra').textContent, '$18.00');

    // 2. CLIENTE en producto agotado tiene botón Comprar deshabilitado
    catalogCtrl.abrirModalProductoCatalogo(2, doc);
    assert.equal(doc.getElementById('btnConfirmarCompra').disabled, true);
    assert.equal(doc.getElementById('alertCompraCatalogo').hidden, false);

    // 3. ADMIN solo ve detalle, sin sección de compra
    await loginAs('admin');
    catalogCtrl.abrirModalProductoCatalogo(1, doc);
    assert.equal(doc.getElementById('seccionCompraCatalogo').hidden, true);
    assert.equal(doc.getElementById('footerSoloLecturaCatalogo').hidden, false);
});

test('Flujo completo de compra de CLIENTE crea orden vía POST /api/orders, descuenta stock y muestra comprobante', async () => {
    const doc = new MockDocument();
    setupCatalogDom(doc);
    globalThis.document = doc;

    await loginAs('cliente_compra');

    const postOrderCalls = [];
    globalThis.fetch = async (url, options) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({
                status: 200,
                body: {
                    userId: 99,
                    username: 'cliente_compra',
                    defaultView: './catalogo.html',
                    permissions: { canPurchaseCatalog: true, canCancelOwnOrders: true }
                }
            });
        }
        if (options?.method === 'POST' && url.endsWith('/orders')) {
            const payload = JSON.parse(options.body);
            postOrderCalls.push({ url, body: payload });
            return makeResponse({
                status: 201,
                body: {
                    orderId: 11078,
                    orderDate: new Date().toISOString(),
                    shipName: payload.shipName,
                    shipAddress: payload.shipAddress,
                    shipCity: payload.shipCity,
                    shipCountry: payload.shipCountry,
                    total: 64.05,
                    items: [
                        {
                            productId: 5,
                            productName: 'Chef Anton Gumbo',
                            unitPrice: 21.35,
                            quantity: 3,
                            subtotal: 64.05
                        }
                    ]
                }
            });
        }
        return makeResponse({
            status: 200,
            body: {
                totalProducts: 1,
                products: [
                    { ProductId: 5, ProductName: 'Chef Anton Gumbo', UnitPrice: 21.35, UnitsInStock: 10 }
                ]
            }
        });
    };

    await catalogCtrl.initCatalogController(doc);
    catalogCtrl.abrirModalProductoCatalogo(5, doc);

    // Rechaza cantidad negativa sin llamar a la API
    doc.getElementById('txtCantidadCompra').value = '-2';
    doc.getElementById('txtEnvioNombre').value = 'Carlos Ruiz';
    doc.getElementById('txtEnvioDireccion').value = 'Calle 10 #45, Centro';
    doc.getElementById('txtEnvioCiudad').value = 'Ciudad de México';
    doc.getElementById('txtEnvioPais').value = 'México';
    const invalidOk = await catalogCtrl.procesarCompraCatalogo({ preventDefault() {} }, doc);
    assert.equal(invalidOk, false);
    assert.equal(postOrderCalls.length, 0);

    // Compra válida de 3 unidades -> llama POST /api/orders y stock pasa de 10 a 7
    doc.getElementById('txtCantidadCompra').value = '3';
    const total = catalogCtrl.actualizarTotalCompra(doc);
    assert.equal(total, 64.05);
    assert.equal(doc.getElementById('lblTotalCompra').textContent, '$64.05');

    const ok = await catalogCtrl.procesarCompraCatalogo({ preventDefault() {} }, doc);
    assert.equal(ok, true);
    assert.equal(postOrderCalls.length, 1);
    assert.equal(postOrderCalls[0].url, 'https://localhost:7039/api/orders');
    assert.deepEqual(postOrderCalls[0].body.items, [{ productId: 5, quantity: 3 }]);
    assert.equal(postOrderCalls[0].body.shipCity, 'Ciudad de México');

    assert.equal(doc.getElementById('resumenCompraCatalogo').hidden, false);
    assert.equal(doc.getElementById('resCompraOrdenId').textContent, '#11078');
    assert.equal(doc.getElementById('resCompraCantidad').textContent, '3');
    assert.equal(doc.getElementById('resCompraTotal').textContent, '$64.05');
    assert.equal(doc.getElementById('resCompraStockRestante').textContent, '7');
    assert.equal(catalogCtrl.getProductosCatalogo()[0].unitsInStock, 7);
});
