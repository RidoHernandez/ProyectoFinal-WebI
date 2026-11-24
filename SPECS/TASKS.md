---
proyecto: Sistema de Gestion Comercial y Control de Acceso
documento: Plan de Trabajo y Desglose de Tareas (WBS / Tasks)
version: 1.5.0
estado_global: DONE
ultima_actualizacion: 2026-11-24
formato_agente: AI-READABLE-TASKS-V1
referencia_spec: ReqProyectoWEB.md (v1.5.0)
backend_status: FROZEN_LOCKED
---

# Plan de Trabajo y Desglose de Tareas (WBS / Tasks)

## 1. Instrucciones para el Agente y Desarrolladores

Este documento define la hoja de ruta de implementacion para el frontend Vanilla (HTML5, CSS puro / Bootstrap utilitario, JavaScript modular con ES Modules), sincronizado estrictamente con los contratos inmutables del backend ASP.NET Core (`c:\Proyectos\Web II\API-KEY_AUTH`).

Al interactuar con este archivo o ejecutar tareas, respeta las siguientes normas:
1. **Identificadores Unicos Inmutables:** Cada tarea posee un codigo estructurado `TASK-F[FASE]-[CORRELATIVO]` (ej. `TASK-F1-01`). Nunca modifiques estos identificadores.
2. **Estados Estandarizados:** Las tareas se gestionan con casillas de verificacion (`- [ ]` para pendiente, `- [x]` para completado) y etiquetas de estado `[TODO]`, `[IN_PROGRESS]`, `[REVIEW]`, `[DONE]`, `[BLOCKED]`.
3. **Backend Estrictamente Congelado:** Bajo ninguna circunstancia se debe crear, editar o eliminar codigo en `c:\Proyectos\Web II\API-KEY_AUTH`. Toda la logica de negocio, control de roles (RBAC) y seguridad debe gobernarse desde el cliente frontend.
4. **Actualizacion de Metricas:** Al marcar una tarea como completada (`- [x]` y `[DONE]`), actualiza la tabla de progreso en la Seccion 2 ("Resumen de Progreso por Fase").
5. **Criterios de Aceptacion:** Una tarea solo se considera completada si cumple con la totalidad de los criterios de aceptacion descritos en su bloque.

---

## 2. Resumen de Progreso por Fase

| Fase | Descripcion | Total Tareas | Completadas | En Progreso | Pendientes | Avance (%) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **Fase 1** | Configuracion base y cliente HTTP | 4 | 4 | 0 | 0 | 100% |
| **Fase 2** | Autenticacion, registro y control de roles | 7 | 7 | 0 | 0 | 100% |
| **Fase 3** | Gestion de productos y catalogo | 6 | 6 | 0 | 0 | 100% |
| **Fase 4** | Consulta de clientes y ordenes | 4 | 4 | 0 | 0 | 100% |
| **Fase 5** | Seguridad en cliente, validaciones Vanilla y buenas practicas | 5 | 5 | 0 | 0 | 100% |
| **TOTAL** | **Consolidado del Proyecto** | **26** | **26** | **0** | **0** | **100%** |

---

## 3. Matriz de Trazabilidad: Requisitos vs Tareas

