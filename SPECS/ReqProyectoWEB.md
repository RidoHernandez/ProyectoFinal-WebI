---
proyecto: Sistema de Gestion Comercial y Control de Acceso
version: 3.0.0
estado_global: DONE
ultima_actualizacion: 2026-11-25
formato_agente: AI-READABLE-SPEC-V1
backend_status: JWT_BEARER_DB_RBAC_V5
---

# Especificacion de Requisitos del Sistema y Arquitectura de Seguridad

## 1. Instrucciones para el Agente de IA
Este documento esta estructurado para ser analizado y actualizado de forma determinista por cualquier agente del enjambre. Al interactuar con este archivo o ejecutar tareas sobre el proyecto, respeta estrictamente las siguientes directrices:
1. **Identificadores Unicos Inmutables:** Nunca modifiques el ID de un requisito existente (`REQ-[MODULO]-[NUMERO]`). Los correlativos identifican contractualmente cada compromiso del sistema.
2. **Estados Validos:** Utiliza unicamente las etiquetas estandarizadas `[TODO]`, `[IN_PROGRESS]`, `[REVIEW]`, `[DONE]`, `[BLOCKED]`.
3. **Seguridad y Menor Exposicion del Backend:** La maxima prioridad del sistema es minimizar la superficie de exposicion del backend ASP.NET Core (`APIKey_ProyectoWEB_II`). Toda autenticacion opera exclusivamente mediante JWT Bearer (`Authorization: Bearer <token>`) con validacion de roles exclusivamente en servidor consultando la tabla `roles` y la relacion `users.RoleId` en MySQL. El frontend (construido unicamente con HTML, JavaScript, Bootstrap, jQuery y DataTables) nunca almacena, calcula ni muestra nombres de roles, nunca permite editar la URL del backend (`https://localhost:7039/api` fija), no expone rutas de la API en textos visibles ni conserva logica de API Key.
4. **Actualizacion de Progreso:** Al marcar una subtarea como completada (`- [x]`), recalcula el porcentaje en la seccion "Resumen de Progreso" y actualiza el estado del requisito padre.
5. **Registro de Cambios:** Documenta cualquier modificacion estructural, de criterios o de estado en la seccion final "Historial de Cambios del Agente".

---

## 2. Resumen de Progreso

