import { BadRequestException } from '@nestjs/common';

/**
 * K3-L Faz 2b — dosya açılışında `caseDebtors[].avalForDebtorId` tutarlılığı (yazma ÖNCESİ, transaction dışı hızlı
 * red; DB CHECK `case_debtor_aval_for_check` son savunma hattıdır): lehine bilgisi yalnız AVAL rolünde, kendisi
 * olamaz, aynı istekteki başka bir dosya borçlusunu göstermelidir. Rol/borçlu değişirse
 * `CaseDebtorService.resolveAvalBeneficiary` (mevcut) sonradan doğrular.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.create() → POST /cases (transaction öncesi)
 * /// </remarks>
 */
export interface CaseDebtorAvalInput {
  readonly debtorId: string;
  readonly role?: string | null;
  readonly avalForDebtorId?: string | null;
}

export function assertAvalBeneficiariesConsistent(caseDebtors: ReadonlyArray<CaseDebtorAvalInput>): void {
  const ids = new Set(caseDebtors.map((d) => d.debtorId));
  for (const d of caseDebtors) {
    const target = d.avalForDebtorId?.trim();
    if (!target) continue;
    const role = String(d.role ?? 'ASIL_BORCLU').toUpperCase();
    if (role !== 'AVAL') {
      throw new BadRequestException({
        code: 'AVAL_BENEFICIARY_ROLE_INVALID',
        message: 'Lehine aval bilgisi yalnız AVAL rolündeki borçluda verilebilir.',
      });
    }
    if (target === d.debtorId) {
      throw new BadRequestException({
        code: 'AVAL_BENEFICIARY_SELF',
        message: 'Aval veren kendi lehine aval veremez.',
      });
    }
    if (!ids.has(target)) {
      throw new BadRequestException({
        code: 'AVAL_BENEFICIARY_NOT_IN_CASE',
        message: 'Lehine aval verilen kişi bu dosyanın borçluları arasında olmalıdır.',
      });
    }
  }
}
