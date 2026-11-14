import { describe, expect, it } from 'vitest';
import { CLIENT_CREATE_RESULT_INVALID_MESSAGE, readClientCreateResult } from './client-create-result';

const client = { id: 'client-r17', displayName: 'Sentetik Müvekkil', tckn: '*******0214', _existingReturned: true, _reactivated: false };

describe('CL-R17 — bounded Client create result', () => {
  it.each([client, { data: client }, { data: { data: client } }])('reads the existing envelope without copying or rewriting the scoped card', (response) => {
    expect(readClientCreateResult(response)).toBe(client);
    expect(client).toEqual({ id: 'client-r17', displayName: 'Sentetik Müvekkil', tckn: '*******0214', _existingReturned: true, _reactivated: false });
  });

  it.each([null, undefined, [], { data: [] }, {}, { id: '' }, { id: '   ' }, { id: 12 }, { data: { data: { name: 'No id' } } }, { data: { data: { data: client } } }])('rejects an unconfirmed result: %j', (response) => {
    expect(() => readClientCreateResult(response)).toThrow(CLIENT_CREATE_RESULT_INVALID_MESSAGE);
  });

  it('does not manufacture existing/reactivation flags for a new card', () => {
    expect(readClientCreateResult({ data: { id: 'new-client' } })).toEqual({ id: 'new-client' });
  });
});
