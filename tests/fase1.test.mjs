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

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.window = {
    location: {
        pathname: '/src/views/productos.html',
        href: 'http://localhost:3000/src/views/productos.html'
    }
};

const config = await import('../src/api/config.js');
const httpMod = await import('../src/api/httpClient.js');
const { authService } = await import('../src/services/authService.js');

function resetEnvironment(pathname = '/src/views/productos.html') {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    globalThis.window.location.pathname = pathname;
    globalThis.window.location.href = `http://localhost:3000${pathname}`;
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

test('TASK-F1-01: Configuracion centralizada y construccion de URLs', () => {
    resetEnvironment();
    assert.equal(config.API_BASE_URL, 'https://localhost:7039/api');
    assert.equal(config.AUTH_LOGIN, '/auth/login');
    assert.equal(config.AUTH_REGISTER, '/auth/register');
    assert.equal(config.APIKEYS_REGENERATE, '/apikeys/regenerate');
    assert.equal(config.PRODUCTS, '/Products');
    assert.equal(config.CUSTOMERS, '/customers');
    assert.equal(config.ORDERS, '/orders');

    assert.equal(config.getBaseUrl(), 'https://localhost:7039/api');
    assert.equal(config.buildApiUrl(config.PRODUCTS), 'https://localhost:7039/api/Products');
    assert.equal(config.buildApiUrl('/api/Products'), 'https://localhost:7039/api/Products');

    globalThis.localStorage.setItem('northwind_api_url', 'http://localhost:8080/api/');
    assert.equal(config.getBaseUrl(), 'http://localhost:8080/api');
    assert.equal(config.buildApiUrl('/api/orders'), 'http://localhost:8080/api/orders');
    assert.equal(config.buildApiUrl('/orders'), 'http://localhost:8080/api/orders');

    globalThis.localStorage.setItem('northwind_api_url', 'http://localhost:9000');
    assert.equal(config.buildApiUrl('/Products'), 'http://localhost:9000/api/Products');
    assert.equal(config.buildApiUrl('/api/Products'), 'http://localhost:9000/api/Products');

    globalThis.localStorage.setItem('northwind_api_url', 'http://localhost:9000/API');
    assert.equal(config.buildApiUrl('/api/Products'), 'http://localhost:9000/API/Products');

    assert.equal(config.isPublicEndpoint('/auth/login'), true);
    assert.equal(config.isPublicEndpoint('auth/login'), true);
    assert.equal(config.isPublicEndpoint('/api/auth/login/'), true);
    assert.equal(config.isPublicEndpoint('http://localhost:5009/api/auth/login?next=1'), true);
    assert.equal(config.isPublicEndpoint('http://localhost:5009/api/auth/register'), true);
    assert.equal(config.isPublicEndpoint('/api/Products'), false);
    assert.equal(config.isPublicEndpoint(''), false);
});

test('TASK-F1-02: Inyeccion de X-API-KEY desde sessionStorage y endpoints publicos', async () => {
    resetEnvironment();

    const capturedCalls = [];
    globalThis.fetch = async (url, options) => {
        capturedCalls.push({ url, options });
        return makeResponse({ status: 200, body: { ok: true } });
    };

    // Sin API key: endpoint publico debe funcionar sin bloquear ni enviar X-API-KEY
    await httpMod.httpClient(config.AUTH_LOGIN, {
        method: 'POST',
        body: JSON.stringify({ username: 'u', password: 'p' })
    });
    assert.equal(capturedCalls[0].url, 'https://localhost:7039/api/auth/login');
    assert.equal(capturedCalls[0].options.headers['X-API-KEY'], undefined);

    // Con API key en localStorage solamente: no debe usarse como sesion activa
    globalThis.localStorage.setItem('northwind_api_key', 'OLD-LOCAL-KEY');
    assert.equal(httpMod.getApiKey(), null);

    // Con API key en sessionStorage: debe inyectarse en GET, POST, PUT, DELETE
    httpMod.setApiConfig('ak_session_123');
    assert.equal(globalThis.localStorage.getItem('northwind_api_key'), null);
    assert.equal(httpMod.getApiKey(), 'ak_session_123');

    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        await httpMod.httpClient(config.PRODUCTS, { method });
        const last = capturedCalls.at(-1);
        assert.equal(last.options.headers['X-API-KEY'], 'ak_session_123');
    }

    // No duplicar cabecera si se pasa 'x-api-key' en minusculas
    await httpMod.httpClient(config.PRODUCTS, {
        method: 'GET',
        headers: { 'x-api-key': 'custom_override' }
    });
    const lastCustom = capturedCalls.at(-1);
    assert.equal(lastCustom.options.headers['x-api-key'], 'custom_override');
    assert.equal(lastCustom.options.headers['X-API-KEY'], undefined);

    // Endpoint publico por URL completa tampoco debe disparar limpieza en 401
    globalThis.fetch = async () => makeResponse({ status: 401, body: { status: 401, detail: 'Credenciales invalidas' } });
    await httpMod.httpClient('http://localhost:5009/api/auth/login', { method: 'POST' });
    assert.equal(httpMod.getApiKey(), 'ak_session_123');
});

