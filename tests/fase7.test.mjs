import test from 'node:test';
import assert from 'node:assert/strict';

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
            if (force === true) { set.add(token); return true; }
            if (force === false) { set.delete(token); return false; }
            if (set.has(token)) { set.delete(token); return false; }
            set.add(token);
            return true;
        },
        toString() {
            return Array.from(set).join(' ');
        },
        _syncFromClassName(cls) {
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
        this._innerHTML = '';
        this.disabled = false;
        this.hidden = false;
        this.selected = false;
        this.style = { display: '' };
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.children = [];
        this.parentElement = null;
        this.classList = createClassList();
        if (id) this.attributes.set('id', id);
    }

    get className() { return this.classList.toString(); }
    set className(val) { this.classList._syncFromClassName(val); }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(val) { this._innerHTML = String(val ?? ''); }
    get firstChild() { return this.children[0] || null; }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
        if (name.startsWith('data-')) {
            const camel = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
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

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }

    async dispatchEvent(type, eventInit = {}) {
        const handlers = this.listeners.get(type) || [];
        const evt = {
            type,
            target: this,
            preventDefault() { this.defaultPrevented = true; },
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
        if (selector.includes('select[data-action="cambiar-estado"]')) {
            if (this.tagName === 'SELECT' && (this.dataset?.action === 'cambiar-estado' || this.getAttribute('data-action') === 'cambiar-estado')) {
                return this;
            }
        }
        if (selector.includes('[data-bs-dismiss="modal"]')) {
            if (this.getAttribute('data-bs-dismiss') === 'modal' || this.dataset?.bsDismiss === 'modal') {
                return this;
            }
        }
        return this.parentElement;
    }
}

function createMockDocument() {
    const elementsById = new Map();
    const allElements = [];

    const doc = {
        body: new MockElement('body', 'body'),
        registerElement(el) {
            allElements.push(el);
            if (el.id) elementsById.set(el.id, el);
            return el;
        },
        createElement(tag) {
            const el = new MockElement(tag);
            allElements.push(el);
            return el;
        },
        createTextNode(text) {
            return { nodeType: 3, textContent: String(text) };
        },
        getElementById(id) {
            return elementsById.get(id) || null;
        },
        querySelector(sel) {
            if (sel === 'main') return allElements.find((e) => e.tagName === 'MAIN') || doc.body;
            if (sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
            return null;
        },
        querySelectorAll() { return []; },
        addEventListener() {}
    };

    doc.registerElement(doc.body);
    return doc;
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.window = {
    location: {
        pathname: '/src/views/pedidos.html',
        search: '',
        href: 'http://localhost:3000/src/views/pedidos.html'
    },
    confirm: () => true
};
globalThis.confirm = (...args) => globalThis.window.confirm(...args);
globalThis.document = createMockDocument();

const { ApiError } = await import('../src/api/httpClient.js');
const { authService } = await import('../src/services/authService.js');
const {
    OrderModel,
    ORDER_STATUS,
    normalizeOrderStatusCode,
    canClientCancelStatus,
    validateOrderStatusTransition
} = await import('../src/models/orderModel.js');
const { orderService } = await import('../src/services/orderService.js');
const ordersCtrl = await import('../src/controllers/ordersController.js');
const customersCtrl = await import('../src/controllers/customersController.js');

function makeResponse({ status = 200, body = null, ok = status >= 200 && status < 300 }) {
    const textBody = body === null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    return {
        ok,
        status,
        statusText: String(status),
        clone() { return makeResponse({ status, body, ok }); },
        async text() { return textBody; },
        async json() { return textBody ? JSON.parse(textBody) : null; }
    };
}

function resetEnvironment(pathname = '/src/views/pedidos.html') {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    ordersCtrl.resetOrdersState();
    customersCtrl.resetCustomersState();
    delete globalThis.DataTable;
    delete globalThis.bootstrap;
    globalThis.document = createMockDocument();
    globalThis.window.location = {
        pathname,
        search: '',
        href: `http://localhost:3000${pathname}`
    };
    globalThis.window.confirm = () => true;
}

function mockBackendProfileFor(username) {
    if (username === 'admin') {
        return {
            defaultView: './productos.html',
            permissions: {
                canViewProductsAdmin: true,
                canCreateProducts: true,
                canEditProductDetails: true,
                canEditProductPricingStock: true,
                canDeleteProducts: true,
                canDiscontinueProducts: true,
                canViewCustomers: true,
                canViewAllOrders: true,
                canUpdateOrderStatus: true,
                canCancelOwnOrders: false,
                canPurchaseCatalog: false
            }
        };
    }
    if (username.startsWith('emp_') || username === 'Robe' || username === 'Leo') {
        return {
            defaultView: './productos.html',
            permissions: {
                canViewProductsAdmin: true,
                canCreateProducts: false,
                canEditProductDetails: false,
                canEditProductPricingStock: true,
                canDeleteProducts: false,
                canDiscontinueProducts: false,
                canViewCustomers: true,
                canViewAllOrders: true,
                canUpdateOrderStatus: false,
                canCancelOwnOrders: false,
                canPurchaseCatalog: false
            }
        };
    }
    return {
        defaultView: './catalogo.html',
        permissions: {
            canViewProductsAdmin: false,
            canCreateProducts: false,
            canEditProductDetails: false,
            canEditProductPricingStock: false,
            canDeleteProducts: false,
            canDiscontinueProducts: false,
            canViewCustomers: false,
            canViewAllOrders: false,
            canUpdateOrderStatus: false,
            canCancelOwnOrders: true,
            canPurchaseCatalog: true
        }
    };
}

async function loginMockUser(username) {
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    const profile = mockBackendProfileFor(username);
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { userId: 25, username, apiKey: `ak_${username}_f7`, expiresAt: futureExp, ...profile }
    });
    const session = await authService.login(username, 'Password123!');
    globalThis.fetch = prevFetch;
    return session;
}

