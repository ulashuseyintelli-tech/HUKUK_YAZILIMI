/**
 * C3-B05 — VEKÂLETNAME ↔ CAPABILITY BINDING (§13/9 K9.1-K9.6) — SAF DEĞERLENDİRİCİ.
 *
 * Owner ratifikasyonu (decision-log 2026-08-03). TEK fail-closed kapı (model C, servis
 * seviyesi): efektif yetki = flat izin VE geçerli, kapsam-uyumlu POA. "Müvekkil kaydı
 * var" ≠ "vekaletname/işlem yetkisi var".
 *
 * K9.1 GEÇERLİ POA: isActive · status=ACTIVE (azil=REVOKED, askı/onay bekleme=PENDING,
 * süre=EXPIRED değil) · validUntil yok veya geçmemiş (isLimited olup validUntil yoksa
 * BELİRSİZLİK → geçersiz) · dateIssued gelecekte değil · belge (filePath) VEYA
 * doğrulanabilir immutable kaynak referansı (noter adı + yevmiye no) mevcut · tenant ve
 * müvekkil eşleşmesi ÇAĞIRAN sorguda composite (clientId, tenantId) ile sağlanır.
 *
 * K9.2 KAPSAM: GENEL vekâlet, açıkça sınırlandırılmadıkça (canCollect=false) canCollect'i
 * kapsar; canWaive/canSettle/canRelease HER durumda AÇIK özel yetki (===true) ister;
 * OZEL vekâlette dört yetki de yalnız açık bayrakla; scopeDescription serbest metni
 * OTOMATİK YETKİ ÜRETMEZ (bu değerlendirici onu okumaz).
 *
 * K9.3 ÇAKIŞMA: Client flat bayrakları yalnız EK KISITLAMA getirir (flat=false → RED);
 * tek başına yetki VERMEZ. Çoklu POA'da biri işlemi bağımsız kapsayabilir; fakat geçerli
 * herhangi bir POA canCollect'i AÇIKÇA sınırlandırmışsa (canCollect=false) sonuç
 * fail-closed RED'dir (azil sonrası sınırlama/çelişki/belirsizlik kuralı — eşik ratifiye
 * ifadeden DAR olabilir, GENİŞ olamaz). canWaive/canSettle/canRelease için şema
 * default'u false olduğundan "false" açık kısıt sayılMAZ; yalnız açık true yetki verir.
 *
 * K9.4: Geçerli POA yoksa DÖRT efektif capability de ETKİSİZDİR.
 */

export const CLIENT_POA_CAPABILITIES = ['canCollect', 'canWaive', 'canSettle', 'canRelease'] as const;
export type ClientPoaCapability = (typeof CLIENT_POA_CAPABILITIES)[number];

export interface PoaLike {
  id?: string;
  isActive?: boolean | null;
  status?: string | null;
  isLimited?: boolean | null;
  validUntil?: Date | string | null;
  dateIssued?: Date | string | null;
  filePath?: string | null;
  notaryName?: string | null;
  journalNo?: string | null;
  scopeType?: string | null;
  canCollect?: boolean | null;
  canWaive?: boolean | null;
  canSettle?: boolean | null;
  canRelease?: boolean | null;
}

export type PoaInvalidReason =
  | 'POA_INACTIVE'
  | 'POA_STATUS_NOT_ACTIVE'
  | 'POA_VALIDITY_EXPIRED'
  | 'POA_VALIDITY_UNDEFINED'
  | 'POA_DATE_ISSUED_IN_FUTURE'
  | 'POA_EVIDENCE_MISSING';

/** K9.1 — geçerlilik; ilk ihlal nedeni döner (null = geçerli). */
export function findPoaInvalidReason(poa: PoaLike, now: Date): PoaInvalidReason | null {
  if (poa.isActive !== true) return 'POA_INACTIVE';
  if (poa.status !== 'ACTIVE') return 'POA_STATUS_NOT_ACTIVE';
  if (poa.isLimited === true) {
    if (!poa.validUntil) return 'POA_VALIDITY_UNDEFINED'; // belirsizlik → fail-closed
    if (new Date(poa.validUntil).getTime() < now.getTime()) return 'POA_VALIDITY_EXPIRED';
  } else if (poa.validUntil && new Date(poa.validUntil).getTime() < now.getTime()) {
    return 'POA_VALIDITY_EXPIRED';
  }
  if (poa.dateIssued && new Date(poa.dateIssued).getTime() > now.getTime()) {
    return 'POA_DATE_ISSUED_IN_FUTURE';
  }
  const hasEvidence = !!poa.filePath || (!!poa.notaryName && !!poa.journalNo);
  if (!hasEvidence) return 'POA_EVIDENCE_MISSING';
  return null;
}