test('TASK-F1-03: Normalizacion de ProblemDetails (RFC 7807) y ocultamiento de stack traces', async () => {
    resetEnvironment();
    httpMod.setApiConfig('ak_valid');

    const cases = [
        {
            status: 400,
            payload: {
                status: 400,
                title: 'Bad Request',
                detail: 'El nombre de usuario ya existe.',
                instance: '/api/auth/register'
            },
            expectedDetail: 'El nombre de usuario ya existe.'
        },
        {
            status: 403,
            payload: {
                status: 403,
                title: 'Forbidden',
                detail: 'Rol insuficiente.',
                instance: '/api/Products'
            },
            expectedDetail: 'Rol insuficiente.'
        },
        {
            status: 404,
            payload: {
                status: 404,
                title: 'Not Found',
                detail: 'Producto no encontrado.',
                instance: '/api/Products/9999'
            },
            expectedDetail: 'Producto no encontrado.'
        },
        {
            status: 409,
            payload: {
                status: 409,
                title: 'Conflict',
                detail: 'No se puede eliminar por ordenes asociadas.',
                instance: '/api/Products/1'
            },
            expectedDetail: 'No se puede eliminar por ordenes asociadas.'
        }
    ];

    for (const c of cases) {
        globalThis.fetch = async () => makeResponse({ status: c.status, body: c.payload });
        const res = await httpMod.httpClient('/api/Products', { method: 'GET' });
        assert.equal(res.ok, false);
        assert.equal(res.problemDetails.status, c.status);
        assert.equal(res.problemDetails.title, c.payload.title);
        assert.equal(res.problemDetails.detail, c.expectedDetail);
        assert.equal(res.problemDetails.instance, c.payload.instance);
    }

    // 500 con stack trace debe ser sanitizado completamente
    globalThis.fetch = async () => makeResponse({
        status: 500,
        body: {
            status: 500,
            title: 'System.InvalidOperationException',
            detail: 'MySql.Data.MySqlClient.MySqlException at APIkey.Controllers.ProductsController()',
            instance: '/api/Products'
        }
    });
    const res500 = await httpMod.httpClient('/api/Products');
    assert.equal(res500.problemDetails.status, 500);
    assert.equal(res500.problemDetails.message.includes('MySql'), false);
    assert.equal(res500.problemDetails.message.includes('System.'), false);

    // promiseRequest lanza ApiError con problemDetails
    await assert.rejects(
        () => httpMod.promiseRequest('/api/Products'),
        (err) => err instanceof httpMod.ApiError && err.status === 500
    );
});

test('TASK-F1-04: Interceptor 401 limpia sessionStorage, redirige y evita loop en login.html', async () => {
    resetEnvironment('/src/views/productos.html');
    httpMod.setApiConfig('ak_expired');
    globalThis.sessionStorage.setItem('auth_session', JSON.stringify({ username: 'ana', apiKey: 'ak_expired' }));

    globalThis.fetch = async () => makeResponse({
        status: 401,
        body: { status: 401, title: 'Unauthorized', detail: 'API Key expirada' }
    });

    await httpMod.httpClient('/api/Products');
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.sessionStorage.getItem('auth_session'), null);
    assert.equal(globalThis.window.location.href, './login.html?reason=session_expired');

    // En login.html NO debe redirigir (evitar loop infinito)
    resetEnvironment('/src/views/login.html');
    httpMod.setApiConfig('ak_expired');
    await httpMod.httpClient('/api/Products');
    assert.equal(globalThis.sessionStorage.getItem('northwind_api_key'), null);
    assert.equal(globalThis.window.location.href, 'http://localhost:3000/src/views/login.html');

    // En endpoint publico /api/auth/login NO debe redirigir ni limpiar por error 401 de credenciales
    resetEnvironment('/src/views/productos.html');
    await httpMod.httpClient('/api/auth/login', { method: 'POST' });
    assert.equal(globalThis.window.location.href, 'http://localhost:3000/src/views/productos.html');

    // En 403 Forbidden NO debe destruir la sesion
    resetEnvironment('/src/views/productos.html');
    httpMod.setApiConfig('ak_cliente');
    globalThis.fetch = async () => makeResponse({ status: 403, body: { status: 403, detail: 'Forbidden' } });
    await httpMod.httpClient('/api/Products');
    assert.equal(httpMod.getApiKey(), 'ak_cliente');
    assert.equal(globalThis.window.location.href, 'http://localhost:3000/src/views/productos.html');
});