function registerOrdenesDom(doc) {
    const ids = [
        'lblUsuario', 'badgeRol', 'btnPerfilApiKey', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalOrdenes', 'lblSubtituloOrdenes',
        'alertOrdenes', 'alertOrdenesExito',
        'panelFiltrosOrdenes', 'infoFiltroCliente', 'formBuscarOrdenId',
        'txtBuscarOrdenId', 'btnBuscarOrdenId', 'btnLimpiarOrdenId', 'selEstadoOrden',
        'tablaPedidos', 'tbodyPedidos',
        'modalDetalleOrden', 'modalDetalleOrdenTitulo', 'detOrdenEstatus', 'alertDetalleOrden',
        'detOrdenId', 'detOrdenFecha', 'detOrdenRequerida', 'detOrdenEnvio',
        'detOrdenFlete', 'detOrdenDestinatario', 'detOrdenDireccion',
        'detOrdenCiudad', 'detOrdenPais', 'detOrdenDireccionCompleta',
        'detOrdenProductosWrapper', 'tbodyDetalleOrdenProductos', 'detOrdenTotal',
        'adminEstadoOrdenWrapper', 'selCambiarEstadoOrden', 'btnGuardarEstadoOrden',
        'lblEstadoOrdenAyuda', 'btnCancelarPedidoModal'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn')
            ? 'button'
            : (id.startsWith('form') ? 'form' : (id.startsWith('txt') ? 'input' : (id.startsWith('sel') ? 'select' : (id.startsWith('tbody') ? 'tbody' : 'div'))));
        doc.registerElement(new MockElement(tag, id));
    }

    const selModal = doc.getElementById('selCambiarEstadoOrden');
    for (const code of ['PENDIENTE', 'PENDIENTE_ENVIO', 'EN_TRANSITO', 'ENTREGADO', 'CANCELADO']) {
        const opt = new MockElement('option');
        opt.value = code;
        opt.textContent = ORDER_STATUS[code].label;
        selModal.appendChild(opt);
    }

    doc.getElementById('selEstadoOrden').value = 'ALL';
    for (const hiddenId of ['alertOrdenes', 'alertOrdenesExito', 'infoFiltroCliente', 'alertDetalleOrden', 'detOrdenProductosWrapper', 'adminEstadoOrdenWrapper', 'btnCancelarPedidoModal']) {
        doc.getElementById(hiddenId).classList.add('d-none');
        doc.getElementById(hiddenId).hidden = true;
    }
}

