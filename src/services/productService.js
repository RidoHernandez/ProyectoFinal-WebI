import { httpClient, ajaxRequest, promiseRequest, callbackRequest } from "../api/httpClient.js";

export const productService = {
    getProducts: async () => {
        try {
            const response = await httpClient('/api/Products', { method: 'GET' });
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: No se pudieron cargar los productos`);
            }
            const data = await response.json();
            if (data && Array.isArray(data.products)) {
                return data.products;
            } else if (Array.isArray(data)) {
                return data;
            }
            return [];
        } catch (error) {
            console.error("[productService.getProducts] Error mediante Fetch:", error);
            throw error;
        }
    },

    updateProduct: (id, productPayload) => {
        return new Promise((resolve, reject) => {
            console.log(`[productService.updateProduct] Ejecutando actualización con Promesa para ID ${id}`);

            promiseRequest(`/api/Products/${id}`, {
                method: 'PUT',
                body: JSON.stringify(productPayload)
            })
            .then(data => {
                resolve({ ok: true, status: 204, data });
            })
            .catch(error => {
                console.error("[productService.updateProduct] Error en Promesa:", error);
                reject(error);
            });
        });
    },

    deleteProduct: (id) => {
        console.log(`[productService.deleteProduct] Ejecutando eliminación con AJAX (XMLHttpRequest) para ID ${id}`);
        return ajaxRequest(`/api/Products/${id}`, {
            method: 'DELETE'
        });
    },

    createProductWithCallback: (productPayload, callback) => {
        console.log("[productService.createProductWithCallback] Ejecutando creación mediante Callback tradicional");
        callbackRequest('/api/Products', {
            method: 'POST',
            body: productPayload
        }, callback);
    },

    createProduct: async (productPayload, optionalCallback = null) => {
        if (typeof optionalCallback === 'function') {
            return productService.createProductWithCallback(productPayload, optionalCallback);
        }

        return new Promise((resolve, reject) => {
            productService.createProductWithCallback(productPayload, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        ok: true,
                        status: 201,
                        json: async () => result,
                        text: async () => JSON.stringify(result)
                    });
                }
            });
        });
    },

    getPagedProducts: async ({ page = 1, pageSize = 12, filter = '' } = {}) => {
        const cleanFilter = (filter || '').trim();
        const queryParams = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            filter: cleanFilter
        });

        try {
            const response = await httpClient(`/api/Products/paged?${queryParams.toString()}`, { method: 'GET' });

            if (response.ok) {
                const result = await response.json();
                return {
                    page: result.page || page,
                    pageSize: result.pageSize || pageSize,
                    totalRecords: result.totalRecords ?? (result.products ? result.products.length : 0),
                    totalPages: result.totalPages ?? 1,
                    hasNextPage: result.hasNextPage ?? false,
                    products: result.products || []
                };
            }

            
            if (response.status === 404) {
                console.info("[productService.getPagedProducts] Endpoint /api/Products/paged no detectado en backend. Aplicando paginación client-side de respaldo.");
                return await productService._getPagedProductsFallback(page, pageSize, cleanFilter);
            }

            throw new Error(`Error HTTP ${response.status} al consultar productos paginados`);
        } catch (error) {
            console.warn("[productService.getPagedProducts] Fallo en petición directa, intentando respaldo:", error.message);
            return await productService._getPagedProductsFallback(page, pageSize, cleanFilter);
        }
    },

    _getPagedProductsFallback: async (page, pageSize, filter) => {
        const allProducts = await productService.getProducts();
        
        let filtered = allProducts;
        if (filter) {
            const f = filter.toLowerCase();
            filtered = allProducts.filter(p => 
                (p.productName && p.productName.toLowerCase().includes(f)) ||
                (p.productId && String(p.productId) === f)
            );
        }

        const totalRecords = filtered.length;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        const offset = (page - 1) * pageSize;
        const pageItems = filtered.slice(offset, offset + pageSize);

        return {
            page: page,
            pageSize: pageSize,
            totalRecords: totalRecords,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            products: pageItems
        };
    }
};
