const PRODUCT_CONSTRAINTS = Object.freeze({
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 40,
    PRICE_MIN: 0.01,
    PRICE_MAX: 100000.00,
    STOCK_MIN: 0,
    STOCK_MAX: 32767
});

export function validateProduct(dto, { existingProducts = [], excludeProductId = null } = {}) {
    const input = dto && typeof dto === 'object' ? dto : {};
    const errors = [];
    const fieldErrors = {};

    // 1. Validar ProductName: requerido, longitud entre 2 y 40 caracteres, y prevención de duplicados (REQ-BIZ-002 / REQ-BIZ-003)
    const rawName = input.productName !== undefined ? input.productName : input.ProductName;
    const trimmedName = typeof rawName === 'string' ? rawName.trim() : '';

    if (typeof rawName !== 'string' || trimmedName.length === 0) {
        const msg = 'El nombre del producto es obligatorio (entre 2 y 40 caracteres).';
        errors.push(msg);
        fieldErrors.productName = msg;
    } else if (
        trimmedName.length < PRODUCT_CONSTRAINTS.NAME_MIN_LENGTH ||
        trimmedName.length > PRODUCT_CONSTRAINTS.NAME_MAX_LENGTH
    ) {
        const msg = `El nombre del producto debe tener entre ${PRODUCT_CONSTRAINTS.NAME_MIN_LENGTH} y ${PRODUCT_CONSTRAINTS.NAME_MAX_LENGTH} caracteres.`;
        errors.push(msg);
        fieldErrors.productName = msg;
    } else if (Array.isArray(existingProducts) && existingProducts.length > 0) {
        const normalizedTarget = trimmedName.toLowerCase();
        const rawExclude = excludeProductId !== null && excludeProductId !== undefined && excludeProductId !== ''
            ? excludeProductId
            : (input.productId !== null && input.productId !== undefined && input.productId !== ''
                ? input.productId
                : input.ProductId);
        const hasExcludeId = rawExclude !== null && rawExclude !== undefined && rawExclude !== '' && !Number.isNaN(Number(rawExclude));
        const excludeIdNum = hasExcludeId ? Number(rawExclude) : null;

        const isDuplicate = existingProducts.some((item) => {
            if (!item || typeof item !== 'object') return false;
            const itemIdRaw = item.productId !== undefined ? item.productId : item.ProductId;
            const itemIdNum = itemIdRaw !== null && itemIdRaw !== undefined && itemIdRaw !== '' ? Number(itemIdRaw) : null;
            if (excludeIdNum !== null && itemIdNum !== null && itemIdNum === excludeIdNum) {
                return false;
            }
            const itemName = String(item.productName ?? item.ProductName ?? '').trim().toLowerCase();
            return itemName.length > 0 && itemName === normalizedTarget;
        });

        if (isDuplicate) {
            const msg = 'Ya existe un producto registrado con este nombre.';
            errors.push(msg);
            fieldErrors.productName = msg;
        }
    }

    // 2. Validar UnitPrice: requerido, numérico finito entre 0.01 y 100,000.00 (REQ-BIZ-003)
    const rawPrice = input.unitPrice !== undefined ? input.unitPrice : input.UnitPrice;
    const isEmptyPrice = rawPrice === undefined ||
        rawPrice === null ||
        (typeof rawPrice === 'string' && rawPrice.trim() === '') ||
        typeof rawPrice === 'boolean';
    const parsedPrice = isEmptyPrice ? NaN : Number(rawPrice);

    if (isEmptyPrice || !Number.isFinite(parsedPrice)) {
        const msg = 'El precio unitario es obligatorio y debe ser un valor numérico válido.';
        errors.push(msg);
        fieldErrors.unitPrice = msg;
    } else if (
        parsedPrice < PRODUCT_CONSTRAINTS.PRICE_MIN ||
        parsedPrice > PRODUCT_CONSTRAINTS.PRICE_MAX
    ) {
        const msg = 'El precio unitario debe estar entre 0.01 y 100,000.00.';
        errors.push(msg);
        fieldErrors.unitPrice = msg;
    }

    // 3. Validar UnitsInStock: requerido, entero entre 0 y 32,767 (REQ-BIZ-003)
    const rawStock = input.unitsInStock !== undefined ? input.unitsInStock : input.UnitsInStock;
    const isEmptyStock = rawStock === undefined ||
        rawStock === null ||
        (typeof rawStock === 'string' && rawStock.trim() === '') ||
        typeof rawStock === 'boolean';
    const parsedStock = isEmptyStock ? NaN : Number(rawStock);

    if (isEmptyStock || !Number.isFinite(parsedStock) || !Number.isInteger(parsedStock)) {
        const msg = 'Las unidades en stock son obligatorias y deben ser un número entero.';
        errors.push(msg);
        fieldErrors.unitsInStock = msg;
    } else if (
        parsedStock < PRODUCT_CONSTRAINTS.STOCK_MIN ||
        parsedStock > PRODUCT_CONSTRAINTS.STOCK_MAX
    ) {
        const msg = 'Las unidades en stock deben ser un entero entre 0 y 32,767.';
        errors.push(msg);
        fieldErrors.unitsInStock = msg;
    }

    // 4. Validar Discontinued: booleano (true / false)
    const hasDiscontinued = Object.prototype.hasOwnProperty.call(input, 'discontinued') ||
        Object.prototype.hasOwnProperty.call(input, 'Discontinued');
    const rawDiscontinued = input.discontinued !== undefined ? input.discontinued : input.Discontinued;

    if (hasDiscontinued && rawDiscontinued !== undefined && typeof rawDiscontinued !== 'boolean') {
        const msg = 'El estado descontinuado debe ser un valor booleano (true o false).';
        errors.push(msg);
        fieldErrors.discontinued = msg;
    }

    Object.defineProperties(errors, {
        valid: {
            value: errors.length === 0,
            enumerable: false,
            configurable: true,
            writable: true
        },
        fieldErrors: {
            value: fieldErrors,
            enumerable: false,
            configurable: true,
            writable: true
        },
        errors: {
            value: errors,
            enumerable: false,
            configurable: true,
            writable: true
        }
    });

    return errors;
}

