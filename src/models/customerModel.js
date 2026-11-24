export const CUSTOMER_CONSTRAINTS = Object.freeze({
    ID_LENGTH: 5
});

export class CustomerModel {
    static CONSTRAINTS = CUSTOMER_CONSTRAINTS;

    constructor(raw = {}) {
        const dto = CustomerModel.fromApiDto(raw);
        this.customerId = dto.customerId;
        this.companyName = dto.companyName;
        this.contactName = dto.contactName;
    }

    /**
     * Normaliza un registro de cliente proveniente de la API (camelCase o PascalCase)
     * proyectando estrictamente { customerId, companyName, contactName } (REQ-CORE-002 / REQ-SEC-003).
     * Excluye cualquier campo adicional, binario o innecesario para prevenir over-fetching.
     */
    static fromApiDto(raw = {}) {
        const input = raw && typeof raw === 'object' ? raw : {};

        const rawId = input.customerId ?? input.CustomerId ?? '';
        const rawCompany = input.companyName ?? input.CompanyName ?? '';
        const rawContact = input.contactName ?? input.ContactName ?? '';

        const customerId = String(rawId ?? '').trim();
        const companyName = String(rawCompany ?? '').trim();
        const contactName = String(rawContact ?? '').trim();

        return {
            customerId,
            companyName,
            contactName
        };
    }
}
