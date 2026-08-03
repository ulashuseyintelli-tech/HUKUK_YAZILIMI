import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { decideClientCreate, type ClientMutationActor } from './client-mutation-policy';

/**
 * C3-B02 — İLGİLİ KİŞİ BAŞVURU AKIŞI (§13/6 K6.2-K6.5, model B).
 *
 * Owner ratifikasyonu (decision-log 2026-08-03):
 * - Statü makinesi: RECEIVED → IN_REVIEW → RESPONDED (RESPONDED terminaldir).
 * - Süre (md.13, K6.4): başvuru alınma tarihinden itibaren EN GEÇ 30 GÜN; dueAt create
 *   anında hesaplanır ve saklanır.
 * - Staff başvuruyu KAYDEDEBİLİR ve hazırlık yapabilir; NİHAİ CEVAP yetkilisi DEĞİLDİR.
 * - ERASURE (silme) başvurusunun FİİLÎ yerine getirilmesi POL-E 8-koşul kapısına tabidir
 *   (§13/8 / C3-B03) — bu servis hiçbir kayıt SİLMEZ; yalnız başvuru/cevap belgeleür.
 *
 * YETKİ PROJEKSİYONU (yeni rol sistemi KURULMAZ):
 * - Kayıt + hazırlık (create/startReview): mevcut D01 semantiği (VIEWER DENY, USER/ADMIN
 *   ALLOW) — decideClientCreate TÜKETİLİR.
 * - Nihai cevap + atama: mevcut yükseltilmiş eşik (ADMIN veya
 *   officeApproval.isApproverEligible) — K6.4'ün "partner/manager ve super admin"
 *   ifadesinin sistemdeki mevcut karşılığı budur; ayrı avukat-rol primitive'i İCAT
 *   EDİLMEDİ (fail-closed: eşik ratifiye ifadeden DAR olabilir, GENİŞ olamaz).
 * - Görünürlük (K6.4): yükseltilmiş yetki tüm başvuruları, diğerleri yalnız kendine
 *   atanmış başvuruları görür.
 */

/** md.13 (K6.4 ratifiye): en geç 30 gün. */
export const CLIENT_DSAR_RESPONSE_DAYS = 30;

/** K6.2 — OFİS kanalının ratifiye alt türleri. */
export const CLIENT_DSAR_CHANNELS = [
  'WRITTEN',
  'KEP',
  'REGISTERED_EMAIL',
  'OTHER_ELECTRONIC',
] as const;
export type ClientDsarChannel = (typeof CLIENT_DSAR_CHANNELS)[number];

/** K6.3 — md.11 hak tipleri (ratifiye kapalı liste; şema enum'uyla birebir). */
export const CLIENT_DSAR_TYPES = [
  'ACCESS_CONFIRMATION',
  'INFORMATION',
  'PURPOSE_REVIEW',
  'THIRD_PARTY_DISCLOSURE',
  'RECTIFICATION',
  'ERASURE',
  'THIRD_PARTY_NOTIFICATION',
  'AUTOMATED_DECISION_OBJECTION',
  'DAMAGES',
] as const;
export type ClientDsarType = (typeof CLIENT_DSAR_TYPES)[number];

export function computeDsarDueAt(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + CLIENT_DSAR_RESPONSE_DAYS * 24 * 60 * 60 * 1000);
}

