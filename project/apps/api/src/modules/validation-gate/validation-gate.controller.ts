import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ValidationGateService, GateId, GateValidationResult } from './validation-gate.service';
import { validateBankClaim, isBankClaim, getBankClaimInterestRules, BankClaimValidation } from './rules/bank-claim.rules';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// MasterValidations tipini export et
export interface MasterValidationsResponse {
  version: number;
  engine: string;
  policies: Record<string, any>;
  case_types: Array<{ code: string; name: string; category: string }>;
  gates: Array<{ id: string; name: string; description: string }>;
}

@Controller('validation-gate')
export class ValidationGateController {
  constructor(private readonly validationGateService: ValidationGateService) {}

  /**
   * Belirli bir gate icin dosyayi validate et
   * POST /api/validation-gate/:caseId/validate/:gateId
   */
  @Post(':caseId/validate/:gateId')
  async validateGate(
    @Param('caseId') caseId: string,
    @Param('gateId') gateId: GateId,
    @Body() additionalData?: Record<string, any>,
  ): Promise<GateValidationResult> {
    return this.validationGateService.validateGate(caseId, gateId, additionalData);
  }

  /**
   * Tum gate'leri validate et
   * POST /api/validation-gate/:caseId/validate-all
   */
  @Post(':caseId/validate-all')
  async validateAllGates(
    @Param('caseId') caseId: string,
    @Body() additionalData?: Record<string, any>,
  ): Promise<Record<GateId, GateValidationResult>> {
    return this.validationGateService.validateAllGates(caseId, additionalData);
  }

  /**
   * Gate 1 - Takip Olusturma validasyonu
   * POST /api/validation-gate/:caseId/case-creation
   */
  @Post(':caseId/case-creation')
  async validateCaseCreation(
    @Param('caseId') caseId: string,
    @Body() additionalData?: Record<string, any>,
  ): Promise<GateValidationResult> {
    return this.validationGateService.validateGate(caseId, 'GATE_1_CASE_CREATION', additionalData);
  }

  /**
   * Gate 2 - Ornek 1 Uretimi validasyonu
   * POST /api/validation-gate/:caseId/ornek1-generation
   */
  @Post(':caseId/ornek1-generation')
  async validateOrnek1Generation(
    @Param('caseId') caseId: string,
    @Body() additionalData?: Record<string, any>,
  ): Promise<GateValidationResult> {
    return this.validationGateService.validateGate(caseId, 'GATE_2_ORNEK1_GENERATION', additionalData);
  }

  /**
   * Gate 3 - Tebligat validasyonu
   * POST /api/validation-gate/:caseId/service-of-process
   */
  @Post(':caseId/service-of-process')
  async validateServiceOfProcess(
    @Param('caseId') caseId: string,
    @Body() additionalData?: Record<string, any>,
  ): Promise<GateValidationResult> {
    return this.validationGateService.validateGate(caseId, 'GATE_3_SERVICE_OF_PROCESS', additionalData);
  }

  /**
   * Gate 4 - UYAP Gonderimi validasyonu
   * POST /api/validation-gate/:caseId/uyap-integration
   */
  @Post(':caseId/uyap-integration')
  async validateUyapIntegration(
    @Param('caseId') caseId: string,
    @Body() additionalData?: Record<string, any>,
  ): Promise<GateValidationResult> {
    return this.validationGateService.validateGate(caseId, 'GATE_4_UYAP_INTEGRATION', additionalData);
  }

  /**
   * PR-D4e-3b: HACİZ ÖNCESİ saha istihbaratı SOFT-UYARILARI (read-only, BLOK YOK).
   * GET /api/validation-gate/:caseId/pre-haciz-intelligence
   * Tenant-scoped (JwtAuthGuard). isValid her zaman true; yalnız warnings döner.
   */
  @Get(':caseId/pre-haciz-intelligence')
  @UseGuards(JwtAuthGuard)
  async preHacizIntelligence(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
  ) {
    return this.validationGateService.checkPreHacizIntelligence(tenantId, caseId);
  }

  /**
   * Validasyon kurallarini getir
   * GET /api/validation-gate/rules
   */
  @Get('rules')
  getRules(): MasterValidationsResponse | null {
    const rules = this.validationGateService.getRules();
    if (!rules) return null;
    return {
      version: rules.version,
      engine: rules.engine,
      policies: rules.policies,
      case_types: rules.case_types,
      gates: rules.gates,
    };
  }

  /**
   * Politika degerini getir
   * GET /api/validation-gate/policy?key=check_policy.bad_check_compensation_rate
   */
  @Get('policy')
  getPolicy(@Query('key') key: string) {
    return {
      key,
      value: this.validationGateService.getPolicy(key),
    };
  }

  /**
   * Cek tazminati bilgisi
   * GET /api/validation-gate/check-compensation-info
   */
  @Get('check-compensation-info')
  getCheckCompensationInfo() {
    return {
      defaultOn: this.validationGateService.shouldAddCheckCompensation('KAMBIYO_CEK'),
      rate: this.validationGateService.getCheckCompensationRate(),
      ratePercent: `%${this.validationGateService.getCheckCompensationRate() * 100}`,
    };
  }

  /**
   * Adres onerileri
   * GET /api/validation-gate/address-suggestions
   */
  @Get('address-suggestions')
  getAddressSuggestions() {
    return {
      createTask: this.validationGateService.shouldCreateAddressTask(),
      suggestions: this.validationGateService.getAddressSuggestions(),
    };
  }

  /**
   * Banka alacağı mı kontrol et
   * GET /api/validation-gate/is-bank-claim?mahiyetCode=BANKA
   */
  @Get('is-bank-claim')
  checkIsBankClaim(@Query('mahiyetCode') mahiyetCode: string) {
    return {
      mahiyetCode,
      isBankClaim: isBankClaim(mahiyetCode),
    };
  }

  /**
   * Banka alacağı validasyonu
   * POST /api/validation-gate/bank-claim-validation
   */
  @Post('bank-claim-validation')
  validateBankClaimEndpoint(@Body() params: {
    mahiyetCode: string;
    hasKrediSozlesmesi?: boolean;
    hasHesapOzeti?: boolean;
    hesapOzetiTebligEdildiMi?: boolean;
    hesapOzetiItirazSuresiGectiMi?: boolean;
    hasTemerrut?: boolean;
    hasKefaletname?: boolean;
    borcluItirazEttiMi?: boolean;
    itirazTuru?: 'BORCA' | 'IMZAYA' | null;
  }): BankClaimValidation {
    if (!isBankClaim(params.mahiyetCode)) {
      return {
        isBankClaim: false,
        warnings: [],
        risks: [],
        requiredDocuments: [],
        iik68Status: {
          hasValidDocuments: false,
          documentTypes: [],
          canRequestRemoval: false,
          removalRiskLevel: 'LOW',
        },
      };
    }
    return validateBankClaim(params);
  }

  /**
   * Banka alacağı faiz kuralları
   * GET /api/validation-gate/bank-claim-interest-rules?mahiyetCode=BANKA
   */
  @Get('bank-claim-interest-rules')
  getBankClaimInterestRulesEndpoint(@Query('mahiyetCode') mahiyetCode: string) {
    if (!isBankClaim(mahiyetCode)) {
      return {
        mahiyetCode,
        isBankClaim: false,
        rules: null,
      };
    }
    return {
      mahiyetCode,
      isBankClaim: true,
      rules: getBankClaimInterestRules(mahiyetCode),
    };
  }
}
