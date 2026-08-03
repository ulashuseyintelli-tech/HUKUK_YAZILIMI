import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { type ClientMutationActor } from './client-mutation-policy';
import {
  decideClientDataLifecycleGate,
  type ClientLifecycleAssessment,
  type ClientLifecycleGateDecision,
} from './client-data-lifecycle-gate';

/**
 * C3-B03 — LEGAL HOLD + ON-DEMAND SİLME DEĞERLENDİRMESİ (§13/8 K8.3-K8.5, model A).
 *
 * Owner ratifikasyonu (decision-log 2026-08-03):
 * - Silme YALNIZ yetkili talep üzerine 8-koşullu fail-closed kapıdan DEĞERLENDİRİLİR;
 *   scheduler ve otomatik silme YOKTUR. Bu serviste hiçbir delete/anonimleştirme
 *   YÜRÜTÜCÜSÜ yoktur — değerlendirme sonucu yalnız KAYIT altına alınır.
 * - Legal hold KOYMA: yükseltilmiş yetki (ADMIN veya officeApproval.isApproverEligible —
 *   K8.4 "yetkili avukat, partner/manager veya super admin" ifadesinin sistemdeki mevcut
 *   karşılığı; ayrı rol primitive'i İCAT EDİLMEDİ).
 * - Legal hold KALDIRMA: GEREKÇELİ + MAKER-CHECKER — talep eden yetkili ile onaylayan
 *   yetkili FARKLI kişiler olmak zorundadır (K8.4 "ikinci bir yetkili").
 * - Koyma/kaldırma nedeni, aktör, onaylayan, zaman ve kapsam audit'e yazılır.
 */
