import { BadRequestException } from '@nestjs/common';

/**
 * K3-L (owner kararı 2026-09-28) — çek alacağında kalem bazlı borçlu kümeleri. AVUKAT TEYİDİ BEKLER (RCV-LB-R2-CEK
 * karar paketi H-4); kural tek yerde, bu dosyada.
 *
 *  - Çek bedeli (PRINCIPAL): keşideci (KESIDECI), ciranta (CIRANTA), aval veren (AVAL).
 *  - Çek tazminatı (CHECK_PENALTY): YALNIZ keşideci ve keşideci LEHİNE aval veren. Ciranta ve ciranta lehine aval
 *    veren tazminattan sorumlu DEĞİLDİR.
 *
 * Belirsizlik fail-closed: rolü çek borçlusu olmayan (ASIL_BORCLU, LEHDAR, MUHATAP …) takip edilen borçlu, lehine aval
 * bilgisi olmayan aval veren veya tazminattan sorumlu kimse kalmaması → hata (sessiz "tüm borçlular" YOK).
 */
export const CEK_PRINCIPAL_LIABLE_ROLES = Object.freeze(['KESIDECI', 'CIRANTA', 'AVAL'] as const);

export interface CekCaseDebtorRoleRow {
  readonly debtorId: string;
  readonly role: string;
  readonly avalForDebtorId: string | null;
  readonly lifecycleStatus: string;
}

export interface CekLiabilitySplit {
  readonly principalDebtorIds: readonly string[];
  readonly penaltyDebtorIds: readonly string[];
}

export type CekLiabilityErrorCode =
  | 'LIABLE_DEBTOR_NOT_IN_CASE'
  | 'CHECK_DEBTOR_ROLE_REQUIRED'
  | 'AVAL_BENEFICIARY_REQUIRED'
  | 'CHECK_PENALTY_NO_LIABLE_DEBTOR';

const MESSAGES: Record<CekLiabilityErrorCode, string> = {
  LIABLE_DEBTOR_NOT_IN_CASE: 'Sorumlu borçlu bu dosyanın etkin borçlusu değil.',
  CHECK_DEBTOR_ROLE_REQUIRED: 'Çek alacağında borçlunun rolü keşideci, ciranta veya aval veren olmalıdır.',
  AVAL_BENEFICIARY_REQUIRED: 'Aval verenin kimin lehine aval verdiği dosyada kayıtlı olmalıdır.',
  CHECK_PENALTY_NO_LIABLE_DEBTOR: 'Çek tazminatından sorumlu borçlu yok (keşideci veya keşideci lehine aval veren).',
};

export class CekLiabilityError extends BadRequestException {
  constructor(readonly code: CekLiabilityErrorCode) {
    super({ code, message: MESSAGES[code] });
  }
}

function activeRowsByDebtor(rows: readonly CekCaseDebtorRoleRow[]): Map<string, CekCaseDebtorRoleRow[]> {
  const map = new Map<string, CekCaseDebtorRoleRow[]>();
  for (const row of rows) {
    if (row.lifecycleStatus !== 'ACTIVE') continue;
    map.set(row.debtorId, [...(map.get(row.debtorId) ?? []), row]);
  }
  return map;
}

function drawerIds(byDebtor: Map<string, CekCaseDebtorRoleRow[]>): Set<string> {
  return new Set([...byDebtor.entries()].filter(([, rows]) => rows.some((r) => r.role === 'KESIDECI')).map(([id]) => id));
}

type Eligibility = { readonly principal: boolean; readonly penalty: boolean; readonly unresolvedAval: boolean };

function eligibility(rows: readonly CekCaseDebtorRoleRow[], drawers: Set<string>): Eligibility {
  let principal = false;
  let penalty = false;
  let unresolvedAval = false;
  for (const row of rows) {
    if ((CEK_PRINCIPAL_LIABLE_ROLES as readonly string[]).includes(row.role)) principal = true;
    if (row.role === 'KESIDECI') penalty = true;
    if (row.role === 'AVAL') {
      if (row.avalForDebtorId === null) unresolvedAval = true;
      else if (drawers.has(row.avalForDebtorId)) penalty = true;
    }
  }
  return { principal, penalty, unresolvedAval };
}

/**
 * Takip edilen borçlulardan kalem bazlı kümeleri üretir. Aynı kişinin birden çok rolü olabilir (ör. hem ciranta hem
 * keşideci lehine aval): herhangi bir rolü tazminata uygunsa tazminat kümesine girer.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CekAutoGenerateFormationService.request() → talep anında kalem kümeleri
 * /// </remarks>
 */
export function splitCekLiability(
  rows: readonly CekCaseDebtorRoleRow[],
  pursuedDebtorIds: readonly string[],
): CekLiabilitySplit {
  const byDebtor = activeRowsByDebtor(rows);
  const drawers = drawerIds(byDebtor);
  const principal: string[] = [];
  const penalty: string[] = [];
  for (const debtorId of pursuedDebtorIds) {
    const debtorRows = byDebtor.get(debtorId);
    if (!debtorRows) throw new CekLiabilityError('LIABLE_DEBTOR_NOT_IN_CASE');
    const e = eligibility(debtorRows, drawers);
    if (!e.principal) throw new CekLiabilityError('CHECK_DEBTOR_ROLE_REQUIRED');
    // Lehine aval bilgisi eksik ve başka bir rolden tazminata girmiyorsa sınıflandırılamaz → fail-closed.
    if (e.unresolvedAval && !e.penalty) throw new CekLiabilityError('AVAL_BENEFICIARY_REQUIRED');
    principal.push(debtorId);
    if (e.penalty) penalty.push(debtorId);
  }
  if (penalty.length === 0) throw new CekLiabilityError('CHECK_PENALTY_NO_LIABLE_DEBTOR');
  return Object.freeze({
    principalDebtorIds: Object.freeze([...principal].sort()),
    penaltyDebtorIds: Object.freeze([...penalty].sort()),
  });
}

/**
 * Onay anında: kesinleşecek kalemin borçlularının GÜNCEL rollerle hâlâ o kaleme uygun olduğunu doğrular (onay
 * beklerken rol / lehine aval / etkinlik değiştiyse eski içerik uygulanmaz).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CekAutoGenerateFormationService.finalizeApprovedBatch() → karar transaction'ında, kilitli CaseDebtor satırlarıyla
 * /// </remarks>
 */
export function isCekLiabilityStillValid(
  rows: readonly CekCaseDebtorRoleRow[],
  itemType: 'PRINCIPAL' | 'CHECK_PENALTY',
  debtorIds: readonly string[],
): boolean {
  if (debtorIds.length === 0) return false;
  const byDebtor = activeRowsByDebtor(rows);
  const drawers = drawerIds(byDebtor);
  return debtorIds.every((debtorId) => {
    const debtorRows = byDebtor.get(debtorId);
    if (!debtorRows) return false;
    const e = eligibility(debtorRows, drawers);
    return itemType === 'PRINCIPAL' ? e.principal : e.penalty;
  });
}
