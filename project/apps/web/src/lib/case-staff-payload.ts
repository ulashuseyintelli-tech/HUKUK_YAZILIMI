/**
 * PR-ASSIGN-2b — Yeni takip: seçilen personeli createCase payload'ının `staff[]` alanına çevirir.
 *
 * undefined vs [] AYRIMI (ASSIGN-2a backend kontratı — KRİTİK):
 * - staff = DİZİ      → backend SADECE bu listeyi yazar (isDefaultForNewCases ile MERGE YOK;
 *                       boş [] = kullanıcı "personel istemiyorum" = deselection).
 * - staff = undefined → backend mevcut isDefaultForNewCases davranışına döner (default personel).
 *
 * Karar (Ulaş): /staff listesi BAŞARIYLA yüklendiyse DAİMA dizi gönder (kullanıcı hepsini
 * sildiyse []). /staff YÜKLENEMEDİYSE undefined gönder → backend default personeli eklesin
 * (boş [] gönderip default'ları SESSİZCE DÜŞÜRMEYELİM). Bu yüzden helper `staffListLoaded` alır.
 */
export interface CaseStaffPayloadItem {
  staffMemberId: string;
  roleOnCase?: string;
}

interface SelectedStaffItem {
  id: string;
  roleOnCase?: string;
  staffType?: string;
}

export function buildStaffPayload(
  selectedStaff: SelectedStaffItem[] | null | undefined,
  staffListLoaded: boolean,
): CaseStaffPayloadItem[] | undefined {
  // /staff yüklenemedi (veya henüz yüklenmedi) → undefined → backend default davranışa düşsün.
  if (!staffListLoaded) return undefined;
  // Yüklendi → DAİMA dizi (boş [] dahil = deselection). roleOnCase yoksa staffType'a düş.
  return (selectedStaff ?? []).map((s) => ({
    staffMemberId: s.id,
    roleOnCase: s.roleOnCase || s.staffType,
  }));
}