| Modulo | ID Modulo | Total Requisitos | Completados | En Progreso | Pendientes | Avance (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Autenticacion y Roles | AUTH | 3 | 3 | 0 | 0 | 100% |
| Gestion Comercial y Clientes | CORE | 4 | 4 | 0 | 0 | 100% |
| Reglas de Negocio | BIZ | 3 | 3 | 0 | 0 | 100% |
| Seguridad y Control de Acceso | SEC | 6 | 6 | 0 | 0 | 100% |
| **TOTAL** | **ALL** | **16** | **16** | **0** | **0** | **100%** |

---

## 3. Inventario del Backend y Mapeo de Contratos (JWT Bearer v3.0)

El backend ASP.NET Core (`APIkey`, .NET 10 / MySQL en `APIKey_ProyectoWEB_II`, ejecutando en `https://localhost:7039`) gestiona autenticacion exclusivamente mediante **JWT Bearer (`Authorization: Bearer <token>`, HS256)** y autorizacion estrictamente en servidor contra base de datos (`roles` + `users.RoleId` en `JwtBearerEvents.OnTokenValidated`). La migracion `AddRolesAndSeedUsers` crea la tabla `roles` (`1=ADMIN`, `2=EMPLEADO`, `3=CLIENTE`), agrega la FK `users.RoleId` (default `3`) y siembra las cuentas `admin` (ADMIN), `Robe` (EMPLEADO) y `Leo` (EMPLEADO) con hashes PBKDF2-SHA256. La migracion `RemoveApiKeysTable` elimina por completo la tabla `api_keys` y toda logica de API Key.

### 3.1. AuthController (`/api/auth`)
* `POST /api/auth/register`: (`[AllowAnonymous]`) Recibe `RegisterDto` (`Username`, `Email`, `Password` >= 8). Asigna estrictamente `RoleId = 3` (`CLIENTE`) en servidor, hashea contrasena con PBKDF2-SHA256 (100,000 iteraciones, salt 16 bytes), emite un token JWT HS256 (vigencia 120 min, sin claim `role` en el payload) y retorna `201 Created` con `AuthResponseDto` (`UserId`, `Username`, `Token`, `TokenType: "Bearer"`, `ExpiresAt`, `DefaultView`, `Permissions` — **sin exponer nombres de rol ni API Key**).
* `POST /api/auth/login`: (`[AllowAnonymous]`) Valida credenciales contra PBKDF2 en tiempo constante, lee el rol desde `users.Role` en BD, emite un token JWT HS256 y retorna `200 OK` con `AuthResponseDto` (`UserId`, `Username`, `Token`, `TokenType: "Bearer"`, `ExpiresAt`, `DefaultView`, `Permissions` — **sin exponer nombres de rol ni API Key**).
* `GET /api/auth/me`: Protegido por `[Authorize]` (JWT Bearer). Consulta el usuario activo y su rol en BD en tiempo real y retorna `SessionProfileDto` (`UserId`, `Username`, `DefaultView`, `Permissions`) para sincronizar banderas de interfaz en cliente sin revelar roles.

### 3.2. Autenticacion por API Key (Eliminada por Completo)
* Toda la infraestructura de API Key (`ApiKeyAttribute`, `RequireRolesAttribute`, `Models/ApiKey.cs`, `ApiKeysController`, tabla `api_keys`, `X-API-KEY`) fue **eliminada por completo** del sistema. Todas las peticiones privadas exigen exclusivamente `Authorization: Bearer <token>`.

### 3.3. ProductsController (`/api/Products`)
* Protegido integralmente por `[Authorize]` y `[Authorize(Roles = ...)]` validado en BD en `OnTokenValidated`.
* `GET /api/Products` y `GET /api/Products/{id}`: Cualquier usuario activo autenticado.
* `POST /api/Products`: Exclusivo `ADMIN` (en BD). Retorna `403 Forbidden` para otros roles.
* `PUT /api/Products/{id}`: `ADMIN` (todos los campos) o `EMPLEADO` (en servidor solo actualiza `UnitPrice` y `UnitsInStock`, manteniendo `ProductName` y `Discontinued` intactos). `CLIENTE` recibe `403 Forbidden`.
* `DELETE /api/Products/{id}`: Exclusivo `ADMIN` (en BD). Retorna `409 Conflict` si existen ordenes vinculadas.

### 3.4. CustomersController (`/api/customers`)
* Protegido por `[Authorize(Roles = "ADMIN,EMPLEADO")]` validado en BD (`CLIENTE` recibe `403 Forbidden`).
* `GET /api/customers` y `GET /api/customers/{id}`: Unifican clientes historicos de Northwind (`customers`) y usuarios activos con `Role.Name == "CLIENTE"` en base de datos (sin listas blancas por nombre de usuario), generando claves dinamicas unicas de iniciales + autoincremento.

### 3.5. OrdersController (`/api/orders`)
* Protegido por `[Authorize]` y validacion de rol estrictamente desde base de datos (`user.Role.Name`; funcion `ResolveUserRole` y listas hardcodeadas eliminadas).
* `GET /api/orders`: `[Authorize(Roles = "ADMIN,EMPLEADO")]` (`CLIENTE` recibe `403 Forbidden`).
* `GET /api/orders/mine`: Cualquier usuario autenticado (filtra `Order.UserId == user.Id`).
* `GET /api/orders/{id}`: `ADMIN` y `EMPLEADO` consultan cualquier orden; `CLIENTE` solo sus propias ordenes (`403 Forbidden` ante intento de acceso ajeno).
* `POST /api/orders`: `[Authorize(Roles = "CLIENTE")]` transaccional con descuento atomico de stock.
* `PATCH /api/orders/{id}/status`: Valida el rol directamente en BD (`ADMIN` 5 estados, `EMPLEADO` `403 Forbidden`, `CLIENTE` solo cancelacion de pedidos propios activos) con reintegro atomico de stock y estado `CANCELADO` irreversible.

### 3.6. Controladores Inexistentes en Backend
* **Categorias y Proveedores:** NO existen `CategoriesController` ni `SuppliersController` en el backend. Las vistas que los requieran deben operar mediante cache local, catalogos estaticos de referencia o fallback silencioso ya previsto en `categoryService.js` y `supplierService.js`.
* **Empleados:** NO existe `EmployeesController`. Las cuentas de empleados se gestionan mediante el sistema de autenticacion de usuarios y asignacion de roles en frontend.

---

## 4. Definicion de Roles en Base de Datos y Matriz de Permisos (Backend-Only)

El control de acceso basado en roles reside exclusivamente en el servidor y en la base de datos MySQL (`roles` + `users.RoleId`). El frontend nunca conoce ni almacena nombres de roles; recibe unicamente banderas booleanas de interfaz (`UiPermissionsDto`) y `DefaultView` desde el backend para adaptar menus y botones.

### 4.1. Perfiles en Base de Datos y Cuentas Semilla

1. **Administrador (`roles.Id = 1`, `ADMIN`)**:
   * **Cuenta semilla:** `admin` (`admin@northwind.local`, clave inicial PBKDF2-SHA256 `Admin1234!`).
   * **Permisos en backend:** CRUD completo de productos (`POST`, `PUT`, `DELETE`), consulta de clientes (`/api/customers`), consulta de todas las ordenes (`/api/orders`) y gestion de los 5 estados logisticos (`PATCH /api/orders/{id}/status`).

2. **Empleado (`roles.Id = 2`, `EMPLEADO`)**:
   * **Cuentas semilla:** `Robe` (`robe@northwind.local`, `Robe1234!`) y `Leo` (`leo@northwind.local`, `Leo1234!`).
   * **Permisos en backend:** Consulta de productos, actualizacion restringida de precio y existencias (`PUT /api/Products/{id}`, sin modificar nombre ni descontinuacion), consulta de clientes (`/api/customers`) y consulta de ordenes de solo lectura (`/api/orders`).

3. **Cliente (`roles.Id = 3`, `CLIENTE`, default en registro)**:
   * **Origen:** Registro publico mediante `POST /api/auth/register` (`RoleId = 3` forzado en servidor).
   * **Permisos en backend:** Lectura de catalogo (`GET /api/Products`), compras (`POST /api/orders`), consulta de sus propias ordenes (`GET /api/orders/mine`, `GET /api/orders/{id}` propio) y cancelacion de sus pedidos propios activos (`PATCH /api/orders/{id}/status` -> `CANCELADO`).

### 4.2. Matriz de Permisos Validada en Backend

| Recurso / Vista / Operacion | Endpoint Backend / Ruta Frontend | Metodo | ADMIN | EMPLEADO | CLIENTE |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Registro Publico** | `/api/auth/register` | POST | ❌ | ❌ | ✅ |
| **Inicio de Sesion** | `/api/auth/login` | POST | ✅ | ✅ | ✅ |
| **Perfil de Capacidades UI** | `/api/auth/me` | GET | ✅ | ✅ | ✅ |
| **Catalogo (Vista)** | `catalogo.html` | GET | ✅ | ✅ | ✅ |
| **Listar / Detalle Productos** | `/api/Products` | GET | ✅ | ✅ | ✅ |
| **Gestion Productos (Vista)** | `productos.html` | GET | ✅ | ✅ (Solo precio/stock) | ❌ (403) |
| **Crear Producto** | `/api/Products` | POST | ✅ | ❌ (403) | ❌ (403) |
| **Actualizar Producto / Stock**| `/api/Products/{id}` | PUT | ✅ | ✅ (Solo precio/stock) | ❌ (403) |
| **Eliminar Producto** | `/api/Products/{id}` | DELETE | ✅ (409 si vinculado) | ❌ (403) | ❌ (403) |
| **Directorio de Clientes** | `/api/customers` | GET | ✅ | ✅ | ❌ (403) |
| **Listar Todas las Ordenes** | `/api/orders` | GET | ✅ | ✅ | ❌ (403) |
| **Mis Ordenes** | `/api/orders/mine` | GET | ✅ | ✅ | ✅ (Propias) |
| **Crear Orden / Compra** | `/api/orders` | POST | ❌ (403) | ❌ (403) | ✅ |
| **Detalle de Orden** | `/api/orders/{id}` | GET | ✅ | ✅ | ✅ (Solo propia / 403) |
| **Cambiar Estado / Cancelar** | `/api/orders/{id}/status` | PATCH | ✅ (5 estados) | ❌ (403) | ✅ (Solo cancelar propia) |

---

## 5. Arquitectura de Seguridad en Frontend (HTML, JS, Bootstrap, jQuery, DataTables)

El frontend aplica el principio de minima exposicion y cero confianza en el cliente:

### 5.1. Almacenamiento Seguro de Sesion (`sessionStorage`) y URL Fija
* **URL fija del backend:** `https://localhost:7039/api` fija en `src/api/config.js`; sin campo editable en `login.html` ni lectura de `localStorage`.
* **Solo `sessionStorage` para sesion JWT:** La sesion (`auth_session`) almacena unicamente `{ userId, username, token, tokenType, expiresAt, authenticatedAt, defaultView, permissions, signature }` (y `northwind_jwt_token` sincronizado) **sin ningun campo `role` ni nombre de rol**.
* **Inyeccion `Authorization: Bearer <token>`:** `httpClient.js` adjunta exclusivamente la cabecera `Authorization: Bearer <token>` en peticiones privadas (sin `X-API-KEY`).
* **Cero rutas de API visibles:** Ninguna vista HTML ni texto de interfaz revela rutas `/api/...` ni detalles internos del servidor.

### 5.2. Guardias de Navegacion por Capacidades (`authGuard.js`)
* Cada pagina privada valida autenticacion y la capacidad de UI correspondiente (`authGuard('canViewProductsAdmin')`, `authGuard('canViewCustomers')`, `authGuard()`), sincronizando en cada carga las capacidades reales desde `GET /api/auth/me`.

### 5.3. Sanitizacion de Entradas y Prevencion de XSS
* **Prohibicion de `innerHTML` con datos sin sanitizar:** Toda renderizacion de datos provenientes del backend (nombres de productos, descripciones, clientes, ordenes) debe ejecutarse mediante `textContent`, `document.createElement`, o a traves de una funcion utilitaria de escape HTML (`escapeHtml(str)`).
* Prevencion de inyeccion en tablas dinamicas (DataTables): Uso del formateador `render: DataTable.render.text()` en todas las columnas con texto abierto.

### 5.4. Proteccion contra Fuerza Bruta en Frontend
* Registro de intentos fallidos en `localStorage` bajo las llaves `login_attempts` y `lockout_until`.
* Regla: Al acumularse 3 intentos fallidos consecutivos (respuestas `HTTP 401 Unauthorized` de `/api/auth/login`), se activa un temporizador de bloqueo de 15 minutos (`lockout_until = Date.now() + 15 * 60 * 1000`).
* Durante el periodo de bloqueo:
  * El boton de login y los campos de entrada se deshabilitan.
  * Se muestra un mensaje visible con la cuenta regresiva en segundos/minutos.
  * El estado persiste ante recargas de pagina (F5).
* Reto de verificacion: Inclusion de un desafio de confirmacion humana / captcha de verificacion interactiva antes de habilitar el envio de credenciales tras un bloqueo.

---

## 6. Requisitos Funcionales y de Seguridad Detallados

### Modulo: Autenticacion y Roles (AUTH)

#### [REQ-AUTH-001] Registro Autonomo de Clientes
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Permitir que los usuarios finales se registren de forma autonoma mediante `POST /api/auth/register`. El sistema frontend garantiza que todo usuario registrado por este medio obtenga estrictamente el rol `CLIENTE`.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Endpoint `/api/auth/register` operativo, validando unicidad de `Username` y `Email`.
  * - [x] **[Backend]** Almacenamiento seguro de contrasenas mediante PBKDF2 (100,000 iteraciones, SHA256, salt criptografico de 16 bytes).
  * - [x] **[Backend]** Generacion automatica de API Key vinculada con expiracion a 30 dias.
  * - [x] **[Frontend]** Formulario publico de registro con validacion en tiempo real (formato de correo, longitud minima de 8 caracteres en contrasena).
  * - [x] **[Frontend]** Asignacion automatica e inmutable del perfil `CLIENTE` en la sesion tras registro exitoso.
  * - [x] **[Frontend]** Manejo e interpretacion de ProblemDetails (errores 400 por usuario o correo duplicado) con mensajes claros al usuario.

#### [REQ-AUTH-002] Gestion de Administradores y Roles con Privilegios (Exclusivamente en Backend)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Soporte de roles diferenciados (`ADMIN`, `EMPLEADO`, `CLIENTE`) persistidos exclusivamente en la tabla `roles` de base de datos con FK `users.RoleId`, sin exponer nombres de roles ni whitelists en el frontend.
* **Criterios de Aceptacion:**
  * - [x] **[Arquitectura]** Matriz formal de permisos definida y documentada (Seccion 4.2), aplicada exclusivamente en el servidor.
  * - [x] **[Backend]** Validacion de autorizacion en etapa de filtro de autorizacion (`IAsyncAuthorizationFilter`: `[ApiKey]` Order=0 y `[RequireRoles]` Order=1) consultando `users.Role` en BD; calculo en servidor de `UiPermissionsDto` + `DefaultView` via `/api/auth/login` y `GET /api/auth/me` sin incluir nombres de rol.
  * - [x] **[Frontend]** Ocultamiento dinamico en el DOM de elementos restringidos (botones de creacion, edicion, eliminacion y enlaces de navegacion) basado unicamente en banderas booleanas de capacidad de UI (`permissions`), sin exponer roles ni regeneracion de API Keys.

#### [REQ-AUTH-003] Alta y Diferenciacion de Cuentas Operativas (Empleados)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Garantizar que los privilegios operativos de `EMPLEADO` y `ADMIN` no puedan ser adquiridos de forma autonoma por usuarios publicos. El registro publico asigna estrictamente `RoleId = 3` (`CLIENTE`) en servidor, mientras que las cuentas iniciales (`admin`, `Robe`, `Leo`) se siembran en la migracion EF Core `AddRolesAndSeedUsers`.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** El endpoint publico `/api/auth/register` no admite parametros de inyeccion de rol (solo recibe `RegisterDto`) y asigna siempre `RoleId = Role.ClienteId`.
  * - [x] **[Backend]** Migracion EF Core `AddRolesAndSeedUsers` siembra 1 administrador (`admin`) y 2 empleados (`Robe`, `Leo`) con hashes PBKDF2-SHA256.
  * - [x] **[Frontend]** Blindaje del flujo de registro: ninguna manipulacion en el payload permite elevar privilegios.

---

### Modulo: Gestion Comercial y Clientes (CORE)

#### [REQ-CORE-001] Gestion de Ventas e Historial de Ordenes
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Modulo para consulta y visualizacion comercial de ordenes historicas y seguimiento logistico mediante los endpoints de solo lectura `/api/orders` y `/api/orders/{id}` del backend congelado, vinculando la gestion de inventario a traves de productos.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Endpoints `GET /api/orders` y `GET /api/orders/{id}` operativos retornando `OrderDto` optimizados.
  * - [x] **[Frontend]** Vista o panel de visualizacion de ordenes con detalle de fechas, destino, direccion y flete.
  * - [x] **[Frontend]** Filtro de visualizacion: `ADMIN` y `EMPLEADO` visualizan todas las ordenes; `CLIENTE` visualiza ordenes pertinentes a su cuenta.
  * - [x] **[Frontend]** Ajuste de existencias de inventario tras despacho comercial mediante `PUT /api/Products/{id}`.

#### [REQ-CORE-002] Directorio y Consulta de Clientes
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Descripcion:** Consulta y administracion de clientes mediante `/api/customers` y `/api/customers/{id}`. Dado que el backend expone la entidad cliente como solo lectura, el control de acceso y suspension de clientes se rige por el estado `IsActive` de la cuenta de usuario en autenticacion.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Endpoints `GET /api/customers` y `GET /api/customers/{id}` operativos retornando `CustomerDto` (`CustomerId`, `CompanyName`, `ContactName`).
  * - [x] **[Backend]** Bloqueo de inicio de sesion para usuarios inactivos (`IsActive == false`) en `AuthController.cs`.
  * - [x] **[Frontend]** Vista o modal para consulta y busqueda de clientes accesible unicamente para `ADMIN` y `EMPLEADO`.
  * - [x] **[Frontend]** Proteccion de ruta: Si un usuario con rol `CLIENTE` intenta acceder al directorio de clientes, es bloqueado y redirigido a `catalogo.html`.

#### [REQ-CORE-003] Compra de Productos y Historial Propio de Pedidos del Cliente
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Permitir al cliente autenticado (`CLIENTE`) confirmar compras desde el modal del catalogo comercial creando una orden real en base de datos (`POST /api/orders`) con descuento atomico de inventario, y consultar automaticamente el historial de sus propios pedidos (`GET /api/orders/mine`) con el detalle de los productos adquiridos en `pedidos.html`.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Columna `UserID` en `orders` (FK nullable hacia `users.Id`) y ampliacion de columnas de envio (`ShipName`, `ShipAddress`, `ShipCity`, `ShipCountry`) mediante migracion EF Core.
  * - [x] **[Backend]** `POST /api/orders` transaccional que asocia `UserId` desde la `X-API-KEY`, valida `!Discontinued` y stock suficiente, descuenta `UnitsInStock` en `products`, registra `Order` + `OrderDetail` y retorna `201 Created`.
  * - [x] **[Backend]** `GET /api/orders/mine` filtrado en servidor por `UserId` de la sesion activa, retornando cada orden con `Items` (`ProductId`, `ProductName`, `UnitPrice`, `Quantity`, `Subtotal`) y `Total`.
  * - [x] **[Frontend]** Compra desde `catalogo.html` consumiendo `POST /api/orders` (`orderService.create`) y mostrando el `N° de Orden` generado en el comprobante.
  * - [x] **[Frontend]** Vista `pedidos.html` / `ordersController.js` cargando `GET /api/orders/mine` para `CLIENTE` y mostrando en `#modalDetalleOrden` el desglose de productos comprados y total de la orden.

#### [REQ-CORE-004] Directorio Unificado de Clientes y Gestion de Estados / Cancelacion de Pedidos
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Unificar en `/api/customers` y `clientes.html` los clientes de Northwind con los clientes reales registrados en `users` (perfil `CLIENTE`, clave dinamica de iniciales + autoincremento, correo en Empresa y usuario en Contacto, sin etiquetas adicionales), e implementar el ciclo completo de estados de pedidos (`Pendiente`, `Pendiente de envio`, `En transito`, `Entregado`, `Cancelado`) mediante `PATCH /api/orders/{id}/status`, incluyendo control exclusivo para `ADMIN` con confirmaciones de seguridad y cancelacion por parte del `CLIENTE` (y `ADMIN`) con devolucion atomica de stock y estado final irreversible.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** `CustomersController` (`GET /api/customers` y `GET /api/customers/{id}`) unifica Northwind + usuarios activos con rol `CLIENTE` en base de datos (`u.Role.Name == Role.ClienteName`), generando claves dinamicas unicas de iniciales + numero autoincremental (1 a 5 caracteres alfanumericos).
  * - [x] **[Backend]** Migracion EF Core `AddOrderStatus` agrega columna `orders.Status` (`varchar(30)`) y `OrdersController` expone `Status` en `OrderDto`.
  * - [x] **[Backend]** `PATCH /api/orders/{id}/status` valida roles (`ADMIN` 5 estados, `EMPLEADO` 403, `CLIENTE` solo cancelacion de pedidos propios activos), impide cancelar pedidos `ENTREGADO` o reactivar pedidos `CANCELADO` (`409 Conflict`), y devuelve atómicamente `UnitsInStock` en transaccion al cancelar.
  * - [x] **[Frontend]** `clientes.html` muestra la lista unificada en una sola tabla sin etiquetas extra.
  * - [x] **[Frontend]** `pedidos.html`, `ordenes.html` y `ordersController.js` incorporan filtro de 5 estados, control de cambio de estado exclusivo para `ADMIN` (en tabla y modal) con confirmacion al devolver `En transito`/`Entregado` a `Pendiente` y al cancelar `Pendiente`/`Pendiente de envio`/`En transito`, bloqueo de cancelacion en `Entregado` y bloqueo irreversible en `Cancelado`.
  * - [x] **[Frontend]** Boton `Cancelar Compra` visible unicamente para `CLIENTE` en sus pedidos propios no entregados ni cancelados, con confirmacion previa obligatoria.

---

### Modulo: Reglas de Negocio (BIZ)

#### [REQ-BIZ-001] Politica de Descontinuacion vs Eliminacion Fisica
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Garantizar la integridad historica del sistema. Aunque el backend expone `DELETE /api/Products/{id}`, este genera error `409 Conflict` cuando hay registros vinculados. La regla de negocio prioriza la descontinuacion logica (`Discontinued = true` via `PUT /api/Products/{id}`) sobre la eliminacion fisica.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** `ProductsController.DeleteProduct` captura `DbUpdateException` y retorna HTTP 409 cuando existen ordenes asociadas, impidiendo inconsistencias de base de datos.
  * - [x] **[Backend]** `ProductUpsertDto` y `Product` admiten la bandera booleana `Discontinued` mediante `PUT /api/Products/{id}`.
  * - [x] **[Frontend]** Opcion preferente de "Descontinuar Producto" en la interfaz para marcarlo inactivo sin romper relaciones historicas.
  * - [x] **[Frontend]** Captura controlada del error HTTP 409 en caso de intento de eliminacion fisica, informando amigablemente la existencia de registros asociados.

#### [REQ-BIZ-002] Prevencion de Registros Duplicados
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Descripcion:** Prevenir duplicidad de identificadores criticos (nombres de usuario, correos electronicos y codigos de entidad).
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Indices unicos `IX_users_Username` y `IX_users_Email` en base de datos.
  * - [x] **[Backend]** Verificacion explicita en `AuthController.PostRegister` retornando HTTP 400 ProblemDetails ante duplicados.
  * - [x] **[Frontend]** Validacion previa en formularios de registro y de productos (evitando nombres vacios o duplicados en cliente).
  * - [x] **[Frontend]** Manejo adecuado de respuestas 400 resaltando el campo en conflicto.

#### [REQ-BIZ-003] Validacion de Datos en Servidor y Rangos Permitidos
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Descripcion:** Validacion de tipos, longitudes y rangos de datos en el servidor para evitar corrupcion o manipulacion maliciosa de inventario.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** `ProductUpsertDto` valida `ProductName` (requerido, 2 a 40 caracteres).
  * - [x] **[Backend]** `ProductUpsertDto` valida `UnitPrice` (rango positivo: 0.01 a 100,000.00).
  * - [x] **[Backend]** `ProductUpsertDto` valida `UnitsInStock` (entero no negativo: 0 a 32,767).
  * - [x] **[Frontend]** Validacion HTML5 e interactiva en formularios de producto reflejando exactamente las mismas cotas del backend.

---

### Modulo: Seguridad y Control de Acceso (SEC)

#### [REQ-SEC-001] Autorizacion Granular en API y Proteccion de Rutas (URL)
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Descripcion:** Doble capa de autorizacion: el backend valida la autenticidad de la cabecera `X-API-KEY` en cada peticion privada, y el frontend Vanilla JS protege las URLs mediante guardias de navegacion (`authGuard.js`).
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Filtros de autorizacion `[ApiKey]` (`IAsyncAuthorizationFilter`, Order=0) y `[RequireRoles]` (`IAsyncAuthorizationFilter`, Order=1) aplicados en `ProductsController`, `CustomersController`, `OrdersController` y `AuthController.GetMe` antes de la validacion de modelos.
  * - [x] **[Backend]** Validacion exclusiva de `X-API-KEY` contra hash SHA-256 activo y no expirado en tabla `api_keys`, vinculada a un usuario activo con rol valido en `users`/`roles` (llave maestra estatica eliminada).
  * - [x] **[Frontend]** Inyeccion obligatoria y transparente de la cabecera `X-API-KEY` en todas las llamadas de `httpClient.js`.
  * - [x] **[Frontend]** Modulo `authGuard.js` ejecutado al cargar cada vista privada; redireccion inmediata a `login.html` si no hay sesion, o a `catalogo.html` con mensaje 403 si el rol no tiene privilegios.

#### [REQ-SEC-002] Manejo Estandarizado de Mensajes y ProblemDetails (RFC 7807)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Descripcion:** Respuestas de error estandarizadas que informan al usuario sin revelar datos de infraestructura interna ni stack traces.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** Implementacion nativa de `ProblemDetails` (RFC 7807) en `Program.cs` (`builder.Services.AddProblemDetails()`, `app.UseExceptionHandler()`, `app.UseStatusCodePages()`).
  * - [x] **[Backend]** Mensajes genericos en autenticacion fallida ("El usuario o la contraseña proporcionados son incorrectos.") sin divulgar si fallo el usuario o la clave.
  * - [x] **[Frontend]** Extraccion uniforme de `detail` y `title` desde respuestas ProblemDetails en `httpClient.js` y servicios, presentandolas al usuario sin trazas tecnicas.

#### [REQ-SEC-003] Minimizacion de Datos en Transito (Prevencion de Over-fetching)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Limitar la carga util enviada a traves de la red unicamente a los campos requeridos por las vistas, excluyendo datos pesados o sensibles.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** `ProductDto` proyecta unicamente `ProductId`, `ProductName`, `UnitPrice`, `UnitsInStock` (excluye metadatos internos).
  * - [x] **[Backend]** `CustomerDto` excluye imagenes binarias y datos de fax/region no esenciales.
  * - [x] **[Backend]** `OrderDto` excluye relaciones circulares de navegacion y llaves foraneas no consultadas.
  * - [x] **[Backend]** `AuthResponseDto` expone unicamente identificador, nombre y API Key generada (nunca retorna PasswordHash).

#### [REQ-SEC-004] Proteccion contra Clickjacking
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Descripcion:** Impedir que las vistas de la aplicacion sean incrustadas dentro de elementos `<iframe>`, `<frame>` u `<object>` en sitios de terceros.
* **Criterios de Aceptacion:**
  * - [x] **[Frontend]** Insercion de directiva meta `Content-Security-Policy: frame-ancestors 'none';` en los encabezados HTML de todas las vistas del proyecto.
  * - [x] **[Frontend]** Script defensivo de ruptura de marcos (frame-busting script) en el encabezado comun de la aplicacion para mitigar incrustaciones no autorizadas.

#### [REQ-SEC-005] Sanitizacion de Entradas, Prevencion de XSS y Almacenamiento Seguro
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Descripcion:** Neutralizar codigo malicioso inyectado por usuarios y asegurar el almacenamiento temporal de las credenciales de sesion.
* **Criterios de Aceptacion:**
  * - [x] **[Frontend]** Reemplazo de inserciones de riesgo `innerHTML` por asignaciones seguras `textContent` y construccion controlada de nodos DOM.
  * - [x] **[Frontend]** Migracion completa del almacenamiento de API Key y perfil desde `localStorage` a `sessionStorage` para limitar la exposicion al ciclo de vida de la pestana.
  * - [x] **[Frontend]** Limpieza integral de `sessionStorage` en el evento de cierre de sesion (`logout`).

#### [REQ-SEC-006] Proteccion contra Fuerza Bruta (Control de Intentos en Frontend)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Mitigar ataques automatizados de adivinacion de credenciales en el inicio de sesion mediante bloqueo progresivo en cliente tras 3 intentos fallidos consecutivos.
* **Criterios de Aceptacion:**
  * - [x] **[Frontend]** Contador de intentos fallidos persistente en `localStorage`/`sessionStorage` ante respuestas HTTP 401.
  * - [x] **[Frontend]** Bloqueo automatico del formulario y boton de login durante 15 minutos al alcanzar 3 intentos fallidos.
  * - [x] **[Frontend]** Renderizado de cronometro interactivo que indique el tiempo restante de bloqueo y prevenga el envio de nuevas solicitudes.
  * - [x] **[Frontend]** Desafio interactivo de verificacion (reto captcha en cliente) antes de reanudar el formulario una vez expirado el tiempo de bloqueo.

---

## 7. Plantilla para Nuevos Requisitos (Escalabilidad)

Para incorporar un nuevo requisito, agrega el siguiente bloque en el modulo correspondiente y actualiza la tabla de progreso:

```markdown
#### [REQ-MODULO-XXX] Titulo del Requisito
* **Estado:** `[TODO]`
* **Prioridad:** [Baja | Media | Alta | Critica]
* **Descripcion:** Descripcion clara y concisa de la funcionalidad o restriccion, validada contra el backend congelado.
* **Criterios de Aceptacion:**
  * - [ ] **[Backend]** Criterio verificable de backend (debe usar endpoints existentes sin modificacion).
  * - [ ] **[Frontend]** Criterio verificable de interfaz o logica en Vanilla JS.
```

---

## 8. Historial de Cambios del Agente

| Fecha | Agente / Autor | ID Afectado | Accion Realizada |
| :--- | :--- | :--- | :--- |
| 2026-11-21 | Sistema Inicial | ALL | Creacion de la linea base inicial de requisitos del proyecto. |
| 2026-11-23 | @analista | ALL | Auditoria integral de viabilidad contra el backend 100% congelado (`APIkey`). Se documento el inventario exacto de endpoints reales, se adaptaron los requisitos de ordenes y clientes a modo solo-lectura, se definieron formalmente los 3 roles (`ADMIN`, `EMPLEADO`, `CLIENTE`) con su matriz RBAC completa, se diseno la arquitectura de seguridad frontend en Vanilla JS (`sessionStorage`, guardias de navegacion, mitigacion XSS, bloqueo por fuerza bruta de 15 min), y se actualizaron los porcentajes de progreso y estados. |
| 2026-11-23 | Antigravity | ALL | Actualizacion de la ruta oficial del backend congelado a `C:\Users\yalan\Documentos\Prog WEB II\API_Equipo_BackEnd\API-KEY_AUTH` y recapitulacion tras inspeccion directa de controladores, filtros, DTOs y configuracion (`Program.cs`, `launchSettings.json`, `ApiKeyAttribute.cs`, `AuthController.cs`, `ApiKeysController.cs`, `ProductsController.cs`, `CustomersController.cs`, `OrdersController.cs`). |
| 2026-11-23 | @verifier | REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-BIZ-002, REQ-SEC-001, REQ-SEC-005 | Verificacion y cierre de requisitos de Fase 2 (100% de pruebas en `tests/fase1.test.mjs` y `tests/fase2.test.mjs`): autenticacion exclusiva mediante `/api/auth/login` y `/api/auth/register` (eliminando uso de llave maestra estatica en frontend), mapeo RBAC determinista (`ADMIN`, `EMPLEADO` con whitelist y prefijo `emp_*`, `CLIENTE`) con firma de integridad en `sessionStorage`, guardias `authGuard.js` en todas las vistas protegidas de `src/views/`, adaptacion dinamica de interfaz, y regeneracion de API Keys en caliente. |
| 2026-11-23 | @verifier-f3 | REQ-AUTH-001, REQ-AUTH-002, REQ-CORE-001, REQ-BIZ-001, REQ-BIZ-002, REQ-BIZ-003, REQ-SEC-002, REQ-SEC-003 | Verificacion y cierre de criterios de Fase 3 (21/21 pruebas automatizadas en `tests/fase1.test.mjs`, `tests/fase2.test.mjs` y `tests/fase3.test.mjs`): refactorizacion de `productService.js` (`ProductsSummaryDto`, CRUD completo y `discontinue`), validaciones de cotas exactas y prevencion de duplicados en `productModel.js`, vista administrativa RBAC en `src/views/productos.html` y `src/controllers/productsController.js` (modal unificado Crear/Editar, edicion restringida a precio y existencias para `EMPLEADO`, politica de descontinuacion logica y captura de HTTP `409 Conflict` con mensaje de integridad historica y accion rapida), y vista de catalogo comercial de solo lectura con filtros en tiempo real e indicador de productos agotados en `src/views/catalogo.html` y `src/controllers/catalogController.js`. |
| 2026-11-24 | Antigravity | REQ-CORE-001, REQ-CORE-002, REQ-SEC-003 | Cierre de criterios de Fase 4 (`TASK-F4-01` a `TASK-F4-04`) con 28/28 pruebas pasando en `tests/fase1.test.mjs` a `tests/fase4.test.mjs`: modelos y servicios de solo lectura (`customerModel.js`, `customerService.js`, `orderModel.js`, `orderService.js`) con validacion anti-traversal y minimizacion estricta DTO, vistas anti-clickjacking y de solo lectura (`clientes.html`, `ordenes.html`, `pedidos.html`), y controladores RBAC anti-XSS (`customersController.js`, `ordersController.js`) con modal de detalle de cliente, modal logístico/postal de orden y aislamiento/busqueda por N° de orden para `CLIENTE`. |
| 2026-11-24 | @verifier | REQ-SEC-004, REQ-SEC-005, REQ-SEC-006 | Cierre al 100% de Fase 5 y del proyecto (14/14 requisitos `[DONE]`, 28/28 pruebas existentes pasando en `tests/fase1.test.mjs` a `tests/fase4.test.mjs`): proteccion contra clickjacking (`frame-ancestors 'none'` + `window.top !== window.self`) en todas las vistas `src/views/*.html`; prevencion XSS (`src/utils/securityUtils.js` y 0 usos de `innerHTML` en `src/`) e higiene completa de `sessionStorage`/`localStorage` en `httpClient.js` y `authService.js`; proteccion contra fuerza bruta en `src/utils/bruteForceProtection.js`, `src/views/login.html` y `src/controllers/loginController.js` (3 intentos HTTP 401, bloqueo de 15 min persistente ante F5, cronometro MM:SS y reto CAPTCHA); y auditoria estatica limpia sin endpoints inexistentes ni rutas rotas. |
| 2026-11-24 | Antigravity | REQ-CORE-003 | Extension controlada del backend (`APIkey`) y frontend para compras reales e historial propio de `CLIENTE` (15/15 requisitos `[DONE]`): `ApiKeyAttribute` propaga `ClientIdentifier`; migracion EF Core `AddOrderUserIdAndWidenShipFields` (`orders.UserID` + columnas de envio ampliadas); `POST /api/orders` transaccional y `GET /api/orders/mine` con `Items` y `Total` en `OrdersController.cs`; integracion en `orderModel.js`, `orderService.js`, `catalogController.js`, `ordersController.js`, `pedidos.html` y `ordenes.html`; 32/32 pruebas unitarias y verificacion E2E en vivo contra MySQL exitosas. |
| 2026-11-24 | Antigravity | REQ-CORE-004 | Extension controlada de clientes unificados y ciclo de estados/cancelacion de pedidos (16/16 requisitos `[DONE]`): `CustomersController.cs` unifica Northwind + cuentas activas `CLIENTE` con clave dinamica determinista (iniciales + autoincremento, correo en Empresa y usuario en Contacto); migracion EF Core `AddOrderStatus` (`orders.Status`); `PATCH /api/orders/{id}/status` en `OrdersController.cs` con RBAC (`ADMIN` 5 estados, `CLIENTE` cancelacion de pedidos propios activos), estado `CANCELADO` irreversible, bloqueo de cancelacion en `ENTREGADO` y reintegro atomico de stock; integracion en `orderModel.js`, `orderService.js`, `ordersController.js`, `pedidos.html` y `ordenes.html`; 38/38 pruebas unitarias (`tests/fase1.test.mjs` a `tests/fase7.test.mjs`) y `dotnet build` sin errores. |
| 2026-11-25 | Antigravity | ALL (v2.0.0) | Endurecimiento integral de seguridad y menor exposicion del backend (Fase 8): creacion de tabla `roles` (`ADMIN`, `EMPLEADO`, `CLIENTE`) y FK `users.RoleId` (default `CLIENTE`) en migracion EF Core `AddRolesAndSeedUsers` sembrando 1 admin (`admin`) y 2 empleados (`Robe`, `Leo`) con PBKDF2-SHA256; eliminacion de `ResolveUserRole` y listas hardcodeadas en backend; autorizacion estricta en servidor mediante `[ApiKey]` + `[RequireRoles]` en todos los controladores; nuevo endpoint `GET /api/auth/me` con banderas de UI (`UiPermissionsDto`) sin exponer nombres de roles; eliminacion de `POST /api/apikeys/regenerate` y su modulo/boton en frontend; eliminacion de exposicion de roles en frontend (`ROLES`, whitelists, `#badgeRol`, `#badgeRoleCliente`, campo `role` en `sessionStorage`); eliminacion del campo de configuracion de URL del backend en `login.html` y `localStorage` (`https://localhost:7039/api` fija); y eliminacion de textos que revelen rutas de la API en frontend. |
| 2026-11-25 | Antigravity | ALL (v3.0.0) | Migracion integral de autenticacion y autorizacion desde API Key hacia JWT Bearer (`Authorization: Bearer <token>`): eliminacion total de logica `X-API-KEY` / `apiKey` / `northwind_api_key` en frontend (`config.js`, `httpClient.js`, `authService.js`), almacenamiento seguro exclusivo en `sessionStorage` (`northwind_jwt_token` + `auth_session` firmada con validacion de `exp` JWT y `expiresAt`), correccion de guardia `DOMContentLoaded` en `productsController.js`, y actualizacion completa de la suite `tests/*.test.mjs` para verificar autenticacion exclusivamente JWT. |
