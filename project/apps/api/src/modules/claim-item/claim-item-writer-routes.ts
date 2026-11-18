import { type ClaimItemWriteOperation } from './claim-item-write-command';

export const CLAIM_ITEM_HUMAN_WRITE_POLICY_REF = 'CLAIM_ITEM_WRITE_POLICY_V1' as const;

/**
 * Due köprüsünün (kullanıcı isteğiyle tetiklenen yol) bağlı kanonik kalemde GÜNCELLEYEBİLECEĞİ alanlar — yalnız düşük
 * etkili alanlar (owner kararı 18.11.2026, K1). Yüksek etkili alanlar (tutar, tür, para birimi, vade, faiz alanları,
 * durum) bu rotadan YAZILAMAZ: kullanıcı kalem ucu + iki kişi onayı tek yoldur. Kapı, listede olmayan alanı
 * `UNSUPPORTED_UPDATE_FIELD` ile reddeder; çağıran kod yanlışlıkla yüksek etkili alan gönderse de yazım olmaz.
 */
export const DUE_BRIDGE_UPDATE_FIELDS = ['description', 'sortOrder'] as const;

export const CLAIM_ITEM_SYSTEM_WRITER_ROUTES = {
  DUE_BRIDGE: {
    sourceType: 'DUE_BRIDGE',
    policyRef: 'REC-AUTH-008',
    operations: ['CREATE', 'UPDATE', 'CANCEL'],
    updateFields: DUE_BRIDGE_UPDATE_FIELDS,
  },
  CASE_INSTRUMENT_GENERATOR: {
    sourceType: 'CASE_INSTRUMENT',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  DOCUMENT_AUTO_GENERATOR: {
    sourceType: 'DOCUMENT_AUTO_GENERATOR',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  RULE_ENGINE_GENERATOR: {
    sourceType: 'RULE_ENGINE_GENERATOR',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  PRECAUTIONARY_COST_WRITER: {
    sourceType: 'PRECAUTIONARY_COST',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
} as const satisfies Record<
  string,
  Readonly<{
    sourceType: string;
    policyRef: string;
    operations: readonly ClaimItemWriteOperation[];
    /** Verilmişse UPDATE yükü yalnız bu alanları taşıyabilir; verilmemişse rota UPDATE alan süzgeci uygulamaz. */
    updateFields?: readonly string[];
  }>
>;

/** Rotanın UPDATE alan süzgeci; tanımlı değilse `undefined` (süzgeç yok). */
export function claimItemSystemRouteUpdateFields(
  route: ClaimItemSystemWriterRoute,
): readonly string[] | undefined {
  return (CLAIM_ITEM_SYSTEM_WRITER_ROUTES[route] as { updateFields?: readonly string[] }).updateFields;
}

export type ClaimItemSystemWriterRoute = keyof typeof CLAIM_ITEM_SYSTEM_WRITER_ROUTES;

export function isClaimItemSystemWriterRoute(
  value: string,
): value is ClaimItemSystemWriterRoute {
  return Object.prototype.hasOwnProperty.call(CLAIM_ITEM_SYSTEM_WRITER_ROUTES, value);
}
