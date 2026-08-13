/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 (S3) — Staff okuma yüzeyi projeksiyonu.
 *
 * ÖLÇÜM (P5-B03 matrisi): GET /api/staff ve GET /api/staff/:id yalnız JwtAuthGuard taşır;
 * tenant'taki HERHANGİ bir authenticated kullanıcı (personel dahil) tüm yetki bayraklarını
 * ve TCKN'yi okuyabiliyordu. Mutasyonlar #2076'dan beri F01 kapılıdır — okuma yüzeyi değildi.
 *
 * S3 (owner-ratified): KAPI değil ALAN-DARALTMA — F01-yetkisiz aktöre liste/detay yanıtından
 * yetki bayrakları ve `tckn` anahtarı TAMAMEN düşürülür (null'a çekilmez; anahtar YOK).
 * İsim/tür/iletişim/sıralama/isDefaultForNewCases korunur → ölçülen tüketici akışları
 * (yeni-takip personel seçici, takip filtre lookup'u, dosya ekip modalı, büro ayarları
 * listesi) KIRILMAZ. F01-yetkili aktörün yanıtı DEĞİŞMEZ (PARTNER/AUTHORIZED akışları
 * korunur — owner yasağı).
 *
 * KAPSAM SABİT: yalnız aşağıdaki alanlar. Yeni alan eklemek kanıt ister; liste testle
 * kilitlidir (lawyer-public-projection emsali).
 */

/** F01-yetkisiz aktörün staff yanıtında ASLA bulunmayacak alanlar. */
export const STAFF_PRIVILEGED_READ_FIELDS = [
  'tckn',
  'canCreateCase',
  'canEditCase',
  'canGenerateDocuments',
  'canApproveDocuments',
  'canSeeFinance',
  'canApproveFinance',
  'canPrepareCollectionDisposition',
  'canSendNotifications',
] as const;

export type StaffPrivilegedReadField = (typeof STAFF_PRIVILEGED_READ_FIELDS)[number];

/** F01-yetkisiz aktöre dönen staff satırı tipi: ayrıcalıklı alanlar TİP düzeyinde de yok. */
export type RestrictedStaffRow<T> = Omit<T, StaffPrivilegedReadField>;

/**
 * Tek staff satırını aktörün F01 yetkisine göre projekte eder. Yetkili aktörde satır
 * DEĞİŞMEZ (referans aynen döner); yetkisiz aktörde ayrıcalıklı anahtarlar TAMAMEN silinir.
 */
export function projectStaffRowForActor<T extends object>(
  row: T,
  f01Authorized: boolean,
): T | RestrictedStaffRow<T> {
  if (f01Authorized) return row;
  const clone: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of STAFF_PRIVILEGED_READ_FIELDS) {
    delete clone[field];
  }
  return clone as RestrictedStaffRow<T>;
}

/** Liste yüzeyleri için; boş dizide boş dizi döner. */
export function projectStaffRowsForActor<T extends object>(
  rows: readonly T[],
  f01Authorized: boolean,
): (T | RestrictedStaffRow<T>)[] {
  return rows.map((r) => projectStaffRowForActor(r, f01Authorized));
}
