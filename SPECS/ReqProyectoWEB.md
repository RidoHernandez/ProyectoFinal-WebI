---
proyecto: Sistema de Gestion Comercial y Control de Acceso
version: 1.5.0
estado_global: DONE
ultima_actualizacion: 2026-11-24
formato_agente: AI-READABLE-SPEC-V1
backend_status: FROZEN_LOCKED
---

# Especificacion de Requisitos del Sistema y Arquitectura de Seguridad

## 1. Instrucciones para el Agente de IA
Este documento esta estructurado para ser analizado y actualizado de forma determinista por cualquier agente del enjambre. Al interactuar con este archivo o ejecutar tareas sobre el proyecto, respeta estrictamente las siguientes directrices:
1. **Identificadores Unicos Inmutables:** Nunca modifiques el ID de un requisito existente (`REQ-[MODULO]-[NUMERO]`). Los correlativos identifican contractualmente cada compromiso del sistema.
2. **Estados Validos:** Utiliza unicamente las etiquetas estandarizadas `[TODO]`, `[IN_PROGRESS]`, `[REVIEW]`, `[DONE]`, `[BLOCKED]`.
3. **Backend 100% Congelado (Inmutable):** El codigo fuente, modelos, base de datos y endpoints en `C:\Users\yalan\Documentos\Prog WEB II\API_Equipo_BackEnd\API-KEY_AUTH` estan estrictamente congelados y NO se pueden modificar bajo ninguna circunstancia. Toda solucion, restriccion de roles, interfaz y control de acceso debe implementarse y resolverse en la capa frontend (Vanilla JavaScript / HTML5 / CSS3).
4. **Actualizacion de Progreso:** Al marcar una subtarea como completada (`- [x]`), recalcula el porcentaje en la seccion "Resumen de Progreso" y actualiza el estado del requisito padre.
5. **Registro de Cambios:** Documenta cualquier modificacion estructural, de criterios o de estado en la seccion final "Historial de Cambios del Agente".

---

## 2. Resumen de Progreso