| Requisito en ReqProyectoWEB.md | Descripcion del Requisito | Tarea(s) Asociada(s) |
| :--- | :--- | :--- |
| **REQ-AUTH-001** | Registro Autonomo de Clientes | `TASK-F1-04`, `TASK-F2-01`, `TASK-F2-02`, `TASK-F2-05`, `TASK-F3-06` |
| **REQ-AUTH-002** | Gestion de Administradores y Roles con Privilegios (RBAC) | `TASK-F2-01`, `TASK-F2-03`, `TASK-F2-04`, `TASK-F2-06`, `TASK-F2-07`, `TASK-F3-03` |
| **REQ-AUTH-003** | Alta Exclusiva y Diferenciacion de Empleados | `TASK-F2-03`, `TASK-F2-05`, `TASK-F2-06` |
| **REQ-CORE-001** | Gestion de Ventas e Historial de Ordenes | `TASK-F3-01`, `TASK-F4-03`, `TASK-F4-04` |
| **REQ-CORE-002** | Directorio y Consulta de Clientes (Solo Lectura) | `TASK-F4-01`, `TASK-F4-02` |
| **REQ-BIZ-001** | Politica de Descontinuacion vs Eliminacion Fisica (409 Conflict) | `TASK-F1-03`, `TASK-F3-01`, `TASK-F3-03`, `TASK-F3-05` |
| **REQ-BIZ-002** | Prevencion de Registros Duplicados | `TASK-F2-05`, `TASK-F3-04` |
| **REQ-BIZ-003** | Validacion de Datos en Servidor y Rangos Permitidos | `TASK-F3-02`, `TASK-F3-04` |
| **REQ-SEC-001** | Autorizacion Granular en API y Proteccion de Rutas (URL) | `TASK-F1-01`, `TASK-F1-02`, `TASK-F1-04`, `TASK-F2-04` |
| **REQ-SEC-002** | Manejo Estandarizado de Mensajes y ProblemDetails (RFC 7807) | `TASK-F1-03`, `TASK-F2-05`, `TASK-F3-04`, `TASK-F3-05` |
| **REQ-SEC-003** | Minimizacion de Datos en Transito (Prevencion de Over-fetching) | `TASK-F3-01`, `TASK-F4-01`, `TASK-F4-03` |
| **REQ-SEC-004** | Proteccion contra Clickjacking (Frame-Busting / CSP) | `TASK-F5-03` |
| **REQ-SEC-005** | Sanitizacion de Entradas, Prevencion XSS y Almacenamiento Seguro | `TASK-F1-02`, `TASK-F2-02`, `TASK-F5-02`, `TASK-F5-04` |
| **REQ-SEC-006** | Proteccion contra Fuerza Bruta (Bloqueo de 15 min en Frontend) | `TASK-F5-01` |

---

## 4. Desglose Detallado de Tareas

### FASE 1: Configuracion Base y Cliente HTTP

#### [TASK-F1-01] Configuracion Centralizada de Entorno y Conexion API
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/api/config.js` (o constante central en `src/api/httpClient.js`)
* **Requisitos:** `REQ-SEC-001`
* **Descripcion:** Centralizar la URL base del backend congelado (`http://localhost:5009/api`), permitiendo parametrizacion de desarrollo sin alterar secretos ni requerir build tools.
* **Criterios de Aceptacion:**
  * - [x] Crear/confirmar constante `API_BASE_URL` con valor por defecto `http://localhost:5009/api`.
  * - [x] Soporte para sobreescritura opcional mediante `localStorage.getItem('northwind_api_url')` exclusivamente para configuracion no sensible.
  * - [x] Exportacion de constantes de endpoints (`AUTH_LOGIN`, `AUTH_REGISTER`, `APIKEYS_REGENERATE`, `PRODUCTS`, `CUSTOMERS`, `ORDERS`).

#### [TASK-F1-02] Inyeccion Automatica de Cabecera X-API-KEY en Cliente HTTP
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `src/api/httpClient.js`
* **Requisitos:** `REQ-SEC-001`, `REQ-SEC-005`
* **Descripcion:** Asegurar que toda peticion HTTP hacia endpoints privados del backend inyecte de manera obligatoria y transparente la cabecera `X-API-KEY`.
* **Criterios de Aceptacion:**
  * - [x] `httpClient.js` lee la API Key activa de forma prioritaria desde `sessionStorage.getItem('northwind_api_key')`.
  * - [x] Si existe API Key, inyectar el encabezado `X-API-KEY: <key>` en cada solicitud `GET`, `POST`, `PUT`, `DELETE`.
  * - [x] En llamadas a endpoints publicos (`/api/auth/login`, `/api/auth/register`), no bloquear la peticion si la API Key aun no esta establecida.

#### [TASK-F1-03] Soporte Integral de ProblemDetails (RFC 7807) y Normalizacion de Errores
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/api/httpClient.js`
* **Requisitos:** `REQ-SEC-002`, `REQ-BIZ-001`
* **Descripcion:** Procesar de forma estandarizada los errores devueltos por el backend en formato ProblemDetails (`application/problem+json`).
* **Criterios de Aceptacion:**
  * - [x] Detectar respuestas HTTP `!response.ok` e intentar parsear el cuerpo JSON de ProblemDetails.
  * - [x] Extraer de forma estructurada `status`, `title`, `detail`, e `instance`.
  * - [x] Mapear mensajes genericos amigables sin exponer stack traces ni detalles de base de datos.
  * - [x] Manejar especificamente respuestas 400 (duplicados / validacion), 401 (no autorizado), 403 (prohibido), 404 (no encontrado), 409 (conflicto de integridad) y 500 (error interno).

#### [TASK-F1-04] Interceptor de Respuestas y Deteccion de Sesion Expirada (401 / 403)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/api/httpClient.js`, `src/services/authService.js`
* **Requisitos:** `REQ-AUTH-001`, `REQ-SEC-001`
* **Descripcion:** Detectar cuando una solicitud falla por API Key expirada, revocada o invalida (401/403) para purgar la sesion local y redirigir de forma controlada.
* **Criterios de Aceptacion:**
  * - [x] Si un endpoint privado devuelve `401 Unauthorized` por llave invalida o expirada, ejecutar limpieza de `sessionStorage`.
  * - [x] Redirigir automaticamente a `login.html` acompanado de un parametro o mensaje indicando sesion expirada.
  * - [x] Evitar loops infinitos de redireccion si el error ocurre en la propia pagina de login.

