import {
  ClientFinancialDisclosureStatus,
  type CollectionDispositionLineType,
  type PrismaClient,
} from '@prisma/client';
import { canonicalMoney } from './client-financial-disclosure-canonical';
import {
  CLIENT_DISCLOSURE_ALLOWED_FIELDS,
  CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS,
  type ClientDisclosureCurrentSurface,
  type ClientDisclosureHistorySurface,
  type ClientDisclosureLineProjection,
  ClientDisclosureProjectionForbiddenError,
  ClientDisclosureProjectionNotFoundError,
  type ClientDisclosureProjection,
  type ClientDisclosureReadScope,
  type ClientDisclosureRemittanceStatus,
} from './client-financial-disclosure-projection.contract';
import { createClientSafeFileReferenceFromCaseFileNumber } from './client-safe-file-reference.contract';

/**
 * §35.7 — YALNIZ bu üç durum client-görünürdür. `PUBLISHED` yayındaki hâli, `SUPERSEDED`
 * düzeltilmiş geçmiş, `REVERSED` geri alınmış geçmiştir. DRAFT / *_APPROVAL_* / SEND_* /
 * CANCELLED durumlarındaki hiçbir versiyon client'a ASLA ulaşmaz.
 */
const CLIENT_VISIBLE_STATUSES: readonly ClientFinancialDisclosureStatus[] = [
  ClientFinancialDisclosureStatus.PUBLISHED,
  ClientFinancialDisclosureStatus.SUPERSEDED,
  ClientFinancialDisclosureStatus.REVERSED,
];

const VERSION_SELECT = {
  id: true,
  disclosureId: true,
  version: true,
  status: true,
  currency: true,
  totalCollected: true,
  clientNetAmount: true,
  officeApprovedAt: true,
  contentApprovedAt: true,
  publishedAt: true,
  supersedesVersionId: true,
  supersededAt: true,
  reversedAt: true,
  correctionReason: true,
  supersededByVersion: { select: { id: true } },
  lines: { select: { type: true, amount: true, sortOrder: true } },
  disclosure: { select: { currentVersionId: true, case: { select: { fileNumber: true } } } },
} as const;

/**
 * CLIENT-P2-U03-TRACK-B-I05 — CLIENT AUTHORIZATION PROJECTION AND READ API
 *
 * Canonical sözleşme: charter §35.7 + §35.14.
 *
 * DORMANT SINIR (I02/I03/I04 emsali): bu sınıf BİLEREK bir Nest provider DEĞİLDİR ve
 * production call-site'ı YOKTUR. HTTP controller, REST route veya GraphQL resolver
 * ÜRETMEZ — HTTP yüzeyi ayrıca yetkilendirilmiş I06'nın kapsamındadır.
 *   PROJECTION EXISTS != PROJECTION IS ROUTED
 *
 * YETKİ ZİNCİRİ — her okuma server tarafında baştan çözülür, client girdisi ASLA güvenilmez:
 * ```text
 * portalUserId -> ClientPortalUser (isActive)
 *              -> clientId
 *              -> Client (tenantId ESLESMELI)
 *              -> CaseClient (client'in gercekten bagli oldugu dosyalar)
 *              -> ClientFinancialDisclosure (tenant + caseClient scope)
 *              -> ClientFinancialDisclosureVersion (YALNIZ client-gorunur statuler)
 * ```
 *
 * ALAN SINIRI (§35.14): çıktı `CLIENT_DISCLOSURE_ALLOWED_FIELDS` beyaz listesiyle BİREBİR
 * kurulur; internal approver kimliği, onay yorumu, provider hata detayı, idempotency anahtarı,
 * hash, ham ledger kimliği, banka bilgisi, yayınlanmamış değer ve taslak workflow durumu
 * projeksiyona GİRMEZ.
 */
export class ClientFinancialDisclosureProjectionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * §35.14 VARSAYILAN YÜZEY — yalnız current-effective disclosure'lar. Her disclosure kökü
   * için en fazla bir kayıt döner; düzeltilmiş/geri alınmış geçmiş BU YÜZEYDE GÖRÜNMEZ
   * (birleşik liste üretilmez).
   */
  async getCurrentSurface(scope: ClientDisclosureReadScope): Promise<ClientDisclosureCurrentSurface> {
    const versions = await this.loadAuthorisedVersions(scope);
    const items = versions
      .filter((v) => v.status === ClientFinancialDisclosureStatus.PUBLISHED && this.isCurrent(v))
      .map((v) => this.project(v));
    return { surface: 'CURRENT', items };
  }

  /**
   * §35.14 AYRI "Bildirim Geçmişi" YÜZEYİ — düzeltme/reversal geçmişi. Eski kayıtlar
   * gizlenmez; yalnız normal ekranda gürültü yaratmasın diye ayrı yüzeyde sunulur.
   * Yeniden eskiye sıralanır.
   */
  async getHistorySurface(scope: ClientDisclosureReadScope): Promise<ClientDisclosureHistorySurface> {
    const versions = await this.loadAuthorisedVersions(scope);
    const items = versions
      .filter((v) => !(v.status === ClientFinancialDisclosureStatus.PUBLISHED && this.isCurrent(v)))
      .sort((a, b) => b.version - a.version)
      .map((v) => this.project(v));
    return { surface: 'HISTORY', items };
  }

  /**
   * Tek kayıt okuma. Kapsam dışı, yayınlanmamış ve var olmayan durumlar AYNI 404 cevabını
   * üretir — bir kaydın VARLIĞI bile sızdırılmaz.
   */
  async getById(
    scope: ClientDisclosureReadScope,
    disclosureVersionId: string,
  ): Promise<ClientDisclosureProjection> {
    const versions = await this.loadAuthorisedVersions(scope);
    const found = versions.find((v) => v.id === disclosureVersionId);
    if (!found) {
      throw new ClientDisclosureProjectionNotFoundError('DISCLOSURE_PROJECTION_NOT_PUBLISHED');
    }
    return this.project(found);
  }

  // ── Yetki ve yükleme ─────────────────────────────────────────────────────────

  private async loadAuthorisedVersions(scope: ClientDisclosureReadScope) {
    // (1) Portal kullanıcısı aktif olmalı.
    const portalUser = await this.prisma.clientPortalUser.findFirst({
      where: { id: scope.portalUserId, isActive: true },
      select: { id: true, clientId: true, client: { select: { id: true, tenantId: true } } },
    });
    if (!portalUser) {
      throw new ClientDisclosureProjectionForbiddenError(
        'DISCLOSURE_PROJECTION_PORTAL_USER_INACTIVE',
      );
    }
    // (2) Client tenant'ı istenen tenant ile AYNI olmalı — cross-tenant okuma fail-closed.
    if (portalUser.client.tenantId !== scope.tenantId) {
      throw new ClientDisclosureProjectionForbiddenError('DISCLOSURE_PROJECTION_OUT_OF_SCOPE');
    }

    // (3) Disclosure kökü tenant + caseClient.clientId ile bağlanır. `CaseClient`'te tenantId
    //     kolonu YOKTUR (§37.3), bu yüzden tenant güvencesi kökün kendi `tenantId`sinden ve
    //     client eşleşmesinden birlikte gelir — "caseClientId verildi, kabul et" modeli YOK.
    return this.prisma.clientFinancialDisclosureVersion.findMany({
      where: {
        tenantId: scope.tenantId,
        status: { in: [...CLIENT_VISIBLE_STATUSES] },
        publishedAt: { not: null },
        disclosure: {
          tenantId: scope.tenantId,
          ...(scope.caseId ? { caseId: scope.caseId } : {}),
          caseClient: { clientId: portalUser.clientId, case: { tenantId: scope.tenantId } },
        },
      },
      select: VERSION_SELECT,
      orderBy: [{ disclosureId: 'asc' }, { version: 'desc' }],
    });
  }

  private isCurrent(v: { id: string; disclosure: { currentVersionId: string | null } }): boolean {
    return v.disclosure.currentVersionId === v.id;
  }

  // ── §35.14 alan projeksiyonu ─────────────────────────────────────────────────

  private project(v: {
    id: string;
    version: number;
    status: ClientFinancialDisclosureStatus;
    currency: string;
    totalCollected: unknown;
    clientNetAmount: unknown;
    officeApprovedAt: Date | null;
    contentApprovedAt: Date | null;
    publishedAt: Date | null;
    supersedesVersionId: string | null;
    supersededAt: Date | null;
    reversedAt: Date | null;
    correctionReason: string | null;
    supersededByVersion: { id: string } | null;
    lines: ReadonlyArray<{
      type: CollectionDispositionLineType;
      amount: unknown;
      sortOrder: number;
    }>;
    disclosure: { currentVersionId: string | null; case: { fileNumber: string } };
  }): ClientDisclosureProjection {
    const lines: ClientDisclosureLineProjection[] = [...v.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        type: line.type,
        amount: canonicalMoney(line.amount as never),
      }));

    const projection: ClientDisclosureProjection = {
      disclosureId: v.id,
      version: v.version,
      fileNumber: createClientSafeFileReferenceFromCaseFileNumber(v.disclosure.case.fileNumber)
        .value,
      currency: v.currency,
      totalCollected: canonicalMoney(v.totalCollected as never),
      clientNetAmount: canonicalMoney(v.clientNetAmount as never),
      lines,
      // §35.14: "approvedAt" client için finansal onayın tamamlandığı andır — onaylayanın
      // KİMLİĞİ değil. İçerik onayı yoksa ofis onayına düşülür.
      approvedAt: this.iso(v.contentApprovedAt ?? v.officeApprovedAt),
      // Gönderim kanıtı client'a tarih olarak yansır; provider message ID YANSIMAZ.
      notifiedAt: this.iso(v.publishedAt),
      publishedAt: this.iso(v.publishedAt),
      isCurrentEffective:
        v.status === ClientFinancialDisclosureStatus.PUBLISHED &&
        v.disclosure.currentVersionId === v.id,
      supersedesDisclosureId: v.supersedesVersionId,
      supersededByDisclosureId: v.supersededByVersion?.id ?? null,
      isReversed: v.reversedAt !== null,
      correctionReason: v.correctionReason,
      remittanceStatus: this.remittanceStatus(v),
    };

    // Beyaz liste ile BİREBİR eşleşme — fazladan veya eksik anahtar fail-closed hatadır.
    assertProjectionShape(projection);
    return projection;
  }

  /** §35.14 kanıt-desteklenen durum — internal workflow durumları ASLA yansıtılmaz. */
  private remittanceStatus(v: {
    status: ClientFinancialDisclosureStatus;
    reversedAt: Date | null;
  }): ClientDisclosureRemittanceStatus {
    if (v.reversedAt !== null || v.status === ClientFinancialDisclosureStatus.REVERSED) {
      return 'REVERSED';
    }
    if (v.status === ClientFinancialDisclosureStatus.SUPERSEDED) return 'CORRECTED';
    return 'PUBLISHED';
  }

  private iso(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
  }
}

/**
 * Projeksiyon şekli guard'ı: çıktının anahtar kümesi §35.14 beyaz listesiyle BİREBİR aynı
 * olmalıdır. Yeni bir alan eklenirse (veya bir alan düşerse) burada fail-closed patlar —
 * "sessizce sızan alan" senaryosu yapısal olarak engellenir.
 */
export function assertProjectionShape(projection: ClientDisclosureProjection): void {
  const actual = Object.keys(projection).sort();
  const expected = [...CLIENT_DISCLOSURE_ALLOWED_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new ClientDisclosureProjectionForbiddenError('DISCLOSURE_PROJECTION_OUT_OF_SCOPE');
  }
  for (const line of projection.lines) {
    const lineKeys = Object.keys(line).sort();
    const expectedLine = [...CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS].sort();
    if (lineKeys.length !== expectedLine.length || lineKeys.some((k, i) => k !== expectedLine[i])) {
      throw new ClientDisclosureProjectionForbiddenError('DISCLOSURE_PROJECTION_OUT_OF_SCOPE');
    }
  }
}
