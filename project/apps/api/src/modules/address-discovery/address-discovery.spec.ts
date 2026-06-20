import { describeDb } from '../../../test/describe-db';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { AddressDiscoveryService } from './address-discovery.service';
import { ClientInfoRequestService } from './client-info-request.service';
import { CrossFileService } from './cross-file.service';
import { ConfidenceScoreService } from './confidence-score.service';
import { UyapQueryService } from './uyap-query.service';
import { InstitutionLetterService } from './institution-letter.service';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { EmailProviderService } from '../notification/email-provider.service';
import { 
  AddressSource, 
  DebtorType, 
  ClientInfoRequestStatus, 
  UyapQueryStatus,
  CaseStatus,
  CaseType,
  DebtorRole,
  ServiceStatus,
} from '@prisma/client';

/**
 * Address Discovery Module - Integration Tests
 * 
 * Tests:
 * 1. Full research workflow
 * 2. Cross-file matching
 * 3. Confidence score calculation
 * 4. Auto-trigger rules
 */

describeDb('AddressDiscoveryModule Integration Tests', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let addressDiscoveryService: AddressDiscoveryService;
  let clientInfoRequestService: ClientInfoRequestService;
  let crossFileService: CrossFileService;
  let confidenceScoreService: ConfidenceScoreService;
  let uyapQueryService: UyapQueryService;

  // Test data
  const tenantId = 'test-tenant-integration';
  let testCase: any;
  let testDebtor: any;
  let testCaseDebtor: any;
  let testClient: any;
  let testUser: any;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        AddressDiscoveryService,
        ClientInfoRequestService,
        CrossFileService,
        ConfidenceScoreService,
        UyapQueryService,
        InstitutionLetterService,
        CaseDebtorLifecycleGuardService,
        PrismaService,
        {
          provide: EmailProviderService,
          useValue: {
            send: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    addressDiscoveryService = module.get<AddressDiscoveryService>(AddressDiscoveryService);
    clientInfoRequestService = module.get<ClientInfoRequestService>(ClientInfoRequestService);
    crossFileService = module.get<CrossFileService>(CrossFileService);
    confidenceScoreService = module.get<ConfidenceScoreService>(ConfidenceScoreService);
    uyapQueryService = module.get<UyapQueryService>(UyapQueryService);
  });

  beforeEach(async () => {
    // Clean up test data
    await cleanupTestData();
    
    // Create test tenant
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: 'Test Tenant',
        slug: 'test-tenant-int',
        settings: { autoClientInfoRequest: true },
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId,
        email: `test-user-${Date.now()}@test.com`,
        name: 'Test',
        surname: 'User',
        role: 'ADMIN',
        passwordHash: 'test-hash',
      },
    });

    // Create test client
    testClient = await prisma.client.create({
      data: {
        tenantId,
        displayName: 'Test Müvekkil',
        email: 'client@test.com',
        type: 'INDIVIDUAL',
      },
    });

    // Create test debtor
    testDebtor = await prisma.debtor.create({
      data: {
        tenantId,
        name: 'Test Borçlu',
        type: 'INDIVIDUAL',
        tckn: '12345678901',
      },
    });

    // Create test case
    testCase = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `TEST-${Date.now()}`,
        type: CaseType.GENERAL_EXECUTION,
        status: CaseStatus.ACTIVE,
        clientId: testClient.id,
      },
    });

    // Create case-debtor relation
    testCaseDebtor = await prisma.caseDebtor.create({
      data: {
        caseId: testCase.id,
        debtorId: testDebtor.id,
        role: DebtorRole.ASIL_BORCLU,
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await module.close();
  });

  async function cleanupTestData() {
    // Clean in correct order due to foreign keys
    await prisma.addressResearch.deleteMany({ where: { tenantId } });
    await prisma.clientInfoRequest.deleteMany({ where: { tenantId } });
    await prisma.uyapQuery.deleteMany({ where: { tenantId } });
    await prisma.institutionLetter.deleteMany({ where: { tenantId } });
    await prisma.serviceHistory.deleteMany({ where: { caseDebtor: { case: { tenantId } } } });
    await prisma.debtorAddress.deleteMany({ where: { debtor: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
  }

  // ============================================
  // 19.1 Test Full Research Workflow
  // ============================================
  describe('19.1 Full Research Workflow', () => {
    it('should create research record when starting research', async () => {
      const research = await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      expect(research).toBeDefined();
      expect(research.status).toBe('IN_PROGRESS');
      expect(research.startedAt).toBeDefined();
      expect(research.caseDebtorId).toBe(testCaseDebtor.id);
    });

    it('should return existing research if already started', async () => {
      const research1 = await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      const research2 = await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      expect(research1.id).toBe(research2.id);
    });

    it('should get research status with statistics', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      
      const status = await addressDiscoveryService.getResearchStatus(tenantId, testCaseDebtor.id);

      expect(status).toBeDefined();
      expect(status.statistics).toBeDefined();
      expect(status.statistics.totalAddresses).toBe(0);
      expect(status.statistics.verifiedAddresses).toBe(0);
      expect(status.statistics.clientInfoRequests.total).toBe(0);
    });

    it('should suggest client info request as first action', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      
      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].action).toBe('SEND_CLIENT_INFO_REQUEST');
    });

    it('should complete research workflow', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      
      const completed = await addressDiscoveryService.completeResearch(tenantId, testCaseDebtor.id);

      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeDefined();
    });

    it('should mark research as exhausted when no more options', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      
      const exhausted = await addressDiscoveryService.markAsExhausted(tenantId, testCaseDebtor.id);

      expect(exhausted.status).toBe('EXHAUSTED');
    });

    it('should build research timeline with all events', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      
      // Create a client info request
      await prisma.clientInfoRequest.create({
        data: {
          tenantId,
          caseId: testCase.id,
          clientId: testClient.id,
          emailTo: 'test@test.com',
          emailSubject: 'Test',
          emailBody: 'Test body',
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      const timeline = await addressDiscoveryService.getResearchTimeline(tenantId, testCaseDebtor.id);

      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].type).toBe('CLIENT_INFO');
    });
  });

  // ============================================
  // 19.2 Test Cross-File Matching
  // ============================================
  describe('19.2 Cross-File Matching', () => {
    let secondCase: any;
    let secondCaseDebtor: any;

    beforeEach(async () => {
      // Create second case with same debtor (by TCKN)
      const secondDebtor = await prisma.debtor.create({
        data: {
          tenantId,
          name: 'Test Borçlu (Diğer Dosya)',
          type: 'INDIVIDUAL',
          tckn: '12345678901', // Same TCKN
        },
      });

      secondCase = await prisma.case.create({
        data: {
          tenantId,
          fileNumber: `TEST-SECOND-${Date.now()}`,
          type: CaseType.GENERAL_EXECUTION,
          status: CaseStatus.ACTIVE,
          clientId: testClient.id,
        },
      });

      secondCaseDebtor = await prisma.caseDebtor.create({
        data: {
          caseId: secondCase.id,
          debtorId: secondDebtor.id,
          role: DebtorRole.ASIL_BORCLU,
        },
      });

      // Add address to second debtor
      await prisma.debtorAddress.create({
        data: {
          debtorId: secondDebtor.id,
          street: 'Atatürk Cad. No:123',
          city: 'İstanbul',
          district: 'Kadıköy',
          type: 'DECLARED',
          source: 'MERNIS',
          verified: true,
          confidenceScore: 85,
        },
      });
    });

    it('should find same debtor in other cases by TCKN', async () => {
      const matches = await crossFileService.findSameDebtor(tenantId, testDebtor.id);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchType).toBe('TCKN');
    });

    it('should get addresses from other cases', async () => {
      const addresses = await crossFileService.getAddressesFromOtherCases(
        tenantId,
        testDebtor.id,
        testCase.id
      );

      expect(addresses.length).toBeGreaterThan(0);
      expect(addresses[0].city).toBe('İstanbul');
      expect(addresses[0].fromCaseFileNumber).toContain('TEST-SECOND');
    });

    it('should copy address to current case', async () => {
      const addresses = await crossFileService.getAddressesFromOtherCases(
        tenantId,
        testDebtor.id,
        testCase.id
      );

      const result = await crossFileService.copyAddressToCase(
        tenantId,
        addresses[0].addressId,
        testDebtor.id
      );

      expect(result.success).toBe(true);
      expect(result.newAddressId).toBeDefined();

      // Verify address was created
      const newAddress = await prisma.debtorAddress.findUnique({
        where: { id: result.newAddressId },
      });
      expect(newAddress).toBeDefined();
      expect(newAddress?.source).toBe('CROSS_FILE');
    });

    it('should not duplicate address if already exists', async () => {
      // First copy
      const addresses = await crossFileService.getAddressesFromOtherCases(
        tenantId,
        testDebtor.id,
        testCase.id
      );
      await crossFileService.copyAddressToCase(tenantId, addresses[0].addressId, testDebtor.id);

      // Second copy attempt
      const result = await crossFileService.copyAddressToCase(
        tenantId,
        addresses[0].addressId,
        testDebtor.id
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('zaten mevcut');
    });

    it('should detect different address in other case', async () => {
      const hasDifferent = await crossFileService.hasDifferentAddressInOtherCase(
        tenantId,
        testDebtor.id,
        testCase.id
      );

      expect(hasDifferent).toBe(true);
    });

    it('should count cross-file addresses', async () => {
      const count = await crossFileService.getCrossFileAddressCount(
        tenantId,
        testDebtor.id,
        testCase.id
      );

      expect(count).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 19.3 Test Confidence Score Calculation
  // ============================================
  describe('19.3 Confidence Score Calculation', () => {
    it('should calculate high score for MERNIS verified address', () => {
      const score = confidenceScoreService.calculateScore({
        source: 'MERNIS' as AddressSource,
        verified: true,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        totalNotifications: 5,
        successfulNotifications: 4,
      });

      // MERNIS (100 * 0.4) + verified (100 * 0.25) + fresh (100 * 0.2) + 80% success (80 * 0.15)
      // = 40 + 25 + 20 + 12 = 97
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it('should calculate lower score for USER_INPUT unverified address', () => {
      const score = confidenceScoreService.calculateScore({
        source: 'USER_INPUT' as AddressSource,
        verified: false,
        updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days old
        totalNotifications: 0,
        successfulNotifications: 0,
      });

      // USER_INPUT (30 * 0.4) + not verified (0) + old (25 * 0.2) + no notifications (50 * 0.15)
      // = 12 + 0 + 5 + 7.5 = ~25
      expect(score).toBeLessThan(30);
    });

    it('should provide score breakdown', () => {
      const breakdown = confidenceScoreService.getScoreBreakdown({
        source: 'UYAP' as AddressSource,
        verified: true,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        totalNotifications: 10,
        successfulNotifications: 8,
      });

      expect(breakdown.sourceScore).toBe(90); // UYAP
      expect(breakdown.verificationScore).toBe(100); // verified
      expect(breakdown.freshnessScore).toBe(100); // fresh
      expect(breakdown.factors.successRate).toBe(0.8);
    });

    it('should update address score in database', async () => {
      // Create address
      const address = await prisma.debtorAddress.create({
        data: {
          debtorId: testDebtor.id,
          street: 'Test Sokak',
          city: 'Ankara',
          type: 'DECLARED',
          source: 'MERNIS',
          verified: true,
        },
      });

      const score = await confidenceScoreService.updateAddressScore(address.id);

      expect(score).toBeGreaterThan(0);

      // Verify in database
      const updated = await prisma.debtorAddress.findUnique({
        where: { id: address.id },
      });
      expect(updated?.confidenceScore).toBe(score);
    });

    it('should update all scores for debtor', async () => {
      // Create multiple addresses
      await prisma.debtorAddress.createMany({
        data: [
          { debtorId: testDebtor.id, street: 'Adres 1', city: 'İstanbul', type: 'DECLARED', source: 'MERNIS', verified: true },
          { debtorId: testDebtor.id, street: 'Adres 2', city: 'Ankara', type: 'DECLARED', source: 'CLIENT', verified: false },
        ],
      });

      await confidenceScoreService.updateAllScoresForDebtor(testDebtor.id);

      const addresses = await prisma.debtorAddress.findMany({
        where: { debtorId: testDebtor.id },
      });

      expect(addresses.every(a => a.confidenceScore !== null)).toBe(true);
    });

    it('should factor in notification success rate', () => {
      const highSuccessScore = confidenceScoreService.calculateScore({
        source: 'CLIENT' as AddressSource,
        verified: false,
        updatedAt: new Date(),
        totalNotifications: 10,
        successfulNotifications: 10,
      });

      const lowSuccessScore = confidenceScoreService.calculateScore({
        source: 'CLIENT' as AddressSource,
        verified: false,
        updatedAt: new Date(),
        totalNotifications: 10,
        successfulNotifications: 1,
      });

      expect(highSuccessScore).toBeGreaterThan(lowSuccessScore);
    });
  });

  // ============================================
  // 19.4 Test Auto-Trigger Rules
  // ============================================
  describe('19.4 Auto-Trigger Rules', () => {
    it('should suggest UYAP query after 2+ failed notifications', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      // Create failed service history
      await prisma.serviceHistory.createMany({
        data: [
          { caseDebtorId: testCaseDebtor.id, fromStatus: ServiceStatus.SENT, toStatus: ServiceStatus.RETURNED, actionDate: new Date() },
          { caseDebtorId: testCaseDebtor.id, fromStatus: ServiceStatus.SENT, toStatus: ServiceStatus.FAILED, actionDate: new Date() },
        ],
      });

      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);

      const uyapSuggestion = suggestions.find(s => s.action === 'SUGGEST_UYAP_QUERY');
      expect(uyapSuggestion).toBeDefined();
      expect(uyapSuggestion?.reason).toContain('başarısız tebligat');
    });

    it('should suggest institution letter after 3+ failed notifications', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      // Create 3 failed service history
      await prisma.serviceHistory.createMany({
        data: [
          { caseDebtorId: testCaseDebtor.id, fromStatus: ServiceStatus.SENT, toStatus: ServiceStatus.RETURNED, actionDate: new Date() },
          { caseDebtorId: testCaseDebtor.id, fromStatus: ServiceStatus.SENT, toStatus: ServiceStatus.FAILED, actionDate: new Date() },
          { caseDebtorId: testCaseDebtor.id, fromStatus: ServiceStatus.SENT, toStatus: ServiceStatus.RETURNED, actionDate: new Date() },
        ],
      });

      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);

      const letterSuggestion = suggestions.find(s => s.action === 'SUGGEST_INSTITUTION_LETTER');
      expect(letterSuggestion).toBeDefined();
    });

    it('should suggest cross-file check when addresses exist in other cases', async () => {
      // Create another case with same debtor
      const otherDebtor = await prisma.debtor.create({
        data: {
          tenantId,
          name: 'Same Person',
          type: 'INDIVIDUAL',
          tckn: '12345678901',
        },
      });

      const otherCase = await prisma.case.create({
        data: {
          tenantId,
          fileNumber: `OTHER-${Date.now()}`,
          type: CaseType.GENERAL_EXECUTION,
          status: CaseStatus.ACTIVE,
          clientId: testClient.id,
        },
      });

      await prisma.caseDebtor.create({
        data: {
          caseId: otherCase.id,
          debtorId: otherDebtor.id,
          role: DebtorRole.ASIL_BORCLU,
        },
      });

      await prisma.debtorAddress.create({
        data: {
          debtorId: otherDebtor.id,
          street: 'Cross File Address',
          city: 'Bursa',
          type: 'DECLARED',
          source: 'MERNIS',
        },
      });

      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);

      const crossFileSuggestion = suggestions.find(s => s.action === 'CHECK_CROSS_FILE');
      expect(crossFileSuggestion).toBeDefined();
    });

    it('should suggest different UYAP queries for individual vs company', async () => {
      // Test for individual
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);
      const individualSuggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);
      
      const individualUyapSuggestions = individualSuggestions.filter(s => s.action === 'SUGGEST_UYAP_QUERY');
      const individualCodes = individualUyapSuggestions.map(s => s.actionCode);

      // Create company debtor
      const companyDebtor = await prisma.debtor.create({
        data: {
          tenantId,
          name: 'Test Şirket',
          type: 'COMPANY',
          vkn: '1234567890',
        },
      });

      const companyCaseDebtor = await prisma.caseDebtor.create({
        data: {
          caseId: testCase.id,
          debtorId: companyDebtor.id,
          role: DebtorRole.ASIL_BORCLU,
        },
      });

      await addressDiscoveryService.startResearch(tenantId, companyCaseDebtor.id);
      const companySuggestions = await addressDiscoveryService.suggestNextAction(tenantId, companyCaseDebtor.id);
      
      const companyUyapSuggestions = companySuggestions.filter(s => s.action === 'SUGGEST_UYAP_QUERY');
      const companyCodes = companyUyapSuggestions.map(s => s.actionCode);

      // Individual should have AA (MERNİS), Company should have AF (Ticaret Odası)
      expect(individualCodes).toContain('AA');
      expect(companyCodes).toContain('AF');
    });

    it('should not suggest already completed queries', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      // Create completed UYAP query
      await prisma.uyapQuery.create({
        data: {
          tenantId,
          caseDebtorId: testCaseDebtor.id,
          queryType: 'NUFUS_ADRES',
          queryCode: 'AA',
          status: 'COMPLETED',
          requestedBy: testUser.id,
        },
      });

      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);
      
      const aaSuggestion = suggestions.find(s => s.actionCode === 'AA');
      expect(aaSuggestion).toBeUndefined();
    });

    it('should prioritize suggestions correctly', async () => {
      await addressDiscoveryService.startResearch(tenantId, testCaseDebtor.id);

      const suggestions = await addressDiscoveryService.suggestNextAction(tenantId, testCaseDebtor.id);

      // First suggestion should be client info request (priority 1)
      expect(suggestions[0].action).toBe('SEND_CLIENT_INFO_REQUEST');
      
      // Suggestions should be sorted by priority
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i].priority).toBeGreaterThanOrEqual(suggestions[i - 1].priority);
      }
    });
  });
});
