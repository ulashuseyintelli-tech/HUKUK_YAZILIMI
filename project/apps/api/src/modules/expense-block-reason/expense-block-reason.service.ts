import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ExpenseBlockStatus } from '@prisma/client';
import { CreateExpenseBlockReasonDto } from './dto/expense-block-reason.dto';

/**
 * Masraf Blok Gerekçesi servisi (PR-1).
 *
 * Amaç: "Masraf talep edildi, ödeme/onay gelmedi, bu nedenle X işlemi başlatılmadı"
 * kararını kalıcı, silinemez bir savunma defteri olarak tutmak.
 *
 * İLKELER:
 * - Salt-kayıt: bu servis hiçbir UYAP/işlemi otomatik DURDURMAZ; yalnız gerekçeyi kaydeder.
 * - Immutability: çekirdek alanlar (blockedActionCode/reasonCode/note/caseId/expenseRequestId)
 *   create sonrası değiştirilmez. Bu servis update/delete metodu SUNMAZ.
 * - Yanlış kayıt cancel edilir, SİLİNMEZ (status=CANCELLED).
 * - Multitenant: tüm okuma/yazma tenantId ile filtrelenir; FK hedefleri aynı tenant'a ait mi doğrulanır.
 */
@Injectable()
export class ExpenseBlockReasonService {
  constructor(private prisma: PrismaService) {}

  /**
   * Yeni blok gerekçesi aç (status=OPEN).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseBlockReasonController.create() → POST /expense-block-reasons/case/:caseId (savunma kaydı oluştur)
   * </remarks>
   */
  async create(tenantId: string, caseId: string, userId: string, dto: CreateExpenseBlockReasonDto) {
    // FK guard: case aynı tenant'a mı ait?
    const caseItem = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!caseItem) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // FK guard: expenseRequest verildiyse aynı tenant + aynı case'e mi ait?
    if (dto.expenseRequestId) {
      const er = await this.prisma.expenseRequest.findFirst({
        where: { id: dto.expenseRequestId, tenantId },
        select: { id: true, caseId: true },
      });
      if (!er) {
        throw new NotFoundException('Masraf talebi bulunamadı');
      }
      if (er.caseId !== caseId) {
        throw new BadRequestException('Masraf talebi bu takibe ait değil');
      }
    }

    return this.prisma.expenseBlockReason.create({
      data: {
        tenantId,
        caseId,
        expenseRequestId: dto.expenseRequestId ?? null,
        blockedActionCode: dto.blockedActionCode,
        reasonCode: dto.reasonCode,
        note: dto.note ?? null,
        status: ExpenseBlockStatus.OPEN,
        createdById: userId,
      },
    });
  }

  /**
   * Blok gerekçesini çöz (OPEN → RESOLVED). Ödeme/onay geldi, işlem yapılabilir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseBlockReasonController.resolve() → POST /expense-block-reasons/:id/resolve
   * </remarks>
   */
  async resolve(tenantId: string, id: string, userId: string, note?: string) {
    const existing = await this.findOwned(tenantId, id);
    if (existing.status !== ExpenseBlockStatus.OPEN) {
      throw new BadRequestException(
        `Yalnız OPEN kayıt çözülebilir (mevcut durum: ${existing.status})`,
      );
    }

    return this.prisma.expenseBlockReason.update({
      where: { id },
      data: {
        status: ExpenseBlockStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: userId,
        resolutionNote: note ?? null,
      },
    });
  }

  /**
   * Blok gerekçesini iptal et (OPEN → CANCELLED). Kayıt yanlış/geçersiz — SİLİNMEZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseBlockReasonController.cancel() → POST /expense-block-reasons/:id/cancel
   * </remarks>
   */
  async cancel(tenantId: string, id: string, userId: string, note?: string) {
    const existing = await this.findOwned(tenantId, id);
    if (existing.status !== ExpenseBlockStatus.OPEN) {
      throw new BadRequestException(
        `Yalnız OPEN kayıt iptal edilebilir (mevcut durum: ${existing.status})`,
      );
    }

    return this.prisma.expenseBlockReason.update({
      where: { id },
      data: {
        status: ExpenseBlockStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        resolutionNote: note ?? null,
      },
    });
  }

  /**
   * Dosya bazlı blok gerekçeleri listesi (default: yalnız OPEN).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseBlockReasonController.listByCase() → GET /expense-block-reasons/case/:caseId?status=
   * </remarks>
   */
  async listByCase(tenantId: string, caseId: string, status?: ExpenseBlockStatus) {
    return this.prisma.expenseBlockReason.findMany({
      where: {
        tenantId,
        caseId,
        status: status ?? ExpenseBlockStatus.OPEN,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tenant-sahipli tek kayıt getir (iç yardımcı). Başka tenant'ın kaydını GÖRMEZ.
   */
  private async findOwned(tenantId: string, id: string) {
    const record = await this.prisma.expenseBlockReason.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('Blok gerekçesi bulunamadı');
    }
    return record;
  }
}
