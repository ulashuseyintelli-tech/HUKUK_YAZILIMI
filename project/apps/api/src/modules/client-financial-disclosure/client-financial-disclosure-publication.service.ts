import { assertDisclosureRecipient } from './client-financial-disclosure-recipient';
import { loadDisclosureDeliveryEvidence } from './client-financial-disclosure-delivery-evidence';
import {
  ClientFinancialDisclosureStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { domainSeparatedHash } from './client-financial-disclosure-canonical';
import {
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
  isDisclosureDecisionRoleDenied,
} from './client-financial-disclosure-approval-eligibility';
import { CLIENT_FINANCIAL_DISCLOSURE_NOTIFICATION_CONTENT_CONTRACT_VERSION } from './client-financial-disclosure-approval.contract';
import { parseClientFinancialDisclosureRenderOutput } from './client-financial-disclosure-renderer.contract';
import {
  type BeginDisclosureSendInput,
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
  isClientFinancialDisclosureApprovedDispatchReceipt,
  isClientFinancialDisclosureApprovedProvider,
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
          await this.assertPublishablePayload(tx, version);
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
    this.assertProductionProvider();
    let claimed: LoadedVersion;
    try {
      claimed = await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        if (version.publishedAt !== null) {
          throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED');
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        await this.assertPublishablePayload(tx, version);
        const evidence = (await loadDisclosureDeliveryEvidence(tx, [version], this.dispatcher.providerName)).get(version.id);
        if (evidence === 'ACCEPTED') return version;
        if (evidence !== 'NONE') {
          throw new ClientFinancialDisclosurePublicationError(version.sendRequestedAt !== null && version.providerMessageId === null
            ? 'DISCLOSURE_PUBLICATION_SEND_ALREADY_CLAIMED' : 'DISCLOSURE_PUBLICATION_RECONCILIATION_REQUIRED');
        }
        const sendRequestedAt = new Date();
        const claim = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id, tenantId: version.tenantId,
            status: ClientFinancialDisclosureStatus.SEND_PENDING,
            sendRequestedAt: null, publishedAt: null, providerMessageId: null, providerAcceptedAt: null,
          },
          data: { sendRequestedAt },
        });
        this.assertSingleTransition(claim.count);
        return { ...version, sendRequestedAt };
      });
    } catch (error) {
      throw this.mapError(error);
    }
    if (claimed.providerMessageId !== null) return this.publishAccepted(input, claimed);

    // The durable claim precedes transport. An interrupted/throwing transport never releases it.
    const approvedContent = parseClientFinancialDisclosureRenderOutput(claimed.notificationContent as string);
    const dispatch = await this.dispatcher.send({
      to: claimed.approvedRecipientEmail as string,
      subject: approvedContent.subject,
      text: approvedContent.text,
    });
    const messageId = typeof dispatch.messageId === 'string' ? dispatch.messageId.trim() : '';
    const providerReceiptApproved = isClientFinancialDisclosureApprovedDispatchReceipt(this.dispatcher.providerName, dispatch.provider);
    const accepted = dispatch.success && messageId.length > 0 && providerReceiptApproved &&
      (dispatch.deliveryOutcome === undefined || dispatch.deliveryOutcome === 'ACCEPTED');
    if (!accepted) {
      const failureCode = !providerReceiptApproved ? 'DISCLOSURE_PROVIDER_IDENTITY_MISMATCH' :
        dispatch.errorCode ?? (messageId.length === 0 ? 'PROVIDER_MESSAGE_ID_MISSING' : 'PROVIDER_OUTCOME_INDETERMINATE');
      const deliveryOutcome = providerReceiptApproved && !dispatch.success &&
        dispatch.deliveryOutcome === 'REJECTED' ? 'REJECTED' : 'INDETERMINATE';
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
          const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
          this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
          this.assertSameSend(claimed, version);
          if (version.providerMessageId !== null || version.providerAcceptedAt !== null) {
            throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION');
          }
          const moved = await tx.clientFinancialDisclosureVersion.updateMany({
            where: {
              id: version.id, tenantId: version.tenantId, status: ClientFinancialDisclosureStatus.SEND_PENDING,
              sendRequestedAt: claimed.sendRequestedAt, publishedAt: null, providerMessageId: null, providerAcceptedAt: null,
            },
            data: {
              status: ClientFinancialDisclosureStatus.SEND_FAILED,
              sendFailureCode: failureCode, sendFailureDetail: dispatch.errorMessage ?? null,
            },
          });
          this.assertSingleTransition(moved.count);
          await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SEND_FAILED, {
            provider: this.dispatcher.providerName, failureCode, deliveryOutcome,
            sendRequestedAt: claimed.sendRequestedAt!.toISOString(),
          }, { actorType: 'SYSTEM' });
        });
      } catch (error) {
        throw this.mapError(error);
      }
      return {
        disclosureVersionId: claimed.id, previousStatus: ClientFinancialDisclosureStatus.SEND_PENDING,
        status: ClientFinancialDisclosureStatus.SEND_FAILED, replayed: false, sendFailureCode: failureCode,
      };
    }

    // Persist transport facts with their audit BEFORE the publication transaction.
    // If publication later rolls back, retry completes publication without another transport call.
    try {
      claimed = await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
        await this.assertPublishablePayload(tx, version);
        this.assertSameSend(claimed, version);
        const providerAcceptedAt = new Date();
        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id, tenantId: version.tenantId, status: ClientFinancialDisclosureStatus.SEND_PENDING,
            sendRequestedAt: claimed.sendRequestedAt, publishedAt: null, providerMessageId: null, providerAcceptedAt: null,
          },
          data: { providerMessageId: messageId, providerAcceptedAt, sendFailureCode: null, sendFailureDetail: null },
        });
        this.assertSingleTransition(moved.count);
        await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.SENT, {
          provider: dispatch.provider, providerMessageId: messageId,
          providerAcceptedAt: providerAcceptedAt.toISOString(), sendRequestedAt: claimed.sendRequestedAt!.toISOString(),
        }, { actorType: 'SYSTEM' });
        return { ...version, providerMessageId: messageId, providerAcceptedAt, sendFailureCode: null };
      });
      return await this.publishAccepted(input, claimed);
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
    this.assertProductionProvider();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
        const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
        this.assertNotTerminal(version);
        if (version.publishedAt !== null) {
          throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_ALREADY_PUBLISHED');
        }
        await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
        await this.assertPublishablePayload(tx, version);
        const evidence = (await loadDisclosureDeliveryEvidence(tx, [version], this.dispatcher.providerName)).get(version.id);
        if (version.status === ClientFinancialDisclosureStatus.SEND_PENDING && evidence === 'ACCEPTED') {
          return this.result(version, version.status, version.status, true);
        }
        if (version.status === ClientFinancialDisclosureStatus.SEND_PENDING) {
          throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_RECONCILIATION_REQUIRED');
        }
        this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_FAILED);
        if (evidence !== 'REJECTED') {
          throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_RECONCILIATION_REQUIRED');
        }
        const moved = await tx.clientFinancialDisclosureVersion.updateMany({
          where: {
            id: version.id, tenantId: version.tenantId, status: ClientFinancialDisclosureStatus.SEND_FAILED,
            sendRequestedAt: version.sendRequestedAt, publishedAt: null, providerMessageId: null, providerAcceptedAt: null,
          },
          data: {
            status: ClientFinancialDisclosureStatus.SEND_PENDING, sendRequestedAt: null,
            sendFailureCode: null, sendFailureDetail: null,
          },
        });
        this.assertSingleTransition(moved.count);
        return this.result(version, ClientFinancialDisclosureStatus.SEND_FAILED, ClientFinancialDisclosureStatus.SEND_PENDING, false);
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
        }, { actorType: 'USER', userId: input.actorUserId });

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
        }, { actorType: 'USER', userId: input.actorUserId });

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
    if (!isClientFinancialDisclosureApprovedProvider(this.dispatcher.providerName)) {
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
    try {
      parseClientFinancialDisclosureRenderOutput(version.notificationContent);
    } catch {
      throw new ClientFinancialDisclosurePublicationError(
        'DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH',
      );
    }
    await assertDisclosureRecipient(tx, version.tenantId, version.id, version.approvedRecipientEmail, version.approvedRecipientPortalUserId);
  }

  /**
   * §41.3 canonical yeterlilik — I03 ile AYNI saf predikat; ikinci kural ÜRETİLMEZ.
   *
   * B10 (owner GO 2026-09-27): aktörün `Lawyer` ve `User` satırları ÖNCE `FOR SHARE` ile kilitlenir (sıra, yetki
   * iptali yollarıyla AYNI: Lawyer → User); yeterlilik kilit ALTINDA değerlendirilir ve iptalle serileşir. Kilit
   * mantığı `office-approval-execution-authority.ts` ile aynıdır; bu dormant sınıf office-approval modülüne
   * bağımlı olmasın diye burada yerel tutulur. B4: yürütme anında okunan rol VIEWER ise aktör uygun DEĞİLDİR.
   * Yetkili karar gönderimden ÖNCEKİ talep transaction'ıdır; e-posta geri alınamadığı için PUBLISHED geçişi
   * yeniden kontrol ETMEZ (gönderilmiş bildirimi yarım durumda bırakmamak için bilinçli).
   */
  private async assertEligibleActor(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "Lawyer" WHERE "userId" = ${userId} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    const candidate = await tx.user.findUnique({
      where: { id: userId },
      select: { ...DISCLOSURE_APPROVER_CANDIDATE_SELECT, role: true },
    });
    if (!candidate || candidate.tenantId !== tenantId) {
      throw new ClientFinancialDisclosurePublicationAuthorizationError(
        'DISCLOSURE_PUBLICATION_TENANT_MISMATCH',
      );
    }
    if (isDisclosureDecisionRoleDenied(candidate.role) || !isDisclosureApproverEligible(candidate, tenantId)) {
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
  private async publishAccepted(
    input: DispatchDisclosureInput,
    accepted: LoadedVersion,
  ): Promise<DisclosurePublicationTransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, input.tenantId, input.disclosureVersionId);
      const version = await this.loadVersion(tx, input.tenantId, input.disclosureVersionId);
      this.assertNotTerminal(version);
      await this.assertEligibleActor(tx, input.actorUserId, version.tenantId);
      if (version.publishedAt !== null) return this.result(version, version.status, version.status, true);
      this.assertExactStatus(version, ClientFinancialDisclosureStatus.SEND_PENDING);
      await this.assertPublishablePayload(tx, version);
      this.assertSameSend(accepted, version);
      const evidence = (await loadDisclosureDeliveryEvidence(tx, [version], this.dispatcher.providerName)).get(version.id);
      if (evidence !== 'ACCEPTED' || version.providerMessageId !== accepted.providerMessageId ||
          version.providerAcceptedAt?.getTime() !== accepted.providerAcceptedAt?.getTime()) {
        throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_SEND_PROOF_MISSING');
      }
      const moved = await tx.clientFinancialDisclosureVersion.updateMany({
        where: {
          id: version.id, tenantId: version.tenantId, status: ClientFinancialDisclosureStatus.SEND_PENDING,
          publishedAt: null, providerMessageId: version.providerMessageId,
          providerAcceptedAt: version.providerAcceptedAt, sendRequestedAt: version.sendRequestedAt,
        },
        data: { status: ClientFinancialDisclosureStatus.PUBLISHED, publishedAt: new Date() },
      });
      this.assertSingleTransition(moved.count);
      await this.writeAudit(tx, version, CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ACTIONS.PUBLISHED, {
        provider: this.dispatcher.providerName, providerMessageId: version.providerMessageId!,
      }, { actorType: 'USER', userId: input.actorUserId });
      return this.result(version, ClientFinancialDisclosureStatus.SEND_PENDING, ClientFinancialDisclosureStatus.PUBLISHED, false);
    });
  }

  private assertSameSend(before: LoadedVersion, after: LoadedVersion): void {
    if (before.sendRequestedAt?.getTime() !== after.sendRequestedAt?.getTime()) {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_CONCURRENT_TRANSITION');
    }
    if (before.snapshotHash !== after.snapshotHash) {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_STALE_SNAPSHOT');
    }
    if (before.approvedRecipientEmail !== after.approvedRecipientEmail ||
        before.approvedRecipientPortalUserId !== after.approvedRecipientPortalUserId) {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_RECIPIENT_CHANGED');
    }
    if (before.notificationContent !== after.notificationContent || before.notificationContentHash !== after.notificationContentHash) {
      throw new ClientFinancialDisclosurePublicationError('DISCLOSURE_PUBLICATION_CONTENT_HASH_MISMATCH');
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    version: LoadedVersion,
    action: string,
    metadata: Record<string, string | number>,
    actor: { actorType: 'SYSTEM' } | { actorType: 'USER'; userId: string },
  ): Promise<void> {
    if (actor.actorType === 'USER' && (typeof actor.userId !== 'string' || actor.userId.trim().length === 0)) {
      throw new ClientFinancialDisclosurePublicationAuthorizationError('DISCLOSURE_PUBLICATION_NOT_ELIGIBLE');
    }
    await tx.auditLog.create({
      data: {
        tenantId: version.tenantId,
        action,
        entityType: CLIENT_FINANCIAL_DISCLOSURE_AUDIT_ENTITY,
        entityId: version.id,
        actorType: actor.actorType,
        userId: actor.actorType === 'USER' ? actor.userId : null,
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
