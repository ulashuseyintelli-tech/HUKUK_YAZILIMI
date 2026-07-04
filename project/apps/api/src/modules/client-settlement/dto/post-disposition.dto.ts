import { CollectionDispositionLineType } from '@prisma/client';

/** TM3 M2 — disposition posting satırı (kullanıcı dağıtım kararı). */
export interface PostDispositionLineInput {
  type: CollectionDispositionLineType;
  amount: string | number; // pozitif; Decimal(15,2)
  caseClientId?: string; // CLUSTER + client-attributed satırda zorunlu
  note?: string;
  expenseRequestId?: string; // FAZ-1b: REIMBURSEMENT tiplerinde ZORUNLU (kapatılan ExpenseRequest; 1:1 binding)
}

export interface PostDispositionDto {
  lines: PostDispositionLineInput[];
}
