import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(ROOT_DIR, '..', '..', 'API_Equipo_BackEnd', 'API-KEY_AUTH', 'APIkey');

function listFiles(dir, extRegex) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...listFiles(full, extRegex));
        } else if (extRegex.test(entry.name)) {
            results.push(full);
        }
    }
    return results;
}

test('FASE 8: Cero exposicion de roles, sin URL editable, sin regeneracion de API Key y sin rutas /api/ en vistas HTML', () => {
    const htmlFiles = listFiles(path.join(ROOT_DIR, 'src', 'views'), /\.html$/i);
    assert.ok(htmlFiles.length >= 6);

    for (const file of htmlFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const name = path.basename(file);

        assert.equal(content.includes('badgeRol'), false, `${name} no debe contener #badgeRol`);
        assert.equal(content.includes('badgeRoleCliente'), false, `${name} no debe contener #badgeRoleCliente`);
        assert.equal(content.includes('btnPerfilApiKey'), false, `${name} no debe contener #btnPerfilApiKey`);
        assert.equal(content.includes('txtApiUrl'), false, `${name} no debe contener #txtApiUrl`);
        assert.equal(content.includes('collapseApiUrl'), false, `${name} no debe contener #collapseApiUrl`);
        assert.equal(content.includes('northwind_api_url'), false, `${name} no debe exponer northwind_api_url`);
        assert.equal(/\/api\/[a-z]+/i.test(content), false, `${name} no debe revelar rutas de la API`);
        assert.equal(/https?:\/\/localhost/i.test(content), false, `${name} no debe revelar URLs del backend`);
        assert.equal(/\b(RBAC|ADMIN|EMPLEADO|CLIENTE)\b/.test(content), false, `${name} no debe exponer nombres de roles`);
    }
});

test('FASE 8: Cero exposicion de roles ni regeneracion de API Key en modulos JS del frontend', () => {
    const jsFiles = listFiles(path.join(ROOT_DIR, 'src'), /\.js$/i);
    assert.ok(jsFiles.length >= 10);

    for (const file of jsFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT_DIR, file);

        assert.equal(/\b(ROLES|ADMIN_WHITELIST|EMPLOYEE_WHITELIST|EMPLOYEE_PREFIX)\b/.test(content), false, `${rel} no debe definir constantes de roles`);
        assert.equal(/\b(resolveUserRole|getUserRole|hasRole|resolveConnectedRole|regenerateApiKey|handleRegenerateApiKey|ensureApiKeyModal)\b/.test(content), false, `${rel} no debe contener funciones eliminadas`);
        assert.equal(/Backend:\s*\/api\//i.test(content), false, `${rel} no debe mostrar texto con rutas de API`);
    }
});

test('FASE 8: Backend endurecido — sin ResolveUserRole, sin ApiKeysController, con roles en BD y cuentas semilla', () => {
    assert.equal(fs.existsSync(path.join(BACKEND_DIR, 'Controllers', 'ApiKeysController.cs')), false, 'ApiKeysController.cs debe estar eliminado');
    assert.equal(fs.existsSync(path.join(BACKEND_DIR, 'DTOs', 'ApiKeyCreatedResponseDto.cs')), false, 'ApiKeyCreatedResponseDto.cs debe estar eliminado');
    assert.equal(fs.existsSync(path.join(BACKEND_DIR, 'Models', 'Role.cs')), true, 'Role.cs debe existir');
    assert.equal(fs.existsSync(path.join(BACKEND_DIR, 'Filters', 'RequireRolesAttribute.cs')), true, 'RequireRolesAttribute.cs debe existir');

    const ordersCtrl = fs.readFileSync(path.join(BACKEND_DIR, 'Controllers', 'OrdersController.cs'), 'utf8');
    assert.equal(ordersCtrl.includes('ResolveUserRole'), false, 'ResolveUserRole debe estar eliminado de OrdersController.cs');
    assert.equal(ordersCtrl.includes('AdminUsernames'), false, 'AdminUsernames debe estar eliminado');
    assert.equal(ordersCtrl.includes('EmployeeUsernames'), false, 'EmployeeUsernames debe estar eliminado');
    assert.ok(ordersCtrl.includes('.Include(u => u.Role)'), 'OrdersController debe cargar el rol desde BD');

    const customersCtrl = fs.readFileSync(path.join(BACKEND_DIR, 'Controllers', 'CustomersController.cs'), 'utf8');
    assert.equal(customersCtrl.includes('ExcludedNonClientUsernames'), false, 'ExcludedNonClientUsernames debe estar eliminado');
    assert.ok(customersCtrl.includes('RequireRoles'), 'CustomersController debe exigir roles en BD');
    assert.ok(customersCtrl.includes('u.Role.Name == Role.ClienteName'), 'CustomersController debe filtrar clientes por rol en BD');

    const authCtrl = fs.readFileSync(path.join(BACKEND_DIR, 'Controllers', 'AuthController.cs'), 'utf8');
    assert.ok(authCtrl.includes('[HttpGet("me")]'), 'AuthController debe exponer GET /api/auth/me');
    assert.ok(authCtrl.includes('RoleId = Role.ClienteId'), 'PostRegister debe asignar RoleId = ClienteId en BD');

    const migrationsDir = path.join(BACKEND_DIR, 'Migrations');
    const roleMigration = fs.readdirSync(migrationsDir).find((f) => f.endsWith('AddRolesAndSeedUsers.cs'));
    assert.ok(roleMigration, 'Debe existir la migracion AddRolesAndSeedUsers');
    const migContent = fs.readFileSync(path.join(migrationsDir, roleMigration), 'utf8');
    assert.ok(migContent.includes('"roles"'), 'La migracion debe crear la tabla roles');
    assert.ok(migContent.includes("'admin'"), 'La migracion debe sembrar admin');
    assert.ok(migContent.includes("'Robe'"), 'La migracion debe sembrar Robe');
    assert.ok(migContent.includes("'Leo'"), 'La migracion debe sembrar Leo');
});
