/**
 * G4a classifier testleri — summary-engine'den çıkarılan TEK OTORİTE sınıflandırma.
 * Davranış summary-engine (PR-AO-3/doc-27) ile BİREBİR olmalı.
 */

import { AncillaryType } from '../../types/domain.types';
import {
  mapItemTypeToAncillary,
  isCostItemType,
  classifyClaimItemType,
} from '../claim-item-classifier';

describe('claim-item-classifier (G4a)', () => {
  describe('mapItemTypeToAncillary (doc-27/PR-AO-3 eşleme)', () => {
    it('masraf/fer\'i eşlemeleri', () => {
      expect(mapItemTypeToAncillary('FEE')).toBe(AncillaryType.HARC);
      expect(mapItemTypeToAncillary('EXPENSE')).toBe(AncillaryType.TEBLIGAT_MASRAFI);
      expect(mapItemTypeToAncillary('ATTORNEY_FEE')).toBe(AncillaryType.VEKALET_UCRETI);
      expect(mapItemTypeToAncillary('CHECK_PENALTY')).toBe(AncillaryType.CEK_TAZMINATI);
      expect(mapItemTypeToAncillary('PENALTY')).toBe(AncillaryType.DIGER);
      expect(mapItemTypeToAncillary('CONTRACTUAL_PENALTY')).toBe(AncillaryType.DIGER);
      expect(mapItemTypeToAncillary('COMMISSION')).toBe(AncillaryType.KOMISYON);
      expect(mapItemTypeToAncillary('OTHER')).toBe(AncillaryType.DIGER);
    });

    it('eşlenmeyen → null (PRINCIPAL/INTEREST/TAX)', () => {
      expect(mapItemTypeToAncillary('PRINCIPAL')).toBeNull();
      expect(mapItemTypeToAncillary('INTEREST')).toBeNull();
      expect(mapItemTypeToAncillary('TAX_KDV')).toBeNull();
      expect(mapItemTypeToAncillary('NONEXISTENT')).toBeNull();
    });
  });

  describe('isCostItemType (FEE/EXPENSE/COMMISSION = masraf)', () => {
    it('masraf türleri → true', () => {
      expect(isCostItemType('FEE')).toBe(true);
      expect(isCostItemType('EXPENSE')).toBe(true);
      expect(isCostItemType('COMMISSION')).toBe(true);
    });
    it('fer\'i/diğer → false', () => {
      expect(isCostItemType('ATTORNEY_FEE')).toBe(false);
      expect(isCostItemType('PENALTY')).toBe(false);
      expect(isCostItemType('OTHER')).toBe(false);
    });
  });

  describe('classifyClaimItemType', () => {
    it('PRINCIPAL → category PRINCIPAL', () => {
      expect(classifyClaimItemType('PRINCIPAL')).toEqual({ category: 'PRINCIPAL' });
    });

    it('INTEREST/PRE_INTEREST/POST_INTEREST → category INTEREST', () => {
      expect(classifyClaimItemType('INTEREST')).toEqual({ category: 'INTEREST' });
      expect(classifyClaimItemType('PRE_INTEREST')).toEqual({ category: 'INTEREST' });
      expect(classifyClaimItemType('POST_INTEREST')).toEqual({ category: 'INTEREST' });
    });

    it('TAX_* → category TAX', () => {
      expect(classifyClaimItemType('TAX_KDV')).toEqual({ category: 'TAX' });
      expect(classifyClaimItemType('TAX_BSMV')).toEqual({ category: 'TAX' });
      expect(classifyClaimItemType('TAX_KKDF')).toEqual({ category: 'TAX' });
    });

    it('masraf türleri → COST + doğru ancillaryType', () => {
      expect(classifyClaimItemType('FEE')).toEqual({ category: 'COST', ancillaryType: AncillaryType.HARC });
      expect(classifyClaimItemType('EXPENSE')).toEqual({ category: 'COST', ancillaryType: AncillaryType.TEBLIGAT_MASRAFI });
      expect(classifyClaimItemType('COMMISSION')).toEqual({ category: 'COST', ancillaryType: AncillaryType.KOMISYON });
    });

    it('fer\'i türleri → ANCILLARY + doğru ancillaryType', () => {
      expect(classifyClaimItemType('ATTORNEY_FEE')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.VEKALET_UCRETI });
      expect(classifyClaimItemType('CHECK_PENALTY')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.CEK_TAZMINATI });
      expect(classifyClaimItemType('PENALTY')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.DIGER });
      expect(classifyClaimItemType('CONTRACTUAL_PENALTY')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.DIGER });
      expect(classifyClaimItemType('OTHER')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.DIGER });
    });

    it('bilinmeyen → category UNKNOWN', () => {
      expect(classifyClaimItemType('NONEXISTENT')).toEqual({ category: 'UNKNOWN' });
    });
  });
});
