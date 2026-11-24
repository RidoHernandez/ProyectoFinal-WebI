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
                        // Parse nested IDs in injected modal HTML for getElementById lookup
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
        pathname: '/src/views/login.html',
        search: '',
        href: 'http://localhost:3000/src/views/login.html'
    },
    confirm: () => true
};
globalThis.confirm = (...args) => globalThis.window.confirm(...args);
globalThis.document = createMockDocument();

const config = await import('../src/api/config.js');
const httpMod = await import('../src/api/httpClient.js');
const authMod = await import('../src/services/authService.js');
const guardMod = await import('../src/utils/authGuard.js');
const loginMod = await import('../src/controllers/loginController.js');
const tableHelpers = await import('../src/utils/tableHelpers.js');
const productsMod = await import('../src/controllers/productsController.js');

const {
    authService,
    ROLES,
    ADMIN_WHITELIST,
    EMPLOYEE_WHITELIST,
    EMPLOYEE_PREFIX,
    resolveUserRole,
    computeSessionSignature,
    verifySessionIntegrity,
    purgeResidualLocalStorage
} = authMod;
const { authGuard } = guardMod;

function resetEnvironment(pathname = '/src/views/login.html', search = '') {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
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

test('Auditoria de Seguridad: Eliminacion total de la llave maestra estatica en src/ y tests/', () => {
    const forbiddenKey = ['ROBE', 'LINGO', 'KEY', '1234'].join('-');

    function scanDir(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (/\.(js|mjs|html|css)$/i.test(entry.name)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                assert.equal(
                    content.includes(forbiddenKey),
                    false,
                    `Se encontro referencia prohibida a la llave maestra en ${fullPath}`
                );
            }
        }
    }

    scanDir(path.join(ROOT_DIR, 'src'));
    scanDir(path.join(ROOT_DIR, 'tests'));
});

test('TASK-F2-01: authService.login, register, regenerateApiKey, logout y metodos utilitarios', async () => {
    resetEnvironment('/src/views/login.html');
    const futureExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const capturedRequests = [];
    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        return makeResponse({
            status: 200,
            body: {
                UserId: 10,
                Username: 'admin',
                ApiKey: 'ak_login_admin_9999',
                ExpiresAt: futureExp
            }
        });
    };

    // 1. login(username, password) con respuesta PascalCase del backend
    const adminSession = await authService.login('admin', 'Password123!');
    assert.equal(capturedRequests.at(-1).url, 'https://localhost:7039/api/auth/login');
    assert.equal(adminSession.userId, 10);
    assert.equal(adminSession.username, 'admin');
    assert.equal(adminSession.role, ROLES.ADMIN);
    assert.equal(adminSession.apiKey, 'ak_login_admin_9999');

    // Metodos utilitarios
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.getApiKey(), 'ak_login_admin_9999');
    assert.equal(authService.getUserRole(), 'ADMIN');
    assert.equal(authService.hasRole(['ADMIN', 'EMPLEADO']), true);
    assert.equal(authService.hasRole('ADMIN'), true);
    assert.equal(authService.hasRole(['CLIENTE']), false);

    const currentUser = authService.getCurrentUser();
    assert.equal(currentUser.userId, 10);
    assert.equal(currentUser.username, 'admin');
    assert.equal(currentUser.role, 'ADMIN');
    assert.equal(currentUser.apiKey, 'ak_login_admin_9999');
    assert.equal(currentUser.expiresAt, futureExp);

    // 2. regenerateApiKey() para ADMIN actualiza sessionStorage sin re-login
    const newFutureExp = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        return makeResponse({
            status: 200,
            body: {
                Id: 55,
                ClientIdentifier: 'admin',
                ApiKey: 'ak_regenerated_admin_7777',
                CreatedAt: new Date().toISOString(),
                IsActive: true,
                ExpiresAt: newFutureExp
            }
        });
    };

    const regenResult = await authService.regenerateApiKey();
    assert.equal(capturedRequests.at(-1).url, 'https://localhost:7039/api/apikeys/regenerate');
    assert.equal(capturedRequests.at(-1).options.headers['X-API-KEY'], 'ak_login_admin_9999');
    assert.equal(regenResult.apiKey, 'ak_regenerated_admin_7777');
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.getApiKey(), 'ak_regenerated_admin_7777');
    assert.equal(authService.getCurrentUser().expiresAt, newFutureExp);

    // 3. logout() limpia sessionStorage y redirige a ./login.html
    authService.logout();
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(authService.getCurrentUser(), null);
    assert.equal(authService.getUserRole(), null);
    assert.equal(authService.getApiKey(), null);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.window.location.href, './login.html');

    // 4. register(username, email, password) invoca POST /api/auth/register y asigna CLIENTE
    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        return makeResponse({
            status: 201,
            body: {
                userId: 42,
                username: 'nuevo_cliente',
                apiKey: 'ak_cliente_4200',
                expiresAt: futureExp
            }
        });
    };

    const clientSession = await authService.register('nuevo_cliente', 'cliente@correo.com', 'ClaveSegura123');
    assert.equal(capturedRequests.at(-1).url, 'https://localhost:7039/api/auth/register');
    assert.equal(clientSession.role, ROLES.CLIENTE);
    assert.equal(authService.getUserRole(), 'CLIENTE');
    assert.equal(authService.hasRole(['CLIENTE']), true);
    assert.equal(authService.hasRole(['ADMIN', 'EMPLEADO']), false);

    // CLIENTE no tiene permiso para regenerar API Key
    await assert.rejects(
        () => authService.regenerateApiKey(),
        (err) => err.status === 403
    );
});

