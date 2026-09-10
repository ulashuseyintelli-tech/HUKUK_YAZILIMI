import { ForbiddenException } from "@nestjs/common";

/**
 * AK-1a (owner GO 2026-09-10) — VIEWER için OFFICE SALT-OKUMA sınırı.
 *
 * `UserRole.VIEWER` OFFICE verisinde (ofis ayarları, banka hesabı, avukat, personel) YAZMA yapamaz — bağlı
 * avukatı PARTNER/MANAGER olsa veya delege bayrağı (`canApproveOfficeActions`) taşısa bile. OKUMA davranışı
 * DEĞİŞMEZ. Yalnız VIEWER elenir; ADMIN/USER mevcut kapılarına (F01, H2, AK-2) tabi kalır.
 *
 * Tek yüklem, üç giriş sınıfı:
 *  - F01 yazma rotaları → `OfficeF01AuthorizationGuard` (POST/PUT/PATCH/DELETE) + `isF01WriteActorAuthorized`
 *  - POST /cases dosya içi avukat → `CaseService.resolveInlinePartiesBeforeTx` ön kontrolü (ilk yazmadan önce)
 *  - seed OFFICE uçları → `SeedController` (lawyers / staff / office / bank-accounts / fix-lawyers)
 */
export const OFFICE_WRITE_DENIED_VIEWER = "OFFICE_WRITE_DENIED_VIEWER";

export function isOfficeWriteDeniedForRole(role: unknown): boolean {
  return role === "VIEWER";
}

export function assertOfficeWriteRole(role: unknown): void {
  if (isOfficeWriteDeniedForRole(role)) {
    throw new ForbiddenException({
      code: OFFICE_WRITE_DENIED_VIEWER,
      message: "Görüntüleyici (VIEWER) rolü OFFICE verisinde yazma işlemi yapamaz.",
    });
  }
}
