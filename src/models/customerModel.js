const CUSTOMER_ID_PATTERN = /^[A-Za-z0-9]{1,5}$/;

export function validateCustomerId(id) {
    const clean = String(id ?? '').trim();
    if (!CUSTOMER_ID_PATTERN.test(clean)) {
        return {
            valid: false,
            error: 'El código de cliente debe ser alfanumérico (1 a 5 caracteres).'
        };
    }
    return { valid: true, value: clean };
}

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

    static fromApiDto(raw = {}) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return new CustomerModel();
        }

        const customerId = String(raw.customerId ?? raw.CustomerId ?? '').trim();
        const companyName = String(raw.companyName ?? raw.CompanyName ?? '').trim();
        const contactName = String(raw.contactName ?? raw.ContactName ?? '').trim();

        return new CustomerModel({
            customerId,
            companyName,
            contactName
        });
    }
}
