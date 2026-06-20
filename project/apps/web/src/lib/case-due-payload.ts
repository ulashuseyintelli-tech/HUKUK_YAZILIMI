export interface CreateCaseDueInput {
  type: string;
  description?: string;
  amount?: string | number;
  dueDate: string;
  interestType?: string;
  interestRate?: number;
  interestAmount?: number;
  interestStartDate?: string;
  interestEndDate?: string;
}

export interface CreateCaseDuePayload {
  type: string;
  description?: string;
  amount: number;
  dueDate: string;
  interestType?: string;
  interestRate?: number;
  interestAmount?: number;
  interestStartDate?: string;
  interestEndDate?: string;
}

export function buildCreateCaseDuesPayload(dues: CreateCaseDueInput[]): CreateCaseDuePayload[] {
  return dues
    .filter((due) => due.amount && Number.parseFloat(String(due.amount)) > 0)
    .map((due) => ({
      type: due.type,
      description: due.description || undefined,
      amount: Number.parseFloat(String(due.amount)),
      dueDate: due.dueDate,
      interestType: due.interestType,
      interestRate: due.interestRate,
      interestAmount: due.interestAmount,
      interestStartDate: due.interestStartDate,
      interestEndDate: due.interestEndDate,
    }));
}
