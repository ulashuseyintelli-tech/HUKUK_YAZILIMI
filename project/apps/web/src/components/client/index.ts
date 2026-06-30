// Task 3.5: yalnız canlı PoaScannerWizard re-export edilir (0 barrel-consumer; doğrudan path'ten import ediliyor).
// Orphan client component'leri barrel'dan çıkarıldı (ölü re-export): client-profile + communication-history
// = REBIND (Task 4 Detail Workspace), contract-management/notification-preferences/report-subscription
// = owner ürün-kararına ERTELENDİ. Dosyalar siliNMEDİ; yalnız ölü barrel indirection temizlendi.
export { PoaScannerWizard } from "./PoaScannerWizard";
