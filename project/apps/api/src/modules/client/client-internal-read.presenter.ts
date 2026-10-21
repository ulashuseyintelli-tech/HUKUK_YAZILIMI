import { maskEmail, maskIban, maskIdentity, maskPhone } from '../../common/pii-mask.util';

/** Only internal HTTP read projections; never use for persistence or document generation. */
export function presentInternalClient<T extends Record<string, any>>(client: T, purpose: 'LIST' | 'CONTACT_DETAIL'): T {
  const result: Record<string, any> = { ...client };
  const mask = (value: unknown, fn: (value: string) => string) =>
    typeof value === 'string' && value.length > 0 ? fn(value) : value;
  for (const key of ['tckn', 'vkn', 'identityNo']) {
    if (key in result) result[key] = mask(result[key], maskIdentity);
  }
  delete result.notes;
  if (Array.isArray(client.bankAccounts)) {
    result.bankAccounts = client.bankAccounts.map((account: Record<string, any>) => ({
      ...account, iban: mask(account.iban, maskIban),
    }));
  }
  if (Array.isArray(client.powerOfAttorneys)) {
    result.powerOfAttorneys = client.powerOfAttorneys.map(({ notes: _notes, ...poa }: Record<string, any>) => poa);
  }
  if (purpose === 'LIST') {
    delete result.address;
    delete result.postalCode;
    if ('phone' in result) result.phone = mask(result.phone, maskPhone);
    if ('email' in result) result.email = mask(result.email, maskEmail);
    if (Array.isArray(client.contacts)) {
      result.contacts = client.contacts.map((contact: Record<string, any>) => ({
        ...contact,
        value: mask(contact.value, contact.type === 'EMAIL' ? maskEmail : maskPhone),
      }));
    }
    if (Array.isArray(client.addresses)) {
      result.addresses = client.addresses.map(({ street: _street, postalCode: _postalCode, ...address }: Record<string, any>) => address);
    }
    if (client.portalUser) {
      result.portalUser = { ...client.portalUser, email: mask(client.portalUser.email, maskEmail) };
    }
  }
  return result as T;
}
