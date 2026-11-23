export class OrderModel {
    constructor({
        orderId = null,
        orderDate = null,
        requiredDate = null,
        shippedDate = null,
        freight = null,
        shipName = '',
        shipAddress = '',
        shipCity = '',
        shipRegion = '',
        shipPostalCode = '',
        shipCountry = ''
    } = {}) {
        this.orderId = orderId;
        this.orderDate = orderDate;
        this.requiredDate = requiredDate;
        this.shippedDate = shippedDate;
        this.freight = freight;
        this.shipName = shipName;
        this.shipAddress = shipAddress;
        this.shipCity = shipCity;
        this.shipRegion = shipRegion;
        this.shipPostalCode = shipPostalCode;
        this.shipCountry = shipCountry;
    }
}