---

### FASE 2: Autenticacion, Registro y Control de Roles (RBAC)

#### [TASK-F2-01] Implementacion del Servicio de Autenticacion (`authService.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `src/services/authService.js`
* **Requisitos:** `REQ-AUTH-001`, `REQ-AUTH-002`, `REQ-AUTH-003`
* **Descripcion:** Proveer los metodos centrales para iniciar sesion, registrar clientes autonomos, regenerar API Keys y gestionar el estado del usuario.
* **Criterios de Aceptacion:**
  * - [x] Implementar `login(username, password)` invocando `POST /api/auth/login`.
  * - [x] Implementar `register(username, email, password)` invocando `POST /api/auth/register`.
  * - [x] Implementar `regenerateApiKey()` invocando `POST /api/apikeys/regenerate`.
  * - [x] Implementar `logout()` que elimine credenciales de `sessionStorage` y redirija a `login.html`.
  * - [x] Implementar metodos utilitarios: `getCurrentUser()`, `getApiKey()`, `isAuthenticated()`, `getUserRole()`, `hasRole(allowedRoles)`.

#### [TASK-F2-02] Migracion a Almacenamiento Seguro de Sesion en `sessionStorage`
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `src/services/authService.js`, `src/api/httpClient.js`
* **Requisitos:** `REQ-SEC-005`, `REQ-AUTH-001`
* **Descripcion:** Trasladar el almacenamiento de API Key, token y perfil desde `localStorage` a `sessionStorage` para asegurar la expiracion automatica al cerrar la pestana del navegador.
* **Criterios de Aceptacion:**
  * - [x] Guardar sesion bajo una clave segura `auth_session` en `sessionStorage`:
    `{ userId, username, role, apiKey, expiresAt, authenticatedAt, signature }`.
  * - [x] Eliminar toda API Key residual de `localStorage` al iniciar la aplicacion.
  * - [x] Comprobar vigencia de `expiresAt` en cada invocacion de `isAuthenticated()`. Si ha expirado, forzar `logout()`.

#### [TASK-F2-03] Mapeo Determinista de Perfiles y Roles (`ADMIN`, `EMPLEADO`, `CLIENTE`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/services/authService.js`
* **Requisitos:** `REQ-AUTH-002`, `REQ-AUTH-003`
* **Descripcion:** Implementar la logica determinista de asignacion de roles en frontend de acuerdo con la matriz RBAC de la especificacion:
* **Criterios de Aceptacion:**
  * - [x] Rol `ADMIN`: Asignado cuando el nombre de usuario autenticado via `POST /api/auth/login` pertenece a la lista de administradores reconocidos (`admin`, `administrador`).
  * - [x] Rol `EMPLEADO`: Asignado cuando el nombre de usuario posee prefijo operativo (`emp_`) o pertenece a la lista blanca de empleados de operacion (`empleado`, `operador`, `ventas`).
  * - [x] Rol `CLIENTE`: Asignado estrictamente a todo usuario registrado mediante `POST /api/auth/register` y usuarios estandar.
  * - [x] Inmutabilidad en cliente: El usuario no puede modificar su rol mediante edicion simple de almacenamiento sin invalidar la sesion (firma de integridad `signature` verificada en `verifySessionIntegrity`).

#### [TASK-F2-04] Guardias de Navegacion Sincronas (`authGuard.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `src/utils/authGuard.js`, `src/controllers/productsController.js`, `src/controllers/customersController.js`, `src/controllers/ordersController.js`, `src/controllers/catalogController.js`
* **Requisitos:** `REQ-SEC-001`, `REQ-AUTH-002`
* **Descripcion:** Crear guardia de navegacion modular para proteger el acceso a las paginas HTML segun la matriz de permisos.
* **Criterios de Aceptacion:**
  * - [x] Crear funcion exportable `authGuard(allowedRoles = [])`.
  * - [x] Si el usuario no esta autenticado, redirigir de inmediato a `login.html`.
  * - [x] Si el rol del usuario no esta en `allowedRoles`, bloquear renderizado, mostrar alerta de acceso denegado (403) y redirigir a `catalogo.html`.
  * - [x] Invocar `authGuard` como primera instruccion en el script principal de cada vista protegida (`src/views/productos.html`, `src/views/clientes.html`, `src/views/pedidos.html` / `src/views/ordenes.html`, `src/views/catalogo.html`).

