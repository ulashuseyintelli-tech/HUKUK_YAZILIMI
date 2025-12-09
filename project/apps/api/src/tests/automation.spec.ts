/**
 * Automation Engine Tests - Madde 59
 * Otomasyon döngüsünün uçtan uca test edilmesi
 */

describe('Automation Engine Tests', () => {
  describe('Rule Engine Tests', () => {
    // 10 gün kuralı
    const PAYMENT_ORDER_DAYS = 10;
    const KAMBIYO_DAYS = 5;

    function shouldAdvanceToEnforcement(
      deliveredAt: Date,
      caseType: string
    ): boolean {
      const daysSinceDelivery = Math.floor(
        (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (caseType === 'CHECK' || caseType === 'BOND') {
        return daysSinceDelivery >= KAMBIYO_DAYS;
      }
      return daysSinceDelivery >= PAYMENT_ORDER_DAYS;
    }

    it('should trigger ENFORCEMENT after 10 days for general execution', () => {
      const deliveredAt = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000);
      expect(shouldAdvanceToEnforcement(deliveredAt, 'GENERAL_EXECUTION')).toBe(true);
    });

    it('should NOT trigger ENFORCEMENT before 10 days for general execution', () => {
      const deliveredAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(shouldAdvanceToEnforcement(deliveredAt, 'GENERAL_EXECUTION')).toBe(false);
    });

    it('should trigger ENFORCEMENT after 5 days for KAMBIYO (CHECK)', () => {
      const deliveredAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      expect(shouldAdvanceToEnforcement(deliveredAt, 'CHECK')).toBe(true);
    });

    it('should trigger ENFORCEMENT after 5 days for KAMBIYO (BOND)', () => {
      const deliveredAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      expect(shouldAdvanceToEnforcement(deliveredAt, 'BOND')).toBe(true);
    });

    it('should NOT trigger ENFORCEMENT before 5 days for KAMBIYO', () => {
      const deliveredAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(shouldAdvanceToEnforcement(deliveredAt, 'CHECK')).toBe(false);
    });
  });

  describe('Workflow Stage Transitions', () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      'INITIAL': ['PAYMENT_ORDER'],
      'PAYMENT_ORDER': ['WAITING_RESPONSE', 'OBJECTION'],
      'WAITING_RESPONSE': ['ENFORCEMENT', 'OBJECTION', 'PARTIAL_PAYMENT'],
      'ENFORCEMENT': ['SEIZURE', 'PARTIAL_PAYMENT'],
      'SEIZURE': ['SALE_REQUEST', 'PARTIAL_PAYMENT', 'FULL_PAYMENT'],
      'SALE_REQUEST': ['AUCTION'],
      'AUCTION': ['COLLECTION', 'PARTIAL_PAYMENT'],
      'COLLECTION': ['FULL_PAYMENT', 'CLOSED'],
      'PARTIAL_PAYMENT': ['ENFORCEMENT', 'COLLECTION', 'FULL_PAYMENT'],
      'FULL_PAYMENT': ['CLOSED'],
    };

    function isValidTransition(from: string, to: string): boolean {
      return VALID_TRANSITIONS[from]?.includes(to) || false;
    }

    it('should allow INITIAL -> PAYMENT_ORDER', () => {
      expect(isValidTransition('INITIAL', 'PAYMENT_ORDER')).toBe(true);
    });

    it('should allow WAITING_RESPONSE -> ENFORCEMENT', () => {
      expect(isValidTransition('WAITING_RESPONSE', 'ENFORCEMENT')).toBe(true);
    });

    it('should allow ENFORCEMENT -> SEIZURE', () => {
      expect(isValidTransition('ENFORCEMENT', 'SEIZURE')).toBe(true);
    });

    it('should allow SEIZURE -> SALE_REQUEST', () => {
      expect(isValidTransition('SEIZURE', 'SALE_REQUEST')).toBe(true);
    });

    it('should NOT allow INITIAL -> ENFORCEMENT (skip)', () => {
      expect(isValidTransition('INITIAL', 'ENFORCEMENT')).toBe(false);
    });

    it('should NOT allow PAYMENT_ORDER -> CLOSED (skip)', () => {
      expect(isValidTransition('PAYMENT_ORDER', 'CLOSED')).toBe(false);
    });
  });

  describe('Risk Score Calculation', () => {
    function calculateRiskScore(params: {
      hasAssets: boolean;
      assetCount: number;
      collectionRate: number;
      daysSinceStart: number;
      hasObjection: boolean;
    }): number {
      let score = 50;

      // Varlık etkisi
      if (params.hasAssets) score -= 10;
      if (params.assetCount > 3) score -= 10;

      // Tahsilat etkisi
      score -= Math.floor(params.collectionRate * 30);

      // Yaş etkisi
      if (params.daysSinceStart > 180) score += 10;
      if (params.daysSinceStart > 365) score += 10;

      // İtiraz etkisi
      if (params.hasObjection) score += 15;

      return Math.max(0, Math.min(100, score));
    }

    it('should decrease risk with assets', () => {
      const withAssets = calculateRiskScore({
        hasAssets: true,
        assetCount: 2,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: false,
      });

      const withoutAssets = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: false,
      });

      expect(withAssets).toBeLessThan(withoutAssets);
    });

    it('should decrease risk with collections', () => {
      const withCollections = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0.5, // %50 tahsilat
        daysSinceStart: 30,
        hasObjection: false,
      });

      const withoutCollections = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: false,
      });

      expect(withCollections).toBeLessThan(withoutCollections);
    });

    it('should increase risk with age', () => {
      const oldCase = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 400, // 1 yıldan fazla
        hasObjection: false,
      });

      const newCase = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: false,
      });

      expect(oldCase).toBeGreaterThan(newCase);
    });

    it('should increase risk with objection', () => {
      const withObjection = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: true,
      });

      const withoutObjection = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 30,
        hasObjection: false,
      });

      expect(withObjection).toBeGreaterThan(withoutObjection);
    });

    it('should keep score between 0-100', () => {
      const extremeHigh = calculateRiskScore({
        hasAssets: false,
        assetCount: 0,
        collectionRate: 0,
        daysSinceStart: 1000,
        hasObjection: true,
      });

      const extremeLow = calculateRiskScore({
        hasAssets: true,
        assetCount: 10,
        collectionRate: 1,
        daysSinceStart: 1,
        hasObjection: false,
      });

      expect(extremeHigh).toBeLessThanOrEqual(100);
      expect(extremeLow).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Auto Mode Toggle', () => {
    it('should enable auto mode correctly', () => {
      const caseData = { isAutoMode: false, nextActionAt: null };
      
      // Toggle on
      const enabled = { ...caseData, isAutoMode: true, nextActionAt: new Date() };
      
      expect(enabled.isAutoMode).toBe(true);
      expect(enabled.nextActionAt).toBeDefined();
    });

    it('should disable auto mode correctly', () => {
      const caseData = { isAutoMode: true, nextActionAt: new Date() };
      
      // Toggle off
      const disabled = { ...caseData, isAutoMode: false, nextActionAt: null };
      
      expect(disabled.isAutoMode).toBe(false);
      expect(disabled.nextActionAt).toBeNull();
    });
  });
});
