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

const authMod = await import('../src/services/authService.js');
const guardMod = await import('../src/utils/authGuard.js');
const loginMod = await import('../src/controllers/loginController.js');
const tableHelpers = await import('../src/utils/tableHelpers.js');
const productsMod = await import('../src/controllers/productsController.js');

const {
    authService,
    verifySessionIntegrity,
    purgeResidualLocalStorage
} = authMod;
const { authGuard } = guardMod;

const ADMIN_PERMS = {
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
};

const EMPLOYEE_PERMS = {
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
};

const CLIENT_PERMS = {
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
};

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

test('TASK-F2-01: authService.login, register, refreshProfile, logout y cero exposicion de roles ni regeneracion', async () => {
    resetEnvironment('/src/views/login.html');
    const futureExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    assert.equal(authService.ROLES, undefined);
    assert.equal(authService.resolveUserRole, undefined);
    assert.equal(authService.getUserRole, undefined);
    assert.equal(authService.hasRole, undefined);
    assert.equal(authService.regenerateApiKey, undefined);

    const capturedRequests = [];
    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        if (url.endsWith('/auth/me')) {
            return makeResponse({
                status: 200,
                body: {
                    userId: 1,
                    username: 'admin',
                    defaultView: './productos.html',
                    permissions: ADMIN_PERMS
                }
            });
        }
        return makeResponse({
            status: 200,
            body: {
                userId: 1,
                username: 'admin',
                apiKey: 'ak_admin_001',
                expiresAt: futureExp,
                defaultView: './productos.html',
                permissions: ADMIN_PERMS
            }
        });
    };

    const loginSession = await authService.login('admin', 'Admin1234!');
    assert.equal(capturedRequests[0].url, 'https://localhost:7039/api/auth/login');
    assert.equal(loginSession.username, 'admin');
    assert.equal(loginSession.role, undefined);
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.hasPermission('canViewProductsAdmin'), true);
    assert.equal(authService.hasPermission('canPurchaseCatalog'), false);
    assert.equal(authService.getDefaultView(), './productos.html');

    const refreshed = await authService.refreshProfile();
    assert.equal(refreshed.username, 'admin');
    assert.equal(refreshed.permissions.canDeleteProducts, true);

    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        return makeResponse({
            status: 201,
            body: {
                userId: 55,
                username: 'nuevo_usuario',
                apiKey: 'ak_user_55',
                expiresAt: futureExp,
                defaultView: './catalogo.html',
                permissions: CLIENT_PERMS
            }
        });
    };

    const regSession = await authService.register('nuevo_usuario', 'nuevo@correo.com', 'ClaveSegura123');
    assert.equal(capturedRequests.at(-1).url, 'https://localhost:7039/api/auth/register');
    assert.equal(regSession.role, undefined);
    assert.equal(authService.hasPermission('canPurchaseCatalog'), true);
    assert.equal(authService.hasPermission('canViewProductsAdmin'), false);
    assert.equal(authService.getDefaultView(), './catalogo.html');

    authService.logout();
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(authService.getApiKey(), null);
    assert.equal(globalThis.window.location.href, './login.html');
});

test('TASK-F2-02: Almacenamiento seguro en sessionStorage, purga de localStorage y control de expiracion', async () => {
    resetEnvironment('/src/views/login.html');
    globalThis.localStorage.setItem('northwind_api_key', 'OLD_KEY');
    globalThis.localStorage.setItem('auth_session', '{"apiKey":"leak"}');
    globalThis.localStorage.setItem('northwind_api_url', 'http://evil.local/api');

    purgeResidualLocalStorage();
    assert.equal(globalThis.localStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.localStorage.getItem('auth_session'), null);
    assert.equal(globalThis.localStorage.getItem('northwind_api_url'), null);

    // Expiración automática
    const pastExp = new Date(Date.now() - 10_000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 9,
            username: 'expirado',
            apiKey: 'ak_expired_9',
            expiresAt: pastExp,
            defaultView: './catalogo.html',
            permissions: CLIENT_PERMS
        }
    });

    await authService.login('expirado', 'Password123!');
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);
});

test('TASK-F2-03: Integridad de sesion ante manipulacion de permisos en sessionStorage', async () => {
    resetEnvironment('/src/views/catalogo.html');
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();

    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 20,
            username: 'usuario_estandar',
            apiKey: 'ak_std_20',
            expiresAt: futureExp,
            defaultView: './catalogo.html',
            permissions: CLIENT_PERMS
        }
    });

    await authService.login('usuario_estandar', 'Password123!');
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.hasPermission('canViewProductsAdmin'), false);

    // Simular manipulación maliciosa intentando activar canViewProductsAdmin en sessionStorage
    const tampered = JSON.parse(globalThis.sessionStorage.getItem('auth_session'));
    assert.equal(tampered.role, undefined);
    tampered.permissions.canViewProductsAdmin = true;
    assert.equal(verifySessionIntegrity(tampered), false);

    globalThis.sessionStorage.setItem('auth_session', JSON.stringify(tampered));
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);
});

