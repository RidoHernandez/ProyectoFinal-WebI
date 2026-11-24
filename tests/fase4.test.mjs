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
        if (selector.includes('[data-bs-dismiss="modal"]')) {
            if (this.getAttribute('data-bs-dismiss') === 'modal' || this.dataset?.bsDismiss === 'modal') {
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
            return [];
        },
        addEventListener() {}
    };

    doc.registerElement(doc.body);
    return doc;
}

function collectTextTree(node) {
    if (!node) return '';
    const own = node.textContent ? String(node.textContent) : '';
    const childTexts = Array.isArray(node.children) ? node.children.map(collectTextTree) : [];
    return [own, ...childTexts].filter(Boolean).join(' ');
}

function collectInnerHtmlTree(node) {
    if (!node) return '';
    const own = node.innerHTML ? String(node.innerHTML) : '';
    const childHtml = Array.isArray(node.children) ? node.children.map(collectInnerHtmlTree) : [];
    return [own, ...childHtml].join('');
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.window = {
    location: {
        pathname: '/src/views/clientes.html',
        search: '',
        href: 'http://localhost:3000/src/views/clientes.html'
    },
    confirm: () => true
};
globalThis.confirm = (...args) => globalThis.window.confirm(...args);
globalThis.document = createMockDocument();

const httpMod = await import('../src/api/httpClient.js');
const authMod = await import('../src/services/authService.js');
const guardMod = await import('../src/utils/authGuard.js');
const tableHelpers = await import('../src/utils/tableHelpers.js');
const customerModelMod = await import('../src/models/customerModel.js');
const customerServiceMod = await import('../src/services/customerService.js');
const orderModelMod = await import('../src/models/orderModel.js');
const orderServiceMod = await import('../src/services/orderService.js');
const customersCtrl = await import('../src/controllers/customersController.js');
const ordersCtrl = await import('../src/controllers/ordersController.js');

const { ApiError } = httpMod;
const { authService } = authMod;
const { authGuard } = guardMod;
const { CustomerModel, CUSTOMER_ID_PATTERN, validateCustomerId } = customerModelMod;
const { customerService } = customerServiceMod;
const { OrderModel, ORDER_STATUS, validateOrderId } = orderModelMod;
const { orderService } = orderServiceMod;

function resetEnvironment(pathname = '/src/views/clientes.html', search = '') {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    customersCtrl.resetCustomersState();
    ordersCtrl.resetOrdersState();
    delete globalThis.DataTable;
    delete globalThis.bootstrap;
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
            userId: 10,
            username,
            apiKey: `ak_${username}_f4`,
            expiresAt: futureExp
        }
    });
    const session = await authService.login(username, 'Password123!');
    globalThis.fetch = prevFetch;
    return session;
}

function registerClientesDom(doc) {
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
    doc.getElementById('alertClientes').classList.add('d-none');
    doc.getElementById('alertClientes').hidden = true;
    doc.getElementById('alertDetalleCliente').classList.add('d-none');
    doc.getElementById('alertDetalleCliente').hidden = true;
}

function registerOrdenesDom(doc) {
    const ids = [
        'lblUsuario', 'badgeRol', 'btnPerfilApiKey', 'btnLogout',
        'navItemProductos', 'navProductos', 'navItemCatalogo', 'navCatalogo',
        'navItemClientes', 'navClientes', 'navItemPedidos', 'navPedidos',
        'alertContainer403', 'lblTotalOrdenes', 'lblSubtituloOrdenes', 'alertOrdenes',
        'panelFiltrosOrdenes', 'infoFiltroCliente', 'formBuscarOrdenId',
        'txtBuscarOrdenId', 'btnBuscarOrdenId', 'btnLimpiarOrdenId', 'selEstadoOrden',
        'tablaPedidos', 'tbodyPedidos',
        'modalDetalleOrden', 'modalDetalleOrdenTitulo', 'detOrdenEstatus', 'alertDetalleOrden',
        'detOrdenId', 'detOrdenFecha', 'detOrdenRequerida', 'detOrdenEnvio',
        'detOrdenFlete', 'detOrdenDestinatario', 'detOrdenDireccion',
        'detOrdenCiudad', 'detOrdenRegion', 'detOrdenCodigoPostal',
        'detOrdenPais', 'detOrdenDireccionCompleta'
    ];
    for (const id of ids) {
        const tag = id.startsWith('btn')
            ? 'button'
            : (id.startsWith('form') ? 'form' : (id.startsWith('txt') ? 'input' : (id.startsWith('sel') ? 'select' : (id === 'tbodyPedidos' ? 'tbody' : 'div'))));
        doc.registerElement(new MockElement(tag, id));
    }
    doc.getElementById('selEstadoOrden').value = 'ALL';
    doc.getElementById('alertOrdenes').classList.add('d-none');
    doc.getElementById('alertOrdenes').hidden = true;
    doc.getElementById('infoFiltroCliente').classList.add('d-none');
    doc.getElementById('infoFiltroCliente').hidden = true;
    doc.getElementById('alertDetalleOrden').classList.add('d-none');
    doc.getElementById('alertDetalleOrden').hidden = true;
}

