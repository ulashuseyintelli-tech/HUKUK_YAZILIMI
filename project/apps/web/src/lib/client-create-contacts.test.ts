import { describe, expect, it } from 'vitest';
import { withClientCreateContacts } from './client-create-contacts';

describe('KI-148 canonical contact creation payload', () => {
  it('adds only absent canonical arrays and preserves original flat validation inputs', () => {
    const payload = { phone: ' 0312 000 00 00 ', email: 'Client@example.test', firstName: 'Synthetic' };
    expect(withClientCreateContacts(payload)).toEqual({ ...payload,
      phones: [{ value: payload.phone, isPrimary: true }], emails: [{ value: payload.email, isPrimary: true }],
    });
    expect(payload).not.toHaveProperty('phones');
  });
  it.each([[], [{ value: 'canonical', isPrimary: false }], null, 'invalid', { value: 'invalid' }, [{}]].map(canonical => ({ canonical })))(
    'preserves an explicitly supplied canonical value without concealing DTO errors: %j', ({ canonical }) => {
      const out = withClientCreateContacts({ phone: 'flat phone', email: 'flat@example.test', phones: canonical, emails: canonical });
      expect(out.phones).toBe(canonical); expect(out.emails).toBe(canonical);
    },
  );
  it.each([undefined, null, '', '   ', 123])('does not synthesize contacts from empty or non-string input: %j', value => {
    const out = withClientCreateContacts({ phone: value, email: value });
    expect(out).toEqual({ phone: value, email: value });
    expect(out).not.toHaveProperty('phones'); expect(out).not.toHaveProperty('emails');
  });
});