#### [TASK-F2-05] Interfaz y Controlador de Autenticacion y Registro (`src/views/login.html`, `src/controllers/loginController.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/views/login.html`, `src/controllers/loginController.js`
* **Requisitos:** `REQ-AUTH-001`, `REQ-BIZ-002`, `REQ-SEC-002`
* **Descripcion:** Modernizar la vista de acceso para permitir tanto el inicio de sesion con credenciales existentes como el registro autonomo de nuevos clientes.
* **Criterios de Aceptacion:**
  * - [x] Pestañas o alternancia fluida entre formulario de "Iniciar Sesion" y "Registrarse como Cliente".
  * - [x] Validacion en cliente: usuario requerido, correo con formato valido, contrasena con longitud minima de 8 caracteres.
  * - [x] Registro exitoso: crea la cuenta mediante `/api/auth/register`, asigna rol `CLIENTE`, guarda sesion en `sessionStorage` y redirige a `catalogo.html`.
  * - [x] Login exitoso: valida credenciales, asigna rol correspondiente (`ADMIN`/`EMPLEADO` redirige a `productos.html`, `CLIENTE` a `catalogo.html`).
  * - [x] Despliegue de errores amigables ante ProblemDetails (ej. "El nombre de usuario ya se encuentra registrado", "Credenciales invalidas").

#### [TASK-F2-06] Adaptacion Dinamica de la Interfaz segun el Rol Conectado
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/utils/tableHelpers.js`, `src/controllers/productsController.js`, vistas HTML en `src/views/`
* **Requisitos:** `REQ-AUTH-002`, `REQ-AUTH-003`
* **Descripcion:** Ocultar o deshabilitar elementos del menu de navegacion, botones de accion y opciones segun el rol del usuario autenticado.
* **Criterios de Aceptacion:**
  * - [x] Renderizar barra de navegacion mostrando nombre del usuario y badge del rol (`ADMIN`, `EMPLEADO`, `CLIENTE`).
  * - [x] Ocultar enlaces no autorizados (ej. enlace a `productos.html` y `clientes.html` oculto para `CLIENTE`).
  * - [x] Boton de cerrar sesion accesible en todas las vistas con confirmacion rapida.

#### [TASK-F2-07] Funcionalidad de Regeneracion de API Key
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/services/authService.js`, `src/utils/tableHelpers.js`, vistas administrativas en `src/views/`
* **Requisitos:** `REQ-AUTH-002`
* **Descripcion:** Permitir a usuarios autorizados (`ADMIN`, `EMPLEADO`) renovar su API Key mediante `POST /api/apikeys/regenerate`.
* **Criterios de Aceptacion:**
  * - [x] Modal o seccion de perfil que muestre la API Key activa truncada y su fecha de expiracion.
  * - [x] Boton "Regenerar API Key" con advertencia de invalidacion de la llave anterior.
  * - [x] Al recibir respuesta exitosa, actualizar inmediatamente `sessionStorage` con la nueva API Key sin requerir re-login.

---

### FASE 3: Gestion de Productos y Catalogo

#### [TASK-F3-01] Refactorizacion del Servicio de Productos (`productService.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/services/productService.js`
* **Requisitos:** `REQ-CORE-001`, `REQ-BIZ-001`, `REQ-SEC-003`
* **Descripcion:** Adaptar `productService.js` para consumir los endpoints reales y la estructura de datos del backend congelado.
* **Criterios de Aceptacion:**
  * - [x] `getAll()`: consume `GET /api/Products`, maneja la respuesta `ProductsSummaryDto` (`totalProducts`, `products`).
  * - [x] `getById(id)`: consume `GET /api/Products/{id}`, retorna `ProductDto`.
  * - [x] `create(data)`: envia `POST /api/Products` con `ProductUpsertDto`.
  * - [x] `update(id, data)`: envia `PUT /api/Products/{id}` con `ProductUpsertDto`.
  * - [x] `delete(id)`: envia `DELETE /api/Products/{id}`.
  * - [x] `discontinue(id, currentData)`: invoca `update(id, { ...currentData, discontinued: true })`.

