import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, CollectionDispositionLineType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostDispositionDto } from './dto/post-disposition.dto';

const HELD = CollectionDispositionLineType.HELD_PENDING_DISTRIBUTION;
/** CLUSTER'da caseClientId zorunlu olan müvekkile-atfedilen tipler. */
const CLIENT_ATTRIBUTED = new Set<CollectionDispositionLineType>([
  CollectionDispositionLineType.CLIENT_PAYABLE,
  CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT,
]);

/**
 * TM3 M2 — Disposition Posting (kullanıcı onaylı dağıtım).
 *
 * HELD_PENDING_DISTRIBUTION draft → kullanıcı gerçek dağıtım satırlarını girer → POSTED.
 * Posting ANINDA ClientStatementLine YAZILMAZ (model A): proceeds defteri = bu lines;
 * ClientStatement.collect() POSTED line'ları okuyup immutable snapshot üretir.
 *
 * İnvariantlar: POSTED toplam == totalAmount (para kaybolmaz); tutarlar pozitif Decimal;
 * HELD satırı POSTED dağıtımda olamaz; CLUSTER'da client-attributed satır caseClientId ister;
 * collection posting anında YENİDEN CONFIRMED doğrulanır; OFFSET_CLIENT_ADVANCE bakiye etkisi
 * YALNIZ BalanceLedger'dan (CREDIT, korelasyonlu) → collect() çift saymaz.
 */