test('TASK-F2-04: authGuard protege rutas por capacidad de UI, redirige con 403 y todas las vistas estan integradas', async () => {
    resetEnvironment('/src/views/productos.html');
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString();

    // Sin sesión -> 401 redirect a login.html
    assert.equal(authGuard('canViewProductsAdmin'), false);
    assert.equal(globalThis.window.location.href, './login.html');

    // Con cuenta sin permiso administrativo -> 403 redirect a catalogo.html
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 30,
            username: 'cuenta_basica',
            apiKey: 'ak_basic_30',
            expiresAt: futureExp,
            defaultView: './catalogo.html',
            permissions: CLIENT_PERMS
        }
    });
    await authService.login('cuenta_basica', 'Password123!');

    const resAllowedShared = authGuard();
    assert.ok(resAllowedShared);
    assert.equal(resAllowedShared.username, 'cuenta_basica');

    const resDeniedAdmin = authGuard('canViewProductsAdmin');
    assert.equal(resDeniedAdmin, false);
    assert.equal(globalThis.window.location.href, './catalogo.html?error=403');
    const flash = globalThis.sessionStorage.getItem('auth_flash_error');
    assert.ok(flash && flash.includes('403'));
    assert.equal(/ADMIN|EMPLEADO|CLIENTE/i.test(flash), false);
});

test('TASK-F2-05: login.html y loginController.js (pestanas, validaciones, redireccion por defaultView y ProblemDetails 400/401)', () => {
    const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/login.html'), 'utf8');
    assert.equal(loginHtml.includes('txtApiUrl'), false);
    assert.equal(loginHtml.includes('collapseApiUrl'), false);
    assert.equal(loginHtml.includes('badgeRoleCliente'), false);

    assert.equal(loginMod.resolveRedirectPath({ defaultView: './productos.html' }), './productos.html');
    assert.equal(loginMod.resolveRedirectPath({ defaultView: './catalogo.html' }), './catalogo.html');
    assert.equal(loginMod.resolveRedirectPath(null), './catalogo.html');

    const badReg = loginMod.validateRegisterInput({ username: 'a', email: 'malo', password: '123' });
    assert.equal(badReg.valid, false);
    assert.ok(badReg.errors.username);
    assert.ok(badReg.errors.email);
    assert.ok(badReg.errors.password);

    const okReg = loginMod.validateRegisterInput({ username: 'usuario_ok', email: 'ok@correo.com', password: 'Password123!' });
    assert.equal(okReg.valid, true);
});

test('TASK-F2-06: Adaptacion dinamica de interfaz (initNavbar sin badgeRol ni btnPerfilApiKey y permisos en productos)', async () => {
    resetEnvironment('/src/views/catalogo.html');
    const doc = globalThis.document;
    const lblUsuario = doc.registerElement(new MockElement('strong', 'lblUsuario'));
    const navProductos = doc.registerElement(new MockElement('a', 'navProductos'));
    navProductos.setAttribute('href', './productos.html');
    const navClientes = doc.registerElement(new MockElement('a', 'navClientes'));
    navClientes.setAttribute('href', './clientes.html');
    const navCatalogo = doc.registerElement(new MockElement('a', 'navCatalogo'));
    navCatalogo.setAttribute('href', './catalogo.html');
    doc.registerElement(new MockElement('button', 'btnLogout'));

    tableHelpers.initNavbar({ username: 'cliente_ui', defaultView: './catalogo.html', permissions: CLIENT_PERMS }, authService);
    assert.equal(lblUsuario.textContent, 'cliente_ui');
    assert.equal(doc.getElementById('badgeRol'), null);
    assert.equal(doc.getElementById('btnPerfilApiKey'), null);
    assert.equal(navProductos.hidden, true);
    assert.equal(navClientes.hidden, true);
    assert.equal(navCatalogo.hidden, false);

    // Permisos de productos con capacidades operativas (sin crear ni eliminar)
    const btnNuevo = doc.registerElement(new MockElement('button', 'btnNuevoProducto'));
    const prodName = doc.registerElement(new MockElement('input', 'prodName'));
    const prodPrice = doc.registerElement(new MockElement('input', 'prodPrice'));
    const prodStock = doc.registerElement(new MockElement('input', 'prodStock'));
    const prodDiscontinued = doc.registerElement(new MockElement('input', 'prodDiscontinued'));

    productsMod.aplicarPermisosProductos(EMPLOYEE_PERMS);
    assert.equal(btnNuevo.hidden, true);
    assert.equal(prodName.disabled, true);
    assert.equal(prodDiscontinued.disabled, true);
    assert.equal(prodPrice.disabled, false);
    assert.equal(prodStock.disabled, false);
});

test('Regresion Fase 2: login sin minlength=8 en password, extractProblemMessage generico y authGuard 401', () => {
    const loginHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/views/login.html'), 'utf8');
    const loginPwdTag = loginHtml.match(/<input[^>]*id="txtLoginPassword"[^>]*>/i)?.[0] || '';
    assert.ok(loginPwdTag.length > 0);
    assert.equal(/minlength=/i.test(loginPwdTag), false);

    assert.equal(
        loginMod.extractProblemMessage({ status: 401, detail: 'Unauthorized' }),
        'Credenciales inválidas. Verifica tu nombre de usuario y contraseña.'
    );
    assert.equal(
        loginMod.extractProblemMessage({ status: 400, detail: 'Bad Request' }),
        'Solicitud inválida. Revisa los campos marcados en el formulario.'
    );

    resetEnvironment('/src/views/productos.html');
    const doc = globalThis.document;
    const bodyEl = new MockElement('body');
    doc.body = bodyEl;
    const blocked = authGuard('canViewProductsAdmin');
    assert.equal(blocked, false);
    assert.equal(bodyEl.getAttribute('data-auth-blocked'), '401');
    assert.equal(bodyEl.style.display, 'none');
});