#### [TASK-F3-02] Modelo de Datos y Validaciones de Entrada (`productModel.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/models/productModel.js`
* **Requisitos:** `REQ-BIZ-003`
* **Descripcion:** Asegurar que los datos enviados en operaciones de creacion y actualizacion cumplan estrictamente con las cotas del backend congelado.
* **Criterios de Aceptacion:**
  * - [x] Validar `ProductName`: requerido, longitud entre 2 y 40 caracteres.
  * - [x] Validar `UnitPrice`: requerido, valor numerico entre 0.01 y 100,000.00.
  * - [x] Validar `UnitsInStock`: requerido, entero no negativo entre 0 y 32,767.
  * - [x] Validar `Discontinued`: booleano (`true` / `false`).
  * - [x] Metodo `validateProduct(dto)` que retorne lista de errores si alguna cota es violada.

#### [TASK-F3-03] Vista de Gestion Administrativa de Productos (`productos.html`, `productsController.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/views/productos.html`, `src/controllers/productsController.js`
* **Requisitos:** `REQ-AUTH-002`, `REQ-BIZ-001`
* **Descripcion:** Vista administrativa con tabla interactiva para gestion de catalogo e inventario de productos.
* **Criterios de Aceptacion:**
  * - [x] Protegida con `authGuard(['ADMIN', 'EMPLEADO'])`. Bloqueo directo a `CLIENTE`.
  * - [x] Si el usuario es `ADMIN`: botones de creacion ("Nuevo Producto"), edicion, descontinuacion y eliminacion visibles.
  * - [x] Si el usuario es `EMPLEADO`: ocultar boton de creacion y eliminacion; permitir unicamente edicion de precio y existencias.
  * - [x] Tabla con buscador en tiempo real, paginacion y ordenamiento por columnas.

#### [TASK-F3-04] Formulario Modal de Alta y Edicion de Productos
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/views/productos.html`, `src/controllers/productsController.js`
* **Requisitos:** `REQ-BIZ-002`, `REQ-BIZ-003`, `REQ-SEC-002`
* **Descripcion:** Modal interactivo para dar de alta o modificar productos con validacion preventiva en cliente.
* **Criterios de Aceptacion:**
  * - [x] Formulario unificado para modo "Crear" y modo "Editar".
  * - [x] Atributos HTML5 (`min`, `max`, `maxlength`, `required`) reflejando los limites de `ProductUpsertDto`.
  * - [x] Limpieza automatica de validaciones al cerrar el modal.
  * - [x] Manejo de respuesta exitosa (201 Created / 204 NoContent) con notificacion Toast y recarga limpia de la tabla.

#### [TASK-F3-05] Implementacion de Politica de Descontinuacion y Manejo de Error 409 Conflict
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/controllers/productsController.js`, `src/services/productService.js`
* **Requisitos:** `REQ-BIZ-001`, `REQ-SEC-002`
* **Descripcion:** Respetar la integridad referencial priorizando la descontinuacion logica y gestionando el error 409 cuando se intenta eliminacion fisica.
* **Criterios de Aceptacion:**
  * - [x] Boton visible "Descontinuar" que ejecuta `PUT /api/Products/{id}` marcando `discontinued = true`.
  * - [x] Si un `ADMIN` pulsa "Eliminar" (`DELETE /api/Products/{id}`) y el backend devuelve `409 Conflict`, capturar el ProblemDetails y mostrar modal/alerta informativo:
    *"No se puede eliminar fisicamente el producto porque tiene ordenes historicas vinculadas. Se ha mantenido en el registro para preservar la integridad historica."*
  * - [x] Ofrecer en la misma alerta la accion rapida de descontinuarlo.

#### [TASK-F3-06] Vista de Catalogo Comercial para Autoservicio (`catalogo.html`, `catalogController.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/views/catalogo.html`, `src/controllers/catalogController.js`
* **Requisitos:** `REQ-AUTH-001`, `REQ-AUTH-002`
* **Descripcion:** Vista moderna y amigable para navegacion de productos por parte de usuarios finales (`CLIENTE`) y roles operativos.
* **Criterios de Aceptacion:**
  * - [x] Protegida con `authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE'])`.
  * - [x] Renderizado en cuadricula de tarjetas (product cards) mostrando nombre, precio formateado y disponibilidad de stock.
  * - [x] Filtros en tiempo real por texto de busqueda y rango de precio.
  * - [x] Vista estrictamente de lectura: sin botones de modificacion ni eliminacion de datos.
  * - [x] Indicador visual distintivo para productos agotados (`unitsInStock == 0`).

