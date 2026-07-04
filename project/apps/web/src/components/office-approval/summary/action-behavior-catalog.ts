// "Onaylanırsa ne değişir?" — actionCode başına SABİT domain açıklaması.
// KURAL: bu metinler savedIntent payload'ından TÜRETİLMEZ; kilitli state-machine/domain bilgisidir
// (Ulaş kararı, GO-IMPLEMENT — Approval Inbox Satır/Detay Zenginleştirmesi, 2026-07-03).
// Yalnız yetkili tarafından onaylanmış actionCode'lar burada yer alır; girilmeyen actionCode için
// impactNotes GÖSTERİLMEZ (uydurma yok) — registry.ts bunu handle eder.
export const ACTION_BEHAVIOR_CATALOG: Record<string, string[]> = {
  COLLECTION_DISPOSITION_POST: [
    "Tahsilat dağıtımı onaylanır.",
    "Onay sonrası dağıtım post edilmeye hazır hale gelir.",
    "Post aşamasında müvekkil/caseClient payable, kesinti, masraf/mahsup satırları kesinleşir.",
  ],
};

export function actionBehaviorNotes(actionCode: string): string[] | undefined {
  return ACTION_BEHAVIOR_CATALOG[actionCode];
}