test('TASK-F7: OrderModel 5 estados, normalización, reglas de transición y cancelabilidad', () => {
    assert.equal(normalizeOrderStatusCode('Pendiente'), 'PENDIENTE');
    assert.equal(normalizeOrderStatusCode('Pendiente de envío'), 'PENDIENTE_ENVIO');
    assert.equal(normalizeOrderStatusCode('Pendiente de envio'), 'PENDIENTE_ENVIO');
    assert.equal(normalizeOrderStatusCode('En tránsito'), 'EN_TRANSITO');
    assert.equal(normalizeOrderStatusCode('entregado'), 'ENTREGADO');
    assert.equal(normalizeOrderStatusCode('CANCELADO'), 'CANCELADO');
    assert.equal(normalizeOrderStatusCode('desconocido'), null);

    // Prioridad del campo explícito status sobre shippedDate
    assert.equal(
        OrderModel.resolveLogisticsStatus({ status: 'PENDIENTE_ENVIO', shippedDate: null }).code,
        'PENDIENTE_ENVIO'
    );
    assert.equal(
        OrderModel.resolveLogisticsStatus({ status: 'CANCELADO', shippedDate: '2026-10-05T00:00:00Z' }).code,
        'CANCELADO'
    );

    // Estados cancelables por cliente
    assert.equal(canClientCancelStatus('PENDIENTE'), true);
    assert.equal(canClientCancelStatus('PENDIENTE_ENVIO'), true);
    assert.equal(canClientCancelStatus('EN_TRANSITO'), true);
    assert.equal(canClientCancelStatus('ENTREGADO'), false);
    assert.equal(canClientCancelStatus('CANCELADO'), false);

    // Reglas de transición ADMIN
    const transitToPending = validateOrderStatusTransition('EN_TRANSITO', 'PENDIENTE', 100);
    assert.equal(transitToPending.valid, true);
    assert.equal(transitToPending.requiresConfirmation, true);

    const deliveredToPending = validateOrderStatusTransition('ENTREGADO', 'PENDIENTE', 100);
    assert.equal(deliveredToPending.valid, true);
    assert.equal(deliveredToPending.requiresConfirmation, true);

    const pendingToCancel = validateOrderStatusTransition('PENDIENTE', 'CANCELADO', 100);
    assert.equal(pendingToCancel.valid, true);
    assert.equal(pendingToCancel.requiresConfirmation, true);

    const transitToCancel = validateOrderStatusTransition('EN_TRANSITO', 'CANCELADO', 100);
    assert.equal(transitToCancel.valid, true);
    assert.equal(transitToCancel.requiresConfirmation, true);

    const deliveredToCancel = validateOrderStatusTransition('ENTREGADO', 'CANCELADO', 100);
    assert.equal(deliveredToCancel.valid, false);

    const cancelledToPending = validateOrderStatusTransition('CANCELADO', 'PENDIENTE', 100);
    assert.equal(cancelledToPending.valid, false);

    const pendingToTransit = validateOrderStatusTransition('PENDIENTE', 'EN_TRANSITO', 100);
    assert.equal(pendingToTransit.valid, true);
    assert.equal(pendingToTransit.requiresConfirmation, false);
});

test('TASK-F7: orderService.updateStatus envia PATCH /api/orders/{id}/status y valida entradas', async () => {
    resetEnvironment('/src/views/pedidos.html');
    await loginMockUser('admin');

    let called = 0;
    let lastReq = null;
    globalThis.fetch = async (url, options) => {
        called += 1;
        lastReq = { url, options };
        return makeResponse({
            status: 200,
            body: { orderId: 10500, status: 'EN_TRANSITO', shipName: 'Destino', items: [], total: 0 }
        });
    };

    await assert.rejects(
        () => orderService.updateStatus('abc', 'PENDIENTE'),
        (err) => err instanceof ApiError && err.status === 400
    );
    await assert.rejects(
        () => orderService.updateStatus(10500, 'ESTADO_INVALIDO'),
        (err) => err instanceof ApiError && err.status === 400
    );
    assert.equal(called, 0);

    const updated = await orderService.updateStatus(10500, 'En tránsito');
    assert.equal(called, 1);
    assert.equal(lastReq.url, 'https://localhost:7039/api/orders/10500/status');
    assert.equal(lastReq.options.method, 'PATCH');
    assert.equal(lastReq.options.headers['X-API-KEY'], 'ak_admin_f7');
    assert.deepEqual(JSON.parse(lastReq.options.body), { status: 'EN_TRANSITO' });
    assert.equal(updated.status, 'EN_TRANSITO');
});