test('TASK-F2-02: Almacenamiento seguro en sessionStorage, purga de localStorage y control de expiracion', async () => {
    resetEnvironment('/src/views/productos.html');

    // Sembrar llaves sensibles residuales en localStorage + URL no sensible
    globalThis.localStorage.setItem('northwind_api_key', 'RESIDUAL_KEY');
    globalThis.localStorage.setItem('auth_session', '{"role":"ADMIN"}');
    globalThis.localStorage.setItem('token', 'RESIDUAL_JWT');
    globalThis.localStorage.setItem('northwind_api_url', 'http://localhost:5009/api');

    purgeResidualLocalStorage();
    assert.equal(globalThis.localStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.localStorage.getItem('auth_session'), null);
    assert.equal(globalThis.localStorage.getItem('token'), null);
    assert.equal(globalThis.localStorage.getItem('northwind_api_url'), 'http://localhost:5009/api');

    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 7,
            username: 'emp_carlos',
            apiKey: 'ak_emp_carlos_1234',
            expiresAt: futureExp
        }
    });

    await authService.login('emp_carlos', 'Password123!');

    // Verificar estructura exacta de auth_session en sessionStorage
    const rawSession = globalThis.sessionStorage.getItem('auth_session');
    assert.ok(rawSession);
    const parsed = JSON.parse(rawSession);
    assert.equal(parsed.userId, 7);
    assert.equal(parsed.username, 'emp_carlos');
    assert.equal(parsed.role, 'EMPLEADO');
    assert.equal(parsed.apiKey, 'ak_emp_carlos_1234');
    assert.equal(parsed.expiresAt, futureExp);
    assert.equal(typeof parsed.authenticatedAt, 'number');
    assert.ok(parsed.signature.startsWith('sig_'));
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), 'ak_emp_carlos_1234');

    // Simular sesion con expiresAt en el pasado: isAuthenticated() debe forzar logout()
    const pastExp = new Date(Date.now() - 60 * 1000).toISOString();
    const expiredBase = {
        ...parsed,
        expiresAt: pastExp
    };
    expiredBase.signature = computeSessionSignature(expiredBase);
    globalThis.sessionStorage.setItem('auth_session', JSON.stringify(expiredBase));

    assert.equal(authService.isAuthenticated(), false);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.window.location.href, './login.html');
});

