# Arquitectura Frontend Vanilla JS (Northwind API)

Arquitectura limpia modular basada en Vanilla JS (ES Modules, HTML5, Bootstrap 5).

## Estructura del Proyecto

```
c:\Proyectos\Web II\Final\
├── index.html                   # Redirección inicial a login
├── login.html                   # Vista de autenticación (Login / Register)
├── productos.html               # Vista CRUD de Productos (/api/Products)
├── clientes.html                # Vista de Clientes (/api/Customers)
├── pedidos.html                 # Vista de Pedidos (/api/Orders)
├── SPECS/                       # Especificaciones funcionales y requisitos
└── src/
    ├── api/                     # Clientes HTTP, configuración y transporte de datos
    │   └── httpClient.js        # Cliente HTTP centralizado (fetch, promise, ajax, callbacks)
    ├── controllers/             # Controladores de interfaz y orquestación de eventos
    │   ├── loginController.js   # Manejador de la vista de Login
    │   ├── productsController.js# Manejador de la vista de Productos
    │   ├── customersController.js# Manejador de la vista de Clientes
    │   └── ordersController.js  # Manejador de la vista de Pedidos
    ├── services/                # Capa de servicios para comunicación con backend
    │   ├── authService.js       # Servicio de autenticación y gestión de sesión
    │   ├── productService.js    # Servicio de productos
    │   ├── customerService.js   # Servicio de clientes
    │   └── orderService.js      # Servicio de pedidos
    ├── models/                  # Clases y modelos de transferencia de datos (DTOs)
    │   ├── productModel.js      # Modelo de Producto
    │   ├── customerModel.js     # Modelo de Cliente
    │   └── orderModel.js        # Modelo de Pedido
    ├── utils/                   # Utilidades y funciones transversales
    │   └── tableHelpers.js      # Helpers para DataTables, sanitización XSS y navbar
    └── views/                   # Componentes y plantillas reutilizables
        └── README.md
```

## Reglas de Arquitectura
1. **ES Modules nativos:** Todos los scripts se importan usando `<script type="module">` y rutas relativas con extensión `.js`.
2. **Separación de responsabilidades:**
   - `views / html`: Estructura semántica sin lógica incrustada.
   - `controllers`: Captura eventos DOM, valida entradas de UI y orquesta llamadas a servicios.
   - `services`: Encapsula llamadas a endpoints HTTP y maneja errores de red.
   - `models`: Estandariza estructuras de datos y validaciones de carga útil (payloads).
   - `api`: Abstracción única de transporte (`httpClient.js`).
   - `utils`: Helpers compartidos, sanitización contra XSS (`escapeHtml`).
3. **Consistencia con Backend:** Todos los modelos y servicios reflejan exclusivamente los endpoints existentes en la API (`/api/Auth`, `/api/ApiKeys`, `/api/Products`, `/api/Customers`, `/api/Orders`).
