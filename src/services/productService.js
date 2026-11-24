import {
    httpClient,
    ApiError,
    normalizeProblemDetails,
    PRODUCTS,
    callbackRequest
} from "../api/httpClient.js";
import { ProductModel } from "../models/productModel.js";

export const DISCONTINUED_STORAGE_KEY = 'northwind_discontinued_products';

const discontinuedMemorySet = new Set();

function getDiscontinuedSet() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            const raw = sessionStorage.getItem(DISCONTINUED_STORAGE_KEY);
            if (!raw) {
                discontinuedMemorySet.clear();
                return new Set();
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const ids = parsed
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n) && n > 0);
                discontinuedMemorySet.clear();
                ids.forEach((n) => discontinuedMemorySet.add(n));
                return new Set(ids);
            }
        }
    } catch {
        // Ignore storage read errors and fallback to memory set
    }
    return new Set(discontinuedMemorySet);
}

function saveDiscontinuedSet(set) {
    discontinuedMemorySet.clear();
    for (const id of set) {
        const num = Number(id);
        if (Number.isFinite(num) && num > 0) {
            discontinuedMemorySet.add(num);
        }
    }
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(
                DISCONTINUED_STORAGE_KEY,
                JSON.stringify(Array.from(discontinuedMemorySet))
            );
        }
    } catch {
        // Ignore storage write errors
    }
}

export function markProductDiscontinued(id, isDiscontinued = true) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) return;
    const set = getDiscontinuedSet();
    if (isDiscontinued) {
        set.add(numId);
    } else {
        set.delete(numId);
    }
    saveDiscontinuedSet(set);
}

export function isProductDiscontinued(id) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) return false;
    return getDiscontinuedSet().has(numId);
}

export function clearDiscontinuedProductsCache() {
    discontinuedMemorySet.clear();
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(DISCONTINUED_STORAGE_KEY);
        }
    } catch {
        // Ignore storage errors
    }
}

async function safeParseJson(response) {
    if (!response || response.status === 204) return null;
    try {
        if (typeof response.json === 'function') {
            return await response.json();
        }
        if (typeof response.text === 'function') {
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        }
    } catch {
        return null;
    }
    return null;
}

function buildApiError(response, fallbackStatus = 500) {
    const pd = response?.problemDetails || normalizeProblemDetails(null, response?.status || fallbackStatus);
    return new ApiError(pd);
}

function attachResponseMetadata(dto, status = 200) {
    if (!dto || typeof dto !== 'object') return dto;
    Object.defineProperties(dto, {
        ok: {
            value: true,
            enumerable: false,
            configurable: true,
            writable: true
        },
        status: {
            value: status,
            enumerable: false,
            configurable: true,
            writable: true
        },
        data: {
            value: dto,
            enumerable: false,
            configurable: true,
            writable: true
        },
        json: {
            value: async () => dto,
            enumerable: false,
            configurable: true,
            writable: true
        },
        text: {
            value: async () => JSON.stringify(dto),
            enumerable: false,
            configurable: true,
            writable: true
        }
    });
    return dto;
}

