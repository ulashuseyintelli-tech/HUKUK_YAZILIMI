import type { ApprovalSummaryProjector } from './types';
import { isRecord, isNonEmptyString } from './guards';

export const projectExpenseSend: ApprovalSummaryProjector = intent => {
  if (!isRecord(intent) || intent.version !== 'EXPENSE_SEND_V1'
    || !isNonEmptyString(intent.expenseRequestId) || !isNonEmptyString(intent.totalAmount)
    || !isNonEmptyString(intent.currency) || !isNonEmptyString(intent.recipientLabel)
    || typeof intent.itemCount !== 'number') return { kind: 'unsafe', fields: [] };
  return { kind: 'summary', fields: [
    { label: 'İşlem', value: 'Masrafın müvekkile gönderilmesi' },
    { label: 'Tutar', value: `${intent.totalAmount} ${intent.currency}` },
    { label: 'Kalem sayısı', value: String(intent.itemCount) },
    { label: 'Alıcı', value: intent.recipientLabel },
    { label: 'Vade', value: typeof intent.dueDate === 'string' ? intent.dueDate : 'Belirtilmedi' },
    ...(typeof intent.preview === 'string' ? [{ label: 'Gönderilecek İçerik (hassas alanlar maskeli)', value: intent.preview }] : []),
  ] };
};
