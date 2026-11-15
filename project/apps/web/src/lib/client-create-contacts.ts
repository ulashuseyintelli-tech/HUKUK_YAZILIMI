/** Used by the three case-wizard Client create callbacks; does not rewrite existing contacts. */
export function withClientCreateContacts<T extends { phone?: unknown; email?: unknown; phones?: unknown; emails?: unknown }>(payload: T) {
  return {
    ...payload,
    ...(payload.phones === undefined && typeof payload.phone === 'string' && payload.phone.trim()
      ? { phones: [{ value: payload.phone, isPrimary: true }] } : {}),
    ...(payload.emails === undefined && typeof payload.email === 'string' && payload.email.trim()
      ? { emails: [{ value: payload.email, isPrimary: true }] } : {}),
  };
}
