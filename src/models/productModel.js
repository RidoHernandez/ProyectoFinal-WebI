import { httpClient, safeParseJson, throwApiError, PRODUCTS } from "./apiClient.js";

const PRODUCT_CONSTRAINTS = Object.freeze({
    NAME_MIN: 2,
    NAME_MAX: 40,
    PRICE_MIN: 0.01,
    PRICE_MAX: 100000.00,
    STOCK_MIN: 0,
    STOCK_MAX: 32767
});

export function validateProduct(dto = {}, { existingProducts = [], excludeProductId = null } = {}) {
    const errors = [];
    const fieldErrors = {};

    const name = typeof dto.productName === 'string' ? dto.productName.trim() : '';
    if (name.length < PRODUCT_CONSTRAINTS.NAME_MIN || name.length > PRODUCT_CONSTRAINTS.NAME_MAX) {
        const msg = `El nombre del producto es obligatorio (${PRODUCT_CONSTRAINTS.NAME_MIN} a ${PRODUCT_CONSTRAINTS.NAME_MAX} caracteres).`;
        errors.push(msg);
        fieldErrors.productName = msg;
    } else if (existingProducts.length > 0) {
        const target = name.toLowerCase();
        const excludedId = excludeProductId !== null && excludeProductId !== '' ? Number(excludeProductId) : null;
        const isDuplicate = existingProducts.some((item) => {
            if (excludedId !== null && Number(item.productId) === excludedId) return false;
            return String(item.productName ?? '').trim().toLowerCase() === target;
        });
        if (isDuplicate) {
            const msg = 'Ya existe un producto registrado con este nombre.';
            errors.push(msg);
            fieldErrors.productName = msg;
        }
    }

    const price = dto.unitPrice === '' || dto.unitPrice === null || dto.unitPrice === undefined ? NaN : Number(dto.unitPrice);
    if (!Number.isFinite(price) || price < PRODUCT_CONSTRAINTS.PRICE_MIN || price > PRODUCT_CONSTRAINTS.PRICE_MAX) {
        const msg = 'El precio unitario debe estar entre 0.01 y 100,000.00.';
        errors.push(msg);
        fieldErrors.unitPrice = msg;
    }

    const stock = dto.unitsInStock === '' || dto.unitsInStock === null || dto.unitsInStock === undefined ? NaN : Number(dto.unitsInStock);
    if (!Number.isInteger(stock) || stock < PRODUCT_CONSTRAINTS.STOCK_MIN || stock > PRODUCT_CONSTRAINTS.STOCK_MAX) {
        const msg = 'Las unidades en stock deben ser un entero entre 0 y 32,767.';
        errors.push(msg);
        fieldErrors.unitsInStock = msg;
    }

    return { valid: errors.length === 0, errors, fieldErrors };
}

function createProductPayload(data = {}) {
    const payload = {
        productName: String(data.productName ?? '').trim(),
        unitPrice: data.unitPrice !== '' && data.unitPrice != null ? Number(data.unitPrice) : null,
        unitsInStock: data.unitsInStock !== '' && data.unitsInStock != null ? Number(data.unitsInStock) : null,
        discontinued: Boolean(data.discontinued)
    };

    const id = parseInt(data.productId, 10);
    if (Number.isInteger(id) && id > 0) {
        payload.productId = id;
    }
    return payload;
}

export const productModel = {
    async getAll() {
        const response = await httpClient(PRODUCTS, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }

        const data = await safeParseJson(response);
        const list = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);
        return list.map((item) => ({
            productId: Number(item.productId ?? 0),
            productName: String(item.productName ?? '').trim(),
            unitPrice: Number(item.unitPrice ?? 0),
            unitsInStock: Math.trunc(Number(item.unitsInStock ?? 0)),
            discontinued: Boolean(item.discontinued)
        }));
    },

    async getById(id) {
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 404);
        }

        const item = await safeParseJson(response);
        return {
            productId: Number(item?.productId ?? id),
            productName: String(item?.productName ?? '').trim(),
            unitPrice: Number(item?.unitPrice ?? 0),
            unitsInStock: Math.trunc(Number(item?.unitsInStock ?? 0)),
            discontinued: Boolean(item?.discontinued)
        };
    },

    async create(data) {
        const payload = createProductPayload(data);
        const response = await httpClient(PRODUCTS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }
        return await safeParseJson(response);
    },

    async update(id, data = {}) {
        const payload = createProductPayload({ ...data, productId: id });
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }
        return { ok: true, status: response.status || 204 };
    },

    async delete(id) {
        const response = await httpClient(`${PRODUCTS}/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throwApiError(response, response.status || 409);
        }
        return { ok: true, status: response.status || 204 };
    },

    async discontinue(id, currentData = null) {
        const base = (currentData?.productName && currentData?.unitPrice !== undefined)
            ? currentData
            : await productModel.getById(id);

        return await productModel.update(id, {
            productId: Number(id),
            productName: base.productName,
            unitPrice: base.unitPrice,
            unitsInStock: base.unitsInStock ?? 0,
            discontinued: true
        });
    }
};
