import { assertK73AccessInTx } from './client-special-category-access';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { type ClientMutationActor } from './client-mutation-policy';

/**
 * C3-B04 — ÖZEL NİTELİKLİ VERİ YÖNETİMİ (§13/7 K7.1-K7.5, model B).
 *
 * Owner ratifikasyonu (decision-log 2026-08-03):
 * - K7.1: kapsam KVKK md.6 KAPALI kategori listesidir; nationality ve gender tek başına
 *   özel nitelikli SAYILMAZ (bu blok o alanları yeniden sınıflandırmaz).
 * - K7.2: genel notes alanına özel nitelikli veri girişi YASAKTIR; bu veri YALNIZ bu
 *   sınıflandırılmış, erişim-kapılı akışta tutulur. Serbest metnin semantik tespiti
 *   otomatikleştirilemez — ihlal tespiti K7.4 WAVE-4 read-only envanter taramasının
 *   işidir; bu servis korumalı alternatif akışı sağlar.
 * - K7.3 (bu blokta uygulanan teknik önlemler): kriptografik saklama (AES-256-GCM,
 *   uygulama seviyesi) + AYRI anahtar yönetimi (DB dışı, env: CLIENT_SPECIAL_CATEGORY_DATA_KEY,
 *   base64 32 bayt) + least-privilege erişim kapısı (yükseltilmiş yetki) + her erişimde
 *   AYRI audit + liste yanıtında maskeleme (içerik asla listelenmez) + export ucu YOK.
 *   B04'te eksik kalan süreli kişi/nesne/işlem yetkisi ve görev değişiminde kapatma,
 *   CLIENT-SPECIAL-CATEGORY-K73-SA01 ile eklenir. MFA, periyodik yetki kontrolü ve
 *   genel güvenlik programı bu dar teslimin dışında kalır.
 * - K7.4: mevcut veri taraması BU BLOKTA YOKTUR (yalnız WAVE 4, read-only, ayrı yetki).
 * - Silme YOKTUR: özel nitelikli kayıt da POL-E 8-koşul kapısına (C3-B03) tabidir.
 *
 * FAIL-CLOSED anahtar kuralı: anahtar yoksa/geçersizse yazma ve okuma REDDEDİLİR;
 * düz metin fallback YOKTUR.
 */

export const CLIENT_SPECIAL_CATEGORY_KEY_ENV = 'CLIENT_SPECIAL_CATEGORY_DATA_KEY';

/** KVKK md.6/1 kapalı listesi (K7.1) — şema enum'uyla birebir. */
export const CLIENT_SPECIAL_DATA_CATEGORIES = [
  'RACE_ETHNIC_ORIGIN',
  'POLITICAL_OPINION',
  'PHILOSOPHICAL_BELIEF',
  'RELIGION_SECT',
  'APPEARANCE_DRESS',
  'ASSOCIATION_FOUNDATION_UNION_MEMBERSHIP',
  'HEALTH',
  'SEXUAL_LIFE',
  'CRIMINAL_CONVICTION_SECURITY_MEASURES',
  'BIOMETRIC',
  'GENETIC',
] as const;
export type ClientSpecialDataCategoryCode = (typeof CLIENT_SPECIAL_DATA_CATEGORIES)[number];

const PACK_VERSION = 'v1';