export function isValidPoa(poa: PoaLike, now: Date): boolean {
  return findPoaInvalidReason(poa, now) === null;
}

/** K9.2 — kapsam uyumu (yalnız GEÇERLİ POA'ya uygulanır). */
export function poaCoversCapability(poa: PoaLike, capability: ClientPoaCapability): boolean {
  if (capability === 'canCollect') {
    if (poa.scopeType === 'GENEL') return poa.canCollect !== false; // açık sınırlama hariç kapsar
    return poa.canCollect === true; // OZEL: yalnız açık bayrak
  }
  // canWaive / canSettle / canRelease: HER durumda açık özel yetki şart (K9.2)
  return poa[capability] === true;
}

export interface EffectiveCapabilityDecision {
  capability: ClientPoaCapability;
  allowed: boolean;
  reasonCode:
    | 'ALLOWED'
    | 'NO_VALID_POA'
    | 'POA_SCOPE_NOT_COVERED'
    | 'POA_EXPLICIT_COLLECT_RESTRICTION'
    | 'FLAT_FLAG_RESTRICTION';
  /** Yetkiyi kapsayan geçerli POA id'leri (kanıt zinciri). */
  basisPoaIds: string[];
}

/**
 * K9.3/K9.4 — tek fail-closed karar. `client` flat bayrakları EK KISIT olarak uygulanır.
 */
export function decideEffectiveClientCapability(
  client: Record<string, unknown> | null | undefined,
  poas: PoaLike[] | null | undefined,
  capability: ClientPoaCapability,
  now: Date,
): EffectiveCapabilityDecision {
  const validPoas = (poas ?? []).filter((p) => isValidPoa(p, now));
  if (validPoas.length === 0) {
    return { capability, allowed: false, reasonCode: 'NO_VALID_POA', basisPoaIds: [] };
  }

  // K9.3: geçerli herhangi bir POA canCollect'i AÇIKÇA sınırlandırmışsa fail-closed RED.
  if (capability === 'canCollect' && validPoas.some((p) => p.canCollect === false)) {
    return {
      capability,
      allowed: false,
      reasonCode: 'POA_EXPLICIT_COLLECT_RESTRICTION',
      basisPoaIds: [],
    };
  }

  const covering = validPoas.filter((p) => poaCoversCapability(p, capability));
  if (covering.length === 0) {
    return { capability, allowed: false, reasonCode: 'POA_SCOPE_NOT_COVERED', basisPoaIds: [] };
  }

  // Flat bayrak yalnız EK KISITLAMA: false ise POA olsa bile RED (K9.3).
  if (client?.[capability] === false) {
    return { capability, allowed: false, reasonCode: 'FLAT_FLAG_RESTRICTION', basisPoaIds: [] };
  }

  return {
    capability,
    allowed: true,
    reasonCode: 'ALLOWED',
    basisPoaIds: covering.map((p) => p.id).filter((x): x is string => !!x),
  };
}

export interface EffectiveClientCapabilities {
  canCollect: EffectiveCapabilityDecision;
  canWaive: EffectiveCapabilityDecision;
  canSettle: EffectiveCapabilityDecision;
  canRelease: EffectiveCapabilityDecision;
}

export function deriveEffectiveClientCapabilities(
  client: Record<string, unknown> | null | undefined,
  poas: PoaLike[] | null | undefined,
  now: Date,
): EffectiveClientCapabilities {
  return {
    canCollect: decideEffectiveClientCapability(client, poas, 'canCollect', now),
    canWaive: decideEffectiveClientCapability(client, poas, 'canWaive', now),
    canSettle: decideEffectiveClientCapability(client, poas, 'canSettle', now),
    canRelease: decideEffectiveClientCapability(client, poas, 'canRelease', now),
  };
}