---

### FASE 4: Consulta de Clientes y Ordenes

#### [TASK-F4-01] Servicio de Clientes (`customerService.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/services/customerService.js`, `src/models/customerModel.js`
* **Requisitos:** `REQ-CORE-002`, `REQ-SEC-003`
* **Descripcion:** Crear servicio para consultar los endpoints de clientes (`GET /api/customers` y `GET /api/customers/{id}`).
* **Criterios de Aceptacion:**
  * - [x] Implementar `getAll()`: consume `GET /api/customers`, retornando lista de `CustomerDto` (`customerId`, `companyName`, `contactName`).
  * - [x] Implementar `getById(id)`: consume `GET /api/customers/{id}`, retornando el cliente solicitado o lanzando 404.
  * - [x] Enfoque estricto de solo lectura (sin metodos `create`, `update` ni `delete`, reflejando la realidad del backend).

#### [TASK-F4-02] Vista y Controlador de Directorio de Clientes (`clientes.html`, `customersController.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/views/clientes.html`, `src/controllers/customersController.js`
* **Requisitos:** `REQ-CORE-002`
* **Descripcion:** Interfaz para que el personal autorizado consulte el directorio comercial de clientes.
* **Criterios de Aceptacion:**
  * - [x] Protegida con `authGuard(['ADMIN', 'EMPLEADO'])`. Acceso denegado a `CLIENTE` con redireccion a `catalogo.html`.
  * - [x] Tabla interactiva con identificador de cliente (5 caracteres), nombre de empresa y nombre de contacto.
  * - [x] Buscador instantaneo y paginacion.
  * - [x] Modal de detalle para visualizar la ficha basica del cliente seleccionado.

#### [TASK-F4-03] Servicio de Ordenes (`orderService.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/services/orderService.js`, `src/models/orderModel.js`
* **Requisitos:** `REQ-CORE-001`, `REQ-SEC-003`
* **Descripcion:** Crear servicio para consultar las ordenes comerciales del backend (`GET /api/orders` y `GET /api/orders/{id}`).
* **Criterios de Aceptacion:**
  * - [x] Implementar `getAll()`: consume `GET /api/orders`, retornando coleccion de `OrderDto`.
  * - [x] Implementar `getById(id)`: consume `GET /api/orders/{id}`, retornando orden con detalle de envio.
  * - [x] Contrato de solo lectura conforme a las capacidades congeladas del backend.

#### [TASK-F4-04] Vista y Controlador de Historial de Ordenes (`ordenes.html`, `ordersController.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** `src/views/ordenes.html`, `src/views/pedidos.html`, `src/controllers/ordersController.js`
* **Requisitos:** `REQ-CORE-001`
* **Descripcion:** Vista para consulta de pedidos, estado de envio y fletes logísticos.
* **Criterios de Aceptacion:**
  * - [x] Protegida con `authGuard(['ADMIN', 'EMPLEADO', 'CLIENTE'])`.
  * - [x] Para `ADMIN` y `EMPLEADO`: visualizacion de todas las ordenes registradas en el sistema.
  * - [x] Para `CLIENTE`: filtrado o busqueda para consultar ordenes asociadas a su cuenta o por identificador de orden.
  * - [x] Despliegue de columnas: N° Orden, Fecha de Orden, Fecha de Envio, Flete, Destinatario, Ciudad y Pais.
  * - [x] Modal de detalle de envio con direccion postal y estatus logistico (Entregado / En transito / Pendiente).

---

### FASE 5: Seguridad en Cliente, Validaciones Vanilla y Buenas Practicas

#### [TASK-F5-01] Proteccion contra Fuerza Bruta en Formulario de Login (`bruteForceProtection.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/utils/bruteForceProtection.js`, `src/controllers/loginController.js`
* **Requisitos:** `REQ-SEC-006`
* **Descripcion:** Prevenir ataques automatizados de diccionario o fuerza bruta bloqueando temporalmente el formulario de acceso tras 3 intentos fallidos consecutivos.
* **Criterios de Aceptacion:**
  * - [x] Contabilizar intentos fallidos de autenticacion (errores HTTP 401 de `/api/auth/login`).
  * - [x] Al alcanzar 3 intentos fallidos consecutivos, registrar timestamp de bloqueo por 15 minutos (`Date.now() + 15 * 60 * 1000`) en almacenamiento del navegador.
  * - [x] Deshabilitar campos de texto y boton de login mientras el bloqueo este activo.
  * - [x] Renderizar cronometro con cuenta regresiva visible (minutos y segundos).
  * - [x] Persistir el estado de bloqueo ante recargas de pagina (F5).
  * - [x] Incorporar un desafio interactivo de confirmacion humana (captcha en cliente) que deba resolverse antes de poder reintentar tras cumplirse los 15 minutos.

