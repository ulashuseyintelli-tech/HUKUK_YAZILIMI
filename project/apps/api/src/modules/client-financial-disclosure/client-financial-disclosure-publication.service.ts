import {
  ClientFinancialDisclosureStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { domainSeparatedHash } from './client-financial-disclosure-canonical';
import {
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
} from './client-financial-disclosure-approval-eligibility';
import { CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION } from './client-financial-disclosure-approval.contract';
import {
  type BeginDisclosureSendInput,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS,
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS,
  CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
  ClientFinancialDisclosurePublicationAuthorizationError,
  ClientFinancialDisclosurePublicationError,
  type DisclosureNotificationDispatcher,
  type DisclosurePublicationTransitionResult,
  type DispatchDisclosureInput,
  type ReverseDisclosureInput,
  type RetryDisclosureSendInput,
  type SupersedeDisclosureInput,
} from './client-financial-disclosure-publication.contract';
import { verifyPersistedDisclosureSnapshot } from './client-financial-disclosure-writer.service';

const TERMINAL_STATUSES: readonly ClientFinancialDisclosureStatus[] = [
  ClientFinancialDisclosureStatus.SUPERSEDED,
  ClientFinancialDisclosureStatus.CANCELLED,
  ClientFinancialDisclosureStatus.REVERSED,
];

const VERSION_SELECT = {
  id: true,
  tenantId: true,
  disclosureId: true,
  version: true,
  status: true,
  snapshotHash: true,
  officeApprovedById: true,
  contentApprovedById: true,
  notificationContent: true,
  notificationContentHash: true,
  approvedRecipientEmail: true,
  approvedRecipientPortalUserId: true,
  sendRequestedAt: true,
  providerMessageId: true,
  providerAcceptedAt: true,
  sendFailureCode: true,
  publishedAt: true,
  supersedesVersionId: true,
  supersededAt: true,
  reversedAt: true,
  cancelledAt: true,
  correctionReason: true,
} as const;

type LoadedVersion = {
  id: string;
  tenantId: string;
  disclosureId: string;
  version: number;
  status: ClientFinancialDisclosureStatus;
  snapshotHash: string;
  officeApprovedById: string | null;
  contentApprovedById: string | null;
  notificationContent: string | null;
  notificationContentHash: string | null;
  approvedRecipientEmail: string | null;
  approvedRecipientPortalUserId: string | null;
  sendRequestedAt: Date | null;
  providerMessageId: string | null;
  providerAcceptedAt: Date | null;
  sendFailureCode: string | null;
  publishedAt: Date | null;
  supersedesVersionId: string | null;
  supersededAt: Date | null;
  reversedAt: Date | null;
  cancelledAt: Date | null;
  correctionReason: string | null;
};

/**
 * CLIENT-P2-U03-TRACK-B-I04 — SEND, PUBLICATION AND REVERSAL RUNTIME
 *
 * Canonical sözleşme: charter §35.7 / §35.10 / §35.11 / §35.13 (+ §42 ile kapanan I03 zinciri).
 *
 * DORMANT SINIR (I02/I03 emsali): bu sınıf BİLEREK bir Nest provider DEĞİLDİR ve production
 * call-site'ı YOKTUR. HTTP controller, REST route, GraphQL resolver, portal fetch veya
 * client-visible DTO ÜRETMEZ. Gönderim, provider portu üzerinden yapılır; Nest'in
 * `EmailProviderService`'ine DOĞRUDAN bağlanmaz.
 *
 * §35.11 ZORUNLU SIRA — birebir uygulanır:
 * ```text
 * (1) SEND_PENDING'i KALICI commit et                 -> beginSend()
 * (2) provider cagrisini DB transaction'i DISINDA yap -> dispatchAndPublish() 2. adim
 * (3) gercek-provider kabulu + message ID zorunlu     -> assertProductionProvider + kanit kapisi
 * (4) snapshot / icerik / alici baglamalarini YENIDEN dogrula
 * (5) PUBLISHED'e TEK idempotent, guarded DB gecisi
 * (6) provider-kabul (SENT) ve yayinlama olaylarini AYRI AYRI kaydet
 * ```
 *
 * Sistem ONLER: gönderim kanıtı olmadan yayınlama · kalıcı versiyon olmadan gönderim ·
 * çift gönderim · çift yayınlama · stale onay yayınlaması · değişmiş-alıcı yayınlaması.
 */
export class ClientFinancialDisclosurePublicationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dispatcher: DisclosureNotificationDispatcher,
  ) {}

  /**
   * §35.11 (1) — `CONTENT_APPROVED → SEND_PENDING`. Provider'a HİÇBİR ŞEY gönderilmeden
   * önce niyet kalıcı olarak commit edilir; böylece "kalıcı disclosure versiyonu olmadan
   * bildirim gönderimi" ve kanıtsız yayınlama yapısal olarak imkânsızdır.
   */
  async beginSend(
    input: BeginDisclosureSendInput,
  ): Promise<DisclosurePublicationTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);

        if (version.status === ClientFinancialDisclosureStatus.SEND_PENDING) {
          return this.result(version, version.status, version.status, true);
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.CONTENT_APPROVED);
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        await this.assertPublishablePayload(tx, version);

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.CONTENT_APPROVED,
            publishedAt: null,
          },
          data: { status: ClientFinancialDisclosureStatus.SEND_PENDING },
        });
        this.assertSingleTransition(moved.count);

        return this.result(
          version,
          ClientFinancialDisclosureStatus.CONTENT_APPROVED,
          ClientFinancialDisclosureStatus.SEND_PENDING,
          false,
        );
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * §35.11 (2)–(6). Provider çağrısı BİLEREK transaction DIŞINDADIR. Çift gönderim,
   * `sendRequestedAt` üzerinden koşullu bir SAHİPLENME (claim) ile engellenir: yalnız
   * `sendRequestedAt`i `NULL`dan bugüne çevirebilen çağıran provider'a gider.
   */
  async dispatchAndPublish(
    input: DispatchDisclosureInput,
  ): Promise<DisclosurePublicationTransitionResult> {
    // §35.10 — mock/onaysız provider yayınlamayı ASLA yetkilendiremez. Guard, provider'a
    // tek bir byte gitmeden ÖNCE çalışır.
    this.assertProductionProvider();

    let claimed: LoadedVersion;
    try {
      claimed = await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        if (version.publishedAt !== null) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED',
          );
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        await this.assertPublishablePayload(tx, version);

        const claim = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.SEND_PENDING,
            sendRequestedAt: null,
            publishedAt: null,
          },
          data: { sendRequestedAt: new Date() },
        });
        if (claim.count !== 1) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_SEND_ALREADY_CLAIMED',
          );
        }
        return version;
      });
    } catch (error) {
      throw this.mapError(error);
    }

    // ── (2) PROVIDER ÇAĞRISI — TRANSACTION DIŞINDA ─────────────────────────────
    const dispatch = await this.dispatcher.send({
      to: claimed.approvedRecipientEmail as string,
      subject: input.subject,
      text: claimed.notificationContent as string,
    });

    // ── (3) GERÇEK KABUL + KALICI MESSAGE ID ZORUNLU ───────────────────────────
    const messageId = typeof dispatch.messageId === 'string' ? dispatch.messageId.trim() : '';
    if (!dispatch.success || messageId.length === 0) {
      // Eksik message ID -> SEND_FAILED (§35.10). Provider hata DETAYI yalnız internal.
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.clientFinancialDisclosureVersion.updateMany({
            where: { id: claimed.id, tenantId: claimed.tenantId, publishedAt: null },
            data: {
              status: ClientFinancialDisclosureStatus.SEND_FAILED,
              sendFailureCode: dispatch.errorCode ?? 'PROVIDER_MESSAGE_ID_MISSING',
              sendFailureDetail: dispatch.errorMessage ?? null,
            },
          });
          await this.writeAudit(tx, claimed, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED, {
            provider: this.dispatcher.providerName,
            failureCode: dispatch.errorCode ?? 'PROVIDER_MESSAGE_ID_MISSING',
          });
        });
      } catch (error) {
        throw this.mapError(error);
      }
      return {
        disclosureVersionId: claimed.id,
        previousStatus: ClientFinancialDisclosureStatus.SEND_PENDING,
        status: ClientFinancialDisclosureStatus.SEND_FAILED,
        replayed: false,
        sendFailureCode: dispatch.errorCode ?? 'PROVIDER_MESSAGE_ID_MISSING',
      };
    }

    // ── (4)(5)(6) YENİDEN DOĞRULAMA + TEK GUARDED GEÇİŞ + AUDIT ────────────────
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);

        if (version.publishedAt !== null) {
          return this.result(version, version.status, version.status, true);
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
        // (4) snapshot / içerik / alıcı bağlamaları gönderimden SONRA da doğrulanır;
        // alıcı gönderim ile yayınlama arasında değişmiş olamaz.
        await this.assertPublishablePayload(tx, version);
        if (version.approvedRecipientEmail !== claimed.approvedRecipientEmail) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_RECIPIENT_CHANGED',
          );
        }
        if (version.snapshotHash !== claimed.snapshotHash) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_STALE_SNAPSHOT',
          );
        }

        const now = new Date();
        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.SEND_PENDING,
            publishedAt: null,
            providerMessageId: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.PUBLISHED,
            providerMessageId: messageId,
            providerAcceptedAt: now,
            publishedAt: now,
            sendFailureCode: null,
            sendFailureDetail: null,
          },
        });
        this.assertSingleTransition(moved.count);

        // (6) provider-kabul (SENT) ve yayınlama olayları AYRI kayıtlardır.
        await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT, {
          provider: this.dispatcher.providerName,
          providerMessageId: messageId,
        });
        await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.PUBLISHED, {
          provider: this.dispatcher.providerName,
          providerMessageId: messageId,
        });

        return {
          disclosureVersionId: version.id,
          previousStatus: ClientFinancialDisclosureStatus.SEND_PENDING,
          status: ClientFinancialDisclosureStatus.PUBLISHED,
          replayed: false,
          providerMessageId: messageId,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * §35.7 `SEND_FAILED ⟲` — başarısız gönderimi yeniden denenebilir hale getirir.
   * Gönderim sahiplenmesi (`sendRequestedAt`) BİLEREK burada, ayrı ve guarded bir
   * operatör eylemiyle serbest bırakılır; `dispatchAndPublish` kendi kendine sıfırlayamaz.
   */
  async retrySend(input: RetryDisclosureSendInput): Promise<DisclosurePublicationTransitionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        if (version.publishedAt !== null) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED',
          );
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_FAILED);
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        await this.assertPublishablePayload(tx, version);

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.SEND_FAILED,
            publishedAt: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.SEND_PENDING,
            sendRequestedAt: null,
          },
        });
        this.assertSingleTransition(moved.count);

        return this.result(
          version,
          ClientFinancialDisclosureStatus.SEND_FAILED,
          ClientFinancialDisclosureStatus.SEND_PENDING,
          false,
        );
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * §35.13 — `PUBLISHED → REVERSED`. Geçmiş ASLA silinmez: satır korunur, yalnız
   * `reversedAt` + client-safe `correctionReason` damgalanır.
   */
  async reversePublishedVersion(
    input: ReverseDisclosureInput,
  ): Promise<DisclosurePublicationTransitionResult> {
    const reason = input.correctionReason?.trim() ?? '';
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);

        if (version.status === ClientFinancialDisclosureStatus.REVERSED) {
          return this.result(version, version.status, version.status, true);
        }
        this.assertNotTerminal(version);
        // Yalnız PUBLISHED'ten ulaşılabilir (§35.7).
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.PUBLISHED);
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        if (reason.length === 0) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_STATUS_INVALID',
          );
        }

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id,
            tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.PUBLISHED,
            reversedAt: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.REVERSED,
            reversedAt: new Date(),
            correctionReason: reason,
          },
        });
        this.assertSingleTransition(moved.count);
        await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.REVERSED, {
          provider: this.dispatcher.providerName,
        });

        return this.result(
          version,
          ClientFinancialDisclosureStatus.PUBLISHED,
          ClientFinancialDisclosureStatus.REVERSED,
          false,
        );
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * §35.13 — düzeltme zinciri. Yayınlanmış versiyon `SUPERSEDED` olur ve yeni versiyon ona
   * `supersedesVersionId` ile bağlanır. `@@unique([tenantId, supersedesVersionId])` bir
   * versiyonun en fazla BİR kez supersede edilmesini DB seviyesinde garanti eder.
   * Kısayol YOKTUR: yeni versiyonun kendi ofis + içerik onayı tamamlanmış olmalıdır.
   */
  async supersedePublishedVersion(
    input: SupersedeDisclosureInput,
  ): Promise<DisclosurePublicationTransitionResult> {
    const reason = input.correctionReason?.trim() ?? '';
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Deterministik kilit sırası (deadlock önlemi): id'ye göre sıralı.
        for (const id of [input.supersededVersionId, input.supersedingVersionId].sort()) {
          await this.lockVersion(tx, input.tenantId, id);
        }
        const old = await this.loadVersion(tx, input.tenantId, input.supersededVersionId);
        const fresh = await this.loadVersion(tx, input.tenantId, input.supersedingVersionId);

        if (old.status === ClientFinancialDisclosureStatus.SUPERSEDED) {
          return this.result(old, old.status, old.status, true);
        }
        if (
          old.id === fresh.id ||
          old.disclosureId !== fresh.disclosureId ||
          old.status !== ClientFinancialDisclosureStatus.PUBLISHED ||
          fresh.version <= old.version ||
          TERMINAL_STATUSES.includes(fresh.status) ||
          fresh.contentApprovedById === null ||
          fresh.officeApprovedById === null
        ) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_SUPERSESSION_INVALID',
          );
        }
        await this.assertEligibleActor(tx, input.actorUserId, old.tenantId);
        if (reason.length === 0) {
          throw new ClientFinancialDisclosurePublicationError(
            'DISCLOSURE_PUBLICATION_STATUS_INVALID',
          );
        }

        const linked = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: fresh.id,
            tenantId: fresh.tenantId,
            supersedesVersionId: null,
          },
          data: { supersedesVersionId: old.id, correctionReason: reason },
        });
        this.assertSingleTransition(linked.count);

        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: old.id,
            tenantId: old.tenantId,
            status: ClientFinancialDisclosureStatus.PUBLISHED,
            supersededAt: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.SUPERSEDED,
            supersededAt: new Date(),
          },
        });
        this.assertSingleTransition(moved.count);
        await this.writeAudit(tx, old, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SUPERSEDED, {
          provider: this.dispatcher.providerName,
          supersedingVersion: fresh.version,
        });

        return this.result(
          old,
          ClientFinancialDisclosureStatus.PUBLISHED,
          ClientFinancialDisclosureStatus.SUPERSEDED,
          false,
        );
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ── Ortak kapılar ────────────────────────────────────────────────────────────

  /** §35.10 production invariant'ı — mock veya onaysız provider fail-closed reddedilir. */
  private assertProductionProvider(): void {
    const name = (this.dispatcher.providerName ?? '').trim().toLowerCase();
    if (!(CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS as readonly string[]).includes(name)) {
      throw new ClientFinancialDisclosurePublicationAuthorizationError(
        'DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION',
      );
    }
  }

  private async lockVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`client-financial-disclosure-publication:${tenantId}:${versionId}`}, 0))`;
  }

  private async loadVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ): Promise<LoadedVersion> {
    const version = await tx.clientFinancialDisclosureVersion.findFirst({
      where: { id: versionId, tenantId },
      select: VERSION_SELECT,
    });
    if (!version) {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_VERSION_NOT_FOUND',
      );
    }
    return version;
  }

  private assertNotTerminal(version: LoadedVersion): void {
    if (
      version.supersededAt !== null ||
      version.cancelledAt !== null ||
      version.reversedAt !== null ||
      TERMINAL_STATUSES.includes(version.status)
    ) {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_VERSION_TERMINAL',
      );
    }
  }

  private assertExactStatus(
    version: LoadedVersion,
    expected: ClientFinancialDisclosureStatus,
  ): void {
    if (version.status !== expected) {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_STATUS_INVALID');
    }
  }

  /**
   * §35.11 (4) — yayınlanabilirlik kapısı: snapshot MATCH, içerik hash MATCH ve alıcı
   * bağlaması mevcut. Gönderim öncesinde VE sonrasında ayrı ayrı çalışır.
   */
  private async assertPublishablePayload(
    tx: Prisma.TransactionClient,
    version: LoadedVersion,
  ): Promise<void> {
    if (
      !version.notificationContent ||
      !version.notificationContentHash ||
      !version.approvedRecipientEmail ||
      !version.contentApprovedById ||
      !version.officeApprovedById
    ) {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_RECIPIENT_MISSING',
      );
    }
    const verdict = await verifyPersistedDisclosureSnapshot(tx, {
      tenantId: version.tenantId,
      versionId: version.id,
    });
    if (verdict.verdict !== 'MATCH') {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_STALE_SNAPSHOT');
    }
    const recomputed = domainSeparatedHash(
      CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
      {
        contractVersion: CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION,
        tenantId: version.tenantId,
        disclosureVersionId: version.id,
        snapshotHash: version.snapshotHash,
        notificationContent: version.notificationContent,
        approvedRecipientEmail: version.approvedRecipientEmail,
        approvedRecipientPortalUserId: version.approvedRecipientPortalUserId,
      },
    );
    if (recomputed !== version.notificationContentHash) {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH',
      );
    }
  }

  /** §41.3 canonical yeterlilik — I03 ile AYNI saf predikat; ikinci kural ÜRETİLMEZ. */
  private async assertEligibleActor(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const candidate = await tx.user.findUnique({
      where: { id: userId },
      select: DISCLOSURE_APPROVER_CANDIDATE_SELECT,
    });
    if (!candidate || candidate.tenantId !== tenantId) {
      throw new ClientFinancialDisclosurePublicationAuthorizationError(
        'DISCLOSURE_PUBLICATION_TENANT_MISMATCH',
      );
    }
    if (!isDisclosureApproverEligible(candidate, tenantId)) {
      throw new ClientFinancialDisclosurePublicationAuthorizationError(
        'DISCLOSURE_PUBLICATION_NOT_ELIGIBLE',
      );
    }
  }

  private assertSingleTransition(count: number): void {
    if (count !== 1) {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION',
      );
    }
  }

  /**
   * §35.11 (6) audit izi. Metadata'ya finansal tutar, alıcı e-postası, bildirim içeriği,
   * snapshot/içerik hash'i veya provider hata DETAYI YAZILMAZ (§35.14) — yalnız
   * versiyon kimliği, provider adı ve kalıcı provider message ID tutulur.
   */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    version: LoadedVersion,
    action: string,
    metadata: Record<string, string | number>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: version.tenantId,
        action,
        entityType: CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
        entityId: version.id,
        actorType: 'SYSTEM',
        decisionResult: 'ALLOWED',
        reasonCode: action,
        metadata: {
          disclosureId: version.disclosureId,
          version: version.version,
          ...metadata,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private result(
    version: LoadedVersion,
    previousStatus: ClientFinancialDisclosureStatus,
    status: ClientFinancialDisclosureStatus,
    replayed: boolean,
  ): DisclosurePublicationTransitionResult {
    return {
      disclosureVersionId: version.id,
      previousStatus,
      status,
      replayed,
      ...(version.providerMessageId ? { providerMessageId: version.providerMessageId } : {}),
    };
  }

  /** Ham Prisma/provider hatası, SQLSTATE veya stack trace consumer'a ASLA sızdırılmaz. */
  private mapError(error: unknown): unknown {
    if (
      error instanceof ClientFinancialDisclosurePublicationError ||
      error instanceof ClientFinancialDisclosurePublicationAuthorizationError
    ) {
      return error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return new ClientFinancialDisclosurePublicationError(
          'DISCLOSURE_PUBLICATION_VERSION_NOT_FOUND',
        );
      }
      return new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION',
      );
    }
    return error;
  }
}