@Injectable()
export class ClientDataSubjectRequestService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  private delegate(tx?: any) {
    const source: any = tx ?? this.prisma;
    return source.clientDataSubjectRequest;
  }

  private assertStaffWrite(actor: ClientMutationActor): void {
    const decision = decideClientCreate(actor);
    if (!decision.allowed) {
      throw new ForbiddenException({ code: decision.reasonCode, message: 'Yetkisiz' });
    }
  }

  private async isElevated(actor: ClientMutationActor, tenantId: string): Promise<boolean> {
    if (!actor?.userId) return false;
    if (actor.role === 'ADMIN') return true;
    return this.officeApproval.isApproverEligible(actor.userId, tenantId);
  }

  private async assertElevated(actor: ClientMutationActor, tenantId: string, what: string) {
    if (!(await this.isElevated(actor, tenantId))) {
      throw new ForbiddenException({
        code: 'DSAR_FINAL_AUTHORITY_REQUIRED',
        message: `${what} yalnız yükseltilmiş yetkiyle yapılır (staff nihai cevap yetkilisi değildir — K6.4)`,
      });
    }
  }

  /** Başvuru kaydı (K6.2): staff kaydedebilir; dueAt = receivedAt + 30 gün (md.13). */
  async createRequest(params: {
    tenantId: string;
    clientId: string;
    type: ClientDsarType;
    channel: ClientDsarChannel;
    receivedAt: Date;
    actor: ClientMutationActor;
    summary?: string;
    assignedToUserId?: string;
  }) {
    const { tenantId, clientId, type, channel, receivedAt, actor, summary, assignedToUserId } =
      params;
    this.assertStaffWrite(actor);
    // Atama nihai-sorumluluk tayinidir → yükseltilmiş yetki (staff kaydeder, atamaz).
    if (assignedToUserId) await this.assertElevated(actor, tenantId, 'Başvuru ataması');

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    const dueAt = computeDsarDueAt(receivedAt);
    return this.prisma.$transaction(async (tx: any) => {
      const created = await this.delegate(tx).create({
        data: {
          tenantId,
          clientId,
          type,
          channel,
          receivedAt,
          dueAt,
          summary: summary ?? null,
          assignedToUserId: assignedToUserId ?? null,
          createdByUserId: actor.userId,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DSAR_RECEIVED',
        entityType: 'CLIENT_DSAR',
        entityId: created.id,
        userId: actor.userId ?? undefined,
        metadata: {
          clientId,
          type,
          channel,
          dueAt: dueAt.toISOString(),
          responseDays: CLIENT_DSAR_RESPONSE_DAYS,
        },
      });
      return created;
    });
  }

  /** Değerlendirmeye alma — staff hazırlık yapabilir (K6.4). */
  async startReview(params: { tenantId: string; requestId: string; actor: ClientMutationActor }) {
    const { tenantId, requestId, actor } = params;
    this.assertStaffWrite(actor);
    const existing = await this.requireRequest(tenantId, requestId);
    this.assertTransition(existing.status, 'IN_REVIEW');

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.delegate(tx).update({
        where: { id: requestId },
        data: { status: 'IN_REVIEW' },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DSAR_REVIEW_START',
        entityType: 'CLIENT_DSAR',
        entityId: requestId,
        userId: actor.userId ?? undefined,
        metadata: { from: existing.status },
      });
      return updated;
    });
  }

  /** Atama — yükseltilmiş yetki. */
  async assign(params: {
    tenantId: string;
    requestId: string;
    assignedToUserId: string;
    actor: ClientMutationActor;
  }) {
    const { tenantId, requestId, assignedToUserId, actor } = params;
    await this.assertElevated(actor, tenantId, 'Başvuru ataması');
    const existing = await this.requireRequest(tenantId, requestId);
    if (existing.status === 'RESPONDED') {
      throw new ConflictException('Cevaplanmış başvuruda atama değiştirilemez');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.delegate(tx).update({
        where: { id: requestId },
        data: { assignedToUserId },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DSAR_ASSIGN',
        entityType: 'CLIENT_DSAR',
        entityId: requestId,
        userId: actor.userId ?? undefined,
        metadata: { assignedToUserId },
      });
      return updated;
    });
  }

  /**
   * NİHAİ CEVAP (K6.4): staff DEĞİL — yükseltilmiş yetki şart. ERASURE tipi için bu kayıt
   * yalnız CEVABI belgeler; fiilî silme/yok etme POL-E 8-koşul kapısına (C3-B03) tabidir
   * ve bu serviste YOKTUR.
   */
  async respond(params: {
    tenantId: string;
    requestId: string;
    responseNote: string;
    actor: ClientMutationActor;
  }) {
    const { tenantId, requestId, responseNote, actor } = params;
    await this.assertElevated(actor, tenantId, 'Nihai cevap');
    const existing = await this.requireRequest(tenantId, requestId);
    this.assertTransition(existing.status, 'RESPONDED');

    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await this.delegate(tx).update({
        where: { id: requestId },
        data: {
          status: 'RESPONDED',
          respondedAt: now,
          respondedByUserId: actor.userId,
          responseNote,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DSAR_RESPOND',
        entityType: 'CLIENT_DSAR',
        entityId: requestId,
        userId: actor.userId ?? undefined,
        metadata: {
          type: existing.type,
          onTime: now.getTime() <= new Date(existing.dueAt).getTime(),
          ...(existing.type === 'ERASURE'
            ? { erasureExecution: 'POL_E_8_CONDITION_GATE_REQUIRED_B03' }
            : {}),
        },
      });
      return updated;
    });
  }

  /** Görünürlük (K6.4): yükseltilmiş yetki tümünü, diğerleri yalnız kendine atananı görür. */
  async listRequests(params: {
    tenantId: string;
    actor: ClientMutationActor;
    clientId?: string;
    status?: string;
  }) {
    const { tenantId, actor, clientId, status } = params;
    if (!actor?.userId) {
      throw new ForbiddenException({ code: 'NO_ACTOR', message: 'Yetkisiz' });
    }
    const elevated = await this.isElevated(actor, tenantId);
    const where: any = { tenantId };
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;
    if (!elevated) where.assignedToUserId = actor.userId;
    return this.delegate().findMany({ where, orderBy: { dueAt: 'asc' } });
  }

  private async requireRequest(tenantId: string, requestId: string) {
    const existing = await this.delegate().findFirst({ where: { id: requestId, tenantId } });
    if (!existing) throw new NotFoundException('Başvuru bulunamadı');
    return existing;
  }

  /** Statü makinesi (K6.5 model B): RESPONDED terminaldir; geçerli geçişler dışındakiler RED. */
  private assertTransition(from: string, to: 'IN_REVIEW' | 'RESPONDED'): void {
    const valid =
      (from === 'RECEIVED' && (to === 'IN_REVIEW' || to === 'RESPONDED')) ||
      (from === 'IN_REVIEW' && to === 'RESPONDED');
    if (!valid) {
      throw new ConflictException(`Geçersiz statü geçişi: ${from} → ${to}`);
    }
  }
}
