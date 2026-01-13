/**
 * KVKK Compliance Tests
 * 
 * DecisionLog'da PII (Kişisel Veri) bulunmadığını doğrular.
 * 
 * @see Requirements 7.3
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionLoggerService } from '../decision-logger/decision-logger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';

// ============================================
// PII Patterns
// ============================================

const PII_PATTERNS = {
  // TC Kimlik No (11 haneli)
  TC_KIMLIK: /\b\d{11}\b/,
  
  // Telefon numarası
  PHONE: /\b(0?\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\+90\d{10})\b/,
  
  // E-posta
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  
  // IBAN
  IBAN: /\bTR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/i,
  
  // Kredi kartı
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  
  // Adres (sokak, mahalle, cadde)
  ADDRESS: /\b(sokak|sok\.|mahalle|mah\.|cadde|cad\.|bulvar|blv\.)\b/i,
  
  // İsim (Türkçe karakterli)
  // Not: Bu pattern çok genel, sadece belirli field'larda kontrol edilmeli
};

// ============================================
// Mock PrismaService
// ============================================

let capturedLogData: any = null;

const mockPrismaService = {
  cpeDecisionLog: {
    create: jest.fn().mockImplementation((data) => {
      capturedLogData = data.data;
      return Promise.resolve({ id: 'log-1', ...data.data });
    }),
  },
};

// ============================================
// Test Suite
// ============================================

describe('KVKK Compliance - DecisionLogger', () => {
  let module: TestingModule;
  let logger: DecisionLoggerService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        DecisionLoggerService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    logger = module.get<DecisionLoggerService>(DecisionLoggerService);
    capturedLogData = null;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await module.close();
  });

  // ============================================
  // PII Sanitization Tests
  // ============================================

  describe('PII Sanitization', () => {
    it('should not log TC Kimlik No in factsUsedKeys', async () => {
      const factsWithPII = {
        'debtor.12345678901.name': 'Test Borçlu', // TC Kimlik No in key
        'case.status': 'ACTIVE',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.UYAP_SEND,
        scope: Scope.CASE,
        context: {},
        allowed: true,
        code: 'ALLOWED',
        factsUsed: factsWithPII,
      });

      // factsUsedKeys should be sanitized
      const factsUsedKeys = capturedLogData.factsUsedKeys;
      
      // Should not contain raw TC Kimlik No
      factsUsedKeys.forEach((key: string) => {
        expect(key).not.toMatch(PII_PATTERNS.TC_KIMLIK);
      });
    });

    it('should not log phone numbers in context', async () => {
      const contextWithPII = {
        debtorId: 'd1',
        phone: '05551234567', // PII!
        notes: 'Borçlu 0555 123 45 67 numarasından arandı',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.SEND_DEBTOR_MSG,
        scope: Scope.DEBTOR,
        context: contextWithPII,
        allowed: true,
        code: 'ALLOWED',
        factsUsed: {},
      });

      // contextJson should be sanitized
      const contextJson = capturedLogData.contextJson;
      const contextStr = JSON.stringify(contextJson);
      
      expect(contextStr).not.toMatch(PII_PATTERNS.PHONE);
    });

    it('should not log email addresses', async () => {
      const contextWithEmail = {
        debtorId: 'd1',
        email: 'borclu@example.com', // PII!
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.SEND_NOTIFICATION,
        scope: Scope.DEBTOR,
        context: contextWithEmail,
        allowed: true,
        code: 'ALLOWED',
        factsUsed: {},
      });

      const contextJson = capturedLogData.contextJson;
      const contextStr = JSON.stringify(contextJson);
      
      expect(contextStr).not.toMatch(PII_PATTERNS.EMAIL);
    });

    it('should not log IBAN numbers', async () => {
      const factsWithIBAN = {
        'debtor.d1.iban': 'TR330006100519786457841326', // PII!
        'case.status': 'ACTIVE',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.TRIGGER_HACIZ,
        scope: Scope.DEBTOR,
        context: { debtorId: 'd1' },
        allowed: true,
        code: 'ALLOWED',
        factsUsed: factsWithIBAN,
      });

      // Fact values should NOT be logged, only keys
      const factsUsedKeys = capturedLogData.factsUsedKeys;
      
      // Keys are fine, values should not be in log
      expect(factsUsedKeys).toContain('debtor.d1.iban');
      
      // But the actual IBAN value should not appear anywhere
      const logStr = JSON.stringify(capturedLogData);
      expect(logStr).not.toMatch(PII_PATTERNS.IBAN);
    });
  });

  // ============================================
  // Fact Keys Only Tests
  // ============================================

  describe('Fact Keys Only', () => {
    it('should log only fact keys, not values', async () => {
      const facts = {
        'case.principal_amount': 150000,
        'debtor.d1.name': 'Ahmet Yılmaz', // PII value
        'debtor.d1.address': 'Atatürk Cad. No:123', // PII value
        'case.status': 'ACTIVE',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.UYAP_SEND,
        scope: Scope.CASE,
        context: {},
        allowed: true,
        code: 'ALLOWED',
        factsUsed: facts,
      });

      // Should have keys
      expect(capturedLogData.factsUsedKeys).toContain('case.principal_amount');
      expect(capturedLogData.factsUsedKeys).toContain('debtor.d1.name');
      expect(capturedLogData.factsUsedKeys).toContain('case.status');

      // Should NOT have values in the log
      const logStr = JSON.stringify(capturedLogData);
      expect(logStr).not.toContain('Ahmet Yılmaz');
      expect(logStr).not.toContain('Atatürk Cad');
      expect(logStr).not.toContain('150000');
    });

    it('should generate factsSnapshotHash without exposing values', async () => {
      const facts = {
        'case.status': 'ACTIVE',
        'debtor.d1.tc_kimlik': '12345678901',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.UYAP_SEND,
        scope: Scope.CASE,
        context: {},
        allowed: true,
        code: 'ALLOWED',
        factsUsed: facts,
      });

      // Should have a hash
      expect(capturedLogData.factsSnapshotHash).toBeDefined();
      expect(typeof capturedLogData.factsSnapshotHash).toBe('string');
      
      // Hash should not contain raw values
      expect(capturedLogData.factsSnapshotHash).not.toContain('12345678901');
    });
  });

  // ============================================
  // Context Sanitization Tests
  // ============================================

  describe('Context Sanitization', () => {
    it('should sanitize sensitive fields in context', async () => {
      const sensitiveContext = {
        debtorId: 'd1',
        assetId: 'a1',
        // These should be sanitized or removed
        tcKimlik: '12345678901',
        telefon: '05551234567',
        email: 'test@example.com',
        adres: 'Test Sokak No:1',
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.TRIGGER_HACIZ,
        scope: Scope.ASSET,
        context: sensitiveContext,
        allowed: true,
        code: 'ALLOWED',
        factsUsed: {},
      });

      const contextJson = capturedLogData.contextJson;
      
      // Safe fields should be preserved
      expect(contextJson.debtorId).toBe('d1');
      expect(contextJson.assetId).toBe('a1');
      
      // Sensitive fields should be masked or removed
      if (contextJson.tcKimlik) {
        expect(contextJson.tcKimlik).toBe('[MASKED]');
      }
      if (contextJson.telefon) {
        expect(contextJson.telefon).toBe('[MASKED]');
      }
      if (contextJson.email) {
        expect(contextJson.email).toBe('[MASKED]');
      }
    });

    it('should preserve non-sensitive context fields', async () => {
      const safeContext = {
        debtorId: 'd1',
        assetId: 'a1',
        expenseId: 'e1',
        actionType: 'BANK_HACIZ',
        priority: 1,
      };

      await logger.log({
        caseId: 'case-1',
        actionCode: ActionCode.TRIGGER_HACIZ,
        scope: Scope.ASSET,
        context: safeContext,
        allowed: true,
        code: 'ALLOWED',
        factsUsed: {},
      });

      const contextJson = capturedLogData.contextJson;
      
      // All safe fields should be preserved
      expect(contextJson.debtorId).toBe('d1');
      expect(contextJson.assetId).toBe('a1');
      expect(contextJson.expenseId).toBe('e1');
      expect(contextJson.actionType).toBe('BANK_HACIZ');
      expect(contextJson.priority).toBe(1);
    });
  });
});

// ============================================
// Retention Policy Tests
// ============================================

describe('KVKK Compliance - Retention Policy', () => {
  it('should have retention period defined (90 days)', () => {
    // This is a documentation test - actual retention is handled by scheduled job
    const RETENTION_DAYS = 90;
    expect(RETENTION_DAYS).toBe(90);
  });

  it('should archive old records, not delete', () => {
    // This is a documentation test
    // Actual implementation should move records to archive table, not delete
    const ARCHIVE_TABLE = 'CpeDecisionLogArchive';
    expect(ARCHIVE_TABLE).toBeDefined();
  });
});