@Injectable()
export class DispositionPostingService {
  private readonly logger = new Logger(DispositionPostingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Çağrıldığı yerler:
   *  - DispositionController.post() → POST /collection-dispositions/:id/post
   */
  async post(
    tenantId: string,
    dispositionId: string,
    dto: PostDispositionDto,
    actor?: { userId?: string },
  ): Promise<{ posted: boolean; dispositionId: string; lineCount: number }> {
    const disp = await this.prisma.collectionDisposition.findFirst({
      where: { id: dispositionId, tenantId },
      select: {
        id: true, collectionId: true, caseId: true, beneficiaryScope: true,
        caseClientId: true, totalAmount: true, currency: true, status: true,
      },
    });
    if (!disp) throw new NotFoundException('Dağıtım kaydı bulunamadı');
    if (disp.status !== 'HELD_PENDING_DISTRIBUTION') {
      throw new BadRequestException(`Yalnız HELD_PENDING_DISTRIBUTION post edilebilir (durum: ${disp.status})`);
    }

    // Posting anında collection YENİDEN doğrulanır (M1 draft'tan sonra iptal/değişim guard).
    const col = await this.prisma.collection.findFirst({
      where: { id: disp.collectionId, caseId: disp.caseId, tenantId },
      select: { status: true },
    });
    if (!col) throw new BadRequestException('Tahsilat scope dışı (tenant/case/collection mismatch)');
    if (col.status !== 'CONFIRMED') {
      throw new BadRequestException(`Tahsilat ${col.status} — posting yasak (CONFIRMED değil)`);
    }

    const lines = dto?.lines ?? [];
    if (lines.length === 0) throw new BadRequestException('En az bir dağıtım satırı gerekir');

    let sum = new Prisma.Decimal(0);
    const resolved = lines.map((ln, i) => {
      if (ln.type === HELD) {
        throw new BadRequestException(`Satır ${i}: HELD_PENDING_DISTRIBUTION POSTED dağıtım satırı olamaz`);
      }
      let amount: Prisma.Decimal;
      try {
        amount = new Prisma.Decimal(ln.amount as Prisma.Decimal.Value);
      } catch {
        throw new BadRequestException(`Satır ${i}: geçersiz tutar`);
      }
      if (amount.lte(0)) throw new BadRequestException(`Satır ${i}: tutar pozitif olmalı`);
      sum = sum.plus(amount);

      // caseClientId: SINGLE → disposition.caseClientId; CLUSTER → satır caseClientId.
      let caseClientId: string | null;
      if (disp.beneficiaryScope === 'SINGLE_CASE_CLIENT') {
        caseClientId = disp.caseClientId ?? ln.caseClientId ?? null;
      } else {
        caseClientId = ln.caseClientId ?? null;
        if (CLIENT_ATTRIBUTED.has(ln.type) && !caseClientId) {
          throw new BadRequestException(`Satır ${i}: çoklu-alacaklı (CLUSTER) ${ln.type} için caseClientId zorunlu`);
        }
      }
      return { type: ln.type, amount, caseClientId, note: ln.note ?? null };
    });

    // POSTED kuralı: line toplamı == totalAmount (eksik/fazla yasak → sessiz "kalan para" yok).
    if (!sum.equals(disp.totalAmount)) {
      throw new BadRequestException(
        `POSTED dağıtım toplamı (${sum.toString()}) tahsilat tutarına (${disp.totalAmount.toString()}) eşit olmalı`,
      );
    }

    // caseClientId foreign-case/role doğrulaması: her satır caseClientId'si BU case'in eligible
    // alacaklısı (ALACAKLI/ORTAK_ALACAKLI) olmalı. Başka dosyanın CaseClient'ı veya uygunsuz rol reddedilir.
    const caseClientIds = [...new Set(resolved.map((r) => r.caseClientId).filter((x): x is string => !!x))];
    if (caseClientIds.length > 0) {
      const valid = await this.prisma.caseClient.findMany({
        where: {
          id: { in: caseClientIds },
          caseId: disp.caseId,
          role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] },
          client: { tenantId },
        },
        select: { id: true },
      });
      const validSet = new Set(valid.map((v) => v.id));
      const foreign = caseClientIds.find((id) => !validSet.has(id));
      if (foreign) {
        throw new BadRequestException(`caseClientId geçersiz/yabancı veya uygun rolde değil (ALACAKLI/ORTAK_ALACAKLI): ${foreign}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // M1 default HELD satırını (ve varsa eskileri) replace et.
      await tx.collectionDispositionLine.deleteMany({ where: { dispositionId } });

      let caseBalanceId: string | null = null;
      for (const r of resolved) {
        const created = await tx.collectionDispositionLine.create({
          data: { dispositionId, type: r.type, amount: r.amount, caseClientId: r.caseClientId, note: r.note },
          select: { id: true },
        });

        // OFFSET_CLIENT_ADVANCE → bakiye etkisi YALNIZ BalanceLedger'dan (avans defteri).
        // Yön CREDIT(+): borçlu tahsilatı müvekkilin avansladığı masrafı geri ödüyor → avans havuzuna
        // para döner (BalanceLedgerType.CREDIT = "Avans/ödeme geldi"). Korelasyon source=disposition_line:<id>
        // → collect() proceeds satırını BİLGİ(0) gösterir, bakiye yalnız bu BalanceLedger'dan oynar (çift-sayım yok).
        if (r.type === CollectionDispositionLineType.OFFSET_CLIENT_ADVANCE) {
          if (!caseBalanceId) {
            const cb = await tx.caseBalance.findFirst({ where: { caseId: disp.caseId, tenantId }, select: { id: true } });
            caseBalanceId = cb?.id
              ?? (await tx.caseBalance.create({ data: { tenantId, caseId: disp.caseId, currency: disp.currency }, select: { id: true } })).id;
          }
          await tx.balanceLedger.create({
            data: {
              tenantId,
              caseBalanceId,
              type: 'CREDIT',
              amount: r.amount,
              currency: disp.currency,
              source: `disposition_line:${created.id}`,
              sourceId: created.id,
              description: 'Tahsilat avans mahsubu (OFFSET_CLIENT_ADVANCE)',
              createdById: actor?.userId,
            },
          });
        }
      }

      await tx.collectionDisposition.update({
        where: { id: dispositionId },
        data: { status: 'POSTED', postedAt: new Date(), postedById: actor?.userId },
      });
    });

    this.logger.log(`CollectionDisposition POSTED: ${dispositionId} (${resolved.length} satır)`);
    return { posted: true, dispositionId, lineCount: resolved.length };
  }
}
