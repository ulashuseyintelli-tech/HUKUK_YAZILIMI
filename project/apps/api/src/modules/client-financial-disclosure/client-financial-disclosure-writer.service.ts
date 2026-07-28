import {
  ClientFinancialDisclosureStatus,
  CollectionDispositionBeneficiaryScope,
  CollectionDispositionStatus,
  CollectionStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  assertDisclosureReconciliation,
  buildDisclosureSnapshotPayload,
  buildDisclosureSourceFingerprintPayload,
  canonicalDisclosureLines,
  canonicalMoney,
  disclosureSnapshotHash,
  disclosureSourceFingerprint,
} from './client-financial-disclosure-canonical';
import {
  CLIENT_FINANCIAL_DISCLOSURE_FIRST_VERSION,
  ClientFinancialDisclosureError,
  type CreateDisclosureVersionInput,
  type CreateDisclosureVersionResult,
  type DisclosureLineSnapshotV1,
  type VerifyDisclosureSnapshotResult,
} from './client-financial-disclosure.contract';

/**
 * CLIENT-P2-U03-TRACK-B-I02 — DISCLOSURE SERVICE FOUNDATION AND INVARIANT ENFORCEMENT
 *
 * Canonical sözleşme: charter §35 (mimari) + §38 (I02 contract).
 *
 * DORMANT SINIR (§38.4 / brief §27): bu sınıf BİLEREK bir Nest provider DEĞİLDİR ve
 * production call-site'ı YOKTUR. HTTP controller, REST route, GraphQL resolver, portal
 * fetch veya client-visible DTO ÜRETMEZ. Yalnız daha sonraki, ayrıca yetkilendirilmiş
 * bir owner-gated adaptör tarafından çağrılabilir.
 *   I02 SERVICE EXISTS != DISCLOSURE IS CLIENT-VISIBLE
 *
 * Yaşam döngüsü: bu servis YALNIZ `DRAFT` versiyon üretir. Ofis onayı, içerik onayı,
 * gönderim, yayınlama ve reversal runtime'ları KAPSAM DIŞIDIR (§38.10).
 */