test('TASK-F2-03: Mapeo determinista de roles (ADMIN, EMPLEADO, CLIENTE) e inmutabilidad ante manipulacion', async () => {
    resetEnvironment('/src/views/login.html');

    // 1. Mapeo determinista de ADMIN
    for (const adminUser of ['admin', 'ADMIN', 'administrador', '  Administrador  ']) {
        assert.equal(resolveUserRole(adminUser), ROLES.ADMIN);
    }

    // 2. Mapeo determinista de EMPLEADO (prefijo emp_* y whitelist)
    for (const empUser of ['emp_01', 'EMP_VENTAS', 'empleado', 'operador', 'ventas']) {
        assert.equal(resolveUserRole(empUser), ROLES.EMPLEADO);
    }

    // 3. Mapeo determinista de CLIENTE para usuarios estandar
    for (const clientUser of ['cliente_demo', 'maria_lopez', 'usuario123', '']) {
        assert.equal(resolveUserRole(clientUser), ROLES.CLIENTE);
    }

    // 4. Blindaje de registro publico: incluso si se registra con nombre "admin" o "emp_jefe", obtiene CLIENTE
    assert.equal(resolveUserRole('admin', { isRegistration: true }), ROLES.CLIENTE);
    assert.equal(resolveUserRole('emp_jefe', { isRegistration: true }), ROLES.CLIENTE);

    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 201,
        body: {
            userId: 99,
            username: 'emp_intruso',
            apiKey: 'ak_reg_intruso_001',
            expiresAt: futureExp
        }
    });

    const regSession = await authService.register('emp_intruso', 'intruso@test.com', 'Password123!');
    assert.equal(regSession.role, ROLES.CLIENTE);
    assert.equal(authService.getUserRole(), ROLES.CLIENTE);

    // 5. Inmutabilidad en cliente: editar role en sessionStorage invalida inmediatamente la sesion
    const stored = JSON.parse(globalThis.sessionStorage.getItem('auth_session'));
    stored.role = 'ADMIN';
    globalThis.sessionStorage.setItem('auth_session', JSON.stringify(stored));

    assert.equal(authService.isAuthenticated(), false);
    assert.equal(authService.getCurrentUser(), null);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);

    // 6. Incluso si un usuario CLIENTE recalcula la firma con role: 'ADMIN', verifySessionIntegrity lo rechaza
    const forgedSession = {
        userId: 105,
        username: 'cliente_normal',
        role: 'ADMIN',
        apiKey: 'ak_forged_123',
        expiresAt: futureExp,
        authenticatedAt: Date.now()
    };
    forgedSession.signature = computeSessionSignature(forgedSession);
    assert.equal(verifySessionIntegrity(forgedSession), false);
});

test('TASK-F2-04: authGuard protege rutas, redirige con 403 y todas las vistas/controladores estan integrados', async () => {
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();

    // 1. Usuario NO autenticado -> redirige a ./login.html y retorna false
    resetEnvironment('/src/views/productos.html');
    const resUnauth = authGuard(['ADMIN', 'EMPLEADO']);
    assert.equal(resUnauth, false);
    assert.equal(globalThis.window.location.href, './login.html');

    // 2. Usuario CLIENTE intentando acceder a ruta de ['ADMIN', 'EMPLEADO'] -> bloquea, guarda flash 403 y redirige a ./catalogo.html?error=403
    resetEnvironment('/src/views/productos.html');
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { userId: 33, username: 'cliente_ana', apiKey: 'ak_ana_123', expiresAt: futureExp }
    });
    await authService.login('cliente_ana', 'Password123!');

    const resForbidden = authGuard(['ADMIN', 'EMPLEADO']);
    assert.equal(resForbidden, false);
    assert.equal(globalThis.window.location.href, './catalogo.html?error=403');
    assert.ok(globalThis.sessionStorage.getItem('auth_flash_error')?.includes('403'));
    assert.equal(globalThis.document.body.getAttribute('data-auth-blocked'), '403');
    assert.equal(globalThis.document.body.style.display, 'none');

    // 3. Usuario CLIENTE accediendo a catalogo.html (['ADMIN', 'EMPLEADO', 'CLIENTE']) -> permitido
    resetEnvironment('/src/views/catalogo.html');
    await authService.login('cliente_ana', 'Password123!');
    const resAllowedClient = authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE']);
    assert.ok(resAllowedClient);
    assert.equal(resAllowedClient.username, 'cliente_ana');
    assert.equal(resAllowedClient.role, 'CLIENTE');

    // 4. Usuario EMPLEADO accediendo a productos.html (['ADMIN', 'EMPLEADO']) -> permitido
    resetEnvironment('/src/views/productos.html');
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { userId: 20, username: 'emp_luis', apiKey: 'ak_luis_123', expiresAt: futureExp }
    });
    await authService.login('emp_luis', 'Password123!');
    const resAllowedEmp = authGuard(['ADMIN', 'EMPLEADO']);
    assert.ok(resAllowedEmp);
    assert.equal(resAllowedEmp.role, 'EMPLEADO');

    // 5. Verificacion estatica de controladores y vistas HTML en src/views/
    const controllerExpectations = [
        { file: 'src/controllers/productsController.js', guardCall: "authGuard(['ADMIN', 'EMPLEADO'])" },
        { file: 'src/controllers/customersController.js', guardCall: "authGuard(['ADMIN', 'EMPLEADO'])" },
        { file: 'src/controllers/ordersController.js', guardCall: "authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE'])" },
        { file: 'src/controllers/catalogController.js', guardCall: "authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE'])" }
    ];

    for (const item of controllerExpectations) {
        const content = fs.readFileSync(path.join(ROOT_DIR, item.file), 'utf8');
        assert.ok(
            content.includes(item.guardCall),
            `El controlador ${item.file} debe invocar ${item.guardCall}`
        );
    }

    const viewExpectations = [
        { file: 'src/views/login.html', script: '../controllers/loginController.js' },
        { file: 'src/views/productos.html', script: '../controllers/productsController.js' },
        { file: 'src/views/clientes.html', script: '../controllers/customersController.js' },
        { file: 'src/views/pedidos.html', script: '../controllers/ordersController.js' },
        { file: 'src/views/ordenes.html', script: '../controllers/ordersController.js' },
        { file: 'src/views/catalogo.html', script: '../controllers/catalogController.js' }
    ];

    for (const view of viewExpectations) {
        const fullPath = path.join(ROOT_DIR, view.file);
        assert.equal(fs.existsSync(fullPath), true, `La vista ${view.file} debe existir en src/views/`);
        const html = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
            html.includes(`src="${view.script}"`),
            `La vista ${view.file} debe importar ${view.script}`
        );
        assert.equal(
            html.includes('./src/controllers/'),
            false,
            `La vista ${view.file} no debe tener rutas rotas ./src/controllers/`
        );
    }
});