#### [TASK-F5-02] Prevencion de Vulnerabilidades XSS y Manipulacion Segura del DOM (`securityUtils.js`)
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `src/utils/securityUtils.js`, todos los controladores y vistas
* **Requisitos:** `REQ-SEC-005`
* **Descripcion:** Erradicar cualquier uso riesgoso de `innerHTML` con datos provenientes de la API o entradas de usuario para prevenir ejecucion de script malicioso (Cross-Site Scripting).
* **Criterios de Aceptacion:**
  * - [x] Crear modulo utilitario `securityUtils.js` con funcion de escape: `escapeHtml(string)`.
  * - [x] Auditar todas las vistas y controladores para asegurar que los datos dinamicos se rendericen mediante `textContent`, `document.createElement`, o celdas escapadas.
  * - [x] En tablas dinamicas (DataTables), configurar la funcion de renderizado seguro de texto `DataTable.render.text()` en todas las columnas de texto.

#### [TASK-F5-03] Proteccion Defensiva contra Clickjacking (Frame-Busting y CSP)
* **Estado:** `[DONE]`
* **Prioridad:** Media
* **Archivos Afectados:** Todas las paginas HTML (`login.html`, `productos.html`, `catalogo.html`, `clientes.html`, `ordenes.html`)
* **Requisitos:** `REQ-SEC-004`
* **Descripcion:** Mitigar el riesgo de ataques de clickjacking impidiendo la carga de las vistas de la aplicacion dentro de marcos externos (`<iframe>`, `<frame>`, `<object>`).
* **Criterios de Aceptacion:**
  * - [x] Incorporar etiqueta meta de directiva CSP en el `<head>` de cada archivo HTML:
    `<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none';">`.
  * - [x] Incorporar script defensivo de ruptura de marcos (*frame-busting script*) en el `<head>`:
    ```javascript
    if (window.top !== window.self) {
      window.top.location = window.self.location;
    }
    ```

#### [TASK-F5-04] Higiene de Almacenamiento y Cierre de Sesion Seguro
* **Estado:** `[DONE]`
* **Prioridad:** Alta
* **Archivos Afectados:** `src/services/authService.js`, `src/api/httpClient.js`
* **Requisitos:** `REQ-SEC-005`, `REQ-AUTH-001`
* **Descripcion:** Garantizar que ninguna credencial quede expuesta mas alla del ciclo de vida intencional de la sesion del navegador.
* **Criterios de Aceptacion:**
  * - [x] Confirmar que `sessionStorage` almacena unicamente la sesion activa y se destruye al cerrar la pestana o invocar `logout()`.
  * - [x] Confirmar que `localStorage` no guarda API Keys, tokens, hashes ni datos sensibles de usuario.
  * - [x] En el evento `logout()`, limpiar de forma explicita tanto `sessionStorage` como variables en memoria antes de redirigir.

#### [TASK-F5-05] Auditoria de Integridad del Backend Congelado y Control de Calidad
* **Estado:** `[DONE]`
* **Prioridad:** Critica
* **Archivos Afectados:** `c:\Proyectos\Web II\API-KEY_AUTH`, `c:\Proyectos\Web II\Final`
* **Requisitos:** `REQ-BIZ-001`, `REQ-SEC-001`, `REQ-SEC-003`
* **Descripcion:** Verificar que todo el proyecto opere armonicamente sin haber alterado ningun byte del backend congelado.
* **Criterios de Aceptacion:**
  * - [x] Comprobar que en `c:\Proyectos\Web II\API-KEY_AUTH` no exista ningun cambio (git status limpio o fecha de modificacion inalterada).
  * - [x] Verificar ausencia de llamadas huérfanas a endpoints inexistentes (ej. `/api/categories`, `/api/suppliers`, `/api/employees`).
  * - [x] Validar que todas las vistas carguen correctamente en el navegador via ES Modules sin errores de importacion ni referencias rotas.
  * - [x] Confirmar que los criterios de aceptacion de `ReqProyectoWEB.md` se encuentren alineados con las tareas completadas.

