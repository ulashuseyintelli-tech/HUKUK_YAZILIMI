import { BadRequestException, ConflictException } from "@nestjs/common";

export const COLLECTION_REQUIRES_REVERSAL = "COLLECTION_REQUIRES_REVERSAL";
export const COLLECTION_DELETE_DISABLED = "COLLECTION_DELETE_DISABLED";
export const COLLECTION_REQUIRES_REVERSAL_DELETE_MESSAGE =
  "Posted/confirmed collection cannot be deleted. Use cancel/reversal flow.";
export const COLLECTION_REQUIRES_REVERSAL_UPDATE_MESSAGE =
  "Posted/confirmed collection cannot be updated in ledger-impacting fields. Use cancel/reversal flow.";
export const COLLECTION_DELETE_DISABLED_MESSAGE =
  "Collection hard delete is disabled. Use explicit void/discard flow.";
export const COLLECTION_STATUS_PENDING = "PENDING";
export const COLLECTION_STATUS_CANCELLED = "CANCELLED";
export const COLLECTION_METADATA_UPDATE_FIELDS = ["description", "receiptNo", "notes"] as const;

const COLLECTION_METADATA_UPDATE_ALLOWLIST = new Set<string>(COLLECTION_METADATA_UPDATE_FIELDS);

export function providedCollectionUpdateFields(data: Record<string, unknown>) {
  return Object.keys(data).filter((field) => data[field] !== undefined);
}

export function disallowedPostedCollectionUpdateFields(data: Record<string, unknown>) {
  return providedCollectionUpdateFields(data).filter((field) => !COLLECTION_METADATA_UPDATE_ALLOWLIST.has(field));
}

export function collectionRequiresReversal(message: string, fields?: string[]) {
  return new ConflictException({
    errorCode: COLLECTION_REQUIRES_REVERSAL,
    message,
    ...(fields?.length ? { fields } : {}),
  });
}

export function collectionDeleteDisabled(fields?: string[]) {
  return new ConflictException({
    errorCode: COLLECTION_DELETE_DISABLED,
    message: COLLECTION_DELETE_DISABLED_MESSAGE,
    ...(fields?.length ? { fields } : {}),
  });
}

export function assertCollectionPublicUpdateAllowed(status: string, data: Record<string, unknown>) {
  if (status === COLLECTION_STATUS_CANCELLED) {
    throw new BadRequestException("İptal edilmiş tahsilat güncellenemez");
  }

  const disallowedFields = disallowedPostedCollectionUpdateFields(data);
  if (data.status !== undefined || (status !== COLLECTION_STATUS_PENDING && disallowedFields.length > 0)) {
    throw collectionRequiresReversal(COLLECTION_REQUIRES_REVERSAL_UPDATE_MESSAGE, disallowedFields);
  }
}

export function pickDefinedCollectionUpdateData(
  data: Record<string, unknown>,
  allowedFields: readonly string[],
  dateFields: readonly string[] = [],
) {
  const dateFieldSet = new Set(dateFields);
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    const value = data[field];
    if (value === undefined) continue;
    updateData[field] = dateFieldSet.has(field) ? new Date(String(value)) : value;
  }

  return updateData;
}