test('TASK-F2-05: login.html y loginController.js (pestanas, validaciones, redireccion por rol y ProblemDetails 400/401)', async () => {
    // 1. Validaciones unitarias de entrada
    assert.equal(loginMod.validateLoginInput({ username: '', password: '123' }).valid, false);
    assert.equal(loginMod.validateLoginInput({ username: 'admin', password: '' }).valid, false);
    assert.equal(loginMod.validateLoginInput({ username: 'admin', password: 'Password123' }).valid, true);

    assert.equal(loginMod.validateRegisterInput({ username: 'ab', email: 'a@b.com', password: 'Password123' }).valid, false);
    assert.equal(loginMod.validateRegisterInput({ username: 'con espacio', email: 'a@b.com', password: 'Password123' }).valid, false);
    assert.equal(loginMod.validateRegisterInput({ username: 'cliente1', email: 'correo-invalido', password: 'Password123' }).valid, false);
    assert.equal(loginMod.validateRegisterInput({ username: 'cliente1', email: 'a@b.com', password: '1234567' }).valid, false);
    assert.equal(loginMod.validateRegisterInput({ username: 'cliente1', email: 'a@b.com', password: 'Password123' }).valid, true);

    // 2. Rutas de redireccion por rol
    assert.equal(loginMod.resolveRedirectPath('ADMIN'), './productos.html');
    assert.equal(loginMod.resolveRedirectPath('EMPLEADO'), './productos.html');
    assert.equal(loginMod.resolveRedirectPath('CLIENTE'), './catalogo.html');

    // 3. Flujo DOM completo en initLoginController
    resetEnvironment('/src/views/login.html', '?reason=session_expired');
    const doc = globalThis.document;

    const ids = [
        'tabLogin', 'tabRegister', 'paneLogin', 'paneRegister',
        'formLogin', 'txtLoginUsername', 'txtLoginPassword', 'errLoginUsername', 'errLoginPassword', 'txtApiUrl', 'btnLogin',
        'formRegister', 'txtRegUsername', 'txtRegEmail', 'txtRegPassword', 'errRegUsername', 'errRegEmail', 'errRegPassword', 'btnRegister',
        'alertError', 'alertSuccess'
    ];
    for (const id of ids) {
        doc.registerElement(new MockElement('div', id));
    }
    doc.getElementById('alertError').classList.add('d-none');
    doc.getElementById('alertSuccess').classList.add('d-none');

    await loginMod.initLoginController(doc);

    // Debe mostrar mensaje amigable por ?reason=session_expired
    assert.equal(doc.getElementById('alertError').classList.contains('d-none'), false);
    assert.ok(doc.getElementById('alertError').textContent.includes('expirado'));

    // Alternancia de pestanas Login <-> Registro
    await doc.getElementById('tabRegister').dispatchEvent('click');
    assert.equal(doc.getElementById('tabRegister').classList.contains('active'), true);
    assert.equal(doc.getElementById('paneRegister').classList.contains('active'), true);

    await doc.getElementById('tabLogin').dispatchEvent('click');
    assert.equal(doc.getElementById('tabLogin').classList.contains('active'), true);

    // Login fallido con 401 ProblemDetails
    globalThis.fetch = async () => makeResponse({
        status: 401,
        body: {
            status: 401,
            title: 'Unauthorized',
            detail: 'El usuario o la contraseña proporcionados son incorrectos.'
        }
    });

    doc.getElementById('txtLoginUsername').value = 'admin';
    doc.getElementById('txtLoginPassword').value = 'WrongPass123';
    await doc.getElementById('formLogin').dispatchEvent('submit');

    assert.equal(doc.getElementById('alertError').textContent, 'El usuario o la contraseña proporcionados son incorrectos.');
    assert.equal(doc.getElementById('txtLoginUsername').classList.contains('is-invalid'), true);

    // Login exitoso como EMPLEADO -> redirige a ./productos.html
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { userId: 15, username: 'emp_sofia', apiKey: 'ak_sofia_01', expiresAt: futureExp }
    });
    doc.getElementById('txtLoginUsername').value = 'emp_sofia';
    doc.getElementById('txtLoginPassword').value = 'ValidPass123!';
    await doc.getElementById('formLogin').dispatchEvent('submit');

    assert.equal(globalThis.window.location.href, './productos.html');
    assert.equal(authService.getUserRole(), 'EMPLEADO');

    // Registro fallido con 400 ProblemDetails por correo duplicado -> resalta #txtRegEmail con .is-invalid
    authService.logout();
    globalThis.fetch = async () => makeResponse({
        status: 400,
        body: {
            status: 400,
            title: 'Bad Request',
            detail: 'El correo electrónico ya se encuentra registrado.'
        }
    });

    doc.getElementById('txtRegUsername').value = 'cliente_nuevo';
    doc.getElementById('txtRegEmail').value = 'duplicado@correo.com';
    doc.getElementById('txtRegPassword').value = 'Password123!';
    await doc.getElementById('formRegister').dispatchEvent('submit');

    assert.equal(doc.getElementById('txtRegEmail').classList.contains('is-invalid'), true);
    assert.equal(doc.getElementById('alertError').textContent, 'El correo electrónico ya se encuentra registrado.');

    // Registro exitoso -> asigna rol CLIENTE y redirige a ./catalogo.html
    globalThis.fetch = async () => makeResponse({
        status: 201,
        body: { userId: 88, username: 'cliente_nuevo', apiKey: 'ak_nuevo_88', expiresAt: futureExp }
    });
    doc.getElementById('txtRegEmail').value = 'nuevo_unico@correo.com';
    await doc.getElementById('formRegister').dispatchEvent('submit');

    assert.equal(globalThis.window.location.href, './catalogo.html');
    assert.equal(authService.getUserRole(), 'CLIENTE');
});

