// M2-G5d-2: Toplu gerçek-kişi Dosya Sorumlusu atama (frontend multi-PATCH).
// Backend batch endpoint YOK; her seçili dosya için G3a PATCH /cases/:id/responsible-person.
// Saf + testlenebilir: patchFn enjekte edilir. Promise.allSettled → partial success (rollback YOK).

import { buildAssignBody, type ResponsibleSelection } from "@/components/case/responsible-candidate-select";

export interface BulkAssignResult {
  success: string[]; // başarıyla atanan caseId'ler
  failed: { id: string; error: string }[]; // başarısızlar (id + hata mesajı)
}

/**
 * Seçili dosyalara aynı gerçek kişiyi (lawyer/staff) toplu atar.
 * Her dosya bağımsız PATCH'lenir (concurrency limiti YOK — tarayıcı kuyruğa alır).
 * Kısmi başarı mümkün; rollback yoktur → çağıran success/failed sayımını raporlar.
 */
export async function bulkAssignResponsible(
  caseIds: string[],
  person: ResponsibleSelection,
  patchFn: (
    caseId: string,
    body: { responsibleLawyerId?: string; responsibleStaffId?: string }
  ) => Promise<unknown>
): Promise<BulkAssignResult> {
  const body = buildAssignBody(person);
  const results = await Promise.allSettled(caseIds.map((id) => patchFn(id, body)));

  const success: string[] = [];
  const failed: { id: string; error: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      success.push(caseIds[i]);
    } else {
      const reason = r.reason as { message?: string } | undefined;
      failed.push({ id: caseIds[i], error: reason?.message || "Atama başarısız" });
    }
  });

  return { success, failed };
}
