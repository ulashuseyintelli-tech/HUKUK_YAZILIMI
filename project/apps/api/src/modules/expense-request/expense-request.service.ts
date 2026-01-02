import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ExpenseRequestStatus } from '@prisma/client';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';

export interface ExpenseItem {
  type: string;        // TEBLIGAT, HACIZ, SATIS_AVANSI, BILIRKISI, DIGER
  description: string;
  amount: number;
}

export interface CreateExpenseRequestDto {
  caseId: string;
  clientId: string;
  items: ExpenseItem[];
  dueDate?: string;
  notes?: string;
  paidByLawyer?: boolean; // Avukat kendisi karşıladı - müvekkilden tahsil edilecek
}

export interface UpdateExpenseRequestDto {
  items?: ExpenseItem[];
  dueDate?: string;
  notes?: string;
  status?: ExpenseRequestStatus;
}

@Injectable()
export class ExpenseRequestService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => CaseBalanceService))
    private caseBalanceService: CaseBalanceService,
  ) {}

  async findAll(tenantId: string, params?: { caseId?: string; clientId?: string; status?: ExpenseRequestStatus }) {
    const where: any = { tenantId };
    if (params?.caseId) where.caseId = params.caseId;
    if (params?.clientId) where.clientId = params.clientId;
    if (params?.status) where.status = params.status;

    return this.prisma.expenseRequest.findMany({
      where,
      include: {
        case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
        client: { select: { id: true, name: true, displayName: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const request = await this.prisma.expenseRequest.findFirst({
      where: { id, tenantId },
      include: {
        case: { 
          select: { 
            id: true, 
            fileNumber: true, 
            executionFileNumber: true,
            executionOffice: { select: { name: true } },
          } 
        },
        client: { 
          select: { 
            id: true, 
            name: true, 
            displayName: true, 
            phone: true, 
            email: true,
            bankAccounts: { where: { isPrimary: true }, take: 1 },
          } 
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Masraf talebi bulunamadı');
    }

    return request;
  }

  async findByCaseId(tenantId: string, caseId: string) {
    return this.prisma.expenseRequest.findMany({
      where: { tenantId, caseId },
      include: {
        client: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateExpenseRequestDto) {
    // Validate case exists
    const caseItem = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseItem) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // Validate client exists
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) {
      throw new NotFoundException('Müvekkil bulunamadı');
    }

    // Calculate total
    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);

    const expenseRequest = await this.prisma.expenseRequest.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        items: dto.items as any,
        totalAmount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        status: dto.paidByLawyer ? 'LAWYER_PAID' : 'PENDING', // Avukat karşıladıysa farklı status
        createdById: userId,
      },
      include: {
        case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
        client: { select: { id: true, name: true, displayName: true } },
      },
    });

    // Avukat karşıladıysa bakiyeye kredi ekle (UYAP'a gönderim açılsın)
    if (dto.paidByLawyer) {
      try {
        await this.caseBalanceService.credit(
          tenantId,
          dto.caseId,
          {
            amount: totalAmount,
            source: `expense_request:${expenseRequest.id}`,
            sourceId: expenseRequest.id,
            description: `Avukat tarafından karşılandı - Müvekkilden tahsil edilecek`,
          },
          userId,
        );
      } catch (error) {
        console.error('Bakiye kredisi eklenemedi:', error);
      }
    }

    return expenseRequest;
  }

  /**
   * Paket bazlı masraf talebi oluştur
   * Yeni masraf otomasyon sistemi için
   */
  async createFromPackage(tenantId: string, userId: string, dto: {
    caseId: string;
    clientId: string;
    packageCode: string;
    items: Array<{
      itemCode: string;
      label: string;
      suggestedAmount: number;
      finalAmount: number;
      wasOverridden?: boolean;
    }>;
    dueDate?: string;
    notes?: string;
    sendEmail?: boolean;
    sendSms?: boolean;
    sendWhatsapp?: boolean;
    paidByLawyer?: boolean; // Avukat kendisi karşıladı
  }) {
    // Validate case exists
    const caseItem = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseItem) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // Validate client exists
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) {
      throw new NotFoundException('Müvekkil bulunamadı');
    }

    // Calculate totals
    const totalSuggested = dto.items.reduce((sum, item) => sum + item.suggestedAmount, 0);
    const totalAmount = dto.items.reduce((sum, item) => sum + item.finalAmount, 0);

    // Convert items to old format for backward compatibility
    const legacyItems = dto.items.map(item => ({
      type: item.itemCode,
      description: item.label,
      amount: item.finalAmount,
    }));

    const expenseRequest = await this.prisma.expenseRequest.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        // Yeni alanlar (migration sonrası aktif olacak)
        // packageCode: dto.packageCode,
        // totalSuggested,
        // sendEmail: dto.sendEmail || false,
        // sendSms: dto.sendSms || false,
        // sendWhatsapp: dto.sendWhatsapp || false,
        items: legacyItems as any,
        totalAmount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        status: dto.paidByLawyer ? 'LAWYER_PAID' : 'PENDING', // Avukat karşıladıysa farklı status
        createdById: userId,
      },
      include: {
        case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
        client: { select: { id: true, name: true, displayName: true } },
      },
    });

    // Avukat karşıladıysa bakiyeye kredi ekle (UYAP'a gönderim açılsın)
    if (dto.paidByLawyer) {
      try {
        await this.caseBalanceService.credit(
          tenantId,
          dto.caseId,
          {
            amount: totalAmount,
            source: `expense_request:${expenseRequest.id}`,
            sourceId: expenseRequest.id,
            description: `Avukat tarafından karşılandı (${dto.packageCode}) - Müvekkilden tahsil edilecek`,
          },
          userId,
        );
      } catch (error) {
        console.error('Bakiye kredisi eklenemedi:', error);
      }
    }
    // Eğer sendEmail true ise otomatik gönder (avukat karşılamadıysa)
    else if (dto.sendEmail) {
      try {
        await this.markAsSent(tenantId, expenseRequest.id, 'EMAIL');
      } catch (error) {
        console.error('E-posta gönderimi başarısız:', error);
      }
    }

    return expenseRequest;
  }

  async update(tenantId: string, id: string, dto: UpdateExpenseRequestDto) {
    const existing = await this.findOne(tenantId, id);

    const data: any = {};
    
    if (dto.items) {
      data.items = dto.items as any;
      data.totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }
    if (dto.status) {
      data.status = dto.status;
    }

    return this.prisma.expenseRequest.update({
      where: { id },
      data,
      include: {
        case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
        client: { select: { id: true, name: true, displayName: true } },
      },
    });
  }

  async markAsSent(tenantId: string, id: string, channel: string, notificationId?: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.status !== 'PENDING' && existing.status !== 'REMINDED') {
      throw new BadRequestException('Bu talep zaten gönderilmiş veya tamamlanmış');
    }

    return this.prisma.expenseRequest.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentVia: channel,
        notificationId,
      },
    });
  }

  async markAsReminded(tenantId: string, id: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.status !== 'SENT' && existing.status !== 'REMINDED') {
      throw new BadRequestException('Sadece gönderilmiş talepler için hatırlatma yapılabilir');
    }

    return this.prisma.expenseRequest.update({
      where: { id },
      data: {
        status: 'REMINDED',
        reminderCount: { increment: 1 },
        lastReminderAt: new Date(),
      },
    });
  }

  async markAsReceived(tenantId: string, id: string, paidAmount: number, receiptDocId?: string, userId?: string) {
    const existing = await this.findOne(tenantId, id);

    // Transaction ile güncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Masraf talebini güncelle
      const updated = await tx.expenseRequest.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          paidAt: new Date(),
          paidAmount,
          receiptDocId,
          respondedAt: new Date(),
        },
        include: {
          case: { select: { id: true, fileNumber: true, executionFileNumber: true } },
          client: { select: { id: true, name: true, displayName: true } },
        },
      });

      return updated;
    });

    // Bakiyeye kredi ekle
    if (userId) {
      try {
        await this.caseBalanceService.credit(
          tenantId,
          existing.caseId,
          {
            amount: paidAmount,
            source: `expense_request:${id}`,
            sourceId: id,
            description: `Masraf talebi ödemesi (${(existing as any).packageCode || 'manuel'})`,
          },
          userId,
        );
      } catch (error) {
        console.error('Bakiye kredisi eklenemedi:', error);
        // Hata olsa bile masraf talebi güncellendi, devam et
      }
    }

    return result;
  }

  async cancel(tenantId: string, id: string, reason?: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.status === 'RECEIVED') {
      throw new BadRequestException('Ödeme alınmış talepler iptal edilemez');
    }

    return this.prisma.expenseRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        responseNotes: reason,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Sadece bekleyen talepler silinebilir');
    }

    await this.prisma.expenseRequest.delete({ where: { id } });
    return { success: true };
  }

  // İstatistikler
  async getStats(tenantId: string, caseId?: string) {
    const where: any = { tenantId };
    if (caseId) where.caseId = caseId;

    const [pending, sent, received, total] = await Promise.all([
      this.prisma.expenseRequest.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.expenseRequest.count({ where: { ...where, status: { in: ['SENT', 'REMINDED'] } } }),
      this.prisma.expenseRequest.count({ where: { ...where, status: 'RECEIVED' } }),
      this.prisma.expenseRequest.aggregate({
        where: { ...where, status: 'RECEIVED' },
        _sum: { paidAmount: true },
      }),
    ]);

    return {
      pending,
      sent,
      received,
      totalReceived: total._sum.paidAmount || 0,
    };
  }
}
