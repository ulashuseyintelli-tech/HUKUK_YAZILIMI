import { ConflictException } from '@nestjs/common';

/**
 * PR-1.3 — DOMAIN-OWNED APPROVAL KORUMASI.
 *
 * SORUN: Generic Onay Kutusu, Client Financial Disclosure (FD) onay taleplerini
 * gösteriyor ve `approve`/`reject` ile TÜKETİYORDU. Ancak FD yaşam döngüsü geçişi
 * (`OFFICE_APPROVAL_PENDING → OFFICE_APPROVED`) yalnız FD domain servisinde yapılır.
 * Sonuç: talep APPROVED oluyor, FD sürümü PENDING'de kalıyor ve FD'nin kendi
 * tamamlama yolu `DISCLOSURE_APPROVAL_REQUEST_CONSUMED` ile kilitleniyordu —
 * bildirim kalıcı olarak donuyordu.
 *
 * ÇÖZÜM: bu tür talepler için generic yüzey KARAR VEREMEZ. Statü DEĞİŞTİRİLMEDEN
 * typed `DOMAIN_ACTION_REQUIRED` döner ve kullanıcı domain ekranına yönlendirilir.
 * Frontend'de gizlemek TEK BAŞINA yeterli değildir; kapı backend'dedir (fail-closed).
 *
 * KAPSAM: yalnız burada listelenen actionCode'lar. Diğer tüm approval türlerinin
 * mevcut davranışı AYNEN korunur.
 */
export const DOMAIN_OWNED_APPROVAL_ACTION_CODES = [
  'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
] as const;

export type DomainOwnedApprovalActionCode = (typeof DOMAIN_OWNED_APPROVAL_ACTION_CODES)[number];

/** Domain ekranına yönlendirme ipucu — ham iç ID İÇERMEZ. */
const DOMAIN_SURFACE_HINT: Record<string, string> = {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE: 'CLIENT_FINANCIAL_DISCLOSURE_WORKSPACE',
};

export function isDomainOwnedApprovalActionCode(actionCode: string | null | undefined): boolean {
  if (typeof actionCode !== 'string') return false;
  return (DOMAIN_OWNED_APPROVAL_ACTION_CODES as readonly string[]).includes(actionCode);
}

/**
 * 409 — generic yüzey bu kararı veremez. Statü DEĞİŞMEZ; çağıran fail-loud biçimde
 * domain ekranına yönlendirilir. Mesaj ham hedef/iç kimlik SIZDIRMAZ.
 */
export class DomainActionRequiredError extends ConflictException {
  constructor(actionCode: string) {
    super({
      statusCode: 409,
      error: 'Domain Action Required',
      code: 'DOMAIN_ACTION_REQUIRED',
      actionCode,
      domainSurface: DOMAIN_SURFACE_HINT[actionCode] ?? null,
      message:
        'Bu onay kararı yalnız ilgili domain ekranından verilebilir; onay kutusundan karar verilemez.',
    });
  }
}

/** Generic karar yollarının BAŞINDA çağrılır — statü mutasyonundan ÖNCE. */
export function assertGenericDecisionAllowed(actionCode: string | null | undefined): void {
  if (isDomainOwnedApprovalActionCode(actionCode)) {
    throw new DomainActionRequiredError(actionCode as string);
  }
}
