import {
  CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION,
  CLIENT_SAFE_FILE_REFERENCE_LABEL,
  CLIENT_SAFE_FILE_REFERENCE_SOURCE,
  createClientSafeFileReferenceFromCaseFileNumber,
} from '../client-safe-file-reference.contract';

describe('CLIENT-ACCOUNTING-DELIVERY R01 / X2-B03 — client-safe file reference', () => {
  it('yalnız owner-ratified Case.fileNumber kaynağını frozen shared primitive’e dönüştürür', () => {
    const reference = createClientSafeFileReferenceFromCaseFileNumber('2026/42');

    expect(reference).toEqual({
      contractVersion: CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION,
      source: CLIENT_SAFE_FILE_REFERENCE_SOURCE,
      label: CLIENT_SAFE_FILE_REFERENCE_LABEL,
      value: '2026/42',
    });
    expect(reference.source).toBe('Case.fileNumber');
    expect(reference.label).toBe('Büro dosya no');
    expect(Object.isFrozen(reference)).toBe(true);
  });

  it.each(['', ' 2026/42', '2026/42 ', '2026/42\ncaseId:internal', '2026/42\u0000'])(
    'unsafe fileNumber %p için fail-closed kalır',
    (fileNumber) => {
      expect(() => createClientSafeFileReferenceFromCaseFileNumber(fileNumber)).toThrow(TypeError);
    },
  );

  it('executionFileNumber veya internal ID için alternatif source/fallback sözleşmesi üretmez', () => {
    expect(CLIENT_SAFE_FILE_REFERENCE_SOURCE).toBe('Case.fileNumber');
    const serialized = JSON.stringify(createClientSafeFileReferenceFromCaseFileNumber('OFFICE-42'));
    expect(serialized).not.toContain('executionFileNumber');
    expect(serialized).not.toContain('caseId');
    expect(serialized).not.toContain('caseClientId');
  });
});
