/**
 * Task 11.6 - KVKK Masking Service
 *
 * TC Kimlik, isim, dosya no, tutar maskeleme
 * KVKK m.7 uyumlu
 */

import { Injectable } from '@nestjs/common';

// ═══════════════════════════════════════════════════════════════════════════
// MASKING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export type MaskingLevel = 'NONE' | 'PARTIAL' | 'FULL';

export interface MaskingConfig {
  tcKimlik: MaskingLevel;
  name: MaskingLevel;
  caseNumber: MaskingLevel;
  amount: MaskingLevel;
  address: MaskingLevel;
  phone: MaskingLevel;
  email: MaskingLevel;
  iban: MaskingLevel;
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  tcKimlik: 'PARTIAL',
  name: 'PARTIAL',
  caseNumber: 'NONE',
  amount: 'NONE',
  address: 'PARTIAL',
  phone: 'PARTIAL',
  email: 'PARTIAL',
  iban: 'PARTIAL',
};

export const EXPORT_MASKING_CONFIG: MaskingConfig = {
  tcKimlik: 'FULL',
  name: 'FULL',
  caseNumber: 'PARTIAL',
  amount: 'NONE',
  address: 'FULL',
  phone: 'FULL',
  email: 'FULL',
  iban: 'FULL',
};

// ═══════════════════════════════════════════════════════════════════════════
// MASKING SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class MaskingService {
  /**
   * Mask TC Kimlik number
   * PARTIAL: 123****789
   * FULL: ***********
   */
  maskTcKimlik(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '*'.repeat(11);

    // PARTIAL: show first 3 and last 3
    const clean = value.replace(/\D/g, '');
    if (clean.length !== 11) return '*'.repeat(value.length);

    return `${clean.slice(0, 3)}${'*'.repeat(5)}${clean.slice(-3)}`;
  }

  /**
   * Mask name
   * PARTIAL: A*** B***
   * FULL: [ISIM GIZLI]
   */
  maskName(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[ISIM GIZLI]';

    // PARTIAL: show first letter of each word
    return value
      .split(' ')
      .map((word) =>
        word.length > 0
          ? `${word[0]}${'*'.repeat(Math.max(0, word.length - 1))}`
          : '',
      )
      .join(' ');
  }

  /**
   * Mask case number
   * PARTIAL: 2025-****-001
   * FULL: [DOSYA NO GIZLI]
   */
  maskCaseNumber(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[DOSYA NO GIZLI]';

    // PARTIAL: mask middle part
    const parts = value.split('/');
    if (parts.length >= 3) {
      return `${parts[0]}/${'*'.repeat(parts[1].length)}/${parts[parts.length - 1]}`;
    }
    return value.replace(/\d/g, '*');
  }

  /**
   * Mask amount
   * PARTIAL: 1**.***.** TL
   * FULL: [TUTAR GIZLI]
   */
  maskAmount(value: number | string, level: MaskingLevel = 'NONE'): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const formatted = numValue.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
    });

    if (level === 'NONE') return `${formatted} TL`;
    if (level === 'FULL') return '[TUTAR GIZLI]';

    // PARTIAL: show first digit and magnitude
    const str = formatted.replace(/[.,]/g, '');
    const firstDigit = str[0];
    return `${firstDigit}${'*'.repeat(str.length - 3)},** TL`;
  }

  /**
   * Mask address
   * PARTIAL: *** Mah. *** Sok. No: **
   * FULL: [ADRES GIZLI]
   */
  maskAddress(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[ADRES GIZLI]';

    // PARTIAL: mask specific parts but keep structure
    return value
      .replace(/\b\d+\b/g, '**')
      .replace(
        /\b[A-ZÇĞİÖŞÜa-zçğıöşü]{4,}\b/g,
        (match) => '*'.repeat(match.length),
      );
  }

  /**
   * Mask phone number
   * PARTIAL: 0532 *** ** 89
   * FULL: [TELEFON GIZLI]
   */
  maskPhone(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[TELEFON GIZLI]';

    // PARTIAL: show first 4 and last 2
    const clean = value.replace(/\D/g, '');
    if (clean.length < 10) return '*'.repeat(value.length);

    return `${clean.slice(0, 4)} ${'*'.repeat(3)} ** ${clean.slice(-2)}`;
  }

  /**
   * Mask email
   * PARTIAL: a***@***.com
   * FULL: [E-POSTA GIZLI]
   */
  maskEmail(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[E-POSTA GIZLI]';

    // PARTIAL: show first letter and domain extension
    const atIndex = value.indexOf('@');
    if (atIndex === -1) return '*'.repeat(value.length);

    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    const domainParts = domain.split('.');
    const ext = domainParts[domainParts.length - 1];

    return `${local[0]}${'*'.repeat(Math.max(0, local.length - 1))}@${'*'.repeat(domain.length - ext.length - 1)}.${ext}`;
  }

  /**
   * Mask IBAN
   * PARTIAL: TR** **** **** **** **** **89
   * FULL: [IBAN GIZLI]
   */
  maskIban(value: string, level: MaskingLevel = 'PARTIAL'): string {
    if (level === 'NONE' || !value) return value;
    if (level === 'FULL') return '[IBAN GIZLI]';

    // PARTIAL: show country code and last 2
    const clean = value.replace(/\s/g, '').toUpperCase();
    if (clean.length < 4) return '*'.repeat(value.length);

    const country = clean.slice(0, 2);
    const last2 = clean.slice(-2);
    const middle = '*'.repeat(clean.length - 4);

    // Format with spaces
    const middleFormatted = middle.match(/.{1,4}/g)?.join(' ') || middle;
    return `${country}** ${middleFormatted} ${last2}`;
  }

  /**
   * Apply masking to an object based on config
   */
  maskObject<T extends Record<string, unknown>>(
    obj: T,
    fieldMapping: Partial<Record<keyof T, keyof MaskingConfig>>,
    config: MaskingConfig = DEFAULT_MASKING_CONFIG,
  ): T {
    const result = { ...obj };

    for (const [field, maskType] of Object.entries(fieldMapping)) {
      const value = result[field as keyof T];
      if (value === undefined || value === null) continue;

      const level = config[maskType as keyof MaskingConfig];

      switch (maskType) {
        case 'tcKimlik':
          (result as Record<string, unknown>)[field] = this.maskTcKimlik(
            String(value),
            level,
          );
          break;
        case 'name':
          (result as Record<string, unknown>)[field] = this.maskName(
            String(value),
            level,
          );
          break;
        case 'caseNumber':
          (result as Record<string, unknown>)[field] = this.maskCaseNumber(
            String(value),
            level,
          );
          break;
        case 'amount':
          (result as Record<string, unknown>)[field] = this.maskAmount(
            value as number,
            level,
          );
          break;
        case 'address':
          (result as Record<string, unknown>)[field] = this.maskAddress(
            String(value),
            level,
          );
          break;
        case 'phone':
          (result as Record<string, unknown>)[field] = this.maskPhone(
            String(value),
            level,
          );
          break;
        case 'email':
          (result as Record<string, unknown>)[field] = this.maskEmail(
            String(value),
            level,
          );
          break;
        case 'iban':
          (result as Record<string, unknown>)[field] = this.maskIban(
            String(value),
            level,
          );
          break;
      }
    }

    return result;
  }
}
