import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  decideClientUpdate,
  type ClientMutationActor,
} from './client-mutation-policy';
import {
  CLIENT_PROCESSING_BASIS_REGISTRY_VERSION,
  resolveClientProcessingBasis,
  type ClientProcessingActivity,
} from './client-processing-basis.registry';

/**
 * C3-B01 — MÜVEKKİL AÇIK RIZA KAYDI (KVKK md.5/1) — Model C-HİBRİT'in dinamik yarısı.
 *
 * Owner ratifikasyonu (decision-log 2026-08-03 §13/5, K5.3-K5.5):
 * - Açık rıza gereken faaliyetler müvekkil bazlı, TARİHLİ, GERİ ALINABİLİR ve AUDIT'Lİ
 *   kayıtla tutulur.
 * - Geçerli opt-in yoksa faaliyet RED (fail-closed).
 * - Rıza geri alındığında ilgili tercih bayrakları AYNI transaction'da kapatılır.
 *
 * YETKİ KAYNAĞI: İkinci bir rol/capability altyapısı KURULMAZ (C2 freeze). Rıza kaydı,
 * ilgili STANDART tercih alanlarının ön koşuludur; bu yüzden yetki eşiği mevcut
 * `decideClientUpdate` semantiğinin AYNISIDIR (VIEWER DENY, USER/ADMIN ALLOW) ve o
 * fonksiyon TÜKETİLEREK uygulanır — politika dosyası DEĞİŞTİRİLMEZ.
 */

/** Rıza kaydının kapıladığı Client tercih bayrakları (activity → alanlar projeksiyonu). */
export const CLIENT_CONSENT_GATED_FLAGS: Readonly<
  Partial<Record<ClientProcessingActivity, readonly string[]>>
> = {
  GREETING_AND_OPTIONAL_COMMUNICATION: [
    'sendBirthdayGreeting',
    'sendAnniversaryGreeting',
    'sendHolidayGreeting',
  ],
};

export const CLIENT_CONSENT_REASON = {
  CONSENT_REQUIRED: 'KVKK_EXPLICIT_CONSENT_REQUIRED',
  NOT_CONSENT_ACTIVITY: 'ACTIVITY_DOES_NOT_TAKE_CONSENT',
  UNKNOWN_ACTIVITY: 'NO_LEGAL_BASIS_REGISTERED',
} as const;

/**
 * Payload'da opt-in bayrağını AÇAN alanları döndürür (undefined/false açma değildir;
 * mevcut değeri true olan alanda true göndermek geçiş sayılmaz).
 */
export function findConsentGatedFlagsTurningOn(
  payload: Record<string, unknown> | null | undefined,
  existing: Record<string, unknown> | null | undefined,
): string[] {
  if (!payload) return [];
  const gated = CLIENT_CONSENT_GATED_FLAGS.GREETING_AND_OPTIONAL_COMMUNICATION ?? [];
  return gated.filter(
    (f) => payload[f] === true && (existing ? existing[f] !== true : true),
  );
}

/**
 * DI'sız FAIL-CLOSED kapı: client.service create/update yolları constructor değişikliği
 * olmadan bu fonksiyonu kendi prisma handle'ıyla çağırır. Payload rıza-kapılı bir bayrağı
 * AÇIYORSA geçerli opt-in şart; create yolunda (clientId=null) rıza kaydı HENÜZ var
 * olamayacağı için açma talebi her zaman RED'dir (önce oluştur, sonra rıza kaydet).
 */
export async function assertClientConsentGateForWrite(
  prisma: any,
  tenantId: string,
  clientId: string | null,
  payload: Record<string, unknown> | null | undefined,
  existing: Record<string, unknown> | null | undefined,
): Promise<void> {
  const turningOn = findConsentGatedFlagsTurningOn(payload, existing);
  if (turningOn.length === 0) return;
  let ok = false;
  if (clientId !== null) {
    const delegate = prisma?.clientConsent;
    // Fail-closed: delegate yoksa rıza kanıtı da yoktur.
    const row = delegate
      ? await delegate.findFirst({
          where: {
            tenantId,
            clientId,
            activity: 'GREETING_AND_OPTIONAL_COMMUNICATION',
            status: 'GRANTED',
            revokedAt: null,
          },
        })
      : null;
    ok = !!row;
  }
  if (!ok) {
    throw new ForbiddenException({
      code: CLIENT_CONSENT_REASON.CONSENT_REQUIRED,
      message:
        'Geçerli açık rıza kaydı olmadan isteğe bağlı iletişim tercihi açılamaz (KVKK md.5/1; §13/5 K5.5). Önce rıza kaydedin.',
      offendingFields: turningOn,
    });
  }
}

