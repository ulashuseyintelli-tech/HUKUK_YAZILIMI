import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import {
  CekLegalBasisReleaseResolverService,
  type CekLegalBasisArtifactsV1,
} from '../formation-cek/cek-legal-basis-release.resolver';
import { assertLegalBasisEligible } from '../formation-intent/claim-item-formation-legal-basis-eligibility';
import { createLegalBasisProjectionBindingV1 } from '../formation-intent/legal-basis-projection-binding.contract';
import type { ResolveExactLegalBasisInput } from '../formation-intent/claim-item-formation-resolver.ports';

/**
 * K3 AUTO-GENERATE FORMATION — RCV-LB-R2-CEK taslak hukuki dayanak çözücüsü (owner GO + kararları 2026-09-28).
 * İçerik TASLAKTIR: yalnız `allowDraftContent` ile kabul edilir; üretim varsayılanı reddeder.
 */
const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const VALIDATOR = path.join(PROJECT_ROOT, 'scripts/governance/validate-receivable-cek-legal-basis-release-r2.cjs');

const input = (over: Partial<ResolveExactLegalBasisInput> = {}): ResolveExactLegalBasisInput => ({
  tenantId: 'tenant-1',
  caseId: 'case-1',
  legalBasisCode: 'TTK_CEK_TAZMINATI',
  requestedVersion: '1',
  effectiveAt: '2026-09-01T00:00:00.000Z',
  componentCategory: 'ANCILLARY',
  componentSubtypeCode: 'CHECK_PENALTY',
  documentType: 'CEK',
  evidenceClasses: ['CHECK_DISHONOUR_RECORD', 'CHECK_INSTRUMENT_RECORD'],
  liabilityContext: { liabilityType: 'TAM', liableDebtorRefs: ['debtor-1'] },
  ...over,
});

const principal = (over: Partial<ResolveExactLegalBasisInput> = {}) =>
  input({ legalBasisCode: 'TTK_CEK_BEDELI', componentCategory: 'PRINCIPAL', componentSubtypeCode: 'CHECK_PRINCIPAL', ...over });

