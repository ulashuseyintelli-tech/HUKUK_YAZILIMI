/**
 * TBK100 Interest Accrual Contract v1 (owner-locked, 2026-07-03).
 *
 * İlke: interestStartDate sessizce dueDate/issueDate'ten türetilmez. "Faiz bilgisi eksik" (UNKNOWN)
 * ile "bilinçli faizsiz" (NO_INTEREST) hukuken aynı şey değildir — sessizce karıştırılmaz.
 *
 * Varsayım matrisi (yalnız değer DTO'da hiç sağlanmamışsa uygulanır — mekanik itemType sınıflaması,
 * hukuki tahmin DEĞİL): PRINCIPAL → UNKNOWN (DB default zaten bu). COST/ANCILLARY/TAX/ATTORNEY_FEE →
 * NO_INTEREST (mevcut "sabit tutar" davranışının açık hale getirilmesi, yeni bir karar değil).
 *
 * SAF FONKSİYON: DB/prisma yok. İzole test edilebilir.
 */

import { BadRequestException } from '@nestjs/common';

// ClaimItemType gerçek enum üyeleri (schema.prisma:5026-5041). 'COMMISSION' claim-item-classifier.ts'in
// ancillary-mapping sözlüğünde var ama Prisma ClaimItemType enum'unda YOK (önceden var olan
// tutarsızlık — disposable-DB migration denemesinde bulundu, bu turda dokunulmadı); bu liste yalnız
// GERÇEK enum üyelerini içerir.
const NO_INTEREST_DEFAULT_ITEM_TYPES: ReadonlySet<string> = new Set([
  'EXPENSE',
  'FEE',
  'ATTORNEY_FEE',
  'CHECK_PENALTY',
  'PENALTY',
  'CONTRACTUAL_PENALTY',
  'OTHER',
  'TAX_KDV',
  'TAX_BSMV',
  'TAX_KKDF',
]);

/**
 * itemType'a göre mekanik varsayım (yalnız `provided` undefined ise çağrılır — açık değeri ASLA ezmez).
 */
export function defaultInterestAccrualStatusForItemType(itemType: string): 'UNKNOWN' | 'NO_INTEREST' {
  return NO_INTEREST_DEFAULT_ITEM_TYPES.has(itemType) ? 'NO_INTEREST' : 'UNKNOWN';
}

export interface InterestAccrualEffectiveState {
  interestAccrualStatus: string;
  interestType?: string | null;
  interestStartDate?: string | Date | null;
  interestStartDateProvenance?: string | null;
  noInterestReason?: string | null;
  noInterestConfirmedById?: string | null;
}

/**
 * Yaratma/güncelleme SONRASI etkin durumu (mevcut kayıt + dto override'ları) doğrular.
 * İhlalde BadRequestException fırlatır — sessiz kabul YOK.
 *
 * `noInterestExplicitlyRequested`: true ise (caller dto'da interestAccrualStatus=NO_INTEREST'i AÇIKÇA
 * yazdıysa) audit alanları zorunlu. Mekanik itemType-varsayımı (caller hiç değer göndermediyse) audit
 * İSTEMEZ — bu yeni bir karar değil, mevcut davranışın yazıya dökülmesidir.
 */
export function validateInterestAccrualState(
  state: InterestAccrualEffectiveState,
  noInterestExplicitlyRequested: boolean,
): void {
  const { interestAccrualStatus, interestType, interestStartDate, interestStartDateProvenance } = state;

  if (interestAccrualStatus === 'ACCRUES') {
    if (!interestType) {
      throw new BadRequestException('interestAccrualStatus=ACCRUES için interestType zorunludur.');
    }
    if (!interestStartDateProvenance) {
      throw new BadRequestException('interestAccrualStatus=ACCRUES için interestStartDateProvenance zorunludur.');
    }
    // ENFORCEMENT_PROCEEDING_DATE istisnası: motor Case.caseDate'ten mekanik çözer (assembler'da),
    // DTO seviyesinde interestStartDate zorunlu tutulmaz.
    if (!interestStartDate && interestStartDateProvenance !== 'ENFORCEMENT_PROCEEDING_DATE') {
      throw new BadRequestException(
        'interestAccrualStatus=ACCRUES için interestStartDate zorunludur (yalnız ENFORCEMENT_PROCEEDING_DATE provenance\'ı hariç).',
      );
    }
    return;
  }

  if (interestAccrualStatus === 'NO_INTEREST') {
    if (interestType || interestStartDate || interestStartDateProvenance) {
      throw new BadRequestException(
        'interestAccrualStatus=NO_INTEREST iken interestType/interestStartDate/interestStartDateProvenance boş olmalıdır.',
      );
    }
    if (noInterestExplicitlyRequested) {
      if (!state.noInterestReason || !state.noInterestConfirmedById) {
        throw new BadRequestException(
          'interestAccrualStatus açıkça NO_INTEREST yapılırken noInterestReason ve noInterestConfirmedById zorunludur.',
        );
      }
    }
    return;
  }

  // UNKNOWN: kısıt yok — "henüz bilinmiyor" durumu serbesttir.
}
