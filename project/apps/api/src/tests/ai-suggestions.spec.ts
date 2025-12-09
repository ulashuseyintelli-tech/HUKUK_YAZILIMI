/**
 * AI Suggestions Tests - Madde 60
 * AI önerilerinin kontrol listesi
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../modules/ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiService - Suggestion Tests', () => {
  let service: AiService;
  let prisma: PrismaService;

  const mockPrisma = {
    case: {
      findUnique: jest.fn(),
    },
    decisionLog: {
      create: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return null; // Fallback mode için
      if (key === 'OPENAI_MODEL') return 'gpt-4';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rule-Based Suggestions (Fallback Mode)', () => {
    it('should suggest payment order for INITIAL stage', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'INITIAL',
        principalAmount: 50000,
        riskScore: 40,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].action).toContain('Ödeme emri');
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(90);
    });

    it('should suggest notification check for PAYMENT_ORDER stage', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'PAYMENT_ORDER',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].action).toContain('Tebligat');
    });

    it('should suggest bank seizure for ENFORCEMENT stage', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'ENFORCEMENT',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.action.includes('Banka') || s.action.includes('haciz'))).toBe(true);
    });

    it('should suggest sale request for SEIZURE stage', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'SEIZURE',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].action).toContain('Satış');
    });
  });

  describe('Prediction Tests', () => {
    it('should increase collection probability with assets', async () => {
      const mockCaseWithAssets = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'ENFORCEMENT',
        principalAmount: 50000,
        riskScore: 40,
        debtors: [{
          debtor: {
            assets: [{ type: 'VEHICLE', value: 100000 }],
          },
        }],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCaseWithAssets);

      const prediction = await service.getPrediction('case-1');

      expect(prediction.collectionProbability).toBeGreaterThan(50);
    });

    it('should decrease collection probability with high risk score', async () => {
      const mockCaseHighRisk = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'ENFORCEMENT',
        principalAmount: 50000,
        riskScore: 85, // Yüksek risk
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCaseHighRisk);

      const prediction = await service.getPrediction('case-1');

      expect(prediction.collectionProbability).toBeLessThan(50);
      expect(prediction.riskFactors).toContain('Yüksek risk skoru');
    });

    it('should recommend installment for partial payments', async () => {
      const mockCaseWithPayments = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'ENFORCEMENT',
        principalAmount: 50000,
        riskScore: 40,
        debtors: [],
        collections: [{ amount: 10000 }], // Kısmi ödeme var
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCaseWithPayments);

      const prediction = await service.getPrediction('case-1');

      expect(prediction.recommendations.some(r => r.includes('taksit'))).toBe(true);
    });
  });

  describe('Suggestion Validation', () => {
    it('should have valid confidence scores (0-100)', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'INITIAL',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      suggestions.forEach(s => {
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid priority values', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'INITIAL',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      suggestions.forEach(s => {
        expect(validPriorities).toContain(s.priority);
      });
    });

    it('should include reasoning for each suggestion', async () => {
      const mockCase = {
        id: 'case-1',
        fileNumber: '2024/1234',
        type: 'GENERAL_EXECUTION',
        workflowStage: 'INITIAL',
        principalAmount: 50000,
        debtors: [],
        collections: [],
        enforcementActions: [],
        decisionLogs: [],
        lifecycleEvents: [],
        riskReports: [],
        formType: null,
      };

      mockPrisma.case.findUnique.mockResolvedValue(mockCase);

      const suggestions = await service.getSuggestions('case-1');

      suggestions.forEach(s => {
        expect(s.reasoning).toBeDefined();
        expect(s.reasoning.length).toBeGreaterThan(0);
      });
    });
  });
});
