import { describe, expect, it } from 'vitest';
import { isUnchangedClientIdentityMask, preserveMaskedClientFields } from './client-masked-edit';
import { buildCreateClientPayload, buildEditClientPayload, clientFormValuesFromClient, validateClientForm } from './client-write';

describe('K16 masked client edit roundtrip', () => {
  const client = { id: 'client', type: 'PERSON', firstName: 'Synthetic', lastName: 'Client', tckn: '100****46',
    phone: '+905551112233', email: 'synthetic@example.test', canCollect: false } as any;
  it('native edit accepts untouched displayed mask but never includes it in PUT', () => {
    const initial = clientFormValuesFromClient(client);
    expect(validateClientForm(initial, initial)).toEqual({});
    const payload = buildEditClientPayload({ ...initial, firstName: 'Changed' }, { readBaseline: client });
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('tckn');
    expect(payload).not.toHaveProperty('notes'); expect(payload.firstName).toBe('Changed');
    expect(JSON.stringify(payload)).not.toContain('100****46'); expect(payload).not.toHaveProperty('phones');
  });
  it('modal full-form payload omits unchanged identity masks and untouched hidden notes', () => {
    const payload = preserveMaskedClientFields({ tckn: '100****46', vkn: '123****90', notes: '', phones: [{ value: client.phone }], emails: [{ value: client.email }] }, { ...client, vkn: '123****90' });
    expect(payload).not.toHaveProperty('tckn'); expect(payload).not.toHaveProperty('vkn'); expect(payload).not.toHaveProperty('notes');
    expect(payload.phones).toEqual([{ value: client.phone }]); expect(payload.emails).toEqual([{ value: client.email }]);
  });
  it('allows an explicit valid replacement while rejecting a modified/malformed mask', () => {
    const initial = clientFormValuesFromClient(client);
    const changed = { ...initial, tckn: '10000000146' };
    expect(validateClientForm(changed, initial)).toEqual({});
    expect(buildEditClientPayload(changed, { readBaseline: client }).tckn).toBe('10000000146');
    expect(validateClientForm({ ...initial, tckn: '101****46' }, initial)).toHaveProperty('tckn');
  });
  it('create validation never treats a mask as a valid identity', () => {
    const values = clientFormValuesFromClient(client); expect(validateClientForm(values)).toHaveProperty('tckn');
    expect(buildCreateClientPayload({ ...values, tckn: '10000000146' }).tckn).toBe('10000000146');
  });
  it.each(['COMPANY', 'PUBLIC'] as const)('%s edit keeps masked VKN out of writes', type => {
    const original = { ...client, type, companyName: 'Synthetic Company', vkn: '123****90' };
    const values = clientFormValuesFromClient(original);
    expect(validateClientForm(values, values)).toEqual({});
    expect(buildEditClientPayload(values, { readBaseline: original })).not.toHaveProperty('vkn');
  });
  it('does not mutate the input or discard explicitly entered notes/new identities', () => {
    const payload = { tckn: '10000000146', notes: 'Explicit new text' }; const snapshot = { ...payload };
    expect(preserveMaskedClientFields(payload, client)).toEqual(snapshot); expect(payload).toEqual(snapshot);
  });
  it('recognizes only exact untouched masks, including short legacy identity masks', () => {
    expect(isUnchangedClientIdentityMask('****', '****')).toBe(true);
    expect(isUnchangedClientIdentityMask('AB1****89', 'AB1****89')).toBe(true);
    expect(preserveMaskedClientFields({ identityNo: 'AB1****89' }, { identityNo: 'AB1****89' })).not.toHaveProperty('identityNo');
    expect(isUnchangedClientIdentityMask('100****46', '101****46')).toBe(false);
    expect(isUnchangedClientIdentityMask('10000000146', '10000000146')).toBe(false);
  });
});
