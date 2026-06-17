import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakeSubmissionStatus, ClientIntakeFieldReviewStatus } from '@prisma/client';

/**
 * Client Intake Review Queue servisi (Faz 4.5) — personel/JWT.
 *
 * ⛔ MİMARİ SINIR (kritik): 4.5 KANONİĞE YAZMAZ. Bu servis YALNIZ PrismaService'e
 * bağlıdır; ClientIntelStatement/DebtorAddress/Asset/DebtorCommunication veya promote
 * servisi INJECT EDİLMEZ. Yalnız ClientIntakeSubmission/Field lifecycle'ını işaretler.
 * Promote (kanoniğe yazım) AYRI faz/modüldür (4.6). Sınır kaybolursa review anlamsızlaşır.
 *
 * KURALLAR:
 * - claim ZORUNLU (review öncesi IN_REVIEW + claimedById/claimedAt).
 * - field review tek tek + aynı submission içinde toplu (submission'lar arası YOK).
 * - IN_REVIEW'de karar değişebilir; PROMOTED (promotedRefId dolu) alan DEĞİŞTİRİLEMEZ.
 * - reject-submission: PENDING alanları REJECTED yapar, APPROVED'a DOKUNMAZ.
 */
@Injectable()
export class ClientIntakeReviewService {
  constructor(private prisma: PrismaService) {}

