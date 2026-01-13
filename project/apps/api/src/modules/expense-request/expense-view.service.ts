import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

// ==================== VIEW INTERFACES ====================

export interface ExpenseTaskView {
  id: string;
  title: string;
  description: string;
  status: 'BEKLIYOR' | 'YAPILDI' | 'IPTAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  category: string;
  taskType: 'EXPENSE_REQUEST';
  metadata: {
    expenseRequestId: string;
    stageCode?: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    gateType: string;
  };
}

export interface ExpenseFinanceView {
  id: string;
  type: 'MASRAF_TALEP';
  date: string;
  description: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  items: Array<{ code: string; label: string; suggestedAmount: number; finalAmount: number; wasOverridden: boolean }>;
  payments: Array<{ id: string; amount: number; date: string; method: string; reference?: string }>;
}

export interface ExpenseClientRequestView {
  id: string;
  type: 'MASRAF_TALEBI';
  title: string;
  content: string;
  amount: number;
  status: 'BEKLIYOR' | 'KISMI' | 'TAMAMLANDI' | 'IPTAL';
  createdAt: string;
  dueDate?: string;
  completedAt?: string;
  items: Array<{ label: string; amount: number }>;
  paymentInfo: { iban?: string; description: string };
}

export interface ExpenseThreeViewData {
  task: ExpenseTaskView;
  finance: ExpenseFinanceView;
  clientRequest: ExpenseClientRequestView;
}

// ==================== SERVICE ====================

@Injectable()
export class ExpenseViewService {
  constructor(private prisma: PrismaService) {}

  private formatTL(amount: number): string {
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL';
  }

  expenseToTask(expense: any): ExpenseTaskView {
    const totalAmount = Number(expense.totalAmount);
    const paidAmount = Number(expense.paidTotal || 0);
    const remainingAmount = totalAmount - paidAmount;

    let status: ExpenseTaskView['status'] = 'BEKLIYOR';
    if (expense.status === 'PAID') status = 'YAPILDI';
    else if (expense.status === 'CANCELLED') status = 'IPTAL';

    let priority: ExpenseTaskView['priority'] = 'MEDIUM';
    if (expense.gateType === 'BLOCKING' && status === 'BEKLIYOR') priority = 'HIGH';
    if (expense.status === 'OVERDUE') priority = 'URGENT';

    const stageLabels: Record<string, string> = {
      OPENING: 'Takip açılış masrafları',
      RE_NOTIFICATION: 'Yeniden tebligat masrafları',
      SEIZURE: 'Haciz masrafları',
      SALE: 'Satış masrafları',
    };
    const stageLabel = expense.stageCode ? stageLabels[expense.stageCode] || expense.stageCode : 'Masraf talebi';

    return {
      id: expense.id,
      title: `Müvekkilden ${stageLabel} talep edildi`,
      description: `Toplam: ${this.formatTL(totalAmount)} - Kalan: ${this.formatTL(remainingAmount)}`,
      status,
      priority,
      dueDate: expense.dueDate?.toISOString?.() || expense.dueDate,
      category: 'MASRAF',
      taskType: 'EXPENSE_REQUEST',
      metadata: {
        expenseRequestId: expense.id,
        stageCode: expense.stageCode || undefined,
        totalAmount,
        paidAmount,
        remainingAmount,
        status: expense.status,
        gateType: expense.gateType || 'BLOCKING',
      },
    };
  }

