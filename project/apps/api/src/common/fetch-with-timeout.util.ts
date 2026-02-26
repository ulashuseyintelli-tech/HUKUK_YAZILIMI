/**
 * Fetch with Timeout Utility
 * 
 * PF-004: Tüm external API çağrılarında AbortController ile timeout.
 * Default: 10 saniye.
 * 
 * Kullanım:
 *   import { fetchWithTimeout } from '@/common/fetch-with-timeout.util';
 *   const response = await fetchWithTimeout(url, { headers: {...} }, 10_000);
 */

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
