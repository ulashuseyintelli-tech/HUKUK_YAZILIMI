/** Existing canonical EMAIL precedence; shared by approval binding and transport. */
export function clientEmailRecipient(client: {
  email?: string | null;
  contacts?: ReadonlyArray<{ type: string; isPrimary: boolean; value: string }>;
}): string | null {
  const contact = client.contacts?.find(c => c.type === 'EMAIL' && c.isPrimary)
    || client.contacts?.find(c => c.type === 'EMAIL');
  return contact?.value || client.email || null;
}