test('TASK-F7: ADMIN cambia estados con confirmaciones obligatorias, bloquea ENTREGADO->CANCELADO y bloquea CANCELADO irreversible', async () => {
    resetEnvironment('/src/views/pedidos.html');
    const doc = globalThis.document;
    registerOrdenesDom(doc);
    await loginMockUser('admin');

    const dbOrders = [
        { orderId: 101, orderDate: '2026-11-20T00:00:00Z', shippedDate: null, status: 'PENDIENTE', freight: 0, shipName: 'Cliente A', shipCity: 'CDMX', shipCountry: 'México', total: 100, items: [] },
        { orderId: 102, orderDate: '2026-11-18T00:00:00Z', shippedDate: '2026-11-19T00:00:00Z', status: 'EN_TRANSITO', freight: 10, shipName: 'Cliente B', shipCity: 'MTY', shipCountry: 'México', total: 200, items: [] },
        { orderId: 103, orderDate: '2026-10-01T00:00:00Z', shippedDate: '2026-10-03T00:00:00Z', status: 'ENTREGADO', freight: 15, shipName: 'Cliente C', shipCity: 'GDL', shipCountry: 'México', total: 300, items: [] },
        { orderId: 104, orderDate: '2026-11-10T00:00:00Z', shippedDate: null, status: 'CANCELADO', freight: 0, shipName: 'Cliente D', shipCity: 'PUE', shipCountry: 'México', total: 50, items: [] }
    ];

    const patchCalls = [];
    globalThis.fetch = async (url, options = {}) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({ status: 200, body: { userId: 25, username: 'admin', ...mockBackendProfileFor('admin') } });
        }
        if (options.method === 'PATCH') {
            const match = url.match(/\/orders\/(\d+)\/status$/);
            const id = Number(match[1]);
            const body = JSON.parse(options.body);
            patchCalls.push({ id, status: body.status });
            const found = dbOrders.find((o) => o.orderId === id);
            found.status = body.status;
            return makeResponse({ status: 200, body: { ...found } });
        }
        return makeResponse({ status: 200, body: dbOrders.map((o) => ({ ...o })) });
    };

    await ordersCtrl.initOrdersController(doc);

    const tbody = doc.getElementById('tbodyPedidos');
    assert.equal(tbody.children.length, 4);

    // Verifica que ADMIN tenga <select data-action="cambiar-estado"> en cada fila, y que la orden CANCELADA esté disabled
    const selectOrder101 = tbody.children[0].children[8].children[1];
    const selectOrder104 = tbody.children[3].children[8].children[1];
    assert.equal(selectOrder101.tagName, 'SELECT');
    assert.equal(selectOrder101.disabled, false);
    assert.equal(selectOrder104.disabled, true);

    // 1. EN_TRANSITO -> PENDIENTE pide confirmación; si se rechaza, NO llama PATCH y revierte select
    let confirmPrompts = [];
    globalThis.window.confirm = (msg) => {
        confirmPrompts.push(msg);
        return false;
    };
    const declined = await ordersCtrl.cambiarEstadoOrden(102, 'PENDIENTE', doc);
    assert.equal(declined.ok, false);
    assert.equal(declined.cancelled, true);
    assert.equal(confirmPrompts.length, 1);
    assert.equal(patchCalls.length, 0);

    // 2. ENTREGADO -> PENDIENTE con confirmación aceptada -> ejecuta PATCH
    globalThis.window.confirm = (msg) => {
        confirmPrompts.push(msg);
        return true;
    };
    const confirmedReturn = await ordersCtrl.cambiarEstadoOrden(103, 'PENDIENTE', doc);
    assert.equal(confirmedReturn.ok, true);
    assert.equal(patchCalls.at(-1).id, 103);
    assert.equal(patchCalls.at(-1).status, 'PENDIENTE');

    // Restaurar 103 a ENTREGADO para probar bloqueo ENTREGADO -> CANCELADO
    await ordersCtrl.cambiarEstadoOrden(103, 'ENTREGADO', doc);
    const blockedCancelDelivered = await ordersCtrl.cambiarEstadoOrden(103, 'CANCELADO', doc);
    assert.equal(blockedCancelDelivered.ok, false);
    assert.equal(blockedCancelDelivered.status, 409);

    // 3. CANCELADO -> PENDIENTE bloqueado (irreversible)
    const blockedReactivate = await ordersCtrl.cambiarEstadoOrden(104, 'PENDIENTE', doc);
    assert.equal(blockedReactivate.ok, false);
    assert.equal(blockedReactivate.status, 409);

    // 4. PENDIENTE -> CANCELADO pide confirmación y actualiza a CANCELADO
    const prevConfirmCount = confirmPrompts.length;
    const cancelRes = await ordersCtrl.cambiarEstadoOrden(101, 'CANCELADO', doc);
    assert.equal(cancelRes.ok, true);
    assert.equal(confirmPrompts.length, prevConfirmCount + 1);
    assert.equal(patchCalls.at(-1).id, 101);
    assert.equal(patchCalls.at(-1).status, 'CANCELADO');
    assert.equal(doc.getElementById('alertOrdenesExito').hidden, false);
});

