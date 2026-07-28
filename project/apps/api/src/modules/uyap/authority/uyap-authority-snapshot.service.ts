/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — Authority snapshot üretimi ve TX-1 revalidation.
 *
 * ## İki fazlı model
 *
 * ```text
 * PHASE 1 (TX-0 civarı)          PHASE 2 (TX-1 içinde)
 *   build(context)         →       revalidate(snapshot, tx)
 *   allowed + digest               aynı kaynaklar tx içinde YENİDEN okunur
 *                                  → yetki hâlâ geçerli mi?   (değilse REVALIDATION_FAILED)
 *                                  → digest aynı mı?          (değilse CONTEXT_STALE)
 * ```
 *
 * ## Mantık kopyalanmaz
 *
 * Revalidation, Phase 1 ile **aynı** resolver'ları (I01 acting-lawyer, I03 UYAP_SEND
 * authority, I04B expense block) çağırır; yalnız okuma client'ı transaction client'tır.
 * Böylece "iki farklı yerde iki farklı yetki mantığı" riski YOKTUR.
 *
 * ## Zaman semantiği (bilinçli)
 *
 * Phase 1 `evaluatedAt` = CPE karar anı. Revalidation `evaluatedAt` = **commit anı**.
 * Aynı `evaluatedAt` kullanılsaydı Phase 1'den SONRA açılan bir masraf bloğu
 * (`createdAt <= evaluatedAt` filtresi nedeniyle) GÖRÜLEMEZDİ. Commit anı kullanmak,
 * owner §11'in "blocking reason created after Phase 1 → AUTHORITY_CONTEXT_STALE"
 * gereğini karşılar. Aynı sebeple araya giren POA süre dolumu da yakalanır.
 *
 * ## Kilit/sıra
 *
 * Broad table lock veya `FOR UPDATE` KULLANILMAZ (owner §7 tercih sırası: önce
 * transaction içinde deterministic re-read). Okuma sırası bütün code path'lerde AYNIDIR:
 * `Case → Lawyer → CaseClient/Client → ClientPowerOfAttorney ASC → PoaLawyer ASC →
 * ExpenseBlockReason ASC → systemAvailability`. Bu sıra `build()` içinde tek yerde
 * kodlanmıştır; Phase 1 ve Phase 2 aynı fonksiyonu çağırdığı için sıra farkı OLUŞAMAZ.
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { canonicalJsonStringify } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  ActingLawyerReadClient,
  ActingLawyerResolverService,
} from '../../lawyer/acting-lawyer-resolver.service';
import {
  ExpenseBlockReadClient,
  ExpenseBlockReasonService,
} from '../../expense-block-reason/expense-block-reason.service';
import { UyapAvailabilityService } from '../../policy-engine/fact-store/uyap-availability.service';
import {
  UyapSendAuthorityReadClient,
  UyapSendAuthorityResolverService,
} from './uyap-send-authority-resolver.service';
import { AuthorityEvidenceRef } from './uyap-send-authority.types';
import {
  ExpenseBlockEvidence,
  UYAP_AUTHORITY_DIGEST_DOMAIN,
  UYAP_AUTHORITY_SNAPSHOT_VERSION,
  UyapAuthorityChangedSource,
  UyapAuthorityRevalidationResult,
  UyapAuthoritySnapshot,
  UyapAuthoritySnapshotContext,
  UyapAuthoritySnapshotResult,
} from './uyap-authority-snapshot.types';

/** Snapshot üretimi için gereken MİNİMUM okuma yüzeyi (PrismaService ve TransactionClient uyar). */
export type UyapAuthoritySnapshotReadClient = ActingLawyerReadClient &
  UyapSendAuthorityReadClient &
  ExpenseBlockReadClient & {
    case: { findFirst: PrismaService['case']['findFirst'] };
  };