  /**
   * İnceleme kuyruğu (default CLIENT_SUBMITTED + IN_REVIEW).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.listQueue() → GET /client-intake-submissions?status=&caseId=
   * </remarks>
   */
  async listQueue(tenantId: string, params: { status?: ClientIntakeSubmissionStatus; caseId?: string }) {
    return this.prisma.clientIntakeSubmission.findMany({
      where: {
        tenantId,
        ...(params.caseId ? { caseId: params.caseId } : {}),
        ...(params.status
          ? { status: params.status }
          : { status: { in: [ClientIntakeSubmissionStatus.CLIENT_SUBMITTED, ClientIntakeSubmissionStatus.IN_REVIEW] } }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tek gönderim + alanlar.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.getOne() → GET /client-intake-submissions/:id
   * </remarks>
   */
  async getOne(tenantId: string, id: string) {
    const sub = await this.prisma.clientIntakeSubmission.findFirst({
      where: { id, tenantId },
      include: { fields: { orderBy: { createdAt: 'asc' } } },
    });
    if (!sub) throw new NotFoundException('Gönderim bulunamadı');
    return sub;
  }

  /**
   * İncelemeyi üstlen (CLIENT_SUBMITTED → IN_REVIEW + claimedById/claimedAt). ZORUNLU.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.claim() → POST /client-intake-submissions/:id/claim
   * </remarks>
   */
  async claim(tenantId: string, id: string, userId: string) {
    const sub = await this.findOwned(tenantId, id);
    if (sub.status !== ClientIntakeSubmissionStatus.CLIENT_SUBMITTED) {
      throw new BadRequestException(`Yalnız CLIENT_SUBMITTED üstlenilebilir (durum: ${sub.status})`);
    }
    return this.prisma.clientIntakeSubmission.update({
      where: { id },
      data: { status: ClientIntakeSubmissionStatus.IN_REVIEW, claimedById: userId, claimedAt: new Date() },
    });
  }

  /**
   * Tek alan review (APPROVE/REJECT). Submission IN_REVIEW olmalı; promote edilmiş alan dokunulamaz.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.reviewField() → POST /client-intake-fields/:fieldId/review
   * </remarks>
   */
  async reviewField(tenantId: string, fieldId: string, userId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    const field = await this.prisma.clientIntakeField.findFirst({
      where: { id: fieldId, submission: { tenantId } },
      select: { id: true, promotedRefId: true, submission: { select: { id: true, status: true } } },
    });
    if (!field) throw new NotFoundException('Alan bulunamadı');
    this.assertReviewable(field.submission.status, field.promotedRefId);

    const reviewStatus = decision === 'APPROVE' ? ClientIntakeFieldReviewStatus.APPROVED : ClientIntakeFieldReviewStatus.REJECTED;
    await this.prisma.$transaction([
      this.prisma.clientIntakeField.update({ where: { id: fieldId }, data: { reviewStatus, reviewNote: note ?? null } }),
      this.prisma.clientIntakeSubmission.update({ where: { id: field.submission.id }, data: { reviewedById: userId, reviewedAt: new Date() } }),
    ]);
    return this.getOne(tenantId, field.submission.id);
  }

  /**
   * Toplu field review — YALNIZ aynı submission içindeki seçili alanlar (promote edilmemiş).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.bulkReview() → POST /client-intake-submissions/:id/fields/bulk-review
   * </remarks>
   */
  async bulkReviewFields(tenantId: string, submissionId: string, userId: string, fieldIds: string[], decision: 'APPROVE' | 'REJECT', note?: string) {
    const sub = await this.findOwned(tenantId, submissionId);
    if (sub.status !== ClientIntakeSubmissionStatus.IN_REVIEW) {
      throw new BadRequestException(`Toplu review için submission IN_REVIEW olmalı (durum: ${sub.status})`);
    }
    const reviewStatus = decision === 'APPROVE' ? ClientIntakeFieldReviewStatus.APPROVED : ClientIntakeFieldReviewStatus.REJECTED;
    // YALNIZ bu submission'ın, promote EDİLMEMİŞ alanları. (submission'lar arası toplu YOK.)
    await this.prisma.clientIntakeField.updateMany({
      where: { id: { in: fieldIds }, submissionId, promotedRefId: null },
      data: { reviewStatus, reviewNote: note ?? null },
    });
    await this.prisma.clientIntakeSubmission.update({ where: { id: submissionId }, data: { reviewedById: userId, reviewedAt: new Date() } });
    return this.getOne(tenantId, submissionId);
  }

  /**
   * Gönderimi reddet (→ REJECTED). PENDING alanlar REJECTED olur; APPROVED'a DOKUNMAZ (45-4).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeReviewController.reject() → POST /client-intake-submissions/:id/reject
   * </remarks>
   */
  async rejectSubmission(tenantId: string, id: string, userId: string, note?: string) {
    const sub = await this.findOwned(tenantId, id);
    if (sub.status !== ClientIntakeSubmissionStatus.CLIENT_SUBMITTED && sub.status !== ClientIntakeSubmissionStatus.IN_REVIEW) {
      throw new BadRequestException(`Bu gönderim reddedilemez (durum: ${sub.status})`);
    }
    await this.prisma.$transaction([
      this.prisma.clientIntakeSubmission.update({
        where: { id },
        data: { status: ClientIntakeSubmissionStatus.REJECTED, reviewedById: userId, reviewedAt: new Date() },
      }),
      // YALNIZ PENDING → REJECTED; APPROVED alanlara dokunma.
      this.prisma.clientIntakeField.updateMany({
        where: { submissionId: id, reviewStatus: ClientIntakeFieldReviewStatus.PENDING },
        data: { reviewStatus: ClientIntakeFieldReviewStatus.REJECTED },
      }),
    ]);
    return this.getOne(tenantId, id);
  }

  // ==================== iç yardımcılar ====================

  /** Review yapılabilir mi: submission IN_REVIEW + alan promote edilmemiş. */
  private assertReviewable(submissionStatus: ClientIntakeSubmissionStatus, promotedRefId: string | null) {
    if (submissionStatus !== ClientIntakeSubmissionStatus.IN_REVIEW) {
      throw new BadRequestException(`Önce claim gerekli / uygun durum değil (durum: ${submissionStatus})`);
    }
    if (promotedRefId) {
      throw new BadRequestException('Promote edilmiş alan 4.5 ile değiştirilemez');
    }
  }

  private async findOwned(tenantId: string, id: string) {
    const sub = await this.prisma.clientIntakeSubmission.findFirst({ where: { id, tenantId }, select: { id: true, status: true } });
    if (!sub) throw new NotFoundException('Gönderim bulunamadı');
    return sub;
  }
}
