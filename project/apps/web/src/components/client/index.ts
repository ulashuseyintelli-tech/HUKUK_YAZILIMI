// Yalnız canlı PoaScannerWizard re-export edilir (0 barrel-consumer; doğrudan path'ten import ediliyor).
// client-profile.tsx KORUNDU (Task 4 Detail Workspace REBIND iskeleti; barrel'a bağlı değil, path'ten gelecek).
// Task 3.6 (owner kararı 2026-06-30): contract-management / notification-preferences / report-subscription /
// communication-history orphan'ları SİLİNDİ (0 consumer; mock/localStorage/paralel-sistem; canlı backend endpoint yok).
export { PoaScannerWizard } from "./PoaScannerWizard";