test('TASK-F2-06: Adaptacion dinamica de interfaz (initNavbar y permisos de EMPLEADO vs ADMIN en productos)', async () => {
    resetEnvironment('/src/views/catalogo.html', '?error=403');
    const doc = globalThis.document;

    // Construir navbar de prueba
    const lblUsuario = doc.registerElement(new MockElement('strong', 'lblUsuario'));
    const badgeRol = doc.registerElement(new MockElement('span', 'badgeRol'));
    const navItemProductos = doc.registerElement(new MockElement('li', 'navItemProductos'));
    const navProductos = doc.registerElement(new MockElement('a', 'navProductos'));
    navProductos.setAttribute('href', './productos.html');
    navItemProductos.appendChild(navProductos);

    const navItemClientes = doc.registerElement(new MockElement('li', 'navItemClientes'));
    const navClientes = doc.registerElement(new MockElement('a', 'navClientes'));
    navClientes.setAttribute('href', './clientes.html');
    navItemClientes.appendChild(navClientes);

    const navItemCatalogo = doc.registerElement(new MockElement('li', 'navItemCatalogo'));
    const navCatalogo = doc.registerElement(new MockElement('a', 'navCatalogo'));
    navCatalogo.setAttribute('href', './catalogo.html');
    navItemCatalogo.appendChild(navCatalogo);

    const navItemPedidos = doc.registerElement(new MockElement('li', 'navItemPedidos'));
    const navPedidos = doc.registerElement(new MockElement('a', 'navPedidos'));
    navPedidos.setAttribute('href', './pedidos.html');
    navItemPedidos.appendChild(navPedidos);

    const btnContainer = doc.registerElement(new MockElement('div', 'btnContainer'));
    const btnPerfilApiKey = doc.registerElement(new MockElement('button', 'btnPerfilApiKey'));
    const btnLogout = doc.registerElement(new MockElement('button', 'btnLogout'));
    btnContainer.appendChild(btnPerfilApiKey);
    btnContainer.appendChild(btnLogout);

    doc.registerElement(new MockElement('div', 'alertContainer403'));

    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: { userId: 50, username: 'cliente_pedro', apiKey: 'ak_pedro_5000', expiresAt: futureExp }
    });
    await authService.login('cliente_pedro', 'Password123!');
    globalThis.sessionStorage.setItem('auth_flash_error', 'Acceso denegado (403): Seccion exclusiva de personal.');

    // 1. Inicializar navbar para CLIENTE
    tableHelpers.initNavbar(authService.getCurrentUser(), authService);

    assert.equal(lblUsuario.textContent, 'cliente_pedro');
    assert.equal(badgeRol.textContent, 'CLIENTE');
    assert.equal(navProductos.hidden, true);
    assert.equal(navClientes.hidden, true);
    assert.equal(navCatalogo.hidden, false);
    assert.equal(navPedidos.hidden, false);
    assert.equal(btnPerfilApiKey.hidden, true);

    // Banner 403 renderizado y flash consumido
    const alert403 = doc.getElementById('alertAccesoDenegado');
    assert.ok(alert403);
    assert.equal(globalThis.sessionStorage.getItem('auth_flash_error'), null);

    // 2. Confirmacion de cierre de sesion: si cancela no cierra sesion, si confirma ejecuta logout()
    globalThis.window.confirm = () => false;
    btnLogout.onclick({ preventDefault() {} });
    assert.equal(authService.isAuthenticated(), true);

    globalThis.window.confirm = () => true;
    btnLogout.onclick({ preventDefault() {} });
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(globalThis.window.location.href, './login.html');

    // 3. Permisos en productsController.js para EMPLEADO vs ADMIN
    const btnNuevoProducto = doc.registerElement(new MockElement('button', 'btnNuevoProducto'));
    const btnEliminarFila = doc.registerElement(new MockElement('button', 'btnEliminar1'));
    btnEliminarFila.dataset.action = 'eliminar';

    productsMod.aplicarPermisosRolProductos('EMPLEADO');
    assert.equal(btnNuevoProducto.hidden, true);
    assert.equal(btnEliminarFila.hidden, true);
    const htmlEmp = productsMod.renderAccionesProducto({ productId: 5 }, 'EMPLEADO');
    assert.equal(htmlEmp.includes('data-action="editar"'), true);
    assert.equal(htmlEmp.includes('data-action="eliminar"'), false);

    productsMod.aplicarPermisosRolProductos('ADMIN');
    assert.equal(btnNuevoProducto.hidden, false);
    assert.equal(btnEliminarFila.hidden, false);
    const htmlAdmin = productsMod.renderAccionesProducto({ productId: 5 }, 'ADMIN');
    assert.equal(htmlAdmin.includes('data-action="editar"'), true);
    assert.equal(htmlAdmin.includes('data-action="eliminar"'), true);
});