| Modulo | ID Modulo | Total Requisitos | Completados | En Progreso | Pendientes | Avance (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Autenticacion y Roles | AUTH | 3 | 3 | 0 | 0 | 100% |
| Gestion Comercial y Clientes | CORE | 2 | 2 | 0 | 0 | 100% |
| Reglas de Negocio | BIZ | 3 | 3 | 0 | 0 | 100% |
| Seguridad y Control de Acceso | SEC | 6 | 6 | 0 | 0 | 100% |
| **TOTAL** | **ALL** | **14** | **14** | **0** | **0** | **100%** |

---

## 3. Inventario del Backend Congelado y Mapeo de Contratos

El backend ASP.NET Core (`APIkey`, .NET 8 / MySQL en `C:\Users\yalan\Documentos\Prog WEB II\API_Equipo_BackEnd\API-KEY_AUTH`, ejecutando en `http://localhost:5009` / `https://localhost:7039` con CORS `AllowAll`) expone exclusivamente los siguientes controladores y contratos inmutables:

### 3.1. AuthController (`/api/auth`)
* `POST /api/auth/register`: Recibe `RegisterDto` (`Username` [Required], `Email` [Required, EmailAddress], `Password` [Required, MinLength(8)]). Valida unicidad de usuario y correo (retorna `400 Bad Request` ProblemDetails si existe duplicado); almacena clave hasheada con PBKDF2 (100,000 iteraciones, SHA256, salt de 16 bytes); genera API Key (`ak_...`) con vigencia de 30 dias. Retorna `201 Created` con `AuthResponseDto` (`UserId`, `Username`, `ApiKey`, `ExpiresAt`).
* `POST /api/auth/login`: Recibe `LoginDto` (`Username`, `Password`). Valida credenciales contra PBKDF2 en tiempo constante; invalida llaves anteriores activas del usuario; genera nueva API Key activa; retorna `200 OK` con `AuthResponseDto`. Si las credenciales fallan o el usuario tiene `IsActive == false`, retorna `401 Unauthorized` con ProblemDetails generico ("Credenciales invalidas").

### 3.2. ApiKeysController (`/api/apikeys`)
* `POST /api/apikeys/regenerate`: Protegido por filtro `[ApiKey]`. Invalida la API Key actual enviada en la cabecera `X-API-KEY` (buscando su hash SHA256 en la tabla `api_keys`), genera una nueva llave (`ak_...` con vigencia de 30 dias) para el mismo `ClientIdentifier`, y retorna `200 OK` con `ApiKeyCreatedResponseDto` (`Id`, `ClientIdentifier`, `ApiKey`, `CreatedAt`, `IsActive`, `ExpiresAt`). *Nota: La llave maestra estatica `ROBE-LINGO-KEY-1234` no reside en `api_keys`, por lo que intentar regenerarla retorna `401 Unauthorized`.*

### 3.3. ProductsController (`/api/Products`)
* Protegido integralmente por filtro `[ApiKey]`.
* `GET /api/Products`: Retorna `ProductsSummaryDto` (`{ totalProducts: int, products: List<ProductDto> }`). Cada `ProductDto` contiene unicamente `ProductId`, `ProductName`, `UnitPrice`, `UnitsInStock` (no expone `Discontinued` en la proyeccion de lectura).
* `GET /api/Products/{id}`: Retorna un `ProductDto` especifico o `404 Not Found`.
* `POST /api/Products`: Recibe `ProductUpsertDto` (`ProductName` [2-40 chars], `UnitPrice` [0.01 - 100,000], `UnitsInStock` [0 - 32,767], `Discontinued` [bool, default `false`]). Retorna `201 Created` con `ProductDto`.
* `PUT /api/Products/{id}`: Actualiza producto existente con `ProductUpsertDto`. Retorna `204 NoContent` o `404 Not Found`.
* `DELETE /api/Products/{id}`: Ejecuta eliminacion fisica. Si existen ordenes o detalles referenciados, el backend captura `DbUpdateException` y retorna `409 Conflict` ("Conflicto de integridad referencial").

### 3.4. CustomersController (`/api/customers`)
* Protegido por filtro `[ApiKey]`.
* `GET /api/customers`: Retorna `List<CustomerDto>` (`CustomerId`, `CompanyName`, `ContactName`). **Solo lectura (No existen endpoints POST, PUT ni DELETE en el backend).**
* `GET /api/customers/{id}`: Retorna `CustomerDto` por identificador alfanumerico (5 caracteres) o `404 Not Found`.

### 3.5. OrdersController (`/api/orders`)
* Protegido por filtro `[ApiKey]`.
* `GET /api/orders`: Retorna `List<OrderDto>` (`OrderId`, `OrderDate`, `RequiredDate`, `ShippedDate`, `Freight`, `ShipName`, `ShipAddress`, `ShipCity`, `ShipRegion`, `ShipPostalCode`, `ShipCountry`). **Solo lectura (No existen endpoints POST, PUT ni DELETE en el backend).**
* `GET /api/orders/{id}`: Retorna `OrderDto` por ID numerico o `404 Not Found`.

### 3.6. Controladores Inexistentes en Backend
* **Categorias y Proveedores:** NO existen `CategoriesController` ni `SuppliersController` en el backend. Las vistas que los requieran deben operar mediante cache local, catalogos estaticos de referencia o fallback silencioso ya previsto en `categoryService.js` y `supplierService.js`.
* **Empleados:** NO existe `EmployeesController`. Las cuentas de empleados se gestionan mediante el sistema de autenticacion de usuarios y asignacion de roles en frontend.

---

## 4. Definicion de Roles, Responsabilidades y Matriz de Permisos (RBAC)

Dado que la tabla `users` en base de datos no contiene una columna de rol mutable y el backend esta congelado, el control de acceso basado en roles (RBAC) se modela de forma hibrida: autenticacion criptografica mediante API Key en backend + autorizacion RBAC determinista en frontend basada en perfiles seguros.

### 4.1. Perfiles y Responsabilidades

1. **Administrador (`ADMIN`)**:
   * **Alcance:** Control total y gobierno del sistema.
   * **Credencial / Origen:** Cuentas autenticadas mediante `POST /api/auth/login` con nombre de usuario con privilegios administrativos declarados (`admin`, `administrador`).
   * **Responsabilidades:**
     * Gestion integral del catalogo e inventario de productos (Creacion `POST`, Edicion `PUT`, Descontinuacion logica y Eliminacion `DELETE`).
     * Acceso irrestricto a la vista de gestion de productos (`productos.html`).
     * Consulta y auditoria de clientes (`clientes.html` / `customers`).
     * Consulta integral de ordenes y logistica (`ordenes.html` / `orders`).
     * Capacidad de regeneracion de API Keys institucionales y de administracion.

2. **Empleado (`EMPLEADO`)**:
   * **Alcance:** Operacion comercial, gestion de existencias y atencion operativa.
   * **Credencial / Origen:** Usuarios creados por administracion o identificados con perfil operativo (`emp_*` o asignacion en whitelist institucional).
   * **Responsabilidades:**
     * Consulta del catalogo completo de productos e inventario.
     * Actualizacion operativa de existencias y precios (`PUT /api/Products/{id}`).
     * **Restriccion:** Prohibida la eliminacion de productos (`DELETE`) y la alteracion de credenciales maestras.
     * Consulta del directorio de clientes (`GET /api/customers`) para atencion comercial.
     * Consulta y seguimiento del estado de pedidos y despachos (`GET /api/orders`).

3. **Cliente (`CLIENTE`)**:
   * **Alcance:** Consumidor final / autoservicio.
   * **Credencial / Origen:** Cualquier usuario registrado de forma autonoma mediante `POST /api/auth/register`. Su API Key generada (`ak_...`) identifica su cuenta personal.
   * **Responsabilidades:**
     * Navegacion en catalogo paginado de productos disponibles (`catalogo.html`).
     * Consulta de precios, nombres y stock disponible.
     * Consulta de sus ordenes de compra e historial historico (`ordenes.html`).
     * **Restriccion Total:** Acceso denegado a la gestion administrativa de productos (`productos.html`), a la creacion/modificacion/eliminacion de inventario y al directorio general de otros clientes.

### 4.2. Matriz de Permisos (RBAC)

| Recurso / Vista / Operacion | Endpoint Backend / Ruta Frontend | Metodo | ADMIN | EMPLEADO | CLIENTE |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Registro Publico** | `/api/auth/register` | POST | ❌ | ❌ | ✅ |
| **Inicio de Sesion** | `/api/auth/login` | POST | ✅ | ✅ | ✅ |
| **Regenerar API Key** | `/api/apikeys/regenerate` | POST | ✅ | ✅ | ❌ |
| **Catalogo Paginado (Vista)** | `catalogo.html` | GET | ✅ | ✅ | ✅ |
| **Listar Productos (API)** | `/api/Products` | GET | ✅ | ✅ | ✅ |
| **Detalle de Producto (API)** | `/api/Products/{id}` | GET | ✅ | ✅ | ✅ |
| **Gestion Productos CRUD (Vista)** | `productos.html` | GET | ✅ | ✅ (Solo edicion) | ❌ (Bloqueo 403) |
| **Crear Producto (API)** | `/api/Products` | POST | ✅ | ❌ | ❌ |
| **Actualizar Producto / Stock (API)**| `/api/Products/{id}` | PUT | ✅ | ✅ | ❌ |
| **Eliminar Producto (API)** | `/api/Products/{id}` | DELETE | ✅ (Restringido) | ❌ | ❌ |
| **Directorio de Clientes (API)** | `/api/customers` | GET | ✅ | ✅ | ❌ |
| **Detalle de Cliente (API)** | `/api/customers/{id}` | GET | ✅ | ✅ | ❌ |
| **Listar Ordenes (API)** | `/api/orders` | GET | ✅ | ✅ | ✅ (Filtradas) |
| **Detalle de Orden (API)** | `/api/orders/{id}` | GET | ✅ | ✅ | ✅ (Propia) |

---

## 5. Arquitectura de Seguridad en Frontend (Vanilla JS)

Dado el congelamiento del backend, la seguridad del lado del cliente debe ser estricta, desacoplada y basada en buenas practicas de desarrollo frontend.

### 5.1. Almacenamiento Seguro de Sesion (`sessionStorage` vs `localStorage`)
* **Migracion a `sessionStorage`:** Las credenciales activas (`northwind_api_key`), el perfil de usuario y el rol del sistema deben residir primariamente en `sessionStorage`. Esto garantiza que los tokens expiren de manera inmediata al cerrar la pestana o el navegador, mitigando riesgos de retencion indebida en dispositivos compartidos.
* **Uso Exclusivo de `localStorage`:** Restringido unicamente a parametros de configuracion de entorno no sensibles (como la URL base de la API `northwind_api_url` o tema de la interfaz).
* **Estructura del Estado de Sesion:**
  ```javascript
  const session = {
    userId: 12,
    username: "cliente_demo",
    role: "CLIENTE", // "ADMIN" | "EMPLEADO" | "CLIENTE"
    apiKey: "ak_8f4a...",
    expiresAt: "2026-12-23T23:42:00Z",
    authenticatedAt: 1732405320000
  };
  ```

### 5.2. Guardias de Navegacion (Route Guards en Vanilla JS)
* Cada pagina privada (`productos.html`, `catalogo.html`, etc.) debe incluir en la primera linea de ejecucion de su script un chequeo sincrono de guardia:
  ```javascript
  import { authGuard } from "../utils/authGuard.js";
  authGuard(['ADMIN', 'EMPLEADO']); // Redirige a login.html si no hay sesion, o a catalogo.html si es CLIENTE
  ```
* En caso de violacion de privilegios: Se emite un aviso visual claro (alerta Toast o Modal de acceso no autorizado) y se redirige automaticamente a la vista correspondiente sin exponer elementos del DOM sensible.

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

#### [REQ-AUTH-002] Gestion de Administradores y Roles con Privilegios
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Soporte de roles diferenciados (`ADMIN`, `EMPLEADO`, `CLIENTE`) con matriz de permisos estricta en el frontend para gobernar las vistas y llamadas a la API.
* **Criterios de Aceptacion:**
  * - [x] **[Arquitectura]** Matriz formal de permisos RBAC definida y documentada (Seccion 4.2).
  * - [x] **[Frontend]** Mecanismo de mapeo determinista de perfil en `authService.js`: deteccion de `ADMIN` (mediante cuentas administrativas `admin`, `administrador` autenticadas via `/api/auth/login`), `EMPLEADO` (whitelist operativa y prefijo `emp_*`) y `CLIENTE` (usuarios registrados y cuentas estandar) con firma de integridad contra manipulacion en `sessionStorage`.
  * - [x] **[Frontend]** Ocultamiento dinamico en el DOM de elementos restringidos (botones de creacion, edicion, eliminacion y enlaces de navegacion) segun el rol del usuario conectado.
  * - [x] **[Frontend]** Soporte en interfaz administrativa para regenerar API Keys mediante `POST /api/apikeys/regenerate`.

#### [REQ-AUTH-003] Alta y Diferenciacion de Cuentas Operativas (Empleados)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Descripcion:** Garantizar que los privilegios operativos de `EMPLEADO` no puedan ser adquiridos de forma autonoma por usuarios publicos. Dado el congelamiento del backend, el registro publico asigna unicamente `CLIENTE`, mientras que las cuentas de `EMPLEADO` son administradas o habilitadas bajo lista de control autorizada.
* **Criterios de Aceptacion:**
  * - [x] **[Backend]** El endpoint publico `/api/auth/register` no admite parametros de inyeccion de rol (solo recibe `RegisterDto`).
  * - [x] **[Frontend]** Blindaje del flujo de registro: ninguna manipulacion en el payload permite elevar privilegios a `EMPLEADO` o `ADMIN`.
  * - [x] **[Frontend]** Configuracion centralizada de credenciales operativas de empleados para atencion comercial y mantenimiento de stock.

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
  * - [x] **[Backend]** Filtro `[ApiKey]` implementado e inyectado en `ProductsController`, `CustomersController`, `OrdersController` y `ApiKeysController`.
  * - [x] **[Backend]** Soporte dual de API Key: validacion contra llave fija institucional (`ROBE-LINGO-KEY-1234`) o contra hash SHA256 en tabla `api_keys`.
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