test('TASK-F7: CLIENTE solo puede cancelar sus propios pedidos en PENDIENTE, PENDIENTE_ENVIO o EN_TRANSITO con confirmación', async () => {
    resetEnvironment('/src/views/pedidos.html');
    const doc = globalThis.document;
    registerOrdenesDom(doc);
    await loginMockUser('cliente_juan');

    const myOrders = [
        { orderId: 201, orderDate: '2026-11-24T00:00:00Z', shippedDate: null, status: 'PENDIENTE', freight: 0, shipName: 'Juan', shipCity: 'CDMX', shipCountry: 'México', total: 50, items: [] },
        { orderId: 202, orderDate: '2026-11-23T00:00:00Z', shippedDate: null, status: 'PENDIENTE_ENVIO', freight: 0, shipName: 'Juan', shipCity: 'CDMX', shipCountry: 'México', total: 60, items: [] },
        { orderId: 203, orderDate: '2026-11-22T00:00:00Z', shippedDate: '2026-11-22T00:00:00Z', status: 'EN_TRANSITO', freight: 0, shipName: 'Juan', shipCity: 'CDMX', shipCountry: 'México', total: 70, items: [] },
        { orderId: 204, orderDate: '2026-10-10T00:00:00Z', shippedDate: '2026-10-11T00:00:00Z', status: 'ENTREGADO', freight: 0, shipName: 'Juan', shipCity: 'CDMX', shipCountry: 'México', total: 80, items: [] },
        { orderId: 205, orderDate: '2026-11-01T00:00:00Z', shippedDate: null, status: 'CANCELADO', freight: 0, shipName: 'Juan', shipCity: 'CDMX', shipCountry: 'México', total: 90, items: [] }
    ];

    const patchCalls = [];
    globalThis.fetch = async (url, options = {}) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({ status: 200, body: { userId: 25, username: 'cliente_juan', ...mockBackendProfileFor('cliente_juan') } });
        }
        if (options.method === 'PATCH') {
            const match = url.match(/\/orders\/(\d+)\/status$/);
            const id = Number(match[1]);
            const body = JSON.parse(options.body);
            patchCalls.push({ id, status: body.status });
            const found = myOrders.find((o) => o.orderId === id);
            found.status = body.status;
            return makeResponse({ status: 200, body: { ...found } });
        }
        return makeResponse({ status: 200, body: myOrders.map((o) => ({ ...o })) });
    };

    await ordersCtrl.initOrdersController(doc);

    const tbody = doc.getElementById('tbodyPedidos');
    assert.equal(tbody.children.length, 5);

    // 201 (PENDIENTE), 202 (PENDIENTE_ENVIO), 203 (EN_TRANSITO) deben mostrar botón "Cancelar Compra"
    assert.equal(tbody.children[0].children[8].children.length, 2);
    assert.equal(tbody.children[0].children[8].children[1].getAttribute('data-action'), 'cancelar');
    assert.equal(tbody.children[1].children[8].children.length, 2);
    assert.equal(tbody.children[2].children[8].children.length, 2);

    // 204 (ENTREGADO) y 205 (CANCELADO) NO deben mostrar botón "Cancelar Compra"
    assert.equal(tbody.children[3].children[8].children.length, 1);
    assert.equal(tbody.children[4].children[8].children.length, 1);

    // Si el cliente rechaza confirmación, NO llama PATCH
    globalThis.window.confirm = () => false;
    const aborted = await ordersCtrl.cancelarPedidoCliente(201, doc);
    assert.equal(aborted.ok, false);
    assert.equal(aborted.cancelled, true);
    assert.equal(patchCalls.length, 0);

    // Si el cliente confirma, llama PATCH con CANCELADO
    globalThis.window.confirm = () => true;
    const cancelled = await ordersCtrl.cancelarPedidoCliente(201, doc);
    assert.equal(cancelled.ok, true);
    assert.equal(patchCalls.length, 1);
    assert.deepEqual(patchCalls[0], { id: 201, status: 'CANCELADO' });

    // Intentar cancelar un pedido ya ENTREGADO retorna 409 sin llamar PATCH
    const blocked = await ordersCtrl.cancelarPedidoCliente(204, doc);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 409);
    assert.equal(patchCalls.length, 1);

    // CLIENTE no puede usar cambiarEstadoOrden
    const forbiddenAdminOp = await ordersCtrl.cambiarEstadoOrden(202, 'ENTREGADO', doc);
    assert.equal(forbiddenAdminOp.ok, false);
    assert.equal(forbiddenAdminOp.status, 403);
});