test('TASK-F2-07: Modal y flujo de regeneracion de API Key para ADMIN y EMPLEADO sin re-login', async () => {
    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;

    doc.registerElement(new MockElement('strong', 'lblUsuario'));
    doc.registerElement(new MockElement('span', 'badgeRol'));
    const btnContainer = doc.registerElement(new MockElement('div', 'btnContainer'));
    const btnPerfilApiKey = doc.registerElement(new MockElement('button', 'btnPerfilApiKey'));
    const btnLogout = doc.registerElement(new MockElement('button', 'btnLogout'));
    btnContainer.appendChild(btnPerfilApiKey);
    btnContainer.appendChild(btnLogout);

    const initialExp = '2026-12-20T12:00:00.000Z';
    const renewedExp = '2027-01-20T12:00:00.000Z';

    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 2,
            username: 'emp_operador',
            apiKey: 'ak_8f4a111122229c12',
            expiresAt: initialExp
        }
    });

    await authService.login('emp_operador', 'Password123!');
    tableHelpers.initNavbar(authService.getCurrentUser(), authService);

    // Para EMPLEADO el boton Mi API Key debe estar visible y el modal inicializado con la llave truncada
    assert.equal(btnPerfilApiKey.hidden, false);
    assert.equal(tableHelpers.truncateApiKey('ak_8f4a111122229c12'), 'ak_8f4a...9c12');
    assert.equal(doc.getElementById('lblApiKeyTruncada').textContent, 'ak_8f4a...9c12');

    // Simular clic en Regenerar API Key
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            id: 19,
            clientIdentifier: 'emp_operador',
            apiKey: 'ak_999900001111abcd',
            createdAt: new Date().toISOString(),
            isActive: true,
            expiresAt: renewedExp
        }
    });

    const regenRes = await tableHelpers.handleRegenerateApiKey(authService);
    assert.equal(regenRes.apiKey, 'ak_999900001111abcd');
    assert.equal(authService.getApiKey(), 'ak_999900001111abcd');
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), 'ak_999900001111abcd');
    assert.equal(doc.getElementById('lblApiKeyTruncada').textContent, 'ak_9999...abcd');
    assert.equal(doc.getElementById('alertApiKeyResultado').hidden, false);
    assert.ok(doc.getElementById('alertApiKeyResultado').textContent.includes('regenerada exitosamente'));
});

