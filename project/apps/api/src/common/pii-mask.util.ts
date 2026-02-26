/**
 * PII Masking Utility
 * 
 * PF-003: Logger çıktılarında IBAN, TCKN, telefon gibi hassas verileri maskeler.
 * 
 * Kullanım:
 *   import { maskIban, maskTckn, maskIdentity } from '@/common/pii-mask.util';
 *   this.logger.log(`Bakiye sorgusu: ${maskIban(iban)}`);
 */

/** IBAN maskele: ilk 4 + son 4 karakter görünür */
export function maskIban(iban: string | null | undefined): string {
  if (!iban) return '[NO_IBAN]';
  const clean = iban.replace(/\s/g, '');
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
}

/** TCKN / Identity No maskele: ilk 3 + son 2 karakter görünür */
export function maskTckn(tckn: string | null | undefined): string {
  if (!tckn) return '[NO_TCKN]';
  if (tckn.length <= 5) return '****';
  return `${tckn.slice(0, 3)}****${tckn.slice(-2)}`;
}

/** Genel identity maskele (TCKN veya VKN) */
export function maskIdentity(id: string | null | undefined): string {
  return maskTckn(id);
}

/** Telefon maskele: ilk 4 + son 2 karakter görünür */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '[NO_PHONE]';
  if (phone.length <= 6) return '****';
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

/** Email maskele: ilk 2 karakter + @domain görünür */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[NO_EMAIL]';
  const atIndex = email.indexOf('@');
  if (atIndex <= 2) return `****${email.slice(atIndex)}`;
  return `${email.slice(0, 2)}****${email.slice(atIndex)}`;
}
