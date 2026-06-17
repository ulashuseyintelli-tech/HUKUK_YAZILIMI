/**
 * Public Intake API (Faz 4.7 PR-A) — AUTH YOK.
 *
 * lib/api.ts'e KASTEN DOKUNULMAZ:
 *  - paralel iş (yeni-takip) ile merge conflict yüzeyini sıfırlar,
 *  - public formda yanlışlıkla personel Bearer token'ının sızmasını önler
 *    (bu dosya hiçbir Authorization header eklemez).
 * Token URL path'inde taşınır ama app log'una/analytics'e YAZILMAZ (4.4 ops kuralı).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface IntakeFormSchema {
  title: string;
  scope: string[]; // ClientIntakeFieldCategory değerleri
}

export interface IntakeFieldInput {
  category: string;
  value: string;
  label?: string;
  note?: string;
}

/** Public uç — Authorization header EKLENMEZ. */
async function publicFetch<T>(token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/public/intake/${encodeURIComponent(token)}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    // Authorization YOK (public). Token'ı LOGLAMA.
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(body.message || "Bağlantı geçersiz veya süresi dolmuş.") as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<T>;
}

/** Form şeması (yalnız başlık + scope; PII yok). */
export function getIntakeForm(token: string): Promise<IntakeFormSchema> {
  return publicFetch<IntakeFormSchema>(token, { method: "GET" });
}

/** Submit (CLIENT_SUBMITTED yazar). hp = honeypot (gerçek kullanıcı boş bırakır). */
export function submitIntake(
  token: string,
  fields: IntakeFieldInput[],
  hp?: string
): Promise<{ ok: boolean }> {
  return publicFetch<{ ok: boolean }>(token, {
    method: "POST",
    body: JSON.stringify({ fields, hp }),
  });
}