test('Regresion Fase 2: login sin minlength=8 en password, extractProblemMessage generico, authGuard 401 y cierre fallback modal API Key', async () => {
    // 1. #txtLoginPassword no debe exigir minlength="8" en login.html (solo en registro)
    const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/login.html'), 'utf8');
    const loginPwdTag = loginHtml.match(/<input[^>]*id="txtLoginPassword"[^>]*>/i)?.[0] || '';
    assert.ok(loginPwdTag.length > 0);
    assert.equal(/minlength=/i.test(loginPwdTag), false);

    // 2. extractProblemMessage debe mapear razones HTTP genericas (Bad Request / Unauthorized) a mensajes amigables
    assert.equal(
        loginMod.extractProblemMessage({ status: 401, detail: 'Unauthorized' }),
        'Credenciales inválidas. Verifica tu nombre de usuario y contraseña.'
    );
    assert.equal(
        loginMod.extractProblemMessage({ status: 400, detail: 'Bad Request' }),
        'Solicitud inválida. Revisa los campos marcados en el formulario.'
    );

    // 3. authGuard oculta el body con data-auth-blocked="401" cuando no hay sesion
    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;
    const bodyEl = new MockElement('body');
    doc.body = bodyEl;
    const blocked = authGuard(['ADMIN']);
    assert.equal(blocked, false);
    assert.equal(bodyEl.getAttribute('data-auth-blocked'), '401');
    assert.equal(bodyEl.style.display, 'none');

    // 4. hideApiKeyModalFallback oculta el modal y limpia #alertApiKeyResultado
    const modalEl = doc.registerElement(new MockElement('div', 'modalApiKey'));
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
    const alertResultado = doc.registerElement(new MockElement('div', 'alertApiKeyResultado'));
    alertResultado.hidden = false;

    tableHelpers.hideApiKeyModalFallback(modalEl);
    assert.equal(modalEl.classList.contains('show'), false);
    assert.equal(modalEl.style.display, 'none');
    assert.equal(modalEl.getAttribute('aria-hidden'), 'true');
    assert.equal(alertResultado.hidden, true);
});
