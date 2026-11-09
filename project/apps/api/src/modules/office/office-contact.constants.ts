export const OFFICE_CONTACT_KEYS = ['office.contact.manage', 'staff.contact.manage'] as const;
export type OfficeContactKey = (typeof OFFICE_CONTACT_KEYS)[number];
export const OFFICE_CONTACT_FIELDS = ['address', 'city', 'district', 'postalCode', 'phone', 'fax', 'email', 'website'] as const;
export const STAFF_CONTACT_FIELDS = ['email', 'phone', 'mobilePhone', 'whatsappPhone'] as const;
export const OFFICE_CONTACT_SELECT = { address: true, city: true, district: true, postalCode: true, phone: true, fax: true, email: true, website: true } as const;
export const STAFF_CONTACT_SELECT = { email: true, phone: true, mobilePhone: true, whatsappPhone: true } as const;
