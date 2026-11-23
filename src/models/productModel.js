export class ProductModel {
    static createPayload({
        productId = null,
        productName = '',
        unitPrice = null,
        unitsInStock = null,
        discontinued = false
    }) {
        const payload = {
            productName: productName ? productName.trim() : '',
            unitPrice: unitPrice !== null && unitPrice !== '' ? parseFloat(unitPrice) : null,
            unitsInStock: unitsInStock !== null && unitsInStock !== '' ? parseInt(unitsInStock, 10) : null,
            discontinued: Boolean(discontinued)
        };

        if (productId) {
            payload.productId = parseInt(productId, 10);
        }

        return payload;
    }
}