test('authService: login, checkSession y logout operan sobre sessionStorage', async () => {
    resetEnvironment('/src/views/login.html');
    const futureExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    globalThis.fetch = async () => makeResponse({
        status: 200,
        body: {
            userId: 1,
            username: 'admin',
            apiKey: 'ak_admin_session_001',
            expiresAt: futureExp
        }
    });

    const loggedSession = await authService.login('admin', 'AdminSecret123!', 'http://localhost:5009');
    assert.equal(loggedSession.username, 'admin');
    assert.equal(loggedSession.role, 'ADMIN');
    assert.equal(authService.getApiKey(), 'ak_admin_session_001');
    assert.equal(globalThis.localStorage.getItem('northwind_api_key'), null);

    const session = await authService.checkSession();
    assert.equal(session.autenticado, true);
    assert.equal(session.apiKey, 'ak_admin_session_001');
    assert.equal(session.role, 'ADMIN');

    authService.logout();
    assert.equal(authService.getApiKey(), null);
    assert.equal(globalThis.window.location.href, './login.html');
});

test('TASK-F1-03: Sanitizacion de detalles de base de datos y rutas en errores 4xx', async () => {
    resetEnvironment();
    httpMod.setApiConfig('ak_valid');

    globalThis.fetch = async () => makeResponse({
        status: 409,
        body: {
            status: 409,
            title: 'DbUpdateException',
            detail: "Table 'northwind.order_details' failed: SELECT * FROM products WHERE id = 1",
            instance: '/api/Products/1'
        }
    });

    const res409 = await httpMod.httpClient('/api/Products/1', { method: 'DELETE' });
    assert.equal(res409.problemDetails.status, 409);
    assert.equal(res409.problemDetails.message.includes('SELECT'), false);
    assert.equal(res409.problemDetails.message.includes('northwind.order_details'), false);
    assert.equal(res409.problemDetails.title.includes('DbUpdateException'), false);
});

test('ajaxRequest y callbackRequest: inyeccion X-API-KEY, ProblemDetails y 401 interceptor', async () => {
    resetEnvironment('/src/views/productos.html');
    httpMod.setApiConfig('ak_xhr_test');

    const xhrLog = [];
    let nextXhrBehavior = { status: 204, responseText: '' };

    globalThis.XMLHttpRequest = class MockXHR {
        constructor() {
            this.headers = {};
            this.status = 0;
            this.statusText = '';
            this.responseText = '';
        }
        open(method, url, asyncFlag) {
            this.method = method;
            this.url = url;
            this.asyncFlag = asyncFlag;
        }
        setRequestHeader(k, v) {
            this.headers[k] = v;
        }
        send(body) {
            xhrLog.push({ method: this.method, url: this.url, headers: { ...this.headers }, body });
            if (nextXhrBehavior.networkError) {
                this.onerror?.();
                return;
            }
            this.status = nextXhrBehavior.status;
            this.statusText = String(nextXhrBehavior.status);
            this.responseText = nextXhrBehavior.responseText;
            this.onload?.();
        }
    };

    // ajaxRequest 204 DELETE
    const delRes = await httpMod.ajaxRequest('/api/Products/5', { method: 'DELETE' });
    assert.equal(delRes.ok, true);
    assert.equal(delRes.status, 204);
    assert.equal(xhrLog.at(-1).headers['X-API-KEY'], 'ak_xhr_test');

    // ajaxRequest 409 Conflict
    nextXhrBehavior = {
        status: 409,
        responseText: JSON.stringify({ status: 409, title: 'Conflict', detail: 'Tiene ordenes asociadas.' })
    };
    const conflictRes = await httpMod.ajaxRequest('/api/Products/5', { method: 'DELETE' });
    assert.equal(conflictRes.ok, false);
    assert.equal(conflictRes.problemDetails.status, 409);
    assert.equal(conflictRes.errorMessage, 'Tiene ordenes asociadas.');

    // callbackRequest 201 Created
    nextXhrBehavior = {
        status: 201,
        responseText: JSON.stringify({ productId: 99, productName: 'Cafe' })
    };
    await new Promise((resolve, reject) => {
        httpMod.callbackRequest('/api/Products', { method: 'POST', body: { productName: 'Cafe' } }, (err, data) => {
            try {
                assert.equal(err, null);
                assert.equal(data.productId, 99);
                assert.equal(xhrLog.at(-1).headers['X-API-KEY'], 'ak_xhr_test');
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });

    // callbackRequest 401 Unauthorized debe limpiar sessionStorage y redirigir
    nextXhrBehavior = {
        status: 401,
        responseText: JSON.stringify({ status: 401, title: 'Unauthorized', detail: 'Key invalida' })
    };
    await new Promise((resolve, reject) => {
        httpMod.callbackRequest('/api/Products', { method: 'POST', body: { productName: 'Cafe' } }, (err, data) => {
            try {
                assert.ok(err instanceof httpMod.ApiError);
                assert.equal(err.status, 401);
                assert.equal(data, null);
                assert.equal(httpMod.getApiKey(), null);
                assert.equal(globalThis.window.location.href, './login.html?reason=session_expired');
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
});
