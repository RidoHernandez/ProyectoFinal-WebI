# Arquitectura Frontend Vanilla JS — MVC (Portal Comercial Northwind)

Arquitectura MVC pura en 3 carpetas basada en Vanilla JS (ES Modules nativos, HTML5, Bootstrap 5, jQuery y DataTables).

## Estructura del Proyecto

```
├── SPECS/                            # Especificaciones funcionales y requisitos
└── src/
    ├── models/                       # Capa de datos, transporte HTTP, validaciones y sesión JWT
    │   ├── apiClient.js              # URL fija del servidor, endpoints, transporte HTTP JWT Bearer y ProblemDetails
    │   ├── authModel.js              # Autenticación JWT, sesión en sessionStorage, guardia de navegación y protección anti-fuerza bruta
    │   ├── productModel.js           # Validación y CRUD/descontinuación de productos
    │   ├── cartModel.js              # Validación y API del carrito persistente (agregar, comprar y cancelación completa)
    │   ├── orderModel.js             # Estados, transiciones, validación y API de órdenes
    │   └── customerModel.js          # Validación de ID y consulta de clientes
    ├── views/                        # Vistas HTML5 con escudo anti-clickjacking
    │   ├── index.html
    │   ├── login.html
    │   ├── catalogo.html
    │   ├── carrito.html
    │   ├── productos.html
    │   ├── clientes.html
    │   └── pedidos.html
    └── controllers/                  # Controladores de interfaz y helpers de UI/DOM
        ├── uiHelpers.js              # Helpers de DataTables, sanitización XSS, modales, navbar y arranque autenticado
        ├── loginController.js        # Controlador de Login y Registro
        ├── catalogController.js      # Controlador de Catálogo comercial y agregado al carrito
        ├── cartController.js         # Controlador de Carrito de compras (compra y cancelación completa)
        ├── productsController.js     # Controlador de gestión de Productos
        ├── customersController.js    # Controlador de consulta de Clientes
        └── ordersController.js       # Controlador de gestión y seguimiento de Pedidos
```

## Reglas de Arquitectura
1. **ES Modules nativos:** Todos los scripts se importan usando `<script type="module">` y rutas relativas con extensión `.js`.
2. **Dependencias unidireccionales:**
   `models/apiClient.js` -> `models/*Model.js` -> `controllers/uiHelpers.js` -> `controllers/*Controller.js` -> `views/*.html`
   - `models/` nunca importa desde `controllers/`.
   - Los 5 controladores de página no exportan símbolos; se auto-inicializan al cargar la vista correspondiente.
3. **Separación de responsabilidades:**
   - `models`: Encapsula el cliente HTTP (`apiClient.js`), los modelos de dominio, validaciones de carga útil, sesión JWT y guardia de acceso.
   - `views`: Estructura HTML semántica sin lógica de negocio, sin exposición de rutas de backend ni nombres de roles, y con protección anti-clickjacking contra embebido en `<iframe>`.
   - `controllers`: Captura eventos DOM, sanitiza renderizado contra XSS (`escapeHtml`, `safeTextRender`) y coordina las vistas con los modelos.
4. **Seguridad y Mínima Exposición (JWT Bearer):** La autenticación opera exclusivamente mediante tokens JWT (`Authorization: Bearer <token>`) almacenados únicamente en `sessionStorage`. La autorización de roles reside exclusivamente en el backend; el frontend adapta la UI según las capacidades (`permissions`) devueltas por el servidor.