export class ClientFinancialDisclosureWriterService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Yetkili kaynaktan (§35.4) tek transaction içinde disclosure aggregate + version +
   * line zincirini oluşturur. Tüm ownership/source doğrulamaları write'tan ÖNCE ve
   * AYNI transaction içinde yapılır; DB constraint'leri son savunma katmanıdır (§14).
   */
  async createDisclosureVersion(
    input: CreateDisclosureVersionInput,
  ): Promise<CreateDisclosureVersionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Aynı dispozisyon için eşzamanlı yazarları serileştirir (§19/§20/§21).
        // Repository emsali: transactional-claim-item-formation-finalizer.service.ts
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`client-financial-disclosure:${input.tenantId}:${input.collectionDispositionId}`}, 0))`;

        const source = await this.loadAuthorisedSource(tx, input);

        // ── Idempotency / replay (§20) ────────────────────────────────────────────
        const existing = await tx.clientFinancialDisclosure.findFirst({
          where: {
            tenantId: input.tenantId,
            collectionDispositionId: input.collectionDispositionId,
          },
          select: {
            id: true,
            currentVersionId: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                version: true,
                snapshotHash: true,
                sourceFingerprint: true,
                sendIdempotencyKey: true,
              },
            },
          },
        });

        if (existing) {
          const latest = existing.versions[0];
          if (!latest) {
            // Aggregate var, versiyon yok → yarım kalmış durum; sessizce tamamlanmaz.
            throw new ClientFinancialDisclosureError('DISCLOSURE_CONCURRENT_MODIFICATION');
          }
          if (latest.sendIdempotencyKey !== input.sendIdempotencyKey) {
            throw new ClientFinancialDisclosureError('DISCLOSURE_IDEMPOTENCY_CONFLICT');
          }
          if (latest.sourceFingerprint !== source.fingerprint) {
            // Aynı idempotency anahtarı, farklı kaynak durumu → conflict (§20).
            throw new ClientFinancialDisclosureError('DISCLOSURE_IDEMPOTENCY_CONFLICT');
          }
          return {
            disclosureId: existing.id,
            versionId: latest.id,
            version: latest.version,
            snapshotHash: latest.snapshotHash,
            sourceFingerprint: latest.sourceFingerprint,
            replayed: true,
          };
        }

        // ── Snapshot + hash (§15/§16/§17) ─────────────────────────────────────────
        const version = CLIENT_FINANCIAL_DISCLOSURE_FIRST_VERSION;
        const snapshotPayload = buildDisclosureSnapshotPayload({
          tenantId: input.tenantId,
          caseId: input.caseId,
          caseClientId: input.caseClientId,
          clientId: source.clientId,
          collectionDispositionId: input.collectionDispositionId,
          version,
          currency: source.currency,
          sourceCollectionId: source.collectionId,
          sourceCollectionAmount: source.collectionAmount,
          sourceCollectionDate: source.collectionDate,
          dispositionTotalAmount: source.dispositionTotalAmount,
          dispositionPostedAt: source.dispositionPostedAt,
          totalCollected: source.totalCollected,
          clientNetAmount: source.clientNetAmount,
          lines: source.lines,
        });
        assertDisclosureReconciliation({
          lines: source.lines,
          totalCollected: snapshotPayload.totalCollected,
          clientNetAmount: snapshotPayload.clientNetAmount,
        });
        const snapshotHash = disclosureSnapshotHash(snapshotPayload);

        // ── Write (§21 atomicity) ─────────────────────────────────────────────────
        const disclosure = await tx.clientFinancialDisclosure.create({
          data: {
            tenantId: input.tenantId,
            caseId: input.caseId,
            caseClientId: input.caseClientId,
            collectionDispositionId: input.collectionDispositionId,
            currency: source.currency,
          },
          select: { id: true },
        });

        const created = await tx.clientFinancialDisclosureVersion.create({
          data: {
            tenantId: input.tenantId,
            disclosureId: disclosure.id,
            version,
            status: ClientFinancialDisclosureStatus.DRAFT,
            sourceCollectionId: source.collectionId,
            sourceCollectionAmount: source.collectionAmount,
            sourceCollectionDate: source.collectionDate,
            dispositionTotalAmount: source.dispositionTotalAmount,
            dispositionPostedAt: source.dispositionPostedAt,
            currency: source.currency,
            totalCollected: new Prisma.Decimal(snapshotPayload.totalCollected),
            clientNetAmount: new Prisma.Decimal(snapshotPayload.clientNetAmount),
            snapshotHash,
            sourceFingerprint: source.fingerprint,
            sendIdempotencyKey: input.sendIdempotencyKey,
          },
          select: { id: true },
        });

        await tx.clientFinancialDisclosureLine.createMany({
          data: source.lines.map((line) => ({
            tenantId: input.tenantId,
            disclosureVersionId: created.id,
            type: line.type as never,
            amount: new Prisma.Decimal(line.amount),
            sourceDispositionLineId: line.sourceDispositionLineId,
            sortOrder: line.sortOrder,
          })),
        });

        await tx.clientFinancialDisclosure.update({
          where: { id: disclosure.id },
          data: { currentVersionId: created.id },
        });

        // ── TOCTOU son kontrol (§22) ──────────────────────────────────────────────
        // Kaynak, snapshot hazırlandıktan sonra değişmiş olabilir; commit'ten önce
        // yeniden okunup parmak izi karşılaştırılır. Fark varsa transaction düşer.
        const reread = await this.loadAuthorisedSource(tx, input);
        if (reread.fingerprint !== source.fingerprint) {
          throw new ClientFinancialDisclosureError('DISCLOSURE_CONCURRENT_MODIFICATION');
        }

        return {
          disclosureId: disclosure.id,
          versionId: created.id,
          version,
          snapshotHash,
          sourceFingerprint: source.fingerprint,
          replayed: false,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Persist edilmiş versiyonu canonical biçimde yeniden serialize ederek hash'i tekrar
   * üretir (§18). Yalnız MATCH/MISMATCH verdict döndürür; hiçbir write yapmaz, hiçbir
   * status ilerletmez ve hash/payload log'a YAZILMAZ.
   */
  async verifyPersistedSnapshot(input: {
    readonly tenantId: string;
    readonly versionId: string;
  }): Promise<VerifyDisclosureSnapshotResult> {
    const version = await this.prisma.clientFinancialDisclosureVersion.findFirst({
      where: { id: input.versionId, tenantId: input.tenantId },
      select: {
        id: true,
        version: true,
        currency: true,
        snapshotHash: true,
        sourceCollectionId: true,
        sourceCollectionAmount: true,
        sourceCollectionDate: true,
        dispositionTotalAmount: true,
        dispositionPostedAt: true,
        totalCollected: true,
        clientNetAmount: true,
        disclosure: {
          select: {
            caseId: true,
            caseClientId: true,
            collectionDispositionId: true,
            caseClient: { select: { clientId: true } },
          },
        },
        lines: {
          select: { type: true, amount: true, sourceDispositionLineId: true },
        },
      },
    });
    if (!version) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_NOT_FOUND');
    }

    const recomputed = disclosureSnapshotHash(
      buildDisclosureSnapshotPayload({
        tenantId: input.tenantId,
        caseId: version.disclosure.caseId,
        caseClientId: version.disclosure.caseClientId,
        clientId: version.disclosure.caseClient.clientId,
        collectionDispositionId: version.disclosure.collectionDispositionId,
        version: version.version,
        currency: version.currency,
        sourceCollectionId: version.sourceCollectionId,
        sourceCollectionAmount: version.sourceCollectionAmount,
        sourceCollectionDate: version.sourceCollectionDate,
        dispositionTotalAmount: version.dispositionTotalAmount,
        dispositionPostedAt: version.dispositionPostedAt,
        totalCollected: version.totalCollected,
        clientNetAmount: version.clientNetAmount,
        lines: canonicalDisclosureLines(version.lines),
      }),
    );

    return {
      verdict: recomputed === version.snapshotHash ? 'MATCH' : 'MISMATCH',
      versionId: version.id,
      expectedSnapshotHash: version.snapshotHash,
      recomputedSnapshotHash: recomputed,
    };
  }

  /**
   * Immutability guard (§38.7): approved/published/superseded/reversed/cancelled bir
   * versiyonun finansal içeriği YERİNDE güncellenemez — yeni versiyon + supersession
   * zinciri gerekir. Mutasyona izin verilmiyorsa fail-closed hata fırlatır.
   */
  async assertVersionFinancialContentMutable(input: {
    readonly tenantId: string;
    readonly versionId: string;
  }): Promise<void> {
    const version = await this.prisma.clientFinancialDisclosureVersion.findFirst({
      where: { id: input.versionId, tenantId: input.tenantId },
      select: {
        status: true,
        officeApprovedAt: true,
        contentApprovedAt: true,
        publishedAt: true,
        supersededAt: true,
        reversedAt: true,
        cancelledAt: true,
      },
    });
    if (!version) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_NOT_FOUND');
    }

    const lockedStatuses: readonly ClientFinancialDisclosureStatus[] = [
      ClientFinancialDisclosureStatus.OFFICE_APPROVED,
      ClientFinancialDisclosureStatus.CONTENT_APPROVAL_PENDING,
      ClientFinancialDisclosureStatus.CONTENT_APPROVED,
      ClientFinancialDisclosureStatus.SEND_PENDING,
      ClientFinancialDisclosureStatus.SEND_FAILED,
      ClientFinancialDisclosureStatus.PUBLISHED,
      ClientFinancialDisclosureStatus.SUPERSEDED,
      ClientFinancialDisclosureStatus.REVERSED,
      ClientFinancialDisclosureStatus.CANCELLED,
    ];

    const stamped =
      version.officeApprovedAt !== null ||
      version.contentApprovedAt !== null ||
      version.publishedAt !== null ||
      version.supersededAt !== null ||
      version.reversedAt !== null ||
      version.cancelledAt !== null;

    if (stamped || lockedStatuses.includes(version.status)) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_IMMUTABLE');
    }
  }

  /**
   * Yetkili kaynak zincirini tenant+parent scope ile okur ve doğrular (§13).
   * "findUnique(id) → kayıt varsa kabul et" modeli KULLANILMAZ.
   */
  private async loadAuthorisedSource(
    tx: Prisma.TransactionClient,
    input: CreateDisclosureVersionInput,
  ): Promise<{
    readonly clientId: string;
    readonly currency: string;
    readonly collectionId: string;
    readonly collectionAmount: Prisma.Decimal;
    readonly collectionDate: Date;
    readonly dispositionTotalAmount: Prisma.Decimal;
    readonly dispositionPostedAt: Date;
    readonly totalCollected: string;
    readonly clientNetAmount: string;
    readonly lines: readonly DisclosureLineSnapshotV1[];
    readonly fingerprint: string;
  }> {
    // Case: tenant-scoped.
    const kase = await tx.case.findFirst({
      where: { id: input.caseId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!kase) throw new ClientFinancialDisclosureError('DISCLOSURE_TENANT_MISMATCH');

    // CaseClient: case-scoped (tabloda tenantId kolonu YOKTUR — §37.3).
    const caseClient = await tx.caseClient.findFirst({
      where: { id: input.caseClientId, caseId: input.caseId },
      select: { id: true, clientId: true, client: { select: { tenantId: true } } },
    });
    if (!caseClient) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_CASE_CLIENT_MISMATCH');
    }
    // Client tenant'ı input tenant'ı ile aynı olmalı — CaseClient tenant güvencesi vermez.
    if (caseClient.client.tenantId !== input.tenantId) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_TENANT_MISMATCH');
    }

    // Disposition: tenant + case scoped.
    const disposition = await tx.collectionDisposition.findFirst({
      where: {
        id: input.collectionDispositionId,
        tenantId: input.tenantId,
        caseId: input.caseId,
      },
      select: {
        id: true,
        status: true,
        beneficiaryScope: true,
        caseClientId: true,
        collectionId: true,
        totalAmount: true,
        currency: true,
        postedAt: true,
        lines: {
          select: { id: true, type: true, amount: true },
        },
      },
    });
    if (!disposition) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_NOT_FOUND');
    }
    // §35.4: yalnız POSTED dispozisyon disclosure üretebilir.
    if (disposition.status !== CollectionDispositionStatus.POSTED || disposition.postedAt === null) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_STATE_INVALID');
    }
    // §35.3: V1 yalnız SINGLE_CASE_CLIENT; cluster fail-closed reddedilir.
    if (
      disposition.beneficiaryScope !== CollectionDispositionBeneficiaryScope.SINGLE_CASE_CLIENT
    ) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_SCOPE_MISMATCH');
    }
    // Dispozisyonun alacaklısı, disclosure'ın canonical client owner'ı ile aynı olmalı.
    if (disposition.caseClientId !== input.caseClientId) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_CASE_CLIENT_MISMATCH');
    }

    // Collection: tenant + case scoped, CONFIRMED (§35.4).
    const collection = await tx.collection.findFirst({
      where: { id: disposition.collectionId, tenantId: input.tenantId, caseId: input.caseId },
      select: { id: true, status: true, amount: true, currency: true, date: true },
    });
    if (!collection) throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_NOT_FOUND');
    if (collection.status !== CollectionStatus.CONFIRMED) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_STATE_INVALID');
    }
    // Tek disclosure tek para birimi taşır; cross-currency agregasyon YOK (§35.16).
    if (collection.currency !== disposition.currency) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_STATE_INVALID');
    }

    const lines = canonicalDisclosureLines(
      disposition.lines.map((line) => ({
        type: line.type,
        amount: line.amount,
        sourceDispositionLineId: line.id,
      })),
    );

    const totalCollected = canonicalMoney(
      lines.reduce((acc, line) => acc.add(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0)),
    );
    const clientPayable = lines.filter((line) => line.type === 'CLIENT_PAYABLE');
    if (clientPayable.length !== 1) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
    }
    const clientNetAmount = canonicalMoney(clientPayable[0].amount);

    const fingerprint = disclosureSourceFingerprint(
      buildDisclosureSourceFingerprintPayload({
        tenantId: input.tenantId,
        caseId: input.caseId,
        caseClientId: input.caseClientId,
        clientId: caseClient.clientId,
        dispositionId: disposition.id,
        dispositionStatus: disposition.status,
        dispositionBeneficiaryScope: disposition.beneficiaryScope,
        dispositionTotalAmount: disposition.totalAmount,
        dispositionCurrency: disposition.currency,
        dispositionPostedAt: disposition.postedAt,
        collectionId: collection.id,
        collectionStatus: collection.status,
        collectionAmount: collection.amount,
        collectionCurrency: collection.currency,
        collectionDate: collection.date,
        lines,
      }),
    );

    return {
      clientId: caseClient.clientId,
      currency: disposition.currency,
      collectionId: collection.id,
      collectionAmount: collection.amount,
      collectionDate: collection.date,
      dispositionTotalAmount: disposition.totalAmount,
      dispositionPostedAt: disposition.postedAt,
      totalCollected,
      clientNetAmount,
      lines,
      fingerprint,
    };
  }

  /**
   * Ham Prisma hatalarını tiplenmiş domain hatalarına çevirir (§23). Ham hata, SQLSTATE
   * veya stack trace consumer'a SIZDIRILMAZ; finansal payload hata gövdesine yazılmaz.
   */
  private mapError(error: unknown): unknown {
    if (error instanceof ClientFinancialDisclosureError) return error;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? (error.meta?.target as string[]).join(',')
          : String(error.meta?.target ?? '');
        if (target.includes('sendIdempotencyKey')) {
          return new ClientFinancialDisclosureError('DISCLOSURE_IDEMPOTENCY_CONFLICT');
        }
        if (target.includes('version')) {
          return new ClientFinancialDisclosureError('DISCLOSURE_VERSION_CONFLICT');
        }
        return new ClientFinancialDisclosureError('DISCLOSURE_DUPLICATE');
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        return new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_NOT_FOUND');
      }
      if (error.code === 'P2034') {
        return new ClientFinancialDisclosureError('DISCLOSURE_CONCURRENT_MODIFICATION');
      }
      return new ClientFinancialDisclosureError('DISCLOSURE_CONCURRENT_MODIFICATION');
    }

    return error;
  }
}