/** AES-256-GCM paketleme: v1:<iv>:<authTag>:<ciphertext> (base64 parçalar). */
export function encryptSpecialContent(keyB64: string, plaintext: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('SPECIAL_DATA_KEY_INVALID');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PACK_VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSpecialContent(keyB64: string, packed: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('SPECIAL_DATA_KEY_INVALID');
  const [version, ivB64, tagB64, ctB64] = packed.split(':');
  if (version !== PACK_VERSION || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('SPECIAL_DATA_PACK_INVALID');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

@Injectable()
export class ClientSpecialCategoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  private delegate(tx?: any) {
    const source: any = tx ?? this.prisma;
    return source.clientSpecialCategoryRecord;
  }

  /** FAIL-CLOSED anahtar: yoksa işlem REDDEDİLİR (düz metin fallback yok). */
  private requireKey(): string {
    const key = process.env[CLIENT_SPECIAL_CATEGORY_KEY_ENV];
    if (!key) {
      throw new ServiceUnavailableException({
        code: 'SPECIAL_DATA_KEY_NOT_CONFIGURED',
        message:
          'Özel nitelikli veri anahtarı yapılandırılmamış — işlem fail-closed reddedildi (K7.3)',
      });
    }
    return key;
  }

  private assertCategory(category: string): ClientSpecialDataCategoryCode {
    if (!(CLIENT_SPECIAL_DATA_CATEGORIES as readonly string[]).includes(category)) {
      throw new ForbiddenException({
        code: 'NOT_A_SPECIAL_CATEGORY',
        message: 'Kategori KVKK md.6 kapalı listesinde değil (K7.1) — fail-closed RED',
      });
    }
    return category as ClientSpecialDataCategoryCode;
  }

  /** Kayıt oluşturma: elevated + geçerli md.6 kategorisi + şifreli saklama + audit. */
  async createRecord(params: {
    tenantId: string;
    clientId: string;
    category: string;
    content: string;
    actor: ClientMutationActor;
    caseId?: string;
  }) {
    const { tenantId, clientId, content, actor } = params;
    const category = this.assertCategory(params.category);
    return this.prisma.$transaction(async (tx: any) => {
      const access = await assertK73AccessInTx(tx, this.officeApproval, tenantId, actor?.userId, 'CREATE', clientId, params.caseId);
      const contentEncrypted = encryptSpecialContent(this.requireKey(), content);
      const created = await this.delegate(tx).create({
        data: { tenantId, clientId, category, contentEncrypted, createdByUserId: actor.userId },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_SPECIAL_DATA_CREATE',
        entityType: 'CLIENT_SPECIAL_DATA',
        entityId: created.id,
        userId: actor.userId ?? undefined,
        // Yalnız kategori ve kayıt kimliği — İÇERİK ASLA audit'e yazılmaz.
        metadata: { clientId, category, accessScopeId: access.id },
      });
      return { id: created.id, category: created.category, createdAt: created.createdAt };
    });
  }

  /** Liste: MASKELİ — içerik asla dönmez (K7.3 maskeleme). */
  async listRecords(params: { tenantId: string; clientId: string; actor: ClientMutationActor; caseId?: string }) {
    const { tenantId, clientId, actor } = params;
    return this.prisma.$transaction(async (tx: any) => {
      await assertK73AccessInTx(tx, this.officeApproval, tenantId, actor?.userId, 'LIST', clientId, params.caseId);
      const rows = await this.delegate(tx).findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r: any) => ({
        id: r.id,
        category: r.category,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
      }));
    });
  }

  /** Detay okuma: elevated + HER ERİŞİM ayrı audit (K7.3) + çözülmüş içerik. */
  async readRecord(params: { tenantId: string; recordId: string; actor: ClientMutationActor; caseId?: string }) {
    const { tenantId, recordId, actor } = params;
    return this.prisma.$transaction(async (tx: any) => {
      const row = await this.delegate(tx).findFirst({ where: { id: recordId, tenantId } });
      if (!row) throw new NotFoundException('Kayıt bulunamadı');
      const access = await assertK73AccessInTx(tx, this.officeApproval, tenantId, actor?.userId, 'READ', row.clientId, params.caseId);
      const key = this.requireKey();
      const content = decryptSpecialContent(key, row.contentEncrypted);
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_SPECIAL_DATA_ACCESS',
        entityType: 'CLIENT_SPECIAL_DATA',
        entityId: recordId,
        userId: actor.userId ?? undefined,
        metadata: { clientId: row.clientId, category: row.category, accessScopeId: access.id },
      });
      return {
        id: row.id,
        clientId: row.clientId,
        category: row.category,
        content,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        accessExpiresAt: access.validUntil.toISOString(),
      };
    });
  }
}
