/**
 * @deprecated PR-A (ASSIGN-4b-DB) — BU SCRIPT EMEKLİ EDİLDİ; ÇALIŞTIRILAMAZ (hard-fail).
 *
 * NE YAPIYORDU: her CaseLawyer'ın büro `LawyerRank`'ine göre `CaseLawyerRole` + `isResponsible`
 * alanlarını yazıyordu (PARTNER/MANAGER → RESPONSIBLE, AUTHORIZED → ASSIGNED, LAWYER → ASSISTANT,
 * INTERN → INTERN).
 *
 * NEDEN EMEKLİ: `isResponsible`'ı AVUKAT-BAŞINA yazdığı için bir dosyada 0 (hiç PARTNER/MANAGER yok)
 * veya >1 (birden çok PARTNER/MANAGER) sorumlu üretebiliyordu → ASSIGN-4b "her dosyada TAM 1 sorumlu
 * avukat" invariant'ını BOZAR ve CaseLawyer partial unique index'i (`case_lawyer_one_responsible_per_case`)
 * geldikten sonra FAIL eder. Artık GÜVENİLMEZ bir yüzeydir; bu yüzden çalıştırılması hard-fail ile engellenir.
 *
 * BUNUN YERİNE:
 * - Sorumlu-avukat drift onarımı → `src/scripts/fix-case-lawyer-responsible-drift.ts`
 *   (planResponsible reuse, "tam 1 sorumlu" garantisi, dry-run + --apply).
 * - Rol↔rank senkronu HÂLÂ isteniyorsa → AYRI, invariant-aware bir script yazılmalı.
 *   (Bu dosya bilinçli olarak REWRITE EDİLMEDİ; yalnız emekli edildi.)
 *
 * Çağrıldığı yerler:
 * - YOK (emekli). Doğrudan çalıştırılırsa hard-fail (process.exit(1)). CI/runtime DEĞİL.
 */

export const RETIREMENT_NOTICE = [
  "⛔ fix-case-lawyer-roles.ts EMEKLİ EDİLDİ (PR-A / ASSIGN-4b-DB) — çalıştırma engellendi.",
  "   Bu script isResponsible'ı avukat-başına büro-rank'ten yazar → bir dosyada 0 veya >1 sorumlu",
  '   üretir, ASSIGN-4b "tam 1 sorumlu avukat" invariant\'ını bozar ve CaseLawyer partial unique',
  "   index'i (case_lawyer_one_responsible_per_case) sonrası FAIL eder.",
  "   → Sorumlu-avukat drift onarımı: src/scripts/fix-case-lawyer-responsible-drift.ts",
  "   → Rol/rank senkronu gerekiyorsa invariant-aware AYRI bir script yazın.",
].join("\n");

/** Hard-fail: uyarıyı yazar ve süreci 1 ile sonlandırır (asla normal dönmez). */
export function main(): never {
  // eslint-disable-next-line no-console
  console.error(RETIREMENT_NOTICE);
  process.exit(1);
}

// Yalnız DOĞRUDAN çalıştırıldığında hard-fail; import edilince (testte) tetiklenmez.
if (require.main === module) {
  main();
}
