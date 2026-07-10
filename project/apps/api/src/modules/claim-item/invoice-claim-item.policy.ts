import { BadRequestException } from '@nestjs/common';

const FATURA_SOURCE_DOCUMENT_TYPE = 'FATURA';
const TAX_KDV_ITEM_TYPE = 'TAX_KDV';

const INVOICE_TAX_KDV_FORBIDDEN_MESSAGE =
  'Fatura KDV dahil brut tutarla tek PRINCIPAL ClaimItem olarak kaydedilmelidir; ayri TAX_KDV kalemi olusturulamaz.';

export function assertInvoiceClaimItemCreateAllowed(input: {
  itemType?: unknown;
  sourceDocumentType?: unknown;
}): void {
  if (
    input.sourceDocumentType === FATURA_SOURCE_DOCUMENT_TYPE &&
    input.itemType === TAX_KDV_ITEM_TYPE
  ) {
    throw new BadRequestException(INVOICE_TAX_KDV_FORBIDDEN_MESSAGE);
  }
}

export function assertInvoiceClaimItemTypeTransitionAllowed(
  current: { itemType?: unknown; sourceDocumentType?: unknown },
  requestedItemType: unknown,
): void {
  if (
    current.sourceDocumentType === FATURA_SOURCE_DOCUMENT_TYPE &&
    current.itemType !== TAX_KDV_ITEM_TYPE &&
    requestedItemType === TAX_KDV_ITEM_TYPE
  ) {
    throw new BadRequestException(INVOICE_TAX_KDV_FORBIDDEN_MESSAGE);
  }
}