export const productService = {
    lastTotalProducts: 0,

    // [TASK-F3-01] getAll(): consume GET /api/Products, maneja ProductsSummaryDto ({ totalProducts, products })
    getAll: async () => {
        const response = await httpClient(PRODUCTS, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        const rawList = Array.isArray(data?.products)
            ? data.products
            : (Array.isArray(data?.Products)
                ? data.Products
                : (Array.isArray(data) ? data : []));

        const discontinuedSet = getDiscontinuedSet();
        const products = rawList.map((item) => ProductModel.fromApiDto(item, discontinuedSet));

        const rawTotal = data?.totalProducts ?? data?.TotalProducts;
        const totalProducts = rawTotal !== undefined && rawTotal !== null && Number.isFinite(Number(rawTotal))
            ? Number(rawTotal)
            : products.length;

        productService.lastTotalProducts = totalProducts;

        Object.defineProperty(products, 'totalProducts', {
            value: totalProducts,
            enumerable: false,
            configurable: true,
            writable: true
        });

        return products;
    },

    // Retorna el objeto ProductsSummaryDto normalizado ({ totalProducts, products })
    getSummary: async () => {
        const products = await productService.getAll();
        return {
            totalProducts: products.totalProducts ?? products.length,
            products
        };
    },

    // [TASK-F3-01] getById(id): consume GET /api/Products/{id}, retorna ProductDto
    getById: async (id) => {
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, { method: 'GET' });
        if (!response.ok) {
            throw buildApiError(response, response.status || 404);
        }

        const data = await safeParseJson(response);
        return ProductModel.fromApiDto(
            data && typeof data === 'object' ? data : { productId: Number(id) },
            getDiscontinuedSet()
        );
    },

    // [TASK-F3-01] create(data): envia POST /api/Products con ProductUpsertDto
    create: async (data) => {
        const payload = ProductModel.createPayload(data);
        const response = await httpClient(PRODUCTS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw buildApiError(response, response.status || 400);
        }

        const createdRaw = await safeParseJson(response);
        const merged = {
            ...payload,
            ...(createdRaw && typeof createdRaw === 'object' ? createdRaw : {})
        };

        if (payload.discontinued && merged.productId) {
            markProductDiscontinued(merged.productId, true);
        } else if (payload.discontinued && merged.ProductId) {
            markProductDiscontinued(merged.ProductId, true);
        }

        const dto = ProductModel.fromApiDto(merged, getDiscontinuedSet());
        if (payload.discontinued) {
            dto.discontinued = true;
        }

        return attachResponseMetadata(dto, response.status || 201);
    },

    // [TASK-F3-01] update(id, data): envia PUT /api/Products/{id} con ProductUpsertDto
    update: async (id, data = {}) => {
        const payload = ProductModel.createPayload({ ...data, productId: id });
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw buildApiError(response, response.status || 400);
        }

        markProductDiscontinued(id, Boolean(payload.discontinued));

        const updatedRaw = await safeParseJson(response);
        const normalizedData = ProductModel.fromApiDto(
            {
                ...payload,
                productId: Number(id),
                ...(updatedRaw && typeof updatedRaw === 'object' ? updatedRaw : {})
            },
            getDiscontinuedSet()
        );
        normalizedData.discontinued = Boolean(payload.discontinued);

        return {
            ok: true,
            status: response.status || 204,
            data: normalizedData,
            productId: normalizedData.productId,
            productName: normalizedData.productName,
            unitPrice: normalizedData.unitPrice,
            unitsInStock: normalizedData.unitsInStock,
            discontinued: normalizedData.discontinued
        };
    },

    // [TASK-F3-01 & TASK-F3-05] delete(id): envia DELETE /api/Products/{id}, lanza ApiError (ej. 409 Conflict) si falla
    delete: async (id) => {
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw buildApiError(response, response.status || 409);
        }

        markProductDiscontinued(id, false);

        return {
            ok: true,
            status: response.status || 204
        };
    },

    // [TASK-F3-01 & TASK-F3-05] discontinue(id, currentData): invoca update(id, { ...currentData, discontinued: true })
    discontinue: async (id, currentData = null) => {
        let baseData = currentData && typeof currentData === 'object' ? currentData : null;
        const hasName = Boolean(baseData && (baseData.productName || baseData.ProductName));
        const hasPrice = Boolean(
            baseData &&
            (baseData.unitPrice !== undefined || baseData.UnitPrice !== undefined)
        );

        if (!hasName || !hasPrice) {
            try {
                const fetched = await productService.getById(id);
                baseData = {
                    ...fetched,
                    ...(baseData || {})
                };
            } catch (err) {
                if (!baseData) {
                    throw err;
                }
            }
        }

        const updatePayload = {
            productId: Number(id),
            productName: baseData?.productName ?? baseData?.ProductName ?? `Producto #${id}`,
            unitPrice: baseData?.unitPrice ?? baseData?.UnitPrice ?? 0.01,
            unitsInStock: baseData?.unitsInStock ?? baseData?.UnitsInStock ?? 0,
            discontinued: true
        };

        return await productService.update(id, updatePayload);
    },

    // Helpers de estado de descontinuación
    markDiscontinued: markProductDiscontinued,
    isDiscontinued: isProductDiscontinued,
    clearDiscontinuedCache: clearDiscontinuedProductsCache,

    // Alias retrocompatibles con controladores existentes
    getProducts: async () => productService.getAll(),

    createProduct: async (productPayload, optionalCallback = null) => {
        if (typeof optionalCallback === 'function') {
            return productService.createProductWithCallback(productPayload, optionalCallback);
        }
        return await productService.create(productPayload);
    },

    createProductWithCallback: (productPayload, callback) => {
        const payload = ProductModel.createPayload(productPayload);
        if (typeof XMLHttpRequest !== 'undefined') {
            callbackRequest(PRODUCTS, {
                method: 'POST',
                body: payload
            }, callback);
            return;
        }
        productService.create(payload)
            .then((result) => callback(null, result))
            .catch((err) => callback(err, null));
    },

    updateProduct: async (id, productPayload) => productService.update(id, productPayload),

    deleteProduct: async (id) => productService.delete(id),

    getPagedProducts: async ({ page = 1, pageSize = 12, filter = '' } = {}) => {
        const cleanFilter = (filter || '').trim();
        const queryParams = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            filter: cleanFilter
        });

        try {
            const response = await httpClient(`${PRODUCTS}/paged?${queryParams.toString()}`, { method: 'GET' });

            if (response.ok) {
                const result = await safeParseJson(response);
                const discontinuedSet = getDiscontinuedSet();
                const items = Array.isArray(result?.products)
                    ? result.products.map((p) => ProductModel.fromApiDto(p, discontinuedSet))
                    : [];
                return {
                    page: result?.page || page,
                    pageSize: result?.pageSize || pageSize,
                    totalRecords: result?.totalRecords ?? items.length,
                    totalPages: result?.totalPages ?? 1,
                    hasNextPage: result?.hasNextPage ?? false,
                    products: items
                };
            }

            if (response.status === 404) {
                return await productService._getPagedProductsFallback(page, pageSize, cleanFilter);
            }

            throw buildApiError(response, response.status || 500);
        } catch {
            return await productService._getPagedProductsFallback(page, pageSize, cleanFilter);
        }
    },

    _getPagedProductsFallback: async (page, pageSize, filter) => {
        const allProducts = await productService.getAll();

        let filtered = allProducts;
        if (filter) {
            const f = filter.toLowerCase();
            filtered = allProducts.filter((p) =>
                (p.productName && p.productName.toLowerCase().includes(f)) ||
                (p.productId && String(p.productId) === f)
            );
        }

        const totalRecords = filtered.length;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        const offset = (page - 1) * pageSize;
        const pageItems = filtered.slice(offset, offset + pageSize);

        return {
            page,
            pageSize,
            totalRecords,
            totalPages,
            hasNextPage: page < totalPages,
            products: pageItems
        };
    }
};
