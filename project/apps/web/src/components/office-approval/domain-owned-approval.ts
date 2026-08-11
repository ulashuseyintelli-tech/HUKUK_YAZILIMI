/**
 * PR-1.3 — DOMAIN-OWNED APPROVAL (frontend yansıması).
 *
 * Backend `office-approval-domain-ownership.ts` ile AYNI kümeyi tanır. Bu liste
 * yalnız ARAYÜZ görünürlüğü içindir; gerçek kapı backend'dedir (UI manipüle edilse
 * bile generic karar yolu 409 `DOMAIN_ACTION_REQUIRED` ile reddedilir).
 *
 * Neden gerekli: generic Onay Kutusu FD talebini APPROVED yapıp domain geçişini
 * atlayabiliyordu; bildirim kilitleniyordu. Artık FD talepleri onay kutusunda
 * GÖRÜNÜR ve bekleyen sayısına dahildir, fakat karar oradan VERİLEMEZ.
 */
export const DOMAIN_OWNED_APPROVAL_ACTION_CODES = [
  'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
] as const;

export function isDomainOwnedApproval(actionCode: string | null | undefined): boolean {
  if (typeof actionCode !== 'string') return false;
  return (DOMAIN_OWNED_APPROVAL_ACTION_CODES as readonly string[]).includes(actionCode);
}

/** Kullanıcıya gösterilecek yönlendirme metni — ham iç kimlik İÇERMEZ. */
export const DOMAIN_OWNED_APPROVAL_GUIDANCE: Record<string, string> = {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE:
    'Bu karar finansal bildirim ekranından verilir. Müvekkilin "Finansal Bildirimler" sayfasını açın ve ilgili sürümün onay adımını oradan tamamlayın.',
};

export function domainOwnedApprovalGuidance(actionCode: string): string {
  return (
    DOMAIN_OWNED_APPROVAL_GUIDANCE[actionCode] ??
    'Bu karar yalnız ilgili domain ekranından verilebilir.'
  );
}