  expenseToFinanceItem(expense: any): ExpenseFinanceView {
    const totalAmount = Number(expense.totalAmount);
    const paidAmount = Number(expense.paidTotal || 0);
    const stageLabels: Record<string, string> = {
      OPENING: 'Takip Açılış Masrafları',
      RE_NOTIFICATION: 'Yeniden Tebligat Masrafları',
      SEIZURE: 'Haciz Masrafları',
      SALE: 'Satış Masrafları',
    };

    return {
      id: expense.id,
      type: 'MASRAF_TALEP',
      date: expense.createdAt?.toISOString?.() || expense.createdAt,
      description: expense.stageCode ? stageLabels[expense.stageCode] || expense.stageCode : 'Manuel Masraf Talebi',
      status: expense.status,
      totalAmount,
      paidAmount,
      remainingAmount: totalAmount - paidAmount,
      items: (expense.requestItems || []).map((item: any) => ({
        code: item.itemCode,
        label: item.label,
        suggestedAmount: Number(item.suggestedAmount),
        finalAmount: Number(item.finalAmount),
        wasOverridden: item.wasOverridden || false,
      })),
      payments: (expense.payments || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.paymentDate?.toISOString?.() || p.paymentDate,
        method: p.method,
        reference: p.reference || undefined,
      })),
    };
  }

  expenseToClientRequest(expense: any, officeIban?: string): ExpenseClientRequestView {
    const totalAmount = Number(expense.totalAmount);
    const paidAmount = Number(expense.paidTotal || 0);

    let status: ExpenseClientRequestView['status'] = 'BEKLIYOR';
    if (expense.status === 'PAID') status = 'TAMAMLANDI';
    else if (expense.status === 'PARTIAL') status = 'KISMI';
    else if (expense.status === 'CANCELLED') status = 'IPTAL';

    const stageLabels: Record<string, string> = {
      OPENING: 'Takip Açılış Masrafları',
      RE_NOTIFICATION: 'Yeniden Tebligat Masrafları',
      SEIZURE: 'Haciz Masrafları',
      SALE: 'Satış Masrafları',
    };
    const title = expense.stageCode ? stageLabels[expense.stageCode] || expense.stageCode : 'Masraf Talebi';
    let content = `${title} - ${this.formatTL(totalAmount)}`;
    if (paidAmount > 0 && paidAmount < totalAmount) content += ` (Kalan: ${this.formatTL(totalAmount - paidAmount)})`;

    return {
      id: expense.id,
      type: 'MASRAF_TALEBI',
      title,
      content,
      amount: totalAmount,
      status,
      createdAt: expense.createdAt?.toISOString?.() || expense.createdAt,
      dueDate: expense.dueDate?.toISOString?.() || expense.dueDate,
      completedAt: expense.paidAt?.toISOString?.() || expense.paidAt,
      items: (expense.requestItems || []).map((item: any) => ({ label: item.label, amount: Number(item.finalAmount) })),
      paymentInfo: { iban: officeIban, description: `${expense.case?.fileNumber || 'N/A'} - Masraf` },
    };
  }

  async getThreeViewData(tenantId: string, requestId: string): Promise<ExpenseThreeViewData> {
    const expense = await this.prisma.expenseRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        case: { select: { fileNumber: true, executionFileNumber: true } },
        client: { select: { displayName: true, name: true } },
      },
    });
    if (!expense) throw new Error('Masraf talebi bulunamadı');

    const payments = await (this.prisma as any).expensePayment.findMany({
      where: { expenseRequestId: requestId },
      orderBy: { paymentDate: 'desc' },
    });

    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { bankAccounts: { where: { isDefault: true }, take: 1, select: { iban: true } } },
    });
    const officeIban = office?.bankAccounts?.[0]?.iban;
    const expenseData = { ...expense, payments };

    return {
      task: this.expenseToTask(expenseData),
      finance: this.expenseToFinanceItem(expenseData),
      clientRequest: this.expenseToClientRequest(expenseData, officeIban),
    };
  }

  async getThreeViewDataForCase(tenantId: string, caseId: string): Promise<ExpenseThreeViewData[]> {
    const expenses = await this.prisma.expenseRequest.findMany({
      where: { tenantId, caseId, status: { not: 'CANCELLED' } },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        case: { select: { fileNumber: true, executionFileNumber: true } },
        client: { select: { displayName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { bankAccounts: { where: { isDefault: true }, take: 1, select: { iban: true } } },
    });
    const officeIban = office?.bankAccounts?.[0]?.iban;

    const results: ExpenseThreeViewData[] = [];
    for (const expense of expenses) {
      const payments = await (this.prisma as any).expensePayment.findMany({
        where: { expenseRequestId: expense.id },
        orderBy: { paymentDate: 'desc' },
      });
      const expenseData = { ...expense, payments };
      results.push({
        task: this.expenseToTask(expenseData),
        finance: this.expenseToFinanceItem(expenseData),
        clientRequest: this.expenseToClientRequest(expenseData, officeIban),
      });
    }
    return results;
  }

  async getPendingExpenseTasks(tenantId: string): Promise<ExpenseTaskView[]> {
    const expenses = await this.prisma.expenseRequest.findMany({
      where: { tenantId, status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL', 'OVERDUE'] as any } },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        case: { select: { fileNumber: true, executionFileNumber: true } },
        client: { select: { displayName: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    const results: ExpenseTaskView[] = [];
    for (const expense of expenses) {
      const payments = await (this.prisma as any).expensePayment.findMany({
        where: { expenseRequestId: expense.id },
        orderBy: { paymentDate: 'desc' },
      });
      results.push(this.expenseToTask({ ...expense, payments }));
    }
    return results.sort((a, b) => {
      if (a.metadata.gateType === 'BLOCKING' && b.metadata.gateType !== 'BLOCKING') return -1;
      if (a.metadata.gateType !== 'BLOCKING' && b.metadata.gateType === 'BLOCKING') return 1;
      return 0;
    });
  }

  async getExpenseFinanceItems(tenantId: string, caseId: string): Promise<ExpenseFinanceView[]> {
    const expenses = await this.prisma.expenseRequest.findMany({
      where: { tenantId, caseId },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        case: { select: { fileNumber: true, executionFileNumber: true } },
        client: { select: { displayName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results: ExpenseFinanceView[] = [];
    for (const expense of expenses) {
      const payments = await (this.prisma as any).expensePayment.findMany({
        where: { expenseRequestId: expense.id },
        orderBy: { paymentDate: 'desc' },
      });
      results.push(this.expenseToFinanceItem({ ...expense, payments }));
    }
    return results;
  }

  async getExpenseClientRequests(tenantId: string, clientId: string): Promise<ExpenseClientRequestView[]> {
    const expenses = await this.prisma.expenseRequest.findMany({
      where: { tenantId, clientId, status: { not: 'CANCELLED' } },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        case: { select: { fileNumber: true, executionFileNumber: true } },
        client: { select: { displayName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const office = await this.prisma.office.findFirst({
      where: { tenantId },
      select: { bankAccounts: { where: { isDefault: true }, take: 1, select: { iban: true } } },
    });
    const officeIban = office?.bankAccounts?.[0]?.iban;

    const results: ExpenseClientRequestView[] = [];
    for (const expense of expenses) {
      const payments = await (this.prisma as any).expensePayment.findMany({
        where: { expenseRequestId: expense.id },
        orderBy: { paymentDate: 'desc' },
      });
      results.push(this.expenseToClientRequest({ ...expense, payments }, officeIban));
    }
    return results;
  }
}
