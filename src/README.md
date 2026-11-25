# Arquitectura Frontend Vanilla JS (Portal Comercial Northwind)

Arquitectura limpia modular basada en Vanilla JS (ES Modules, HTML5, Bootstrap 5, jQuery y DataTables).

## Estructura del Proyecto

```
├── SPECS/                       # Especificaciones funcionales y requisitos
└── src/
    ├── api/                     # Clientes HTTP, configuración fija y transporte de datos
    │   ├── config.js            # URL fija del servidor y endpoints centralizados
    │   └── httpClient.js        # Cliente HTTP centralizado (fetch, promise, ajax, callbacks)
    ├── controllers/             # Controladores de interfaz y orquestación de eventos
    │   ├── loginController.js   # Manejador de la vista de Login y Registro
    │   ├── productsController.js# Manejador de la vista de Productos
    │   ├── catalogController.js # Manejador de la vista de Catálogo comercial
    │   ├── customersController.js# Manejador de la vista de Clientes
    │   └── ordersController.js  # Manejador de la vista de Pedidos y Órdenes
    ├── services/                # Capa de servicios para comunicación con backend
    │   ├── authService.js       # Servicio de autenticación, sesión firmada y capacidades de UI
    │   ├── productService.js    # Servicio de productos
    │   ├── customerService.js   # Servicio de clientes
    │   └── orderService.js      # Servicio de pedidos
    ├── models/                  # Clases y modelos de transferencia de datos (DTOs)
    │   ├── productModel.js      # Modelo de Producto
    │   ├── customerModel.js     # Modelo de Cliente
    │   └── orderModel.js        # Modelo de Pedido
    ├── utils/                   # Utilidades y funciones transversales
    │   ├── authGuard.js         # Guardia de navegación por capacidades de UI
    │   └── tableHelpers.js      # Helpers para DataTables, sanitización XSS y navbar
    └── views/                   # Vistas HTML de la aplicación
        ├── index.html
        ├── login.html
        ├── productos.html
        ├── catalogo.html
        ├── clientes.html
        ├── pedidos.html
        └── ordenes.html
```

## Reglas de Arquitectura
1. **ES Modules nativos:** Todos los scripts se importan usando `<script type="module">` y rutas relativas con extensión `.js`.
2. **Separación de responsabilidades:**
   - `views / html`: Estructura semántica sin lógica incrustada ni exposición de rutas de backend o roles.
   - `controllers`: Captura eventos DOM, valida entradas de UI y orquesta llamadas a servicios.
   - `services`: Encapsula llamadas al backend y maneja errores de red de forma sanitizada.
   - `models`: Estandariza estructuras de datos y validaciones de carga útil (payloads).
   - `api`: Abstracción única de transporte (`httpClient.js`) con URL fija.
   - `utils`: Helpers compartidos, guardias por capacidades y sanitización contra XSS (`escapeHtml`).
3. **Seguridad y Mínima Exposición:** La validación de roles reside exclusivamente en el backend (base de datos); el frontend no expone nombres de roles, no permite editar la URL del backend ni regenerar API Keys.