test('TASK-F4-01: CustomerModel (minimización 3 campos, validación anti-traversal) y customerService (solo lectura)', async () => {
    resetEnvironment('/src/views/clientes.html');
    await loginMockUser('admin');

    assert.equal(CUSTOMER_ID_PATTERN.test('ALFKI'), true);
    assert.equal(validateCustomerId(' ALFKI ').value, 'ALFKI');
    for (const badId of ['', '   ', 'TOOLONG1', '../Products', 'ALF/1', 'A$B', null, undefined]) {
        assert.equal(validateCustomerId(badId).valid, false, `Debe rechazar ID inválido: ${String(badId)}`);
    }

    // Proyección exacta a 3 campos (REQ-SEC-003)
    const dto = CustomerModel.fromApiDto({
        CustomerId: ' ALFKI ',
        CompanyName: ' Alfreds Futterkiste ',
        ContactName: ' Maria Anders ',
        Fax: '030-0076545',
        InternalNotes: 'Sensible'
    });
    assert.deepEqual(Object.keys(dto), ['customerId', 'companyName', 'contactName']);
    assert.equal(dto.customerId, 'ALFKI');
    assert.equal(dto.companyName, 'Alfreds Futterkiste');
    assert.equal(dto.contactName, 'Maria Anders');

    // Contrato estricto de solo lectura
    assert.equal(Object.isFrozen(customerService), true);
    assert.deepEqual(Object.keys(customerService).sort(), ['getAll', 'getById']);

    const captured = [];
    globalThis.fetch = async (url, options) => {
        captured.push({ url, options });
        if (url.endsWith('/customers/ALFKI')) {
            return makeResponse({
                status: 200,
                body: { CustomerId: 'ALFKI', CompanyName: 'Alfreds Futterkiste', ContactName: 'Maria Anders', Extra: 'ignored' }
            });
        }
        if (url.endsWith('/customers/NOEX1')) {
            return makeResponse({
                status: 404,
                body: { status: 404, title: 'Not Found', detail: 'Cliente NOEX1 no encontrado.' }
            });
        }
        return makeResponse({
            status: 200,
            body: [
                { CustomerId: 'ALFKI', CompanyName: 'Alfreds Futterkiste', ContactName: 'Maria Anders', SecretField: 'x' },
                { customerId: 'ANATR', companyName: 'Ana Trujillo', contactName: 'Ana Trujillo' }
            ]
        });
    };

    const all = await customerService.getAll();
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/customers');
    assert.equal(captured.at(-1).options.method, 'GET');
    assert.equal(captured.at(-1).options.headers['X-API-KEY'], 'ak_admin_f4');
    assert.equal(all.length, 2);
    assert.deepEqual(Object.keys(all[0]), ['customerId', 'companyName', 'contactName']);

    const single = await customerService.getById('ALFKI');
    assert.equal(captured.at(-1).url, 'https://localhost:7039/api/customers/ALFKI');
    assert.equal(single.companyName, 'Alfreds Futterkiste');

    await assert.rejects(
        () => customerService.getById('../Products'),
        (err) => err instanceof ApiError && err.status === 400
    );

    await assert.rejects(
        () => customerService.getById('NOEX1'),
        (err) => err instanceof ApiError && err.status === 404 && err.problemDetails?.detail.includes('NOEX1')
    );
});