@Injectable()
export class ClientConsentService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private consentDelegate(tx?: any) {
    const source: any = tx ?? this.prisma;
    return source.clientConsent;
  }

  /** Geçerli (GRANTED ve geri alınmamış) opt-in var mı? Fail-closed: delegate yoksa false. */
  async hasActiveConsent(
    tenantId: string,
    clientId: string,
    activity: ClientProcessingActivity,
  ): Promise<boolean> {
    const delegate = this.consentDelegate();
    if (!delegate) return false;
    const row = await delegate.findFirst({
      where: { tenantId, clientId, activity, status: 'GRANTED', revokedAt: null },
    });
    return !!row;
  }

  /**
   * FAIL-CLOSED kapı (K5.5) — DI'lı sarmalayıcı; tek gerçek uygulama
   * `assertClientConsentGateForWrite`tedir (drift olmasın diye delegate edilir).
   */
  async assertConsentGatedFlagsPermitted(
    tenantId: string,
    clientId: string | null,
    payload: Record<string, unknown> | null | undefined,
    existing: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    await assertClientConsentGateForWrite(this.prisma, tenantId, clientId, payload, existing);
  }

  /**
   * Opt-in kaydı (GRANT). Yalnız requiresExplicitConsent=true faaliyetler için geçerlidir.
   * Yeni satır açılır (tarihçe korunur); audit AYNI transaction'da yazılır.
   */
  async grantConsent(params: {
    tenantId: string;
    clientId: string;
    activity: string;
    actor: ClientMutationActor;
    note?: string;
    source?: string;
  }) {
    const { tenantId, clientId, activity, actor, note, source } = params;
    this.assertConsentMutationAuthorized(actor);
    const entry = this.assertConsentActivity(activity);

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    return this.prisma.$transaction(async (tx: any) => {
      const already = await this.consentDelegate(tx).findFirst({
        where: { tenantId, clientId, activity: entry.activity, status: 'GRANTED', revokedAt: null },
      });
      if (already) return already; // idempotent — mevcut geçerli rıza korunur

      const created = await this.consentDelegate(tx).create({
        data: {
          tenantId,
          clientId,
          activity: entry.activity,
          status: 'GRANTED',
          grantedAt: new Date(),
          grantedByUserId: actor.userId,
          source: source ?? 'OFFICE',
          note: note ?? null,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_CONSENT_GRANT',
        entityType: 'CLIENT',
        entityId: clientId,
        userId: actor.userId ?? undefined,
        metadata: {
          activity: entry.activity,
          consentId: created.id,
          registryVersion: CLIENT_PROCESSING_BASIS_REGISTRY_VERSION,
        },
      });
      return created;
    });
  }

  /**
   * Rıza geri alma (REVOKE) — K5.3 "geri alınabilir". Geçerli GRANTED satırı kapatılır ve
   * kapıladığı tercih bayrakları AYNI transaction'da FALSE yapılır (fail-closed).
   */
  async revokeConsent(params: {
    tenantId: string;
    clientId: string;
    activity: string;
    actor: ClientMutationActor;
    note?: string;
  }) {
    const { tenantId, clientId, activity, actor, note } = params;
    this.assertConsentMutationAuthorized(actor);
    const entry = this.assertConsentActivity(activity);

    const active = await this.consentDelegate().findFirst({
      where: { tenantId, clientId, activity: entry.activity, status: 'GRANTED', revokedAt: null },
    });
    if (!active) throw new NotFoundException('Geri alınacak geçerli rıza kaydı yok');

    const gatedFlags = CLIENT_CONSENT_GATED_FLAGS[entry.activity] ?? [];
    return this.prisma.$transaction(async (tx: any) => {
      const revoked = await this.consentDelegate(tx).update({
        where: { id: active.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByUserId: actor.userId,
          note: note ?? active.note,
        },
      });
      if (gatedFlags.length > 0) {
        const off: Record<string, boolean> = {};
        for (const f of gatedFlags) off[f] = false;
        // tenant-scoped yazım (P0.5 deseni)
        await tx.client.updateMany({ where: { id: clientId, tenantId }, data: off });
      }
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_CONSENT_REVOKE',
        entityType: 'CLIENT',
        entityId: clientId,
        userId: actor.userId ?? undefined,
        metadata: {
          activity: entry.activity,
          consentId: active.id,
          flagsForcedOff: gatedFlags,
          registryVersion: CLIENT_PROCESSING_BASIS_REGISTRY_VERSION,
        },
      });
      return revoked;
    });
  }

  async listConsents(tenantId: string, clientId: string) {
    const delegate = this.consentDelegate();
    if (!delegate) return [];
    return delegate.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Yetki: mevcut D02 standart-güncelleme semantiği TÜKETİLİR (eşik icat edilmez). */
  private assertConsentMutationAuthorized(actor: ClientMutationActor): void {
    const gated = CLIENT_CONSENT_GATED_FLAGS.GREETING_AND_OPTIONAL_COMMUNICATION ?? [];
    const probe: Record<string, unknown> = {};
    for (const f of gated) probe[f] = true;
    const decision = decideClientUpdate(actor, probe);
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: decision.reasonCode,
        message: 'Rıza kaydı için yetkiniz yok',
      });
    }
  }

  /** Yalnız açık-rıza faaliyetleri kabul edilir; bilinmeyen faaliyet fail-closed RED. */
  private assertConsentActivity(activity: string) {
    const entry = resolveClientProcessingBasis(activity);
    if (!entry) {
      throw new ForbiddenException({
        code: CLIENT_CONSENT_REASON.UNKNOWN_ACTIVITY,
        message: 'Registry dışı faaliyet: hukuki dayanak kaydı yok (fail-closed RED)',
      });
    }
    if (!entry.requiresExplicitConsent) {
      throw new ForbiddenException({
        code: CLIENT_CONSENT_REASON.NOT_CONSENT_ACTIVITY,
        message: 'Bu faaliyet açık rıza ile değil, kayıtlı md.5/2 dayanağıyla yürür',
      });
    }
    return entry;
  }
}
