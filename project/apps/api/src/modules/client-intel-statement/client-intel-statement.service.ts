import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntelStatus } from '@prisma/client';
import {
  CreateClientIntelStatementDto,
  SupersedeClientIntelStatementDto,
} from './dto/client-intel-statement.dto';

/**
 * Müvekkil İstihbarat Beyanı servisi (Faz 4.0).
 *
 * Yalnız YUMUŞAK istihbarat (gelir/ticari/aile/dijital/tahsilat-beyanı/strateji).
 * Adres → DebtorAddress(source=CLIENT), varlık → Asset, iletişim → Debtor: BU SERVİSE GİRMEZ.
 *
 * İLKELER (Faz 1):
 * - source=CLIENT_DECLARATION, confidence=DECLARED (default'lar).
 * - Append-only: value/category/label create sonrası değişmez. Düzeltme = supersede.
 * - Yanlış çıkan SİLİNMEZ: RETRACTED / FALSE_POSITIVE (delil izi).
 * - Servis content update/delete metodu SUNMAZ; PATCH/PUT/DELETE route yok.
 * - Multitenant: tüm okuma/yazma tenantId ile filtrelenir; FK hedefleri aynı tenant doğrulanır.
 * - Party / IR-0 / cross-case YOK.
 */
@Injectable()
export class ClientIntelStatementService {
  constructor(private prisma: PrismaService) {}

  /**
   * Yeni beyan oluştur (ACTIVE).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.create() → POST /client-intel-statements/case/:caseId
   * - (Faz 4.6) intake promote → onaylı yumuşak-istihbarat alanını buraya yazacak (henüz yok)
   * </remarks>
   */
  async create(tenantId: string, caseId: string, userId: string, dto: CreateClientIntelStatementDto) {
    const caseItem = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');

    const debtor = await this.prisma.debtor.findFirst({ where: { id: dto.debtorId, tenantId }, select: { id: true } });
    if (!debtor) throw new NotFoundException('Borçlu bulunamadı');

    // 40-2: debtor↔case ilişkisi SOFT — bulunamasa da kayıt reddedilmez (cross-case yok, esnek bağ).

    return this.prisma.clientIntelStatement.create({
      data: {
        tenantId,
        caseId,
        debtorId: dto.debtorId,
        category: dto.category,
        label: dto.label ?? null,
        value: dto.value,
        note: dto.note ?? null,
        status: ClientIntelStatus.ACTIVE,
        createdById: userId,
      },
    });
  }

  /**
   * Müvekkil beyanını geri al (ACTIVE → RETRACTED). Silinmez.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.retract() → POST /client-intel-statements/:id/retract
   * </remarks>
   */
  async retract(tenantId: string, id: string, userId: string, note?: string) {
    return this.revoke(tenantId, id, userId, ClientIntelStatus.RETRACTED, note);
  }

  /**
   * Beyan yanlış çıktı (ACTIVE → FALSE_POSITIVE). Silinmez.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.falsePositive() → POST /client-intel-statements/:id/false-positive
   * </remarks>
   */
  async falsePositive(tenantId: string, id: string, userId: string, note?: string) {
    return this.revoke(tenantId, id, userId, ClientIntelStatus.FALSE_POSITIVE, note);
  }

  /**
   * Düzeltme: eskisini SUPERSEDED yap, yeni ACTIVE beyan üret (tek transaction).
   * Eski kaydın içeriği DEĞİŞMEZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.supersede() → POST /client-intel-statements/:id/supersede
   * </remarks>
   */
  async supersede(tenantId: string, id: string, userId: string, dto: SupersedeClientIntelStatementDto) {
    const old = await this.findOwned(tenantId, id);
    if (old.status !== ClientIntelStatus.ACTIVE) {
      throw new BadRequestException(`Yalnız ACTIVE beyan supersede edilebilir (durum: ${old.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.clientIntelStatement.create({
        data: {
          tenantId,
          caseId: old.caseId,
          debtorId: old.debtorId,
          category: old.category,
          label: dto.label ?? old.label,
          value: dto.value,
          note: dto.note ?? null,
          status: ClientIntelStatus.ACTIVE,
          createdById: userId,
        },
      });
      await tx.clientIntelStatement.update({
        where: { id: old.id },
        data: {
          status: ClientIntelStatus.SUPERSEDED,
          supersededById: fresh.id,
          supersededAt: new Date(),
        },
      });
      return fresh;
    });
  }

  /**
   * Dosya bazlı liste (default ACTIVE).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.listByCase() → GET /client-intel-statements/case/:caseId?status=
   * </remarks>
   */
  async listByCase(tenantId: string, caseId: string, status?: ClientIntelStatus) {
    return this.prisma.clientIntelStatement.findMany({
      where: { tenantId, caseId, status: status ?? ClientIntelStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Borçlu bazlı liste (default ACTIVE).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.listByDebtor() → GET /client-intel-statements/debtor/:debtorId?status=
   * </remarks>
   */
  async listByDebtor(tenantId: string, debtorId: string, status?: ClientIntelStatus) {
    return this.prisma.clientIntelStatement.findMany({
      where: { tenantId, debtorId, status: status ?? ClientIntelStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tek beyan.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntelStatementController.findOne() → GET /client-intel-statements/:id
   * </remarks>
   */
  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.clientIntelStatement.findFirst({ where: { id, tenantId } });
    if (!record) throw new NotFoundException('İstihbarat beyanı bulunamadı');
    return record;
  }

  // ==================== iç yardımcılar ====================

  private async revoke(tenantId: string, id: string, userId: string, to: ClientIntelStatus, note?: string) {
    const existing = await this.findOwned(tenantId, id);
    if (existing.status !== ClientIntelStatus.ACTIVE) {
      throw new BadRequestException(`Yalnız ACTIVE beyan için bu işlem yapılabilir (durum: ${existing.status})`);
    }
    return this.prisma.clientIntelStatement.update({
      where: { id },
      data: {
        status: to,
        revokedAt: new Date(),
        revokedById: userId,
        lifecycleNote: note ?? null,
      },
    });
  }

  private async findOwned(tenantId: string, id: string) {
    const record = await this.prisma.clientIntelStatement.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, caseId: true, debtorId: true, category: true, label: true },
    });
    if (!record) throw new NotFoundException('İstihbarat beyanı bulunamadı');
    return record;
  }
}