test('TASK-F4-02: clientes.html y customersController.js (RBAC 403, anti-XSS, búsqueda y modal de detalle)', async () => {
    // 1. Verificación estática de clientes.html (solo lectura + anti-clickjacking)
    const clientesHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/clientes.html'), 'utf8');
    assert.ok(clientesHtml.includes('Content-Security-Policy'));
    assert.ok(clientesHtml.includes("frame-ancestors 'none'"));
    assert.ok(clientesHtml.includes('window.top !== window.self'));
    assert.equal(clientesHtml.includes('data-action="eliminar"'), false);
    assert.equal(clientesHtml.includes('data-action="editar"'), false);
    assert.equal(clientesHtml.includes('btnNuevo'), false);

    // 2. Bloqueo 403 a CLIENTE mediante authGuard(['ADMIN', 'EMPLEADO'])
    resetEnvironment('/src/views/clientes.html');
    await loginMockUser('cliente_demo');
    const guardBlocked = authGuard(['ADMIN', 'EMPLEADO']);
    assert.equal(guardBlocked, false);
    assert.equal(globalThis.window.location.href, './catalogo.html?error=403');
    assert.ok(globalThis.sessionStorage.getItem('auth_flash_error')?.includes('403'));

    // Si se invoca initCustomersController como CLIENTE, no realiza llamadas a /api/customers
    const docCliente = globalThis.document;
    registerClientesDom(docCliente);
    let clientFetchCalled = false;
    globalThis.fetch = async () => {
        clientFetchCalled = true;
        return makeResponse({ status: 200, body: [] });
    };
    await customersCtrl.initCustomersController(docCliente);
    assert.equal(clientFetchCalled, false);

    // 3. Acceso permitido para EMPLEADO, renderizado seguro anti-XSS y modal de detalle
    resetEnvironment('/src/views/clientes.html');
    const doc = globalThis.document;
    registerClientesDom(doc);
    await loginMockUser('emp_ventas');

    const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const mockCustomers = [
        { customerId: 'ALFKI', companyName: xssPayload, contactName: 'Maria <b onclick=alert(1)>Anders</b>' },
        { customerId: 'BONAP', companyName: 'Bon app', contactName: 'Laurence Lebihan' }
    ];

    globalThis.fetch = async (url) => {
        if (url.endsWith('/customers/ALFKI')) {
            return makeResponse({ status: 200, body: mockCustomers[0] });
        }
        if (url.endsWith('/customers/MISS1')) {
            return makeResponse({ status: 404, body: { status: 404, detail: 'Cliente MISS1 no localizado.' } });
        }
        return makeResponse({ status: 200, body: mockCustomers });
    };

    await customersCtrl.initCustomersController(doc);

    assert.equal(doc.getElementById('lblTotalClientes').textContent, '2');
    const tbody = doc.getElementById('tbodyClientes');
    assert.equal(tbody.children.length, 2);

    // Verificar anti-XSS: el payload vive en textContent, no como innerHTML ejecutable
    assert.equal(collectInnerHtmlTree(tbody), '');
    assert.ok(collectTextTree(tbody).includes(xssPayload));

    // Filtro puro de clientes
    assert.equal(customersCtrl.filtrarClientes(mockCustomers, 'bon').length, 1);
    assert.equal(customersCtrl.filtrarClientes(mockCustomers, 'alfki').length, 1);

    // Abrir detalle vía evento click delegado
    const firstRowBtn = tbody.children[0].children[3].children[0];
    await doc.getElementById('tablaClientes').dispatchEvent('click', { target: firstRowBtn });

    assert.equal(doc.getElementById('modalDetalleCliente').classList.contains('show'), true);
    assert.equal(doc.getElementById('detClienteId').textContent, 'ALFKI');
    assert.equal(doc.getElementById('detClienteEmpresa').textContent, xssPayload);
    assert.equal(doc.getElementById('detClienteEmpresa').innerHTML, '');
    assert.equal(doc.getElementById('detClienteContacto').textContent, 'Maria <b onclick=alert(1)>Anders</b>');

    // Manejo de 404 en detalle
    const missingRes = await customersCtrl.verDetalleCliente('MISS1', doc);
    assert.equal(missingRes.ok, false);
    assert.equal(missingRes.status, 404);
    assert.equal(doc.getElementById('alertDetalleCliente').hidden, false);
    assert.ok(doc.getElementById('alertDetalleCliente').textContent.includes('MISS1'));

    // Cierre fallback del modal limpia los datos y alerta
    const btnCloseModal = new MockElement('button');
    btnCloseModal.setAttribute('data-bs-dismiss', 'modal');
    await doc.getElementById('modalDetalleCliente').dispatchEvent('click', { target: btnCloseModal });
    assert.equal(doc.getElementById('modalDetalleCliente').classList.contains('show'), false);
    assert.equal(doc.getElementById('detClienteId').textContent, '-');
    assert.equal(doc.getElementById('alertDetalleCliente').hidden, true);

    // 4. Integración con DataTable mock y safeTextRender / DataTable.render.text()
    resetEnvironment('/src/views/clientes.html');
    const dtDoc = globalThis.document;
    registerClientesDom(dtDoc);
    await loginMockUser('admin');
    let capturedDtConfig = null;
    let dtTextCalls = 0;
    globalThis.DataTable = class MockDT {
        constructor(_sel, cfg) {
            capturedDtConfig = cfg;
        }
        clear() { return this; }
        rows = { add: () => this };
        draw() { return this; }
        static render = {
            text() {
                return {
                    display(v) {
                        dtTextCalls += 1;
                        return tableHelpers.escapeHtml(v);
                    }
                };
            }
        };
    };
    await customersCtrl.initCustomersController(dtDoc);
    assert.ok(capturedDtConfig);
    const renderedCompany = capturedDtConfig.columns[1].render('<script>x</script>', 'display');
    assert.equal(dtTextCalls, 1);
    assert.equal(renderedCompany, '&lt;script&gt;x&lt;/script&gt;');
});

