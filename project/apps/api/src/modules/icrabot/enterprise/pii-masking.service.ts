/**
 * PII MASKING SERVICE (v38)
 * 
 * Kişisel verilerin maskelenmesi.
 * KVKK uyumluluğu için rol bazlı PII erişimi.
 */

import { Injectable, Logger } from '@nestjs/common';

export type UserRole = 'ADMIN' | 'OPS' | 'LAWYER' | 'VIEWER';

export interface PiiMaskingConfig {
  field: string;
  maskFn: (value: string) => string;
  rolesAllowed: UserRole[];
}

@Injectable()
export class PiiMaskingService {
  private readonly logger = new Logger(PiiMaskingService.name);

  private readonly config: PiiMaskingConfig[] = [
    {
      field: 'identityNo',
      maskFn: this.maskIdentityNo,
      rolesAllowed: ['ADMIN', 'LAWYER'],
    },
    {
      field: 'tckn',
      maskFn: this.maskIdentityNo,
      rolesAllowed: ['ADMIN', 'LAWYER'],
    },
    {
      field: 'phone',
      maskFn: this.maskPhone,
      rolesAllowed: ['ADMIN', 'OPS', 'LAWYER'],
    },
    {
      field: 'email',
      maskFn: this.maskEmail,
      rolesAllowed: ['ADMIN', 'OPS', 'LAWYER'],
    },
    {
      field: 'address',
      maskFn: this.maskAddress,
      rolesAllowed: ['ADMIN', 'LAWYER'],
    },
  ];

  /**
   * Mask identity number (TCKN)
   */
  private maskIdentityNo(value: string): string {
    const v = (value || '').trim();
    return v.length >= 4 ? '******' + v.slice(-4) : '******';
  }

  /**
   * Mask phone number
   */
  private maskPhone(value: string): string {
    const v = (value || '').trim();
    return v.length >= 2 ? '***' + v.slice(-2) : '***';
  }

  /**
   * Mask email
   */
  private maskEmail(value: string): string {
    const v = (value || '').trim();
    if (!v.includes('@')) return '***';
    const [left] = v.split('@');
    return (left?.[0] || '*') + '***@***';
  }

  /**
   * Mask address
   */
  private maskAddress(value: string): string {
    const v = (value || '').trim();
    if (v.length <= 10) return '***';
    return v.slice(0, 5) + '...' + v.slice(-5);
  }

  /**
   * Apply PII masking to a record based on user role
   */
  applyMask<T extends Record<string, any>>(
    record: T,
    userRole: UserRole,
  ): T {
    const result = { ...record };

    for (const cfg of this.config) {
      if (cfg.field in result && result[cfg.field] != null) {
        // Check if user role is allowed to see unmasked data
        if (!cfg.rolesAllowed.includes(userRole)) {
          result[cfg.field] = cfg.maskFn(String(result[cfg.field]));
        }
      }
    }

    return result;
  }

  /**
   * Apply PII masking to an array of records
   */
  applyMaskToArray<T extends Record<string, any>>(
    records: T[],
    userRole: UserRole,
  ): T[] {
    return records.map((r) => this.applyMask(r, userRole));
  }

  /**
   * Check if a field should be masked for a given role
   */
  shouldMask(field: string, userRole: UserRole): boolean {
    const cfg = this.config.find((c) => c.field === field);
    if (!cfg) return false;
    return !cfg.rolesAllowed.includes(userRole);
  }
}
