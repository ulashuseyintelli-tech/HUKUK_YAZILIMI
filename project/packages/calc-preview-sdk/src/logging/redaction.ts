/**
 * PII Redaction
 * 
 * KVKK compliance: No PII in logs/traces.
 */

import { PII_FIELDS } from '../constants';

/**
 * Redact PII from error messages.
 * Replaces known PII patterns with [REDACTED].
 */
export function redactPii(message: string): string {
  // Telefon desenleri (Türkiye) — TCKN deseninden ÖNCE çalışmalı.
  // 05321234567 gibi 11 haneli bir cep numarası, aksi halde genel 11-hane
  // TCKN kuralına (\b\d{11}\b) takılır. Geçerli bir TCKN asla 0 ile başlamaz,
  // bu yüzden 0 ile başlayan 11 haneli dizi her zaman telefon kabul edilir.
  let result = message.replace(/\b0?5\d{9}\b/g, '[PHONE_REDACTED]');
  result = result.replace(/\+90\s?\d{10}/g, '[PHONE_REDACTED]');

  // TCKN pattern (11 digits; first digit 1-9 — a TCKN never starts with 0)
  result = result.replace(/\b[1-9]\d{10}\b/g, '[TCKN_REDACTED]');

  // Email pattern
  result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  
  // IBAN pattern (Turkish)
  result = result.replace(/TR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}/gi, '[IBAN_REDACTED]');
  
  return result;
}

/**
 * Check if a field name is PII.
 */
export function isPiiField(fieldName: string): boolean {
  return PII_FIELDS.has(fieldName) || 
         PII_FIELDS.has(fieldName.toLowerCase()) ||
         fieldName.toLowerCase().includes('tckn') ||
         fieldName.toLowerCase().includes('kimlik');
}

/**
 * Sanitize an object by removing PII fields.
 * Returns a new object without PII.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (isPiiField(key)) {
      continue; // Skip PII fields entirely
    }
    
    if (typeof value === 'string') {
      result[key as keyof T] = redactPii(value) as T[keyof T];
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key as keyof T] = sanitizeObject(value as Record<string, unknown>) as T[keyof T];
    } else {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  
  return result;
}