test('TASK-F4-03: OrderModel (11 campos, estatus logístico, dirección postal, validación ID) y orderService (solo lectura)', async () => {
    resetEnvironment('/src/views/ordenes.html');
    await loginMockUser('admin');

    // Validación estricta de orderId
    assert.equal(validateOrderId('10248').value, 10248);
    assert.equal(validateOrderId(10248).value, 10248);
    for (const badOrderId of ['', '0', 0, -5, 12.5, '10248a', '../1', null, undefined, true]) {
        assert.equal(validateOrderId(badOrderId).valid, false, `Debe rechazar orderId inválido: ${String(badOrderId)}`);
    }

    // Proyección estricta a 11 propiedades (REQ-SEC-003)
    const dto = OrderModel.fromApiDto({
        OrderId: 10248,
        OrderDate: '2026-10-01T00:00:00Z',
        RequiredDate: '2026-10-15T00:00:00Z',
        ShippedDate: '2026-10-05T00:00:00Z',
        Freight: '32.38',
        ShipName: ' Vins et alcools Chevalier ',
        ShipAddress: '59 rue de l Abbaye',
        ShipCity: 'Reims',
        ShipRegion: null,
        ShipPostalCode: '51100',
        ShipCountry: 'France',
        CustomerId: 'VINET',
        EmployeeId: 5
    });
    assert.deepEqual(Object.keys(dto), [
        'orderId', 'orderDate', 'requiredDate', 'shippedDate', 'freight',
        'shipName', 'shipAddress', 'shipCity', 'shipRegion', 'shipPostalCode', 'shipCountry'
    ]);
    assert.equal(dto.freight, 32.38);
    assert.equal(dto.shipRegion, '');

    // Resolución determinista de los 3 estados logísticos
    const refDate = new Date('2026-11-10T12:00:00Z');
    assert.equal(
        OrderModel.resolveLogisticsStatus({ shippedDate: null }, refDate).code,
        ORDER_STATUS.PENDIENTE.code
    );
    assert.equal(
        OrderModel.resolveLogisticsStatus(
            { shippedDate: '2026-11-08T00:00:00Z', requiredDate: '2026-11-15T00:00:00Z' },
            refDate
        ).code,
        ORDER_STATUS.EN_TRANSITO.code
    );
    assert.equal(
        OrderModel.resolveLogisticsStatus(
            { shippedDate: '2026-11-08T00:00:00Z', requiredDate: null },
            refDate
        ).code,
        ORDER_STATUS.EN_TRANSITO.code
    );
    assert.equal(
        OrderModel.resolveLogisticsStatus(
            { shippedDate: '2026-10-05T00:00:00Z', requiredDate: '2026-10-15T00:00:00Z' },
            refDate
        ).code,
        ORDER_STATUS.ENTREGADO.code
    );

    assert.equal(
        OrderModel.formatPostalAddress(dto),
        '59 rue de l Abbaye, Reims, 51100, France'
    );
    assert.equal(OrderModel.formatPostalAddress({}), 'Sin dirección postal registrada');

    // Contrato estricto de solo lectura en orderService
    assert.equal(Object.isFrozen(orderService), true);
    assert.deepEqual(Object.keys(orderService).sort(), ['getAll', 'getById']);

    globalThis.fetch = async (url) => {
        if (url.endsWith('/orders/99999')) {
            return makeResponse({
                status: 404,
                body: { status: 404, title: 'Not Found', detail: 'La orden 99999 no existe.' }
            });
        }
        if (url.endsWith('/orders/10248')) {
            return makeResponse({ status: 200, body: dto });
        }
        return makeResponse({ status: 200, body: [dto] });
    };

    const list = await orderService.getAll();
    assert.equal(list.length, 1);
    assert.equal(list[0].orderId, 10248);

    const byId = await orderService.getById(10248);
    assert.equal(byId.shipCity, 'Reims');

    await assert.rejects(
        () => orderService.getById('abc'),
        (err) => err instanceof ApiError && err.status === 400
    );

    await assert.rejects(
        () => orderService.getById(99999),
        (err) => err instanceof ApiError && err.status === 404 && err.problemDetails?.detail.includes('99999')
    );
});

