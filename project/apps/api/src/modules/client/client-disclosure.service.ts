import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { decideClientCreate, type ClientMutationActor } from './client-mutation-policy';

/**
 * C3-B02 — AYDINLATMA METNİ VERSİYON + TESLİM KAYDI (§13/6 K6.1-K6.2).
 *
 * Owner ratifikasyonu (decision-log 2026-08-03): metin versiyonu, teslim zamanı, yöntem ve
 * teslim edilen versiyon kayıt altına alınır; kanal OFİS'tir.
 *
 * YETKİ PROJEKSİYONU (yeni rol sistemi KURULMAZ, mevcut primitive'ler TÜKETİLİR):
 * - Metin VERSİYONU yayımlamak tenant-genel hukuki artefakttır → mevcut yükseltilmiş eşik
 *   (ADMIN veya officeApproval.isApproverEligible — D02 hassas-alan eşiğiyle aynı kaynak).
 * - TESLİM KAYDI operasyonel staff işidir → mevcut D01 semantiği (VIEWER DENY, USER/ADMIN
 *   ALLOW) decideClientCreate TÜKETİLEREK uygulanır.
 */

/** K6.2 — OFİS kanalının ratifiye alt türleri (geçerli elektronik başvuru dahil). */
export const CLIENT_DISCLOSURE_DELIVERY_METHODS = [
  'WRITTEN',
  'KEP',
  'REGISTERED_EMAIL',
  'OTHER_ELECTRONIC',
  'IN_PERSON',
] as const;
export type ClientDisclosureDeliveryMethod = (typeof CLIENT_DISCLOSURE_DELIVERY_METHODS)[number];

@Injectable()
export class ClientDisclosureService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  private delegate(name: 'clientDisclosureText' | 'clientDisclosureDelivery', tx?: any) {
    const source: any = tx ?? this.prisma;
    return source[name];
  }

  private async assertElevated(actor: ClientMutationActor, tenantId: string): Promise<void> {
    const isAdmin = actor?.role === 'ADMIN';
    const eligible =
      !isAdmin && actor?.userId
        ? await this.officeApproval.isApproverEligible(actor.userId, tenantId)
        : false;
    if (!actor?.userId || (!isAdmin && !eligible)) {
      throw new ForbiddenException({
        code: 'DISCLOSURE_TEXT_ELEVATED_REQUIRED',
        message: 'Aydınlatma metni versiyonu yalnız yükseltilmiş yetkiyle yayımlanır',
      });
    }
  }

  private assertStaffWrite(actor: ClientMutationActor): void {
    const decision = decideClientCreate(actor);
    if (!decision.allowed) {
      throw new ForbiddenException({ code: decision.reasonCode, message: 'Yetkisiz' });
    }
  }

  /** Yeni metin versiyonu (K6.1) — tenant içi ardışık versiyon, audit'li. */
  async createTextVersion(params: {
    tenantId: string;
    actor: ClientMutationActor;
    content: string;
    title?: string;
    effectiveFrom?: Date;
  }) {
    const { tenantId, actor, content, title, effectiveFrom } = params;
    await this.assertElevated(actor, tenantId);

    return this.prisma.$transaction(async (tx: any) => {
      const last = await this.delegate('clientDisclosureText', tx).findFirst({
        where: { tenantId },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;
      const created = await this.delegate('clientDisclosureText', tx).create({
        data: {
          tenantId,
          version,
          title: title ?? null,
          content,
          effectiveFrom: effectiveFrom ?? null,
          createdByUserId: actor.userId,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DISCLOSURE_TEXT_CREATE',
        entityType: 'CLIENT_DISCLOSURE_TEXT',
        entityId: created.id,
        userId: actor.userId ?? undefined,
        metadata: { version },
      });
      return created;
    });
  }

  /** Teslim kaydı (K6.1): hangi müvekkile hangi versiyon, ne zaman, hangi yöntemle. */
  async recordDelivery(params: {
    tenantId: string;
    clientId: string;
    disclosureTextId: string;
    method: ClientDisclosureDeliveryMethod;
    deliveredAt: Date;
    actor: ClientMutationActor;
    note?: string;
  }) {
    const { tenantId, clientId, disclosureTextId, method, deliveredAt, actor, note } = params;
    this.assertStaffWrite(actor);

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
    const text = await this.delegate('clientDisclosureText').findFirst({
      where: { id: disclosureTextId, tenantId },
    });
    if (!text) throw new NotFoundException('Aydınlatma metni versiyonu bulunamadı');

    return this.prisma.$transaction(async (tx: any) => {
      const created = await this.delegate('clientDisclosureDelivery', tx).create({
        data: {
          tenantId,
          clientId,
          disclosureTextId,
          deliveredAt,
          method,
          deliveredByUserId: actor.userId,
          note: note ?? null,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DISCLOSURE_DELIVERY_RECORD',
        entityType: 'CLIENT',
        entityId: clientId,
        userId: actor.userId ?? undefined,
        metadata: { disclosureTextId, version: text.version, method },
      });
      return created;
    });
  }

  async listTexts(tenantId: string) {
    return this.delegate('clientDisclosureText').findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
    });
  }

  async listDeliveries(tenantId: string, clientId: string) {
    return this.delegate('clientDisclosureDelivery').findMany({
      where: { tenantId, clientId },
      orderBy: { deliveredAt: 'desc' },
    });
  }
}