test('TASK-F7: EMPLEADO no tiene control de cambio de estado ni botón de cancelar', async () => {
    resetEnvironment('/src/views/pedidos.html');
    const doc = globalThis.document;
    registerOrdenesDom(doc);
    await loginMockUser('emp_ventas');

    globalThis.fetch = async (url) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({ status: 200, body: { userId: 25, username: 'emp_ventas', ...mockBackendProfileFor('emp_ventas') } });
        }
        return makeResponse({
            status: 200,
            body: [
                { orderId: 301, orderDate: '2026-11-24T00:00:00Z', shippedDate: null, status: 'PENDIENTE', freight: 0, shipName: 'Cliente X', shipCity: 'CDMX', shipCountry: 'México', total: 50, items: [] }
            ]
        });
    };

    await ordersCtrl.initOrdersController(doc);
    const tbody = doc.getElementById('tbodyPedidos');
    // Solo el botón "Ver Detalle"
    assert.equal(tbody.children[0].children[8].children.length, 1);
    assert.equal(tbody.children[0].children[8].children[0].getAttribute('data-action'), 'ver');
});

test('TASK-F7: Clientes unificados (Northwind + usuarios CLIENTE con clave dinámica alfanumérica) sin etiquetas extra', async () => {
    resetEnvironment('/src/views/clientes.html');
    const doc = globalThis.document;
    const ids = [
        'lblUsuario', 'badgeRol', 'btnPerfilApiKey', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalClientes', 'alertClientes',
        'tablaClientes', 'tbodyClientes',
        'modalDetalleCliente', 'modalDetalleClienteTitulo', 'alertDetalleCliente',
        'detClienteId', 'detClienteEmpresa', 'detClienteContacto'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn') ? 'button' : (id === 'tbodyClientes' ? 'tbody' : 'div');
        doc.registerElement(new MockElement(tag, id));
    }
    doc.getElementById('alertClientes').hidden = true;
    doc.getElementById('alertDetalleCliente').hidden = true;

    await loginMockUser('admin');

    const unifiedCustomers = [
        { customerId: 'ALFKI', companyName: 'Alfreds Futterkiste', contactName: 'Maria Anders' },
        { customerId: 'JP1', companyName: 'juan.perez@correo.com', contactName: 'juan_perez' },
        { customerId: 'JP2', companyName: 'julia.pardo@correo.com', contactName: 'julia_pardo' }
    ];

    globalThis.fetch = async (url) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({ status: 200, body: { userId: 25, username: 'admin', ...mockBackendProfileFor('admin') } });
        }
        if (url.endsWith('/customers/JP1')) {
            return makeResponse({ status: 200, body: unifiedCustomers[1] });
        }
        return makeResponse({ status: 200, body: unifiedCustomers });
    };

    await customersCtrl.initCustomersController(doc);
    assert.equal(doc.getElementById('lblTotalClientes').textContent, '3');
    const tbody = doc.getElementById('tbodyClientes');
    assert.equal(tbody.children.length, 3);
    assert.equal(tbody.children[1].children.length, 4);
    assert.equal(tbody.children[1].children[0].children[0].textContent, 'JP1');
    assert.equal(tbody.children[1].children[1].textContent, 'juan.perez@correo.com');
    assert.equal(tbody.children[1].children[2].textContent, 'juan_perez');

    const detRes = await customersCtrl.verDetalleCliente('JP1', doc);
    assert.equal(detRes.ok, true);
    assert.equal(doc.getElementById('detClienteId').textContent, 'JP1');
    assert.equal(doc.getElementById('detClienteEmpresa').textContent, 'juan.perez@correo.com');
    assert.equal(doc.getElementById('detClienteContacto').textContent, 'juan_perez');
});