@Injectable()
export class ClientLegalHoldService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  private delegate(tx?: any) {
    const source: any = tx ?? this.prisma;
    return source.clientLegalHold;
  }

  private async assertElevated(actor: ClientMutationActor, tenantId: string, what: string) {
    const isAdmin = actor?.role === 'ADMIN';
    const eligible =
      !isAdmin && actor?.userId
        ? await this.officeApproval.isApproverEligible(actor.userId, tenantId)
        : false;
    if (!actor?.userId || (!isAdmin && !eligible)) {
      throw new ForbiddenException({
        code: 'LEGAL_HOLD_ELEVATED_REQUIRED',
        message: `${what} yalnız yükseltilmiş yetkiyle yapılır (K8.4)`,
      });
    }
  }

  /** Aktif hold var mı? (kapı koşulu 6 + dış tüketiciler için) */
  async hasActiveHold(
    tenantId: string,
    scope: { clientId?: string; caseId?: string; recordFamily?: string },
  ): Promise<boolean> {
    const or: any[] = [];
    if (scope.clientId) or.push({ scopeType: 'CLIENT', clientId: scope.clientId });
    if (scope.caseId) or.push({ scopeType: 'CASE', caseId: scope.caseId });
    if (scope.recordFamily) or.push({ scopeType: 'RECORD_FAMILY', recordFamily: scope.recordFamily });
    if (scope.clientId) {
      // Müvekkil-kapsamlı hold, o müvekkilin dava/aile taleplerini de kapsar (fail-closed).
      or.push({ scopeType: 'CLIENT', clientId: scope.clientId });
    }
    if (or.length === 0) return false;
    const row = await this.delegate().findFirst({
      // RELEASE_REQUESTED da AKTİF sayılır: onay tamamlanmadan hold düşmez (fail-closed).
      where: { tenantId, status: { in: ['ACTIVE', 'RELEASE_REQUESTED'] }, OR: or },
    });
    return !!row;
  }

  /** Hold koyma (K8.4): yükseltilmiş yetki + zorunlu gerekçe + audit. */
  async placeHold(params: {
    tenantId: string;
    clientId: string;
    scopeType: 'CLIENT' | 'CASE' | 'RECORD_FAMILY';
    reason: string;
    actor: ClientMutationActor;
    caseId?: string;
    recordFamily?: string;
  }) {
    const { tenantId, clientId, scopeType, reason, actor, caseId, recordFamily } = params;
    await this.assertElevated(actor, tenantId, 'Legal hold koyma');
    if (!reason?.trim()) {
      throw new BadRequestException('Legal hold gerekçesi zorunludur (K8.4)');
    }
    if (scopeType === 'CASE' && !caseId) {
      throw new BadRequestException('CASE kapsamı için caseId zorunludur');
    }
    if (scopeType === 'RECORD_FAMILY' && !recordFamily) {
      throw new BadRequestException('RECORD_FAMILY kapsamı için recordFamily zorunludur');
    }
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const created = await this.delegate(tx).create({
        data: {
          tenantId,
          clientId,
          scopeType,
          caseId: caseId ?? null,
          recordFamily: recordFamily ?? null,
          status: 'ACTIVE',
          reason,
          placedByUserId: actor.userId,
          placedAt: now,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_LEGAL_HOLD_PLACE',
        entityType: 'CLIENT_LEGAL_HOLD',
        entityId: created.id,
        userId: actor.userId ?? undefined,
        metadata: { clientId, scopeType, caseId: caseId ?? null, recordFamily: recordFamily ?? null, reason },
      });
      return created;
    });
  }

  /** Kaldırma TALEBİ (maker): yükseltilmiş yetki + zorunlu gerekçe. Hold hâlâ AKTİF sayılır. */
  async requestRelease(params: {
    tenantId: string;
    holdId: string;
    releaseReason: string;
    actor: ClientMutationActor;
  }) {
    const { tenantId, holdId, releaseReason, actor } = params;
    await this.assertElevated(actor, tenantId, 'Legal hold kaldırma talebi');
    if (!releaseReason?.trim()) {
      throw new BadRequestException('Kaldırma gerekçesi zorunludur (K8.4)');
    }
    const hold = await this.requireHold(tenantId, holdId);
    if (hold.status !== 'ACTIVE') {
      throw new ConflictException(`Hold ${hold.status} durumunda — kaldırma talebi yalnız ACTIVE hold için`);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.delegate(tx).update({
        where: { id: holdId },
        data: {
          status: 'RELEASE_REQUESTED',
          releaseReason,
          releaseRequestedByUserId: actor.userId,
          releaseRequestedAt: now,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_LEGAL_HOLD_RELEASE_REQUEST',
        entityType: 'CLIENT_LEGAL_HOLD',
        entityId: holdId,
        userId: actor.userId ?? undefined,
        metadata: { releaseReason },
      });
      return updated;
    });
  }

  /**
   * Kaldırma ONAYI (checker, K8.4): yükseltilmiş yetki + talep edenden FARKLI kişi.
   * Aynı kişi kendi talebini onaylayamaz — maker-checker fail-closed.
   */
  async approveRelease(params: { tenantId: string; holdId: string; actor: ClientMutationActor }) {
    const { tenantId, holdId, actor } = params;
    await this.assertElevated(actor, tenantId, 'Legal hold kaldırma onayı');
    const hold = await this.requireHold(tenantId, holdId);
    if (hold.status !== 'RELEASE_REQUESTED') {
      throw new ConflictException('Onaylanacak bekleyen kaldırma talebi yok');
    }
    if (hold.releaseRequestedByUserId && hold.releaseRequestedByUserId === actor.userId) {
      throw new ForbiddenException({
        code: 'LEGAL_HOLD_MAKER_CHECKER_VIOLATION',
        message: 'Kaldırma onayı, talebi yapan yetkiliden FARKLI ikinci bir yetkili ister (K8.4)',
      });
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.delegate(tx).update({
        where: { id: holdId },
        data: { status: 'RELEASED', releasedByUserId: actor.userId, releasedAt: now },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_LEGAL_HOLD_RELEASE_APPROVE',
        entityType: 'CLIENT_LEGAL_HOLD',
        entityId: holdId,
        userId: actor.userId ?? undefined,
        metadata: {
          requestedByUserId: hold.releaseRequestedByUserId,
          approvedByUserId: actor.userId,
          releaseReason: hold.releaseReason,
        },
      });
      return updated;
    });
  }

  async listHolds(tenantId: string, clientId?: string) {
    return this.delegate().findMany({
      where: { tenantId, ...(clientId ? { clientId } : {}) },
      orderBy: { placedAt: 'desc' },
    });
  }

  /**
   * ON-DEMAND SİLME DEĞERLENDİRMESİ (K8.3 model A): yalnız yükseltilmiş yetkili talep;
   * koşul 6 (aktif hold) DB'den OTOMATİK doldurulur — çağıran iddiası EZİLİR.
   * Sonuç yalnız KAYDA GEÇER: bu servis hiçbir kaydı silmez/anonimleştirmez (K8.5
   * default NO DELETE; yöntem NOT SELECTED → executionAllowed HER ZAMAN false).
   */
  async evaluateDeletionRequest(params: {
    tenantId: string;
    clientId: string;
    actor: ClientMutationActor;
    assessment: ClientLifecycleAssessment;
    caseId?: string;
    recordFamily?: string;
    requestNote?: string;
  }): Promise<ClientLifecycleGateDecision> {
    const { tenantId, clientId, actor, assessment, caseId, recordFamily, requestNote } = params;
    await this.assertElevated(actor, tenantId, 'Silme değerlendirme talebi');

    const holdActive = await this.hasActiveHold(tenantId, { clientId, caseId, recordFamily });
    const effectiveAssessment: ClientLifecycleAssessment = {
      ...assessment,
      // Koşul 6 repository-truth'tur; iddia ile AÇILAMAZ (fail-closed).
      NO_ACTIVE_LEGAL_HOLD: holdActive ? 'NOT_CONFIRMED' : (assessment.NO_ACTIVE_LEGAL_HOLD ?? 'CONFIRMED'),
    };
    const decision = decideClientDataLifecycleGate(effectiveAssessment);

    await this.audit.log({
      tenantId,
      action: 'CLIENT_DELETION_GATE_EVALUATED',
      entityType: 'CLIENT',
      entityId: clientId,
      userId: actor.userId ?? undefined,
      metadata: {
        scope: { caseId: caseId ?? null, recordFamily: recordFamily ?? null },
        result: decision.result,
        executionAllowed: decision.executionAllowed,
        unmetConditions: decision.unmetConditions,
        activeHoldDetected: holdActive,
        requestNote: requestNote ?? null,
      },
    });
    return decision;
  }

  private async requireHold(tenantId: string, holdId: string) {
    const hold = await this.delegate().findFirst({ where: { id: holdId, tenantId } });
    if (!hold) throw new NotFoundException('Legal hold bulunamadı');
    return hold;
  }
}