describe('RCV-LB-R2-CEK taslak hukuki dayanak çözücüsü', () => {
  const draft = new CekLegalBasisReleaseResolverService({ allowDraftContent: true });

  it('kanonik doğrulayıcı taslak içeriği ve checksum\'ları doğrular (CLI, self-test)', () => {
    const result = spawnSync(process.execPath, [VALIDATOR, '--self-test'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^RCV-LB-R2-CEK OK status=DRAFT_PENDING_OWNER_LEGAL_RATIFICATION /);
  });

  it('üretim varsayılanı: taslak (owner onaysız) içerik AUTHORITY_UNAVAILABLE', async () => {
    const production = new CekLegalBasisReleaseResolverService();
    await expect(production.resolveExactVersion(input())).resolves.toEqual({
      ok: false,
      failure: { code: 'AUTHORITY_UNAVAILABLE' },
    });
  });

  it('tazminat: CHECK_PENALTY → ClaimItem CHECK_PENALTY; faiz UNKNOWN; borçlular açık', async () => {
    const result = await draft.resolveExactVersion(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      legalBasisCode: 'TTK_CEK_TAZMINATI',
      registryReleaseId: 'RCV-LB-R2-CEK',
      componentCategory: 'ANCILLARY',
      componentSubtypeCode: 'CHECK_PENALTY',
      status: 'ACTIVE',
      interestEligibility: 'UNRESOLVED',
      legalReviewRequired: false,
    });
    expect(result.value.claimItemProjection).toMatchObject({
      itemType: 'CHECK_PENALTY',
      interestAccrualStatus: 'UNKNOWN',
      isAllDebtorsLiable: false,
      liableDebtorIds: ['debtor-1'],
    });
  });

  it('çek bedeli: CHECK_PRINCIPAL → ClaimItem PRINCIPAL', async () => {
    const result = await draft.resolveExactVersion(principal());
    expect(result.ok && result.value.claimItemProjection.itemType).toBe('PRINCIPAL');
  });

  it.each(['ADMISSION', 'FINALIZATION'] as const)(
    'bağlama formation sözleşmesiyle uyumlu: projeksiyon bağı + ortak uygunluk doğrulayıcısı (%s)',
    async (mode) => {
      for (const request of [input(), principal()]) {
        const result = await draft.resolveExactVersion(request);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(() =>
          createLegalBasisProjectionBindingV1({ legalBasis: result.value, admittedAt: '2026-09-28T09:00:00.000Z' }),
        ).not.toThrow();
        const eligibility = assertLegalBasisEligible({
          mode,
          legalBasis: result.value,
          requestedIdentity: { legalBasisCode: request.legalBasisCode, legalBasisVersion: request.requestedVersion },
          requestedComponent: { category: request.componentCategory, subtypeCode: request.componentSubtypeCode },
          documentType: request.documentType,
          evidenceClasses: request.evidenceClasses,
          effectiveAt: request.effectiveAt,
          ...(mode === 'FINALIZATION'
            ? {
                expectedBinding: {
                  legalBasisChecksum: result.value.legalBasisChecksum,
                  registryReleaseId: result.value.registryReleaseId,
                  registryReleaseChecksum: result.value.registryReleaseChecksum,
                  componentSubtypeVersion: result.value.componentSubtypeVersion,
                  componentSubtypeChecksum: result.value.componentSubtypeChecksum,
                  interestEligibility: result.value.interestEligibility,
                  interestPolicyRef: null,
                  interestPolicyVersion: null,
                  ruleRef: null,
                  ruleVersion: null,
                  resolutionContractVersion: result.value.resolutionContractVersion,
                  resolutionHash: result.value.resolutionHash,
                },
              }
            : {}),
        } as never);
        expect(eligibility.ok).toBe(true);
      }
    },
  );

  it.each([
    ['karşılıksız kaydı yok', input({ evidenceClasses: ['CHECK_INSTRUMENT_RECORD'] }), 'SCOPE_MISMATCH'],
    ['belge türü çek değil', input({ documentType: 'SENET' }), 'SCOPE_MISMATCH'],
    ['sorumluluk TAM değil', input({ liabilityContext: { liabilityType: 'KISMI', liableDebtorRefs: ['d'] } }), 'SCOPE_MISMATCH'],
    ['örtük tüm borçlular (liste boş)', input({ liabilityContext: { liabilityType: 'TAM', liableDebtorRefs: [] } }), 'SCOPE_MISMATCH'],
    ['kategori uyuşmazlığı', input({ componentCategory: 'COST' }), 'SCOPE_MISMATCH'],
    ['alt tür/dayanak çaprazlama', input({ componentSubtypeCode: 'CHECK_PRINCIPAL', componentCategory: 'PRINCIPAL' }), 'SCOPE_MISMATCH'],
    ['yürürlükten önce', input({ effectiveAt: '2011-12-31T00:00:00.000Z' }), 'VERSION_NOT_FOUND'],
    ['bilinmeyen sürüm', input({ requestedVersion: '2' }), 'VERSION_NOT_FOUND'],
    ['nafaka alt türü bu sürümde yok', input({ componentSubtypeCode: 'INTERIM_MAINTENANCE' }), 'VERSION_NOT_FOUND'],
  ])('ret: %s', async (_label, request, code) => {
    await expect(draft.resolveExactVersion(request)).resolves.toEqual({ ok: false, failure: { code } });
  });

  it('bütünlük: içerik değiştirilirse (ör. oran %20) doğrulayıcı reddeder → AUTHORITY_UNAVAILABLE', async () => {
    const tampered = new CekLegalBasisReleaseResolverService({
      allowDraftContent: true,
      artifactsProvider: () => {
        throw new Error('RCV-LB-R2-CEK: manifest does not match the canonical release/registry checksums');
      },
    });
    await expect(tampered.resolveExactVersion(input())).resolves.toEqual({
      ok: false,
      failure: { code: 'AUTHORITY_UNAVAILABLE' },
    });
  });

  it('owner ratifikasyonu sonrası statü bayraksız kabul edilir; tazminat oranı tek kaynaktan 1000 bp', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const validator = require(VALIDATOR);
    const raw = validator.readArtifacts();
    const validation = validator.validateArtifacts(raw);
    const ratified: CekLegalBasisArtifactsV1 = {
      registry: raw.registry,
      release: raw.release,
      validation: { ...validation, ratificationStatus: 'OWNER_LEGAL_AUTHORITY_RATIFIED' },
    };
    const production = new CekLegalBasisReleaseResolverService({ artifactsProvider: () => ratified });
    const result = await production.resolveExactVersion(input());
    expect(result.ok).toBe(true);
    expect(draft.penaltyBasisPoints()).toBe(1000);
  });
});
