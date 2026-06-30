import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ExpenseRequestStatus, ExpenseGateType, Prisma } from '@prisma/client';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { ExpenseCalculatorService, CaseData, EXPENSE_SET_TEMPLATES } from './expense-calculator.service';
import { ExpenseNotificationService } from './expense-notification.service';

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

export interface PaymentInput {
  amount: number;
  paymentDate: Date;
  method: string; // BANK_TRANSFER, CASH, VIRTUAL_POS
  reference?: string;
  notes?: string;
  matchedBy?: string; // AUTO, MANUAL
}

export interface ExpenseSummary {
  totalRequested: number;
  totalPaid: number;
  totalPending: number;
  requestCount: number;
  paidCount: number;
  pendingCount: number;
  blockingUnpaid: number;
}

@Injectable()
export class ExpenseRequestService {
  private readonly logger = new Logger(ExpenseRequestService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => CaseBalanceService))
    private caseBalanceService: CaseBalanceService,
    private expenseCalculator: ExpenseCalculatorService,
    @Inject(forwardRef(() => ExpenseNotificationService))
    private expenseNotification: ExpenseNotificationService,
    private dispatcher: NotificationDispatcherService,
    private office: OfficeService,
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

  /**
   * S8-B FAZ-1b — Masraf DAĞITIM-UYGUNLUĞU onayı (collection-lifecycle status'tan AYRI eksen). PENDING_APPROVAL → APPROVED.
   * Yalnız APPROVED masraf otomatik dağıtıma (CollectionDisposition reimbursement) girer. finalizeAndSend (müvekkile
   * gönder) ile KARIŞTIRILMAZ — bu iç dağıtım-onayı. İdempotent (zaten APPROVED → no-op).
   */
  async approveForDistribution(tenantId: string, id: string, userId: string) {
    const existing = await this.findOne(tenantId, id);
    if (existing.expenseApprovalStatus === 'APPROVED') return existing; // idempotent
    if (existing.expenseApprovalStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Yalnız PENDING_APPROVAL masraf onaylanabilir (durum: ${existing.expenseApprovalStatus})`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseRequest.update({
        where: { id },
        data: { expenseApprovalStatus: 'APPROVED', approvedAt: new Date(), approvedById: userId },
      });
      await tx.expenseAuditLog.create({
        data: { expenseRequestId: id, action: 'APPROVAL_GRANTED', details: { scope: 'DISTRIBUTION' }, userId },
      });
      return updated;
    });
  }

  /**
   * S8-B FAZ-1b — Masraf dağıtım-onayını reddet. PENDING_APPROVAL → REJECTED. İdempotent (zaten REJECTED → no-op). Gerekçe opsiyonel.
   */
  async rejectForDistribution(tenantId: string, id: string, userId: string, note?: string) {
    const existing = await this.findOne(tenantId, id);
    if (existing.expenseApprovalStatus === 'REJECTED') return existing; // idempotent
    if (existing.expenseApprovalStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Yalnız PENDING_APPROVAL masraf reddedilebilir (durum: ${existing.expenseApprovalStatus})`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseRequest.update({
        where: { id },
        data: { expenseApprovalStatus: 'REJECTED', approvedAt: new Date(), approvedById: userId },
      });
      await tx.expenseAuditLog.create({
        data: { expenseRequestId: id, action: 'APPROVAL_REJECTED', details: { scope: 'DISTRIBUTION', note: note ?? null }, userId },
      });
      return updated;
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

  // ==================== YENİ METODLAR ====================

  /**
   * Otomatik açılış masraf seti oluştur
   * Case oluşturulduğunda çağrılır
   */
  async createOpeningExpenseSet(caseId: string, tenantId: string, userId: string) {
    // Case ve client bilgilerini al
    const caseItem = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        client: true,
        claimItems: { where: { itemType: 'PRINCIPAL' } },
        dues: { where: { type: 'PRINCIPAL' } },
        debtors: true, // Borçlu sayısı için
      },
    });

    if (!caseItem) {
      throw new NotFoundException('Takip bulunamadı');
    }

    if (!caseItem.clientId) {
      throw new BadRequestException('Takibe müvekkil atanmamış');
    }

    // Aynı aşama için zaten masraf talebi var mı kontrol et
    const existing = await this.prisma.expenseRequest.findFirst({
      where: { caseId, tenantId, stageCode: 'OPENING', status: { not: 'CANCELLED' } },
    });

    if (existing) {
      throw new BadRequestException('Bu takip için açılış masrafları zaten oluşturulmuş');
    }

    // Asıl alacak tutarını hesapla (dues veya claimItems'dan)
    let asilAlacak = 0;
    if (caseItem.dues && caseItem.dues.length > 0) {
      asilAlacak = caseItem.dues.reduce(
        (sum: number, due: any) => sum + (due.amount?.toNumber() || 0),
        0
      );
    } else if (caseItem.claimItems && caseItem.claimItems.length > 0) {
      asilAlacak = caseItem.claimItems.reduce(
        (sum: number, item: any) => sum + (item.amount?.toNumber() || 0),
        0
      );
    } else if (caseItem.principalAmount) {
      asilAlacak = caseItem.principalAmount.toNumber();
    }

    // Çek/Senet takiplerinde tazminat ve komisyon ekle
    const isCek = caseItem.type === 'CHECK';
    const isSenet = caseItem.type === 'BOND';
    
    let tazminat = 0;
    let komisyon = 0;
    
    if (isCek) {
      tazminat = asilAlacak * 0.10; // %10 karşılıksız çek tazminatı
      komisyon = asilAlacak * 0.003; // %0.3 komisyon
    }

    // Takip öncesi faiz hesapla (basit hesaplama - vade tarihi varsa)
    let takipOncesiFaiz = 0;
    if (caseItem.dues && caseItem.dues.length > 0) {
      const firstDue = caseItem.dues[0];
      if (firstDue.dueDate && caseItem.caseDate) {
        const vadeTarihi = new Date(firstDue.dueDate);
        const takipTarihi = new Date(caseItem.caseDate);
        
        if (vadeTarihi < takipTarihi) {
          const gunFarki = Math.floor((takipTarihi.getTime() - vadeTarihi.getTime()) / (1000 * 60 * 60 * 24));
          // TCMB Avans faiz oranı (yaklaşık %40 yıllık)
          const faizOrani = (isCek || isSenet) ? 0.40 : 0.24; // Ticari veya yasal faiz
          takipOncesiFaiz = asilAlacak * faizOrani * gunFarki / 365;
        }
      }
    }

    // TAKİP TUTARI = Asıl Alacak + Tazminat + Komisyon + Takip Öncesi Faiz
    const takipTutari = asilAlacak + tazminat + komisyon + takipOncesiFaiz;

    // Borçlu sayısı
    const debtorCount = caseItem.debtors?.length || 1;

    // ============================================
    // İCRA MASRAFLARI - Frontend ile birebir aynı formül (2026 Tarifesi)
    // ============================================
    const basvurmaHarci = 738.50;
    const vekaletHarci = 105.00;
    const pesinHarc = Math.max(Math.round(takipTutari * 0.005 * 100) / 100, 120); // min 120 TL
    const dosyaGideri = 50.00;
    const tebligatGideri = 252.00 * debtorCount; // Normal tebligat
    const vekaletPulu = 165.60;
    const totalAmount = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + vekaletPulu;

    // Masraf kalemleri listesi
    const calculatedItems = [
      { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: basvurmaHarci },
      { itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: pesinHarc },
      { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', suggestedAmount: vekaletHarci },
      { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', suggestedAmount: tebligatGideri },
      { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', suggestedAmount: dosyaGideri },
      { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', suggestedAmount: vekaletPulu },
    ];

    // Default due date: 5 iş günü sonra
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    // Transaction ile oluştur
    const result = await this.prisma.$transaction(async (tx) => {
      // ExpenseRequest oluştur
      const expenseRequest = await tx.expenseRequest.create({
        data: {
          tenantId,
          caseId,
          clientId: caseItem.clientId!,
          packageCode: 'OPENING',
          stageCode: 'OPENING',
          gateType: 'BLOCKING',
          totalSuggested: totalAmount,
          totalAmount,
          dueDate,
          status: 'PENDING',
          createdById: userId,
          paidTotal: 0,
        },
      });

      // ExpenseRequestItem'ları oluştur
      for (let i = 0; i < calculatedItems.length; i++) {
        const item = calculatedItems[i];
        await tx.expenseRequestItem.create({
          data: {
            expenseRequestId: expenseRequest.id,
            itemCode: item.itemCode,
            label: item.label,
            suggestedAmount: item.suggestedAmount,
            finalAmount: item.suggestedAmount,
            calcParams: {},
            sortOrder: i,
          },
        });
      }

      // Audit log
      await tx.expenseAuditLog.create({
        data: {
          expenseRequestId: expenseRequest.id,
          action: 'CREATED',
          details: { stageCode: 'OPENING', itemCount: calculatedItems.length, totalAmount },
          userId,
        },
      });

      return expenseRequest;
    });

    this.logger.log(`Opening expense set created for case ${caseId}: ${result.id}`);
    return result;
  }

  /**
   * Aşama bazlı masraf seti oluştur
   */
  async createStageExpenseSet(caseId: string, stageCode: string, tenantId: string, userId: string) {
    const template = EXPENSE_SET_TEMPLATES[stageCode as keyof typeof EXPENSE_SET_TEMPLATES];
    if (!template) {
      throw new BadRequestException(`Geçersiz aşama kodu: ${stageCode}`);
    }

    // Case bilgilerini al
    const caseItem = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        claimItems: { where: { itemType: 'PRINCIPAL' } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException('Takip bulunamadı');
    }

    if (!caseItem.clientId) {
      throw new BadRequestException('Takibe müvekkil atanmamış');
    }

    // Anapara hesapla
    const principalAmount = caseItem.claimItems.reduce(
      (sum, item) => sum + (item.amount?.toNumber() || 0),
      0
    );

    const caseData: CaseData = {
      principalAmount,
      caseType: caseItem.type || 'ILAMSIZ',
    };

    const calculatedItems = this.expenseCalculator.calculateStageExpenses(stageCode, caseData);
    const totalAmount = this.expenseCalculator.calculateTotal(calculatedItems);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const result = await this.prisma.$transaction(async (tx) => {
      const expenseRequest = await tx.expenseRequest.create({
        data: {
          tenantId,
          caseId,
          clientId: caseItem.clientId!,
          packageCode: stageCode,
          stageCode,
          gateType: template.gateType as ExpenseGateType,
          totalSuggested: totalAmount,
          totalAmount,
          dueDate,
          status: 'PENDING',
          createdById: userId,
          paidTotal: 0,
        },
      });

      for (let i = 0; i < calculatedItems.length; i++) {
        const item = calculatedItems[i];
        await tx.expenseRequestItem.create({
          data: {
            expenseRequestId: expenseRequest.id,
            itemCode: item.itemCode,
            label: item.label,
            suggestedAmount: item.suggestedAmount,
            finalAmount: item.suggestedAmount,
            calcParams: item.calcParams as any,
            sortOrder: i,
          },
        });
      }

      await tx.expenseAuditLog.create({
        data: {
          expenseRequestId: expenseRequest.id,
          action: 'CREATED',
          details: { stageCode, itemCount: calculatedItems.length, totalAmount },
          userId,
        },
      });

      return expenseRequest;
    });

    this.logger.log(`Stage expense set created for case ${caseId}, stage ${stageCode}: ${result.id}`);
    return result;
  }

  /**
   * Ödeme kaydet ve durum güncelle
   */
  async recordPayment(tenantId: string, requestId: string, payment: PaymentInput, userId: string) {
    const request = await this.prisma.expenseRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Masraf talebi bulunamadı');
    }

    const totalAmount = request.totalAmount.toNumber();
    const currentPaid = request.paidTotal.toNumber();
    const newPaidTotal = currentPaid + payment.amount;

    // Ödeme toplamı talep toplamını aşamaz
    if (newPaidTotal > totalAmount) {
      throw new BadRequestException(
        `Ödeme tutarı kalan borcu aşıyor. Kalan: ${totalAmount - currentPaid} TL`
      );
    }

    // Yeni durum belirle
    let newStatus: ExpenseRequestStatus;
    if (newPaidTotal >= totalAmount) {
      newStatus = 'PAID';
    } else if (newPaidTotal > 0) {
      newStatus = 'PARTIAL';
    } else {
      newStatus = request.status;
    }

    let paymentId: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      // Ödeme kaydı oluştur
      const createdPayment = await tx.expensePayment.create({
        data: {
          expenseRequestId: requestId,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          method: payment.method,
          reference: payment.reference,
          notes: payment.notes,
          matchedBy: payment.matchedBy || 'MANUAL',
          matchedById: userId,
        },
      });
      paymentId = createdPayment?.id ?? null;

      // ExpenseRequest güncelle
      const updated = await tx.expenseRequest.update({
        where: { id: requestId },
        data: {
          paidTotal: newPaidTotal,
          status: newStatus,
          paidAt: newStatus === 'PAID' ? new Date() : undefined,
          paidAmount: newStatus === 'PAID' ? totalAmount : undefined,
        },
        include: {
          case: { select: { id: true, fileNumber: true } },
          client: { select: { id: true, name: true } },
          payments: true,
        },
      });

      // Audit log
      await tx.expenseAuditLog.create({
        data: {
          expenseRequestId: requestId,
          action: 'PAYMENT_RECORDED',
          details: {
            amount: payment.amount,
            method: payment.method,
            reference: payment.reference,
            newPaidTotal,
            newStatus,
          },
          userId,
        },
      });

      // Task completion on payment - PAID olunca ilgili task'ı tamamla.
      // PR-PERF-1: bu sistem tetikli bir kapanıştır (ödemenin yan etkisi, doğrudan görev işi değil) →
      // AUTO_SYSTEM + completedByUserId null (ödemeyi kaydeden userId zaten expenseAuditLog'da; bu
      // kapanış performans raporunda kişiye atfedilmemeli, aksi halde sayım şişer).
      if (newStatus === 'PAID' && updated.taskId) {
        await tx.task.update({
          where: { id: updated.taskId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            resolutionType: 'AUTO_SYSTEM',
            completedByUserId: null,
          },
        });
        this.logger.log(`Task ${updated.taskId} completed due to expense payment`);
      }

      return updated;
    });

    // Bakiyeye kredi ekle
    try {
      await this.caseBalanceService.credit(
        tenantId,
        request.caseId,
        {
          amount: payment.amount,
          source: `expense_payment:${requestId}`,
          sourceId: requestId,
          description: `Masraf ödemesi - ${payment.reference || 'Manuel'}`,
        },
        userId,
      );
    } catch (error) {
      this.logger.error('Bakiye kredisi eklenemedi:', error);
    }

    // Ödeme maili — BEST-EFFORT (Faz 3.5). Ödeme = finansal olay (commit'li);
    // mail yalnız bildirim. Mail başarısızlığı ödeme state'ini DEĞİŞTİRMEZ.
    await this.notifyPayment(tenantId, userId, request.clientId, request.caseId, newStatus, payment.amount, newPaidTotal, totalAmount, paymentId);

    this.logger.log(`Payment recorded for expense ${requestId}: ${payment.amount} TL, new status: ${newStatus}`);
    return result;
  }

  /**
   * Ödeme bildirimi maili — BEST-EFFORT. Token derleme + dispatch tamamen try/catch içinde:
   * mail (veya okuma) başarısız olsa bile commit'li ödeme DEĞİŞMEZ, throw etmez.
   * Yalnız PAID → PAYMENT_RECEIVED ve PARTIAL → PARTIAL_PAYMENT_BALANCE (m35-4).
   * refId = ExpensePayment.id → her ödeme ayrı mail olayı (m35-1).
   */
  private async notifyPayment(
    tenantId: string,
    userId: string,
    clientId: string,
    caseId: string,
    newStatus: ExpenseRequestStatus,
    paymentAmount: number,
    newPaidTotal: number,
    totalAmount: number,
    paymentId: string | null,
  ): Promise<void> {
    if (newStatus !== 'PAID' && newStatus !== 'PARTIAL') return; // yalnız PAID/PARTIAL
    if (!paymentId) return;

    try {
      const [client, kase, office] = await Promise.all([
        this.prisma.client.findFirst({
          where: { id: clientId, tenantId },
          select: { displayName: true, name: true, firstName: true, lastName: true },
        }),
        this.prisma.case.findFirst({
          where: { id: caseId, tenantId },
          select: { fileNumber: true, executionFileNumber: true },
        }),
        this.office.getOrCreate(tenantId),
      ]);

      const tokens: Record<string, string> = {
        clientName: client?.displayName || client?.name || [client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'Müvekkil',
        caseFileNumber: kase?.fileNumber ?? '',
        executionFileNumber: kase?.executionFileNumber ?? '',
        totalAmount: totalAmount.toFixed(2),
        officeName: office?.name ?? '',
      };

      const templateCode = newStatus === 'PAID' ? 'PAYMENT_RECEIVED' : 'PARTIAL_PAYMENT_BALANCE';
      if (newStatus === 'PARTIAL') {
        tokens.paidAmount = paymentAmount.toFixed(2); // bu ödeme (m35-2)
        tokens.remainingAmount = (totalAmount - newPaidTotal).toFixed(2);
      }

      await this.dispatcher.dispatch(tenantId, userId, {
        clientId,
        caseId,
        templateCode,
        type: 'PAYMENT_INFO',
        tokens,
        refType: 'ExpensePayment',
        refId: paymentId,
      });
    } catch (e: any) {
      this.logger.warn(`Ödeme maili tetiklenemedi (${newStatus}, payment=${paymentId}): ${e.message}`);
    }
  }

  /**
   * Masraf talebi kesinleştir ve gönder
   */
  async finalizeAndSend(tenantId: string, requestId: string, channel: string = 'EMAIL', userId: string) {
    const request = await this.findOne(tenantId, requestId);

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Sadece bekleyen talepler gönderilebilir');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseRequest.update({
        where: { id: requestId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          sentVia: channel,
        },
      });

      await tx.expenseAuditLog.create({
        data: {
          expenseRequestId: requestId,
          action: 'SENT',
          details: { channel, sentAt: new Date().toISOString() },
          userId,
        },
      });

      return updated;
    });

    this.logger.log(`Expense request ${requestId} finalized and sent via ${channel}`);
    return result;
  }

  /**
   * Masraf talebi e-postası gönder (NotificationService kullanarak)
   */
  async sendExpenseEmail(tenantId: string, requestId: string, userId: string) {
    return this.expenseNotification.sendExpenseRequest(tenantId, requestId, userId);
  }

  /**
   * Dosya için masraf özeti getir
   */
  async getExpenseSummaryForCase(tenantId: string, caseId: string, clientId?: string): Promise<ExpenseSummary> {
    // TM3 Faz7-V: opsiyonel clientId → seçili müvekkile filtreli özet (çoklu-alacaklı dosyada
    // dosya-geneli yerine müvekkil-bazlı "talep/tahsil edilen masraf"). Salt-okuma; varsayılan
    // davranış (clientId yok) dosya-geneli kalır → mevcut çağıranlar etkilenmez.
    const requests = await this.prisma.expenseRequest.findMany({
      where: { tenantId, caseId, status: { not: 'CANCELLED' }, ...(clientId ? { clientId } : {}) },
    });

    const summary: ExpenseSummary = {
      totalRequested: 0,
      totalPaid: 0,
      totalPending: 0,
      requestCount: requests.length,
      paidCount: 0,
      pendingCount: 0,
      blockingUnpaid: 0,
    };

    for (const req of requests) {
      const total = req.totalAmount.toNumber();
      const paid = req.paidTotal.toNumber();

      summary.totalRequested += total;
      summary.totalPaid += paid;
      summary.totalPending += (total - paid);

      if (req.status === 'PAID') {
        summary.paidCount++;
      } else if (['PENDING', 'SENT', 'REMINDED', 'PARTIAL'].includes(req.status)) {
        summary.pendingCount++;
        if (req.gateType === 'BLOCKING') {
          summary.blockingUnpaid += (total - paid);
        }
      }
    }

    return summary;
  }

  /**
   * Dosya için tüm masraf taleplerini detaylı getir
   */
  async getExpenseRequestsWithDetails(tenantId: string, caseId: string) {
    return this.prisma.expenseRequest.findMany({
      where: { tenantId, caseId },
      include: {
        requestItems: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
        client: { select: { id: true, name: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