test('TASK-F4-04: ordenes.html, pedidos.html y ordersController.js (RBAC, filtros, búsqueda ID, anti-XSS y modal)', async () => {
    // 1. Verificación estática de sincronización entre ordenes.html y pedidos.html + solo lectura + clickjacking
    const ordenesHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/ordenes.html'), 'utf8');
    const pedidosHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/pedidos.html'), 'utf8');

    for (const html of [ordenesHtml, pedidosHtml]) {
        assert.ok(html.includes('Content-Security-Policy'));
        assert.ok(html.includes("frame-ancestors 'none'"));
        assert.ok(html.includes('window.top !== window.self'));
        assert.ok(html.includes('src="../controllers/ordersController.js"'));
        assert.ok(html.includes('id="formBuscarOrdenId"'));
        assert.ok(html.includes('id="selEstadoOrden"'));
        assert.ok(html.includes('id="modalDetalleOrden"'));
        assert.equal(html.includes('data-action="eliminar"'), false);
        assert.equal(html.includes('data-action="editar"'), false);
    }

    const extractMainAndModal = (html) => html.slice(html.indexOf('<main'), html.indexOf('<!-- jQuery'));
    assert.equal(extractMainAndModal(ordenesHtml), extractMainAndModal(pedidosHtml));

    const refOrders = [
        {
            orderId: 10248,
            orderDate: '2026-09-01T00:00:00Z',
            requiredDate: '2026-09-15T00:00:00Z',
            shippedDate: '2026-09-04T00:00:00Z',
            freight: 32.38,
            shipName: 'cliente_ana <script>alert(1)</script>',
            shipAddress: 'Av. Reforma 100',
            shipCity: 'CDMX',
            shipRegion: 'Centro',
            shipPostalCode: '06600',
            shipCountry: 'México'
        },
        {
            orderId: 10249,
            orderDate: '2026-11-22T00:00:00Z',
            requiredDate: '2026-12-20T00:00:00Z',
            shippedDate: '2026-11-23T00:00:00Z',
            freight: 11.61,
            shipName: 'Toms Spezialitäten',
            shipAddress: 'Luisenstr. 48',
            shipCity: 'Münster',
            shipRegion: '',
            shipPostalCode: '44087',
            shipCountry: 'Germany'
        },
        {
            orderId: 10250,
            orderDate: '2026-11-23T00:00:00Z',
            requiredDate: '2026-12-05T00:00:00Z',
            shippedDate: null,
            freight: 65.83,
            shipName: 'Hanari Carnes',
            shipAddress: 'Rua do Paço 67',
            shipCity: 'Rio de Janeiro',
            shipRegion: 'RJ',
            shipPostalCode: '05454-876',
            shipCountry: 'Brazil'
        }
    ];

    // 2. Vista ADMIN: visualiza todas las órdenes y filtra por estatus logístico
    resetEnvironment('/src/views/ordenes.html');
    const adminDoc = globalThis.document;
    registerOrdenesDom(adminDoc);
    await loginMockUser('admin');

    globalThis.fetch = async (url) => {
        const match = url.match(/\/orders\/(\d+)$/i);
        if (match) {
            const id = Number(match[1]);
            const found = refOrders.find((o) => o.orderId === id);
            if (!found) {
                return makeResponse({ status: 404, body: { status: 404, detail: `Orden ${id} no encontrada.` } });
            }
            return makeResponse({ status: 200, body: found });
        }
        return makeResponse({ status: 200, body: refOrders });
    };

    await ordersCtrl.initOrdersController(adminDoc);

    assert.equal(adminDoc.getElementById('infoFiltroCliente').hidden, true);
    assert.equal(adminDoc.getElementById('lblTotalOrdenes').textContent, '3');
    const adminTbody = adminDoc.getElementById('tbodyPedidos');
    assert.equal(adminTbody.children.length, 3);
    assert.equal(adminTbody.children[0].children.length, 9);
    assert.equal(collectInnerHtmlTree(adminTbody), '');
    assert.ok(collectTextTree(adminTbody).includes('<script>alert(1)</script>'));

    // Filtrar por PENDIENTE -> 1 orden (#10250)
    adminDoc.getElementById('selEstadoOrden').value = 'PENDIENTE';
    await adminDoc.getElementById('selEstadoOrden').dispatchEvent('change');
    assert.equal(adminDoc.getElementById('lblTotalOrdenes').textContent, '1');
    assert.equal(adminDoc.getElementById('tbodyPedidos').children.length, 1);

    // Limpiar filtro
    await adminDoc.getElementById('btnLimpiarOrdenId').dispatchEvent('click');
    assert.equal(adminDoc.getElementById('lblTotalOrdenes').textContent, '3');

    // Abrir detalle de orden #10248
    const verBtn = adminTbody.children[0].children[8].children[0];
    await adminDoc.getElementById('tablaPedidos').dispatchEvent('click', { target: verBtn });

    assert.equal(adminDoc.getElementById('modalDetalleOrden').classList.contains('show'), true);
    assert.equal(adminDoc.getElementById('detOrdenId').textContent, '#10248');
    assert.equal(adminDoc.getElementById('detOrdenEstatus').textContent, 'Entregado');
    assert.equal(adminDoc.getElementById('detOrdenFlete').textContent, '$32.38');
    assert.equal(adminDoc.getElementById('detOrdenDestinatario').textContent, 'cliente_ana <script>alert(1)</script>');
    assert.equal(adminDoc.getElementById('detOrdenDestinatario').innerHTML, '');
    assert.equal(adminDoc.getElementById('detOrdenDireccionCompleta').textContent, 'Av. Reforma 100, CDMX, Centro, 06600, México');

    // 3. Vista CLIENTE: aislamiento de órdenes ajenas + consulta puntual por ID
    resetEnvironment('/src/views/pedidos.html');
    const clientDoc = globalThis.document;
    registerOrdenesDom(clientDoc);
    await loginMockUser('cliente_ana');

    await ordersCtrl.initOrdersController(clientDoc);

    // Muestra banner informativo de cliente y únicamente la orden asociada a cliente_ana (#10248)
    assert.equal(clientDoc.getElementById('infoFiltroCliente').hidden, false);
    assert.equal(clientDoc.getElementById('lblTotalOrdenes').textContent, '1');
    assert.equal(ordersCtrl.getVisibleOrdersCache()[0].orderId, 10248);

    // Intento directo de abrir orden ajena (#10250) sin buscarla -> 403
    const directDenied = await ordersCtrl.verDetalleOrden(10250, clientDoc);
    assert.equal(directDenied.ok, false);
    assert.equal(directDenied.status, 403);

    // Búsqueda explícita por N° de Orden (#10250) vía formulario -> consulta GET /api/orders/10250 y abre modal
    clientDoc.getElementById('txtBuscarOrdenId').value = '10250';
    await clientDoc.getElementById('formBuscarOrdenId').dispatchEvent('submit');

    assert.equal(clientDoc.getElementById('lblTotalOrdenes').textContent, '2');
    assert.equal(clientDoc.getElementById('detOrdenId').textContent, '#10250');
    assert.equal(clientDoc.getElementById('detOrdenEstatus').textContent, 'Pendiente');

    // Búsqueda de orden inexistente -> alerta amigable 404
    clientDoc.getElementById('txtBuscarOrdenId').value = '99999';
    await clientDoc.getElementById('formBuscarOrdenId').dispatchEvent('submit');
    assert.equal(clientDoc.getElementById('alertOrdenes').hidden, false);
    assert.ok(clientDoc.getElementById('alertOrdenes').textContent.includes('99999'));

    // 4. Integración con DataTable mock y DataTable.render.text() en ordersController
    resetEnvironment('/src/views/ordenes.html');
    const dtOrdersDoc = globalThis.document;
    registerOrdenesDom(dtOrdersDoc);
    await loginMockUser('admin');
    let ordersDtConfig = null;
    let dtOrderTextCalls = 0;
    globalThis.DataTable = class MockOrdersDT {
        constructor(_sel, cfg) {
            ordersDtConfig = cfg;
        }
        clear() { return this; }
        rows = { add: () => this };
        draw() { return this; }
        static render = {
            text() {
                return {
                    display(v) {
                        dtOrderTextCalls += 1;
                        return tableHelpers.escapeHtml(v);
                    }
                };
            }
        };
    };
    await ordersCtrl.initOrdersController(dtOrdersDoc);
    assert.ok(ordersDtConfig);
    assert.equal(ordersDtConfig.columns.length, 9);
    const safeRecipient = ordersDtConfig.columns[5].render('<img src=x onerror=alert(1)>', 'display');
    assert.equal(dtOrderTextCalls, 1);
    assert.equal(safeRecipient, '&lt;img src=x onerror=alert(1)&gt;');
});

