/**
 * CLIENT-ACCOUNTING-DELIVERY R01 / X2-B03 — shared client-safe file reference primitive.
 *
 * X2 is the sole writer. C3 and other authorised consumers import this contract read-only;
 * they must not define a parallel source, fallback or label policy.
 */
export const CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION = 'ClientSafeFileReferenceV1' as const;
export const CLIENT_SAFE_FILE_REFERENCE_SOURCE = 'Case.fileNumber' as const;
export const CLIENT_SAFE_FILE_REFERENCE_LABEL = 'Büro dosya no' as const;

export interface ClientSafeFileReferenceV1 {
  readonly contractVersion: typeof CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION;
  readonly source: typeof CLIENT_SAFE_FILE_REFERENCE_SOURCE;
  readonly label: typeof CLIENT_SAFE_FILE_REFERENCE_LABEL;
  readonly value: string;
}

/**
 * The deliberately source-specific factory prevents a generic "any identifier" helper from
 * becoming a backdoor for executionFileNumber, caseId or another technical reference.
 */
export function createClientSafeFileReferenceFromCaseFileNumber(
  fileNumber: string,
): ClientSafeFileReferenceV1 {
  if (
    fileNumber.length === 0 ||
    fileNumber.trim() !== fileNumber ||
    /[\u0000-\u001f\u007f]/.test(fileNumber)
  ) {
    throw new TypeError('Case.fileNumber must be non-empty and free of control characters');
  }

  return Object.freeze({
    contractVersion: CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION,
    source: CLIENT_SAFE_FILE_REFERENCE_SOURCE,
    label: CLIENT_SAFE_FILE_REFERENCE_LABEL,
    value: fileNumber,
  });
}
