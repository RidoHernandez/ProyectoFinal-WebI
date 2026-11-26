import {
    httpClient,
    ApiError,
    normalizeProblemDetails,
    safeParseJson,
    throwApiError,
    CART,
    CART_ITEMS,
    CART_CHECKOUT
} from "./apiClient.js";

function normalizeCart(data) {
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const items = rawItems.map((item) => {
        const unitPrice = Number(item?.unitPrice ?? 0);
        const quantity = Number(item?.quantity ?? 0);
        const subtotal = Number.isFinite(Number(item?.subtotal))
            ? Number(item.subtotal)
            : Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100;

        return {
            productId: Number(item?.productId ?? 0),
            productName: String(item?.productName ?? `Producto #${item?.productId ?? ''}`),
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            subtotal: Number.isFinite(subtotal) ? subtotal : 0,
            discontinued: Boolean(item?.discontinued)
        };
    });

    const computedQty = items.reduce((acc, i) => acc + i.quantity, 0);
    const computedTotal = Math.round((items.reduce((acc, i) => acc + i.subtotal, 0) + Number.EPSILON) * 100) / 100;

    return {
        items,
        totalQuantity: Number.isFinite(Number(data?.totalQuantity)) ? Number(data.totalQuantity) : computedQty,
        total: Number.isFinite(Number(data?.total)) ? Number(data.total) : computedTotal
    };
}

export function validateCartQuantity(rawValue, maxStock = null) {
    const str = String(rawValue ?? '').trim();
    const qty = Number(str);
    if (!/^\d+$/.test(str) || !Number.isSafeInteger(qty) || qty < 1 || qty > 32767) {
        return { valid: false, error: 'La cantidad debe ser un entero entre 1 y 32,767.' };
    }
    if (maxStock !== null) {
        if (maxStock <= 0) {
            return { valid: false, error: 'Este producto no cuenta con stock disponible.' };
        }
        if (qty > maxStock) {
            return { valid: false, error: `Solo hay ${maxStock} unidad(es) disponibles en inventario.` };
        }
    }
    return { valid: true, value: qty };
}

export function validateCheckoutPayload({ shipName = '', shipAddress = '', shipCity = '', shipCountry = '' } = {}) {
    const values = {
        shipName: String(shipName).trim(),
        shipAddress: String(shipAddress).trim(),
        shipCity: String(shipCity).trim(),
        shipCountry: String(shipCountry).trim()
    };
    const fieldErrors = {};

    if (values.shipName.length < 2 || values.shipName.length > 80) {
        fieldErrors.shipName = 'Ingresa el nombre del destinatario (2 a 80 caracteres).';
    }
    if (values.shipAddress.length < 4 || values.shipAddress.length > 200) {
        fieldErrors.shipAddress = 'Ingresa una dirección de envío válida (4 a 200 caracteres).';
    }
    if (values.shipCity.length < 2 || values.shipCity.length > 60) {
        fieldErrors.shipCity = 'Ingresa la ciudad de entrega (2 a 60 caracteres).';
    }
    if (values.shipCountry.length < 2 || values.shipCountry.length > 60) {
        fieldErrors.shipCountry = 'Ingresa el país de entrega (2 a 60 caracteres).';
    }

    return {
        valid: Object.keys(fieldErrors).length === 0,
        fieldErrors,
        values
    };
}

export const cartModel = Object.freeze({
    async get() {
        const response = await httpClient(CART, { method: 'GET' });
        if (!response.ok) {
            throwApiError(response, response.status || 500);
        }
        return normalizeCart(await safeParseJson(response));
    },

    async addItem(productId, quantity) {
        const pid = Number(productId);
        const qtyCheck = validateCartQuantity(quantity);
        if (!Number.isSafeInteger(pid) || pid <= 0) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Producto inválido',
                detail: 'El producto seleccionado no es válido.'
            }, 400));
        }
        if (!qtyCheck.valid) {
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Cantidad inválida',
                detail: qtyCheck.error
            }, 400));
        }

        const response = await httpClient(CART_ITEMS, {
            method: 'POST',
            body: JSON.stringify({ productId: pid, quantity: qtyCheck.value })
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }
        return normalizeCart(await safeParseJson(response));
    },

    async checkout(shippingDto) {
        const validation = validateCheckoutPayload(shippingDto);
        if (!validation.valid) {
            const firstError = Object.values(validation.fieldErrors)[0] || 'Verifica los datos de envío.';
            throw new ApiError(normalizeProblemDetails({
                status: 400,
                title: 'Datos de envío inválidos',
                detail: firstError
            }, 400));
        }

        const response = await httpClient(CART_CHECKOUT, {
            method: 'POST',
            body: JSON.stringify(validation.values)
        });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }
        return await safeParseJson(response);
    },

    async cancel() {
        const response = await httpClient(CART, { method: 'DELETE' });
        if (!response.ok) {
            throwApiError(response, response.status || 400);
        }
        return normalizeCart(await safeParseJson(response));
    }
});