/** `UyapAttempt`/`UyapOperation` blocking action kodu — I04B ile AYNI sabit. */
const UYAP_SEND_BLOCKING_ACTION_CODE = 'UYAP_SEND';

@Injectable()
export class UyapAuthoritySnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actingLawyerResolver: ActingLawyerResolverService,
    private readonly authorityResolver: UyapSendAuthorityResolverService,
    private readonly expenseBlockReasons: ExpenseBlockReasonService,
    private readonly uyapAvailability: UyapAvailabilityService,
  ) {}

  /**
   * Bütün mutable authority kaynaklarını CANONICAL SIRAYLA okur ve immutable snapshot üretir.
   * Exception fırlatmaz; başarısızlık yapısal olarak döner (fail-closed).
   */
  async build(
    context: UyapAuthoritySnapshotContext,
    client: UyapAuthoritySnapshotReadClient = this.prisma,
  ): Promise<UyapAuthoritySnapshotResult> {
    if (
      !context?.tenantId ||
      !context?.authenticatedUserId ||
      !context?.caseId ||
      !context?.actionCode ||
      !(context?.evaluatedAt instanceof Date) ||
      Number.isNaN(context.evaluatedAt.getTime())
    ) {
      return { ok: false, failureCode: 'AUTHORITY_CONTEXT_INVALID' };
    }

    // ── 1) Case (tenant-scoped) ───────────────────────────────────────────────
    const caseRow = await client.case.findFirst({
      where: { id: context.caseId, tenantId: context.tenantId },
      select: {
        id: true,
        tenantId: true,
        caseStatus: true,
        isArchived: true,
        allowUyapActions: true,
        updatedAt: true,
      },
    });
    if (!caseRow) {
      return { ok: false, failureCode: 'CASE_NOT_FOUND' };
    }

    // ── 2) Acting lawyer (I01) ────────────────────────────────────────────────
    const lawyerResolution = await this.actingLawyerResolver.tryResolve(
      { userId: context.authenticatedUserId, tenantId: context.tenantId },
      client,
    );
    if (!lawyerResolution.resolved) {
      return { ok: false, failureCode: lawyerResolution.failureCode };
    }
    const actingLawyerId = lawyerResolution.actingLawyer.lawyerId;

    // Lawyer'ın freshness alanları — I01 yalnız kimlik döner.
    const lawyerRow = await client.lawyer.findMany({
      where: { id: actingLawyerId, tenantId: context.tenantId },
      select: { id: true, tenantId: true, userId: true, isActive: true, updatedAt: true },
      take: 1,
    });
    if (lawyerRow.length !== 1) {
      return { ok: false, failureCode: 'ACTING_LAWYER_NOT_RESOLVED' };
    }
    const lawyer = lawyerRow[0];

    // ── 3) POA zinciri (I03) — CaseClient/Client + POA + PoaLawyer ────────────
    const decision = await this.authorityResolver.resolve(
      {
        tenantId: context.tenantId,
        authenticatedUserId: context.authenticatedUserId,
        actingLawyerId,
        caseId: context.caseId,
        operationType: context.actionCode,
        evaluatedAt: context.evaluatedAt,
      },
      client,
    );
    if (!decision.allowed) {
      return { ok: false, failureCode: decision.failureCode ?? 'POWER_OF_ATTORNEY_MISSING' };
    }

    const clientIds = [
      ...new Set(decision.authorityEvidence.map((e) => e.clientId)),
    ].sort();

    // ── 4) Masraf blokları (I04B) ─────────────────────────────────────────────
    const openBlocks = await this.expenseBlockReasons.findOpenBlocksForAction(
      context.tenantId,
      context.caseId,
      UYAP_SEND_BLOCKING_ACTION_CODE,
      context.evaluatedAt,
      client,
    );
    const expenseBlocks: ExpenseBlockEvidence[] = openBlocks
      .map((b: any) => ({
        blockReasonId: b.id,
        tenantId: b.tenantId,
        caseId: b.caseId,
        blockedActionCode: b.blockedActionCode,
        status: String(b.status),
        createdAt: b.createdAt,
        resolvedAt: b.resolvedAt ?? null,
        cancelledAt: b.cancelledAt ?? null,
      }))
      .sort((a, b) => (a.blockReasonId < b.blockReasonId ? -1 : a.blockReasonId > b.blockReasonId ? 1 : 0));

    // ── 5) Operasyonel erişilebilirlik (env sinyali — DB satırı değil) ────────
    let explicitlyConfigured = false;
    let available = false;
    try {
      explicitlyConfigured = this.uyapAvailability.isAvailabilityExplicitlyConfigured() === true;
      available = this.uyapAvailability.isUyapAvailable() === true;
    } catch {
      // Provider hatası izin üretemez.
      return { ok: false, failureCode: 'SYSTEM_AVAILABILITY_STALE' };
    }

    const snapshot: UyapAuthoritySnapshot = {
      snapshotVersion: UYAP_AUTHORITY_SNAPSHOT_VERSION,
      evaluatedAt: context.evaluatedAt,
      tenantId: context.tenantId,
      authenticatedUserId: context.authenticatedUserId,
      actionCode: context.actionCode,
      actingLawyer: {
        actingLawyerId: lawyer.id,
        tenantId: lawyer.tenantId,
        userId: lawyer.userId ?? '',
        isActive: lawyer.isActive,
        lawyerUpdatedAt: lawyer.updatedAt,
      },
      caseState: {
        caseId: caseRow.id,
        tenantId: caseRow.tenantId,
        caseStatus: String(caseRow.caseStatus),
        isArchived: caseRow.isArchived,
        allowUyapActions: caseRow.allowUyapActions,
        caseUpdatedAt: caseRow.updatedAt,
      },
      clientIds,
      authorityEvidence: decision.authorityEvidence,
      expenseBlocks,
      systemAvailability: { explicitlyConfigured, available },
      authorityVersion: decision.authorityVersion,
      authorityDigest: '', // aşağıda hesaplanır
    };

    return { ok: true, snapshot: { ...snapshot, authorityDigest: this.digest(snapshot) } };
  }

  /**
   * TX-1 revalidation. `client` ÇAĞIRANIN transaction client'ı olmalıdır.
   *
   * `revalidatedAt` **commit anıdır**, snapshot'ın `evaluatedAt`'i DEĞİL — Phase 1'den
   * sonra açılan masraf bloğu ve araya giren süre dolumu ancak böyle görülebilir.
   */
  async revalidate(
    snapshot: UyapAuthoritySnapshot,
    client: UyapAuthoritySnapshotReadClient,
    revalidatedAt: Date,
  ): Promise<UyapAuthorityRevalidationResult> {
    const current = await this.build(
      {
        tenantId: snapshot.tenantId,
        authenticatedUserId: snapshot.authenticatedUserId,
        caseId: snapshot.caseState.caseId,
        actionCode: snapshot.actionCode,
        evaluatedAt: revalidatedAt,
      },
      client,
    );

    if (!current.ok) {
      // Yetki ARTIK GEÇERSİZ (azil, kapanma, blok, pasif avukat, ...).
      const changed = this.classifyFailure(current.failureCode);
      return {
        fresh: false,
        failureCode:
          current.failureCode === 'SYSTEM_AVAILABILITY_STALE'
            ? 'SYSTEM_AVAILABILITY_STALE'
            : 'AUTHORITY_REVALIDATION_FAILED',
        changedSources: changed,
        revalidationFailureCode: current.failureCode,
      };
    }

    // Yetki geçerli — ama kaynaklar DEĞİŞMİŞ olabilir.
    if (current.snapshot.authorityDigest !== snapshot.authorityDigest) {
      const changedSources = this.diffSources(snapshot, current.snapshot);
      return {
        fresh: false,
        failureCode: changedSources.includes('SYSTEM_AVAILABILITY_CHANGED')
          ? 'SYSTEM_AVAILABILITY_STALE'
          : 'AUTHORITY_CONTEXT_STALE',
        changedSources,
      };
    }

    return { fresh: true, snapshot: current.snapshot };
  }

  /**
   * Domain-separated, canonical, deterministik digest.
   *
   * - `sha256(domain || \0 || canonicalJson(payload))` — emsal:
   *   `claim-item-formation-canonical.domainSeparatedFormationHash`.
   * - `canonicalJsonStringify` anahtar sırasından BAĞIMSIZDIR; dizi sırası anlamlıdır ve
   *   yukarıda canonical ASC olarak üretilir.
   * - Tarihler ISO-8601'e normalize edilir (Date nesnesi JSON'da zaten ISO olur, ancak
   *   açıkça yapılır ki `toJSON` davranışına bağımlı kalmayalım).
   * - Tenant/action/actor/case digest'in İÇİNDEDİR → bir bağlamın digest'i başka bir
   *   bağlamda kullanılamaz (FR-07).
   */
  digest(snapshot: UyapAuthoritySnapshot): string {
    const payload = {
      v: snapshot.snapshotVersion,
      authorityVersion: snapshot.authorityVersion,
      tenantId: snapshot.tenantId,
      authenticatedUserId: snapshot.authenticatedUserId,
      actionCode: snapshot.actionCode,
      actingLawyer: {
        id: snapshot.actingLawyer.actingLawyerId,
        tenantId: snapshot.actingLawyer.tenantId,
        userId: snapshot.actingLawyer.userId,
        isActive: snapshot.actingLawyer.isActive,
        updatedAt: iso(snapshot.actingLawyer.lawyerUpdatedAt),
      },
      caseState: {
        id: snapshot.caseState.caseId,
        tenantId: snapshot.caseState.tenantId,
        status: snapshot.caseState.caseStatus,
        isArchived: snapshot.caseState.isArchived,
        allowUyapActions: snapshot.caseState.allowUyapActions,
        updatedAt: iso(snapshot.caseState.caseUpdatedAt),
      },
      clientIds: [...snapshot.clientIds],
      poa: snapshot.authorityEvidence.map((e) => ({
        poaId: e.poaId,
        clientId: e.clientId,
        tenantId: e.tenantId,
        poaLawyerId: e.poaLawyerId,
        status: e.poaStatus,
        scopeType: e.poaScopeType,
        isActive: e.poaIsActive,
        isLimited: e.poaIsLimited,
        dateIssued: iso(e.poaDateIssued),
        validUntil: iso(e.poaValidUntil),
        updatedAt: iso(e.poaUpdatedAt),
      })),
      expenseBlocks: snapshot.expenseBlocks.map((b) => ({
        id: b.blockReasonId,
        tenantId: b.tenantId,
        caseId: b.caseId,
        blockedActionCode: b.blockedActionCode,
        status: b.status,
        createdAt: iso(b.createdAt),
        resolvedAt: iso(b.resolvedAt),
        cancelledAt: iso(b.cancelledAt),
      })),
      systemAvailability: {
        explicitlyConfigured: snapshot.systemAvailability.explicitlyConfigured,
        available: snapshot.systemAvailability.available,
      },
    };

    return createHash('sha256')
      .update(UYAP_AUTHORITY_DIGEST_DOMAIN, 'utf8')
      .update('\0', 'utf8')
      .update(canonicalJsonStringify(payload), 'utf8')
      .digest('hex');
  }

  /** Hangi kaynak(lar) değişti — internal evidence. */
  private diffSources(
    before: UyapAuthoritySnapshot,
    after: UyapAuthoritySnapshot,
  ): UyapAuthorityChangedSource[] {
    const changed: UyapAuthorityChangedSource[] = [];

    if (
      before.caseState.caseStatus !== after.caseState.caseStatus ||
      before.caseState.isArchived !== after.caseState.isArchived ||
      before.caseState.allowUyapActions !== after.caseState.allowUyapActions ||
      iso(before.caseState.caseUpdatedAt) !== iso(after.caseState.caseUpdatedAt)
    ) {
      changed.push('CASE_STATE_CHANGED');
    }

    if (
      before.actingLawyer.actingLawyerId !== after.actingLawyer.actingLawyerId ||
      before.actingLawyer.isActive !== after.actingLawyer.isActive ||
      iso(before.actingLawyer.lawyerUpdatedAt) !== iso(after.actingLawyer.lawyerUpdatedAt)
    ) {
      changed.push('ACTING_LAWYER_CHANGED');
    }

    if (canonicalJsonStringify([...before.clientIds]) !== canonicalJsonStringify([...after.clientIds])) {
      changed.push('CASE_CLIENT_SET_CHANGED');
    }

    const poaKey = (e: AuthorityEvidenceRef) =>
      canonicalJsonStringify({
        poaId: e.poaId,
        status: e.poaStatus,
        scopeType: e.poaScopeType,
        isActive: e.poaIsActive,
        isLimited: e.poaIsLimited,
        dateIssued: iso(e.poaDateIssued),
        validUntil: iso(e.poaValidUntil),
        updatedAt: iso(e.poaUpdatedAt),
      });
    const relKey = (e: AuthorityEvidenceRef) => `${e.poaId}:${e.poaLawyerId}:${e.clientId}`;

    if (
      canonicalJsonStringify(before.authorityEvidence.map(poaKey)) !==
      canonicalJsonStringify(after.authorityEvidence.map(poaKey))
    ) {
      changed.push('POA_CHANGED');
    }
    if (
      canonicalJsonStringify(before.authorityEvidence.map(relKey)) !==
      canonicalJsonStringify(after.authorityEvidence.map(relKey))
    ) {
      changed.push('POA_LAWYER_RELATION_CHANGED');
    }

    if (
      canonicalJsonStringify(before.expenseBlocks) !== canonicalJsonStringify(after.expenseBlocks)
    ) {
      changed.push('EXPENSE_STATE_CHANGED');
    }

    if (
      before.systemAvailability.explicitlyConfigured !==
        after.systemAvailability.explicitlyConfigured ||
      before.systemAvailability.available !== after.systemAvailability.available
    ) {
      changed.push('SYSTEM_AVAILABILITY_CHANGED');
    }

    // Digest farklı ama hiçbir spesifik kaynak eşleşmediyse sessiz geçiş YOK.
    if (changed.length === 0) {
      changed.push('AUTHORITY_EVIDENCE_CHANGED');
    }

    return changed;
  }

  /** Revalidation başarısızlığını kaynak etiketine eşler (internal evidence). */
  private classifyFailure(failureCode: string): UyapAuthorityChangedSource[] {
    if (failureCode.startsWith('POWER_OF_ATTORNEY') || failureCode === 'AUTHORITY_RECORD_CONFLICT') {
      return ['POA_CHANGED'];
    }
    if (failureCode.startsWith('ACTING_LAWYER') || failureCode === 'LAWYER_TENANT_MISMATCH') {
      return ['ACTING_LAWYER_CHANGED'];
    }
    if (failureCode.startsWith('CASE_')) {
      return ['CASE_STATE_CHANGED'];
    }
    if (failureCode.startsWith('CLIENT_')) {
      return ['CASE_CLIENT_SET_CHANGED'];
    }
    if (failureCode === 'SYSTEM_AVAILABILITY_STALE') {
      return ['SYSTEM_AVAILABILITY_CHANGED'];
    }
    return ['AUTHORITY_EVIDENCE_CHANGED'];
  }
}

/** Tarihleri digest için deterministik ISO-8601'e normalize eder. */
function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
