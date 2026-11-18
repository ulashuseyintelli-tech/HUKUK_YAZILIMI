/**
 * "Büro yönetim ve onay yetkisi (delege)" ayarının ekrandaki adı ve kapsamı (owner 18.11.2026: ayar gerçek yetkilerini açıkça
 * anlatsın; yetki modeli DEĞİŞMEZ).
 *
 * Kaynak: `Lawyer.canApproveOfficeActions = true` (yalnız personel olmayan, büroya bağlı avukat). Sunucu bu bayrağı şu yüklemlerde
 * PARTNER ile eş tutar (kod 18.11.2026'da doğrulandı; canlı R14-R08 R4B ve main aynı):
 *  - `OfficeApprovalService.isApproverEligible` / onay politikaları → ofis onay talebi onayı; talep sahibi kendi talebini onaylayamaz
 *    (SELF_APPROVAL_FORBIDDEN).
 *  - `OfficeApprovalService.isF01ActorAuthorized` (F01 yönetim yazması) → `OfficeF01AuthorizationGuard` korumalı büro uçları
 *    (office, lawyer, staff, message-template, client-notification) ve `CaseService.assertCanGrantCasePermissions` (dosya ekibi
 *    üyeliği, dosya yetkisi verme).
 *  - Kayıt yaşam döngüsü kapıları: müvekkil arşiv / silme, borçlu silme, dosya borçlusu pasifleştirme, portal erişimi açma / kapama,
 *    operasyonel eskalasyon tetikleme.
 * Bayrağın kendisini yalnız ADMIN veya PARTNER değiştirebilir (`LawyerService` K1-4b).
 */
export const OFFICE_DELEGATE_LABEL = "Büro yönetim ve onay yetkisi (delege)";

export const OFFICE_DELEGATE_SCOPE_INTRO = "Açıkken bu avukat, ortak avukat olmasa da şunları yapabilir:";

export const OFFICE_DELEGATE_SCOPE_ITEMS: readonly string[] = [
  "Ofis onay taleplerini onaylar (kendi açtığı talebi onaylayamaz).",
  "Dosya ekibine avukat ve personel ekler ya da çıkarır; dosya yetkisi verir.",
  "Büro Ayarları'nda yönetim değişikliği yapar: avukat ve personel kartları, büro bilgileri, bildirim ve mesaj şablonları.",
  "Müvekkil ve borçlu kaydını arşivler ya da siler, portal erişimini açar ya da kapatır, operasyonel eskalasyonu başlatır.",
];

export const OFFICE_DELEGATE_SCOPE_CHANGE_NOTE = "Bu ayarı yalnız ADMIN veya ortak avukat değiştirebilir.";
