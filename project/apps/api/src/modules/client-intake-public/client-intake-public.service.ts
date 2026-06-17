import { Injectable, NotFoundException, BadRequestException, GoneException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakeLinkStatus, ClientIntakeSubmissionStatus } from '@prisma/client';
import { SubmitIntakeDto } from './dto/submit-intake.dto';

// Geçersiz/expired/limit-dolu için TEK generic mesaj (enumerasyon'a ipucu verme).
const GENERIC_INVALID = 'Bağlantı geçersiz veya süresi dolmuş.';

interface ValidLink {
  id: string;
  tenantId: string;
  caseId: string;
  clientId: string;
  scope: string[];
  maxUses: number;
  useCount: number;
}

/**
 * Public İntake servisi (Faz 4.4) — AUTH'suz dış form.
 *
 * KIRMIZI ÇİZGİ: public uç hiçbir mevcut dosya verisini OKUMAZ.
 * - getForm → yalnız { title, scope } (PII yok).
 * - submit → yalnız ClientIntakeSubmission (CLIENT_SUBMITTED) + Field YAZAR.
 * Kanonik modellere YAZMAZ (promote 4.6). tenant/case/client TOKEN kaydından.
 * Token doğrulaması sha256(token)→tokenHash; geçersizde GENERIC mesaj.
 */
@Injectable()
export class ClientIntakePublicService {
  constructor(private prisma: PrismaService) {}

  /**
   * Form şeması — yalnız scope kategorileri + jenerik başlık. PII YOK.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePublicController.getForm() → GET /public/intake/:token
   * </remarks>
   */
  async getForm(token: string) {
    const link = await this.validateActiveLink(token);
    return { title: 'Bilgi Formu', scope: link.scope };
  }

  /**
   * Submit — CLIENT_SUBMITTED yazar. Honeypot/atomik-limit/scope guard. Kanoniğe DOKUNMAZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakePublicController.submit() → POST /public/intake/:token
   * </remarks>
   */
  async submit(token: string, dto: SubmitIntakeDto, ip: string, userAgent?: string) {
    // Honeypot doluysa: sessiz drop (bot). Yazma yok; ipucu verme.
    if (dto.hp && dto.hp.trim().length > 0) {
      return { ok: true };
    }

    const link = await this.validateActiveLink(token);

    // Scope guard: her alanın kategorisi link.scope içinde olmalı.
    for (const f of dto.fields) {
      if (!link.scope.includes(f.category)) {
        throw new BadRequestException('Form gönderilemedi.'); // generic
      }
    }

    const ipHash = createHash('sha256').update(ip || 'unknown').digest('hex');
    const ua = (userAgent || '').slice(0, 256);

    await this.prisma.$transaction(async (tx) => {
      // ATOMİK limit: yalnız ACTIVE & useCount<maxUses iken artır. 0 satır → yarış/limit.
      const inc = await tx.clientIntakeLink.updateMany({
        where: { id: link.id, status: ClientIntakeLinkStatus.ACTIVE, useCount: { lt: link.maxUses } },
        data: { useCount: { increment: 1 } },
      });
      if (inc.count === 0) {
        throw new GoneException(GENERIC_INVALID);
      }
      // Limit dolduysa USED işaretle (idempotent; useCount>=maxUses).
      await tx.clientIntakeLink.updateMany({
        where: { id: link.id, status: ClientIntakeLinkStatus.ACTIVE, useCount: { gte: link.maxUses } },
        data: { status: ClientIntakeLinkStatus.USED },
      });

      const submission = await tx.clientIntakeSubmission.create({
        data: {
          tenantId: link.tenantId,
          intakeLinkId: link.id,
          caseId: link.caseId,
          clientId: link.clientId,
          status: ClientIntakeSubmissionStatus.CLIENT_SUBMITTED,
          sourceMeta: { ipHash, ua }, // ham IP YOK
        },
      });

      await tx.clientIntakeField.createMany({
        data: dto.fields.map((f) => ({
          submissionId: submission.id,
          category: f.category,
          label: f.label ?? null,
          value: f.value,
          note: f.note ?? null,
        })),
      });
    });

    return { ok: true };
  }

  // ==================== iç yardımcı ====================

  /**
   * Token → tokenHash → ACTIVE/süre/limit doğrula. Geçersizde GENERIC hata.
   * Yalnız iç alanları okur; ÇAĞIRANA tenant/case/client SIZDIRMAZ.
   */
  private async validateActiveLink(token: string): Promise<ValidLink> {
    if (!token) throw new NotFoundException(GENERIC_INVALID);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const link = await this.prisma.clientIntakeLink.findFirst({
      where: { tokenHash },
      select: { id: true, tenantId: true, caseId: true, clientId: true, status: true, scope: true, expiresAt: true, maxUses: true, useCount: true },
    });
    if (!link) throw new NotFoundException(GENERIC_INVALID);
    if (link.status !== ClientIntakeLinkStatus.ACTIVE) throw new NotFoundException(GENERIC_INVALID);
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) throw new NotFoundException(GENERIC_INVALID);
    if (link.useCount >= link.maxUses) throw new NotFoundException(GENERIC_INVALID);
    return { id: link.id, tenantId: link.tenantId, caseId: link.caseId, clientId: link.clientId, scope: link.scope, maxUses: link.maxUses, useCount: link.useCount };
  }
}