export class ProductModel {
    static CONSTRAINTS = PRODUCT_CONSTRAINTS;

    static validateProduct(dto, options = {}) {
        return validateProduct(dto, options);
    }

    static createPayload(data = {}) {
        const input = data && typeof data === 'object' ? data : {};
        const rawId = input.productId !== undefined && input.productId !== null && input.productId !== ''
            ? input.productId
            : (input.ProductId !== undefined && input.ProductId !== null && input.ProductId !== '' ? input.ProductId : null);
        const rawName = input.productName !== undefined ? input.productName : (input.ProductName ?? '');
        const rawPrice = input.unitPrice !== undefined ? input.unitPrice : (input.UnitPrice ?? null);
        const rawStock = input.unitsInStock !== undefined ? input.unitsInStock : (input.UnitsInStock ?? null);
        const rawDiscontinued = input.discontinued !== undefined ? input.discontinued : input.Discontinued;

        const parsedPrice = rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== ''
            ? Number(rawPrice)
            : null;
        const parsedStock = rawStock !== null && rawStock !== undefined && String(rawStock).trim() !== ''
            ? Number(rawStock)
            : null;

        const payload = {
            productName: typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim(),
            unitPrice: Number.isFinite(parsedPrice) ? parsedPrice : null,
            unitsInStock: Number.isFinite(parsedStock) ? parsedStock : null,
            discontinued: rawDiscontinued === undefined || rawDiscontinued === null ? false : Boolean(rawDiscontinued)
        };

        if (rawId !== null) {
            const parsedId = parseInt(rawId, 10);
            if (!Number.isNaN(parsedId) && parsedId > 0) {
                payload.productId = parsedId;
            }
        }

        return payload;
    }

    static fromApiDto(raw = {}, discontinuedSet = null) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const rawId = input.productId ?? input.ProductId ?? 0;
        const productId = Number.isFinite(Number(rawId)) ? Number(rawId) : 0;
        const productName = String(input.productName ?? input.ProductName ?? '').trim();

        const rawPrice = input.unitPrice ?? input.UnitPrice ?? 0;
        const unitPrice = Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : 0;

        const rawStock = input.unitsInStock ?? input.UnitsInStock ?? 0;
        const unitsInStock = Number.isFinite(Number(rawStock)) ? Math.trunc(Number(rawStock)) : 0;

        const trackedDiscontinued = Boolean(
            discontinuedSet &&
            typeof discontinuedSet.has === 'function' &&
            (discontinuedSet.has(productId) || discontinuedSet.has(String(productId)))
        );

        const explicitDiscontinued = input.discontinued !== undefined
            ? Boolean(input.discontinued)
            : (input.Discontinued !== undefined ? Boolean(input.Discontinued) : false);

        return {
            productId,
            productName,
            unitPrice,
            unitsInStock,
            discontinued: trackedDiscontinued ? true : explicitDiscontinued
        };
    }
}
