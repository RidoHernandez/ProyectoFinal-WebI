export class CustomerModel {
    constructor({
        customerId = '',
        companyName = '',
        contactName = ''
    } = {}) {
        this.customerId = customerId;
        this.companyName = companyName;
        this.contactName = contactName;
    }
}
