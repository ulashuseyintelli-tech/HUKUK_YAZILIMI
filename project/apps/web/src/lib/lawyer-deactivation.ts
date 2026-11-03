// O-1 — Avukat pasifleştirmede devralan (yeni sorumlu avukat) seçimi: backend yanıtının sınıflandırılması.
//
// Backend kuralı DEĞİŞMEZ (lawyer.service.ts `delete`, H1): avukat herhangi bir dosyada sorumluysa
// `replacementLawyerId` ZORUNLUDUR; devralan aynı tenant'ta, aktif ve o dosyaların HEPSİNE zaten atanmış
// olmalıdır — otomatik atama YAPILMAZ. Sorumlu dosyası olmayan avukat gövdesiz isteklerle pasifleşir.
// Web bu yüzden "devralan gerekli mi?" kararını kendi okumasından ÇIKARMAZ (görünür dosya kapsamı eksik
// olabilir); tek doğruluk kaynağı backend yanıtıdır. Bilinmeyen hata GİZLENMEZ: güvenli mesajıyla kalır.

import type { ActionErrorContract } from './action-error';

/** Backend'in eksik atama kodu (gövdede `caseIds` ile gelir). */
export const REPLACEMENT_NOT_ASSIGNED_TO_CASES = 'REPLACEMENT_NOT_ASSIGNED_TO_CASES';

export const REPLACEMENT_REQUIRED_MESSAGE =
  'Bu avukat bir veya daha fazla dosyada sorumlu avukat. Pasifleştirmeden önce bu dosyaları devralacak avukatı seçin. Hiçbir değişiklik yapılmadı.';

export function replacementNotAssignedMessage(count: number): string {
  const kapsam = count > 0 ? `aşağıdaki ${count} dosyaya` : 'sorumlu olunan dosyaların bir kısmına';
  return `Seçilen avukat ${kapsam} henüz atanmamış. Otomatik atama yapılmaz: önce bu dosyalarda avukat atamasını tamamlayın, sonra pasifleştirmeyi yeniden deneyin. Hiçbir değişiklik yapılmadı.`;
}

export type LawyerDeactivationFailure =
  | { kind: 'REPLACEMENT_REQUIRED'; message: string }
  | { kind: 'REPLACEMENT_NOT_ASSIGNED'; message: string; caseIds: string[] }
  | { kind: 'OTHER'; message: string };

/** Dosya kimliği yalnız bağlantıya güvenle konabilecek biçimdeyse taşınır (uuid / cuid). */
const SAFE_CASE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/**
 * `raw`: istemcinin fırlattığı ham hata (`body` + `status`). `actionError`: aynı hatanın `toActionError`
 * ile güvenli kullanıcı yüzeyi — sınıflanamayan her durumda mesaj BUNDAN gelir (gizlenmez).
 *
 * "Devralan gerekli" yanıtının backend'de kodu YOKTUR (düz metin 400). Tanıma yalnız 400 + kodsuz gövde +
 * metindeki alan adı (`replacementLawyerId`) ile yapılır; metin değişirse yanıt `OTHER` olarak AYNEN
 * gösterilir (akış güvenli tarafta kalır, kullanıcı gerekçeyi görür).
 */
export function classifyLawyerDeactivationFailure(
  raw: unknown,
  actionError: ActionErrorContract,
): LawyerDeactivationFailure {
  const e = record(raw);
  const body = record(e?.body) ?? record(record(e?.response)?.data);
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;

  if (code === REPLACEMENT_NOT_ASSIGNED_TO_CASES) {
    const caseIds = Array.isArray(body?.caseIds)
      ? (body!.caseIds as unknown[]).filter((id): id is string => typeof id === 'string' && SAFE_CASE_ID.test(id))
      : [];
    return { kind: 'REPLACEMENT_NOT_ASSIGNED', message: replacementNotAssignedMessage(caseIds.length), caseIds };
  }

  if (
    status === 400 &&
    code === undefined &&
    typeof body?.message === 'string' &&
    body.message.includes('replacementLawyerId')
  ) {
    return { kind: 'REPLACEMENT_REQUIRED', message: REPLACEMENT_REQUIRED_MESSAGE };
  }

  return { kind: 'OTHER', message: actionError.message };
}
