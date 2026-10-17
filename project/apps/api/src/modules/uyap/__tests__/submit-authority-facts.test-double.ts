import { UYAP_AUTHORITY_FACT_KEYS } from '../authority/uyap-authority-fact.provider';

/**
 * Güvenlik paketi 01 P5 (owner Ek 102, K2 kararı A) — doğrudan `new UyapService(...)` kuran saf testler için
 * işlem öncesi son yetki doğrulamasının (`assertSubmitAuthorityStillValid`) TEST İKİZİ.
 *
 * Bu ikiz yalnız konusu son doğrulama OLMAYAN saf testlerde kullanılır (günlük sahipliği, taşıma doğruluğu, kiracı kapısı …).
 * Gerçek davranış (gerçek UyapAuthorityFactProvider + gerçek DB + karar ile işlem arasında atama / vekalet kaldırma)
 * uyap-submit-runtime-authz.http.db-gated.integration.spec.ts içinde sınanır. Varsayılan: bütün yetki olguları `true`.
 */
export function submitAuthorityFactsDouble(result: Partial<Record<string, unknown>> = {}) {
  const compute = jest.fn(async (_caseId: string, _context: unknown, facts?: Map<string, unknown>) => {
    const all: Record<string, unknown> = {
      [UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer]: true,
      [UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa]: true,
      [UYAP_AUTHORITY_FACT_KEYS.poaEffective]: true,
      [UYAP_AUTHORITY_FACT_KEYS.poaCoversOperation]: true,
      [UYAP_AUTHORITY_FACT_KEYS.authorityUnambiguous]: true,
      [UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase]: true,
      ...result,
    };
    for (const [key, value] of Object.entries(all)) facts?.set(key, value);
    return all[UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa] === true;
  });
  return { compute } as any;
}