test('Auditoria de Seguridad y Calidad Fase 4: cero innerHTML en controladores y sin endpoints inexistentes', () => {
    const customersCtrlSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/controllers/customersController.js'), 'utf8');
    const ordersCtrlSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/controllers/ordersController.js'), 'utf8');

    assert.equal(customersCtrlSrc.includes('innerHTML'), false);
    assert.equal(ordersCtrlSrc.includes('innerHTML'), false);

    // Verificar ausencia de llamadas a endpoints inexistentes en todo src/
    function scanFiles(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                scanFiles(fullPath);
            } else if (/\.(js|html)$/i.test(entry.name)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                for (const forbiddenEndpoint of ['/api/categories', '/api/suppliers', '/api/employees']) {
                    assert.equal(
                        content.toLowerCase().includes(forbiddenEndpoint),
                        false,
                        `Referencia prohibida a ${forbiddenEndpoint} en ${fullPath}`
                    );
                }
            }
        }
    }
    scanFiles(path.join(ROOT_DIR, 'src'));

    // Helpers de tableHelpers.js
    assert.equal(tableHelpers.formatDate('2026-10-05T00:00:00Z').length > 0, true);
    assert.equal(tableHelpers.formatDate(null), 'N/A');
    assert.equal(
        tableHelpers.extractProblemMessage({ problemDetails: { status: 500, detail: 'System.SqlException at Foo()' } }),
        'Ocurrió un error interno en el servidor. Intenta nuevamente más tarde.'
    );
    assert.equal(
        tableHelpers.extractProblemMessage({ status: 404, detail: 'Not Found' }, 'Orden no encontrada.'),
        'Orden no encontrada.'
    );
});
