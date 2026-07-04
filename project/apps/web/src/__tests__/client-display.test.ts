import { describe, it, expect } from 'vitest';
import {
  clientDisplayName,
  clientIdentity,
  clientPrimaryAddress,
  clientPrimaryEmail,
  clientPrimaryPhone,
  clientTypeKind,
  clientTypeLabel,
} from '@/lib/client-display';

describe('client-display helpers (Task 4A)', () => {
  describe('clientTypeKind / clientTypeLabel', () => {
    it('maps canonical types', () => {
      expect(clientTypeKind('COMPANY')).toBe('COMPANY');
      expect(clientTypeKind('PUBLIC')).toBe('PUBLIC');
      expect(clientTypeKind('PERSON')).toBe('PERSON');
    });
    it('treats deprecated INDIVIDUAL and unknown/null as PERSON (safe default)', () => {
      expect(clientTypeKind('INDIVIDUAL')).toBe('PERSON');
      expect(clientTypeKind(undefined)).toBe('PERSON');
      expect(clientTypeKind(null)).toBe('PERSON');
      expect(clientTypeKind('LEGAL' as any)).toBe('PERSON'); // sahte eski enum -> güvenli
    });
    it('labels in Turkish', () => {
      expect(clientTypeLabel('COMPANY')).toBe('Kurum');
      expect(clientTypeLabel('PUBLIC')).toBe('Kamu');
      expect(clientTypeLabel('PERSON')).toBe('Şahıs');
    });
  });

  describe('clientIdentity', () => {
    it('PERSON -> TCKN', () => {
      expect(clientIdentity({ type: 'PERSON', tckn: '10000000146', vkn: null })).toEqual({
        label: 'TCKN',
        value: '10000000146',
      });
    });
    it('COMPANY/PUBLIC -> VKN', () => {
      expect(clientIdentity({ type: 'COMPANY', tckn: null, vkn: '1234567890' })).toEqual({
        label: 'VKN',
        value: '1234567890',
      });
      expect(clientIdentity({ type: 'PUBLIC', tckn: null, vkn: null })).toEqual({
        label: 'VKN',
        value: null,
      });
    });
  });

  describe('clientPrimaryPhone / clientPrimaryEmail', () => {
    it('prefers isPrimary channel, then first matching channel', () => {
      const contacts = [
        { id: '1', type: 'MOBILE', value: '0530', isPrimary: false },
        { id: '2', type: 'WORK_PHONE', value: '0212', isPrimary: true },
        { id: '3', type: 'EMAIL', value: 'a@b.com', isPrimary: false },
      ];
      expect(clientPrimaryPhone({ contacts })).toBe('0212');
      expect(clientPrimaryEmail({ contacts })).toBe('a@b.com');
    });
    it('falls back to deprecated flat field when no channel', () => {
      expect(clientPrimaryPhone({ contacts: [], phone: '0500' })).toBe('0500');
      expect(clientPrimaryEmail({ contacts: undefined, email: 'x@y.com' })).toBe('x@y.com');
    });
    it('returns null when nothing present', () => {
      expect(clientPrimaryPhone({ contacts: [] })).toBeNull();
      expect(clientPrimaryEmail({ contacts: [] })).toBeNull();
    });
  });

  describe('clientPrimaryAddress', () => {
    it('joins flat address parts, skipping empties', () => {
      expect(
        clientPrimaryAddress({
          address: 'Levent Mah.',
          district: 'Beşiktaş',
          city: 'İstanbul',
          region: null,
          postalCode: '34330',
        }),
      ).toBe('Levent Mah., Beşiktaş/İstanbul, 34330');
    });
    it('returns null when empty', () => {
      expect(clientPrimaryAddress({})).toBeNull();
    });
  });

  describe('clientDisplayName', () => {
    it('follows fallback chain', () => {
      expect(clientDisplayName({ displayName: 'X' })).toBe('X');
      expect(clientDisplayName({ companyName: 'ACME' })).toBe('ACME');
      expect(clientDisplayName({ firstName: 'Ali', lastName: 'Veli' })).toBe('Ali Veli');
      expect(clientDisplayName({ name: 'Legacy' })).toBe('Legacy');
      expect(clientDisplayName({})).toBe('İsimsiz Müvekkil');
    });
  });
});