---

## 5. Historial de Modificaciones del Plan de Tareas

| Fecha | Agente / Autor | Version | Accion Realizada |
| :--- | :--- | :---: | :--- |
| 2026-11-23 | @planificador | 1.0.0 | Creacion inicial de la estructura WBS y desglose detallado de tareas (`TASK-F1-01` a `TASK-F5-05`) distribuido en las 5 fases del proyecto, con trazabilidad bidireccional contra `ReqProyectoWEB.md` (v1.1.0) y contratos inmutables del backend congelado. |
| 2026-11-23 | @verifier | 1.2.0 | Completada y verificada al 100% la Fase 2 (`TASK-F2-01` a `TASK-F2-07`): implementacion de `authService.js` (`login`, `register`, `regenerateApiKey`, `logout`, utilidades RBAC y firma de integridad en `sessionStorage`), eliminacion de la llave maestra estatica en frontend, creacion de `authGuard.js` e integracion en controladores y vistas de `src/views/`, interfaz dual de login/registro en `src/views/login.html` y `loginController.js`, adaptacion dinamica de navbar y modal de regeneracion de API Key en `tableHelpers.js`, y suite de pruebas automatizadas (`tests/fase1.test.mjs` y `tests/fase2.test.mjs`, 15/15 tests pasando). |
| 2026-11-23 | @verifier-f3 | 1.3.0 | Completada y verificada al 100% la Fase 3 (`TASK-F3-01` a `TASK-F3-06`): refactorizacion de `productService.js` (`getAll`, `getSummary`, `getById`, `create`, `update`, `delete`, `discontinue`), validaciones y cotas exactas en `productModel.js` (`validateProduct`, `PRODUCT_CONSTRAINTS`, prevencion de duplicados), vista administrativa RBAC y modal unificado en `src/views/productos.html` y `src/controllers/productsController.js` (restriccion de edicion de precio/stock para `EMPLEADO`, politica de descontinuacion y modal 409 Conflict con accion rapida), vista de catalogo comercial de solo lectura con filtros en tiempo real e indicador de agotados en `src/views/catalogo.html` y `src/controllers/catalogController.js`, y suite de pruebas automatizadas (`tests/fase1.test.mjs`, `tests/fase2.test.mjs`, `tests/fase3.test.mjs`, 21/21 tests pasando). |
| 2026-11-24 | Antigravity | 1.4.0 | Completada y verificada al 100% la Fase 4 (`TASK-F4-01` a `TASK-F4-04`): utilidades transversales seguras en `src/utils/tableHelpers.js` (`formatDate`, `safeTextRender`, `extractProblemMessage`, `showModal`, `hideModal`, `bindModalDismiss`, `clearTbody`), modelos y servicios estrictamente de solo lectura (`Object.freeze`) con minimizacion DTO y validacion anti-traversal en `src/models/customerModel.js`, `src/services/customerService.js`, `src/models/orderModel.js` y `src/services/orderService.js`, vistas protegidas contra clickjacking (`clientes.html`, `ordenes.html`, `pedidos.html` sincronizadas), controladores RBAC anti-XSS sin `innerHTML` con datos de API (`src/controllers/customersController.js`, `src/controllers/ordersController.js`) con aislamiento y busqueda por N° de orden para `CLIENTE`, y suite `tests/fase4.test.mjs`. |
| 2026-11-24 | @verifier | 1.5.0 | Completada y verificada al 100% la Fase 5 (`TASK-F5-01` a `TASK-F5-05`, proyecto consolidado 26/26): proteccion contra fuerza bruta en `src/utils/bruteForceProtection.js` e integracion con bloqueo de 15 min, cronometro persistente ante F5 y reto CAPTCHA en `src/views/login.html` y `src/controllers/loginController.js`; utilidades anti-XSS `src/utils/securityUtils.js` (`escapeHtml`, `sanitizeText`, `setSafeText`) y erradicacion total de `innerHTML` en `src/` (0 usos); proteccion anti-clickjacking (`frame-ancestors 'none'` y `window.top !== window.self`) en todas las vistas `src/views/*.html`; higiene de `sessionStorage`/`localStorage` y `logout()` seguro en `src/api/httpClient.js` y `src/services/authService.js`; auditoria estatica (0 endpoints inexistentes, 0 rutas rotas, importacion limpia de modulos ES) y suite existente 28/28 pasando (`tests/fase1.test.mjs` a `tests/fase4.test.mjs`). |