test('TASK-F7 Regresion: confirmacion hacia PENDIENTE_ENVIO, sincronizacion de cache al abrir modal y proteccion contra doble envio', async () => {
    // 1. ENTREGADO/EN_TRANSITO -> PENDIENTE_ENVIO requiere confirmacion
    const deliveredToPendingShip = validateOrderStatusTransition('ENTREGADO', 'PENDIENTE_ENVIO', 501);
    assert.equal(deliveredToPendingShip.valid, true);
    assert.equal(deliveredToPendingShip.requiresConfirmation, true);

    const transitToPendingShip = validateOrderStatusTransition('EN_TRANSITO', 'PENDIENTE_ENVIO', 501);
    assert.equal(transitToPendingShip.valid, true);
    assert.equal(transitToPendingShip.requiresConfirmation, true);

    // 2. Sincronizacion de cache al abrir modal (verDetalleOrden actualiza allOrdersCache)
    resetEnvironment('/src/views/pedidos.html');
    const doc = globalThis.document;
    registerOrdenesDom(doc);
    await loginMockUser('admin');

    let serverStatus = 'PENDIENTE';
    let patchCount = 0;
    let releasePatch = null;

    globalThis.fetch = async (url, options = {}) => {
        if (url.endsWith('/auth/me')) {
            return makeResponse({ status: 200, body: { userId: 25, username: 'admin', ...mockBackendProfileFor('admin') } });
        }
        if (options.method === 'PATCH') {
            patchCount += 1;
            const body = JSON.parse(options.body);
            await new Promise((resolve) => { releasePatch = resolve; });
            serverStatus = body.status;
            return makeResponse({
                status: 200,
                body: { orderId: 501, orderDate: '2026-11-20T00:00:00Z', shippedDate: null, status: serverStatus, freight: 0, shipName: 'Cliente R', shipCity: 'CDMX', shipCountry: 'México', total: 100, items: [] }
            });
        }
        if (url.endsWith('/orders/501')) {
            return makeResponse({
                status: 200,
                body: { orderId: 501, orderDate: '2026-11-20T00:00:00Z', shippedDate: '2026-11-21T00:00:00Z', status: serverStatus, freight: 0, shipName: 'Cliente R', shipCity: 'CDMX', shipCountry: 'México', total: 100, items: [] }
            });
        }
        return makeResponse({
            status: 200,
            body: [{ orderId: 501, orderDate: '2026-11-20T00:00:00Z', shippedDate: null, status: 'PENDIENTE', freight: 0, shipName: 'Cliente R', shipCity: 'CDMX', shipCountry: 'México', total: 100, items: [] }]
        });
    };

    await ordersCtrl.initOrdersController(doc);
    // Simular cambio concurrente en servidor a EN_TRANSITO antes de abrir el modal
    serverStatus = 'EN_TRANSITO';
    await ordersCtrl.verDetalleOrden(501, doc);

    // Ahora cambiar a PENDIENTE NO debe tratarse como noOp y debe pedir confirmacion
    let confirmCalls = 0;
    globalThis.window.confirm = () => {
        confirmCalls += 1;
        return true;
    };

    const firstPromise = ordersCtrl.cambiarEstadoOrden(501, 'PENDIENTE', doc);
    // 3. Doble envio concurrente sobre la misma orden debe rechazarse localmente (429 busy) sin segundo PATCH
    const secondRes = await ordersCtrl.cambiarEstadoOrden(501, 'PENDIENTE', doc);
    assert.equal(secondRes.ok, false);
    assert.equal(secondRes.busy, true);
    assert.equal(secondRes.status, 429);

    releasePatch();
    const firstRes = await firstPromise;
    assert.equal(firstRes.ok, true);
    assert.equal(confirmCalls, 1);
    assert.equal(patchCount, 1);
});
