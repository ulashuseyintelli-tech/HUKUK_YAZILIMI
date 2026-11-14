import { unwrapEnvelope } from './api-envelope';

export const CLIENT_EXISTING_RETURNED_MESSAGE =
  'Bu müvekkil zaten kayıtlı; yeni kayıt açılmadı, mevcut kart kullanıldı.';

export const CLIENT_CREATE_RESULT_INVALID_MESSAGE =
  'Müvekkil işlem sonucu doğrulanamadı: geçerli kimlik alınamadı. Otomatik yeniden deneme yapılmadı.';

type ClientCreateResult = Record<string, unknown> & {
  id: string;
  name?: string;
  displayName?: string;
  _existingReturned?: boolean;
};

/** Only interprets the existing POST /clients result; never retries or changes its payload. */
export function readClientCreateResult(response: unknown): ClientCreateResult {
  const client = unwrapEnvelope<ClientCreateResult>(response);
  if (!client || Array.isArray(client) || typeof client.id !== 'string' || !client.id.trim()) {
    throw new Error(CLIENT_CREATE_RESULT_INVALID_MESSAGE);
  }
  return client;
}
