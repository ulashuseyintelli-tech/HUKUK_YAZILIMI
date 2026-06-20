import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { findOrCreateDebtorAddress } from "@/common/address-hash.util"; // RFA-006 adres dedup
import {
  AddressType,
  AddressSubType,
  AddressSource,
  AddressRiskFlag,
  LegalPriority,
  DebtorType,
  ServiceReturnReason,
} from "@prisma/client";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";

// Re-export for controller
export type AddressRiskFlagType = AddressRiskFlag;

// Address type labels for suggestions
const AddressTypeLabels: Record<AddressType, string> = {
  MERNIS: "MERNİS Adresi",
  LEGAL_CENTER: "Ticaret Sicili Merkez",
  BUSINESS_HQ: "İşyeri Merkez",
  BUSINESS_BRANCH: "Şube Adresi",
  DECLARED: "Beyan Edilen Adres",
  KEP: "KEP Adresi",
};

// ==================== DTOs ====================

export interface CreateAddressDto {
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

export interface UpdateAddressDto {
  type?: AddressType;
  subType?: AddressSubType;
  source?: AddressSource;
  street?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  verified?: boolean;
  riskFlags?: AddressRiskFlag[];
}

export interface TK21_2RecordDto {
  muhtarDeliveryDate: string;
  doorPostingDate: string;
  noticeDate: string;
  notes?: string;
}

export interface AddressDTO {
  id: string;
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  fullText: string;
  legalPriority: LegalPriority;
  canApply21_2: boolean;
  verified: boolean;
  verifiedAt?: string;
  riskFlags: AddressRiskFlag[];
  isPrimary: boolean;
  tk21_2Applied: boolean;
  lastNotificationResult?: {
    date: string;
    status: string;
  };
  // Verification status
  verificationStatus?: 'NOT_VERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'OUTDATED';
  verificationMessage?: string;
  daysSinceVerification?: number;
  // Confidence score (0-100)
  confidenceScore?: number;
}

// Verification result DTO
export interface VerificationResultDto {
  success: boolean;
  verified: boolean;
  source: AddressSource;
  message: string;
  newAddress?: {
    street: string;
    city: string;
    district?: string;
    postalCode?: string;
  };
  verifiedAt: string;
}

@Injectable()
export class AddressService {
  constructor(
    private prisma: PrismaService,
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService
  ) {}

  // ==================== CRUD OPERATIONS ====================

  /**
   * Create a new address for a debtor
   */
  async create(tenantId: string, debtorId: string, dto: CreateAddressDto): Promise<AddressDTO> {
    // Verify debtor exists and belongs to tenant
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    // Calculate canApply21_2 based on type
    const canApply21_2 = this.calculateCanApply21_2(dto.type);

    // Calculate legalPriority based on type
    const legalPriority = this.calculateLegalPriority(dto.type);

    // Calculate verified based on source
    const verified = this.calculateVerified(dto.source);

    // Build full text
    const fullText = this.buildFullText(dto);

    // Check if this is the first address (make it primary)
    const existingCount = await this.prisma.debtorAddress.count({
      where: { debtorId },
    });
    const isPrimary = existingCount === 0;

    // RFA-006: hash dedup. Aynı borçluya aynı normalize adres varsa yeni satır açılmaz (idempotent).
    const { address } = await findOrCreateDebtorAddress(this.prisma, {
      debtorId,
      type: dto.type,
      subType: dto.subType,
      source: dto.source,
      street: dto.street,
      city: dto.city,
      district: dto.district,
      postalCode: dto.postalCode,
      country: dto.country || "Türkiye",
      fullText,
      legalPriority,
      canApply21_2,
      verified,
      verifiedAt: verified ? new Date() : null,
      isPrimary,
      notes: dto.notes,
      confidenceScore: this.calculateConfidenceScore(dto.source, verified),
    });

    return this.toDTO(address);
  }

  /**
   * Update an existing address
   */
  async update(tenantId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressDTO> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    // Recalculate derived fields if type or source changed
    const type = dto.type || address.type;
    const source = dto.source || address.source;

    const canApply21_2 = dto.type ? this.calculateCanApply21_2(type) : address.canApply21_2;
    const legalPriority = dto.type ? this.calculateLegalPriority(type) : address.legalPriority;
    const verified = dto.verified !== undefined ? dto.verified : 
                     dto.source ? this.calculateVerified(source) : address.verified;

    // Rebuild full text if address fields changed
    const fullText = (dto.street || dto.city || dto.district) 
      ? this.buildFullText({
          street: dto.street || address.street,
          city: dto.city || address.city,
          district: dto.district ?? address.district ?? undefined,
        })
      : address.fullText;

    const updated = await this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: {
        ...dto,
        fullText,
        canApply21_2,
        legalPriority,
        verified,
        verifiedAt: verified && !address.verified ? new Date() : address.verifiedAt,
        confidenceScore: this.calculateConfidenceScore(source, verified),
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Delete an address
   */
  async delete(tenantId: string, addressId: string): Promise<void> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    // Check if address is used in any case debtor
    const usedInCases = await this.prisma.caseDebtor.count({
      where: { selectedAddressId: addressId },
    });

    if (usedInCases > 0) {
      throw new BadRequestException(
        "Bu adres aktif takiplerde tebligat adresi olarak seçili. Önce takiplerdeki adresi değiştirin."
      );
    }

    await this.prisma.debtorAddress.delete({ where: { id: addressId } });
  }

  /**
   * Get all addresses for a debtor
   */
  async getAddressesForDebtor(tenantId: string, debtorId: string): Promise<AddressDTO[]> {
    // Verify debtor exists
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const addresses = await this.prisma.debtorAddress.findMany({
      where: { debtorId },
      orderBy: [
        { isPrimary: "desc" },
        { legalPriority: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        serviceHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return addresses.map((addr) => this.toDTO(addr, addr.serviceHistory[0]));
  }

  // ==================== ACTIVE ADDRESS MANAGEMENT ====================

  /**
   * Set active address for a case debtor
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressController.setActiveAddress() → POST /case-debtors/:caseDebtorId/active-address (dosya borçlusu seçili adresini değiştirme)
  /// </remarks>
  async setActiveAddress(
    tenantId: string,
    caseDebtorId: string,
    addressId: string
  ): Promise<void> {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(
      tenantId,
      caseDebtorId
    );

    // Verify case debtor exists
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, case: { tenantId } },
      include: { debtor: true },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Dosya borçlusu bulunamadı");
    }

    // Verify address belongs to the debtor
    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId: caseDebtor.debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı veya bu borçluya ait değil");
    }

    await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: { selectedAddressId: addressId },
    });
  }

  // ==================== PRIORITY ADDRESS LOGIC ====================

  /**
   * Suggest the best address for notification based on debtor type
   * Property 3 & 4: Priority order based on debtor type
   */
  suggestPriorityAddress(debtorType: DebtorType, addresses: AddressDTO[]): AddressDTO | null {
    if (addresses.length === 0) return null;

    // Filter out addresses with risk flags
    const safeAddresses = addresses.filter((a) => a.riskFlags.length === 0);
    const addressPool = safeAddresses.length > 0 ? safeAddresses : addresses;

    if (debtorType === "INDIVIDUAL" || debtorType === "ESTATE") {
      // Property 3: INDIVIDUAL priority order
      // 1. MERNIS
      const mernis = addressPool.find((a) => a.type === "MERNIS");
      if (mernis) return mernis;

      // 2. DECLARED
      const declared = addressPool.find((a) => a.type === "DECLARED");
      if (declared) return declared;

      // 3. BUSINESS (HQ or BRANCH)
      const business = addressPool.find((a) => 
        a.type === "BUSINESS_HQ" || a.type === "BUSINESS_BRANCH"
      );
      if (business) return business;
    } else {
      // Property 4: COMPANY / PUBLIC_INSTITUTION priority order
      // 1. LEGAL_CENTER
      const legalCenter = addressPool.find((a) => a.type === "LEGAL_CENTER");
      if (legalCenter) return legalCenter;

      // 2. BUSINESS_BRANCH
      const branch = addressPool.find((a) => a.type === "BUSINESS_BRANCH");
      if (branch) return branch;

      // 3. DECLARED
      const declared = addressPool.find((a) => a.type === "DECLARED");
      if (declared) return declared;
    }

    // Fallback: return first address
    return addressPool[0] || null;
  }

  // ==================== RISK FLAG MANAGEMENT ====================

  /**
   * Add a risk flag to an address
   */
  async addRiskFlag(
    tenantId: string,
    addressId: string,
    flag: AddressRiskFlag,
    reason?: string
  ): Promise<AddressDTO> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    // Don't add duplicate flags
    if (address.riskFlags.includes(flag)) {
      return this.toDTO(address);
    }

    const updated = await this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: {
        riskFlags: { push: flag },
        riskNotes: reason 
          ? `${address.riskNotes || ""}\n[${new Date().toISOString()}] ${flag}: ${reason}`.trim()
          : address.riskNotes,
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Remove a risk flag from an address
   */
  async removeRiskFlag(tenantId: string, addressId: string, flag: AddressRiskFlag): Promise<AddressDTO> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    const updated = await this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: {
        riskFlags: address.riskFlags.filter((f) => f !== flag),
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Auto-assign risk flag based on notification return reason
   * Property 9: Risk Flag Auto-Assignment
   */
  mapReturnReasonToRiskFlag(returnReason: ServiceReturnReason): AddressRiskFlag | null {
    const mapping: Record<ServiceReturnReason, AddressRiskFlag | null> = {
      ADDRESS_NOT_FOUND: "NOT_FOUND",
      MOVED: "MOVED",
      REFUSED: "REFUSED",
      DECEASED: null, // Not an address issue
      COMPANY_CLOSED: "CLOSED",
      UNCLAIMED: "ADDRESS_SUSPECT",
      OTHER: "ADDRESS_SUSPECT",
    };

    return mapping[returnReason] || null;
  }

  // ==================== TK 21/2 SUPPORT ====================

  /**
   * Check if TK 21/2 can be applied to an address
   * Property 7: TK 21/2 Eligibility Constraint
   */
  canApplyTK21_2(address: AddressDTO): boolean {
    return address.canApply21_2;
  }

  /**
   * Record TK 21/2 application
   * Property 8: TK 21/2 Record Completeness
   */
  async recordTK21_2(tenantId: string, addressId: string, dto: TK21_2RecordDto): Promise<AddressDTO> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    if (!address.canApply21_2) {
      throw new BadRequestException("Bu adres için TK 21/2 uygulanamaz");
    }

    // Validate all required dates
    if (!dto.muhtarDeliveryDate || !dto.doorPostingDate || !dto.noticeDate) {
      throw new BadRequestException(
        "TK 21/2 için muhtar teslim, kapıya yapıştırma ve ihbarname tarihleri zorunludur"
      );
    }

    const updated = await this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: {
        tk21_2Applied: true,
        tk21_2MuhtarDate: new Date(dto.muhtarDeliveryDate),
        tk21_2DoorPostDate: new Date(dto.doorPostingDate),
        tk21_2NoticeDate: new Date(dto.noticeDate),
        notes: dto.notes 
          ? `${address.notes || ""}\n[TK 21/2] ${dto.notes}`.trim()
          : address.notes,
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Check if TK 21/2 should be suggested (after MERNIS notification fails)
   */
  shouldSuggestTK21_2(address: AddressDTO, lastNotificationFailed: boolean): boolean {
    return (
      address.type === "MERNIS" &&
      address.canApply21_2 &&
      !address.tk21_2Applied &&
      lastNotificationFailed
    );
  }

  // ==================== PHASE 2: AUTO NEXT ADDRESS SUGGESTION ====================

  /**
   * Get next suggested address when current notification fails
   * Phase 2: Tebligat Başarısızlık Yönetimi
   */
  async suggestNextAddress(
    tenantId: string,
    debtorId: string,
    currentAddressId: string,
    returnReason: ServiceReturnReason
  ): Promise<{
    nextAddress: AddressDTO | null;
    suggestion: string;
    canApplyTK21_2: boolean;
    shouldAnnounce: boolean;
  }> {
    const addresses = await this.getAddressesForDebtor(tenantId, debtorId);
    const currentAddress = addresses.find(a => a.id === currentAddressId);
    
    if (!currentAddress) {
      return {
        nextAddress: null,
        suggestion: 'Mevcut adres bulunamadı',
        canApplyTK21_2: false,
        shouldAnnounce: false,
      };
    }

    // Add risk flag to current address based on return reason
    const riskFlag = this.mapReturnReasonToRiskFlag(returnReason);
    if (riskFlag) {
      await this.addRiskFlag(tenantId, currentAddressId, riskFlag, `Tebligat iade: ${returnReason}`);
    }

    // Get debtor type
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      return {
        nextAddress: null,
        suggestion: 'Borçlu bulunamadı',
        canApplyTK21_2: false,
        shouldAnnounce: false,
      };
    }

    // Filter out current address and addresses with risk flags
    const availableAddresses = addresses.filter(
      a => a.id !== currentAddressId && a.riskFlags.length === 0
    );

    // Check if TK 21/2 can be applied (for MERNIS addresses)
    const canApplyTK21_2 = currentAddress.type === 'MERNIS' && 
                          currentAddress.canApply21_2 && 
                          !currentAddress.tk21_2Applied &&
                          (returnReason === 'ADDRESS_NOT_FOUND' || returnReason === 'MOVED' || returnReason === 'UNCLAIMED');

    // Get next address based on priority
    const nextAddress = this.suggestPriorityAddress(debtor.type, availableAddresses);

    // Determine suggestion message
    let suggestion = '';
    let shouldAnnounce = false;

    if (canApplyTK21_2) {
      suggestion = `TK 21/2 (bila tebligat) uygulanabilir. MERNİS adresine muhtara teslim yapılabilir.`;
    } else if (nextAddress) {
      suggestion = `Sıradaki adres: ${AddressTypeLabels[nextAddress.type]} - ${nextAddress.fullText.substring(0, 50)}...`;
    } else if (debtor.type === 'COMPANY') {
      // For companies, suggest TK 35 (announcement)
      shouldAnnounce = true;
      suggestion = 'Tüm adresler tükendi. TK 35 (ilan yoluyla tebligat) önerilir.';
    } else {
      // For individuals, suggest TK 21/2 or announcement
      shouldAnnounce = true;
      suggestion = 'Tüm adresler tükendi. İlan yoluyla tebligat önerilir.';
    }

    return {
      nextAddress,
      suggestion,
      canApplyTK21_2,
      shouldAnnounce,
    };
  }

  // ==================== PHASE 3: SMART ADDRESS SUGGESTIONS ====================

  /**
   * Get address success statistics
   * Phase 3: Akıllı Adres Önerisi
   */
  async getAddressSuccessStats(tenantId: string, addressId: string): Promise<{
    totalAttempts: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastAttemptDate?: string;
    lastResult?: string;
  }> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    const history = await this.prisma.serviceHistory.findMany({
      where: { addressId },
      orderBy: { createdAt: 'desc' },
    });

    const totalAttempts = history.length;
    const successCount = history.filter(h => h.toStatus === 'DELIVERED' || h.toStatus === 'MUHTAR').length;
    const failureCount = history.filter(h => h.toStatus === 'RETURNED' || h.toStatus === 'FAILED').length;
    const successRate = totalAttempts > 0 ? (successCount / totalAttempts) * 100 : 0;

    const lastAttempt = history[0];

    return {
      totalAttempts,
      successCount,
      failureCount,
      successRate: Math.round(successRate),
      lastAttemptDate: lastAttempt?.actionDate?.toISOString(),
      lastResult: lastAttempt?.toStatus,
    };
  }

  /**
   * Get all addresses sorted by success rate
   * Phase 3: Akıllı Adres Önerisi
   */
  async getAddressesSortedBySuccessRate(tenantId: string, debtorId: string): Promise<Array<AddressDTO & {
    stats: {
      totalAttempts: number;
      successRate: number;
      lastResult?: string;
    };
  }>> {
    const addresses = await this.getAddressesForDebtor(tenantId, debtorId);
    
    const addressesWithStats = await Promise.all(
      addresses.map(async (addr) => {
        const stats = await this.getAddressSuccessStats(tenantId, addr.id);
        return {
          ...addr,
          stats: {
            totalAttempts: stats.totalAttempts,
            successRate: stats.successRate,
            lastResult: stats.lastResult,
          },
        };
      })
    );

    // Sort: 
    // 1. Addresses without risk flags first
    // 2. Then by success rate (higher first)
    // 3. Then by legal priority
    return addressesWithStats.sort((a, b) => {
      // Risk flags last
      if (a.riskFlags.length === 0 && b.riskFlags.length > 0) return -1;
      if (a.riskFlags.length > 0 && b.riskFlags.length === 0) return 1;
      
      // Higher success rate first (if has attempts)
      if (a.stats.totalAttempts > 0 && b.stats.totalAttempts > 0) {
        if (a.stats.successRate !== b.stats.successRate) {
          return b.stats.successRate - a.stats.successRate;
        }
      }
      
      // Addresses with no attempts before failed ones
      if (a.stats.totalAttempts === 0 && b.stats.totalAttempts > 0) return -1;
      if (a.stats.totalAttempts > 0 && b.stats.totalAttempts === 0) return 1;
      
      // By legal priority
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.legalPriority] - priorityOrder[b.legalPriority];
    });
  }

  // ==================== PHASE 4: NOTIFICATION CHAIN TRACKING ====================

  /**
   * Get notification chain for a debtor (all addresses with attempt counts)
   * Phase 4: Tebligat Zinciri Takibi
   */
  async getNotificationChain(tenantId: string, debtorId: string): Promise<{
    addresses: Array<{
      address: AddressDTO;
      attemptCount: number;
      lastAttempt?: {
        date: string;
        status: string;
        returnReason?: string;
      };
      isExhausted: boolean;
      nextInChain: boolean;
    }>;
    currentAddressId?: string;
    totalAttempts: number;
    exhaustedCount: number;
    remainingCount: number;
    chainStatus: 'ACTIVE' | 'EXHAUSTED' | 'DELIVERED';
    recommendation: string;
  }> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    const addresses = await this.getAddressesForDebtor(tenantId, debtorId);
    
    // Get current active address from case debtor
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { debtorId },
      select: { selectedAddressId: true },
    });

    const currentAddressId = caseDebtor?.selectedAddressId;

    // Get stats for each address
    const addressChain = await Promise.all(
      addresses.map(async (addr) => {
        const history = await this.prisma.serviceHistory.findMany({
          where: { addressId: addr.id },
          orderBy: { createdAt: 'desc' },
        });

        const attemptCount = history.length;
        const lastAttempt = history[0];
        
        // Address is exhausted if:
        // 1. Has risk flags (returned/failed)
        // 2. TK 21/2 already applied (for MERNIS)
        // 3. Multiple failed attempts
        const isExhausted = addr.riskFlags.length > 0 || 
                          addr.tk21_2Applied ||
                          (attemptCount >= 2 && lastAttempt?.toStatus === 'RETURNED');

        return {
          address: addr,
          attemptCount,
          lastAttempt: lastAttempt ? {
            date: lastAttempt.actionDate?.toISOString() || lastAttempt.createdAt.toISOString(),
            status: lastAttempt.toStatus,
            returnReason: lastAttempt.returnReason || undefined,
          } : undefined,
          isExhausted,
          nextInChain: false, // Will be set below
        };
      })
    );

    // Sort by priority and find next in chain
    const sortedChain = addressChain.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.address.legalPriority] - priorityOrder[b.address.legalPriority];
    });

    // Mark next available address
    const nextAvailable = sortedChain.find(a => !a.isExhausted && a.address.id !== currentAddressId);
    if (nextAvailable) {
      nextAvailable.nextInChain = true;
    }

    // Calculate totals
    const totalAttempts = addressChain.reduce((sum, a) => sum + a.attemptCount, 0);
    const exhaustedCount = addressChain.filter(a => a.isExhausted).length;
    const remainingCount = addressChain.length - exhaustedCount;

    // Determine chain status
    let chainStatus: 'ACTIVE' | 'EXHAUSTED' | 'DELIVERED' = 'ACTIVE';
    const hasDelivered = addressChain.some(a => a.lastAttempt?.status === 'DELIVERED' || a.lastAttempt?.status === 'MUHTAR');
    
    if (hasDelivered) {
      chainStatus = 'DELIVERED';
    } else if (remainingCount === 0) {
      chainStatus = 'EXHAUSTED';
    }

    // Generate recommendation
    let recommendation = '';
    if (chainStatus === 'DELIVERED') {
      recommendation = 'Tebligat başarıyla tamamlandı.';
    } else if (chainStatus === 'EXHAUSTED') {
      if (debtor.type === 'COMPANY') {
        recommendation = 'Tüm adresler tükendi. TK 35 (ilan yoluyla tebligat) uygulanmalıdır.';
      } else {
        recommendation = 'Tüm adresler tükendi. İlan yoluyla tebligat veya TK 21/2 değerlendirilmelidir.';
      }
    } else if (nextAvailable) {
      recommendation = `Sıradaki adres: ${AddressTypeLabels[nextAvailable.address.type]}`;
    } else {
      recommendation = 'Aktif adres üzerinden tebligat devam ediyor.';
    }

    return {
      addresses: sortedChain,
      currentAddressId: currentAddressId || undefined,
      totalAttempts,
      exhaustedCount,
      remainingCount,
      chainStatus,
      recommendation,
    };
  }

  // ==================== ADDRESS HISTORY ====================

  /**
   * Get notification history for a specific address
   */
  async getAddressHistory(tenantId: string, addressId: string) {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);

    const history = await this.prisma.serviceHistory.findMany({
      where: { addressId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      channel: h.channel,
      trackingNo: h.trackingNo,
      returnReason: h.returnReason,
      actionDate: h.actionDate.toISOString(),
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  // ==================== ADDRESS VERIFICATION ====================

  /**
   * Verify address via MERNİS (for INDIVIDUAL debtors)
   * Simulates MERNİS API call - in production would call actual API
   */
  async verifyViaMernis(tenantId: string, addressId: string, tckn: string): Promise<VerificationResultDto> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);
    
    // Get debtor to check type
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: address.debtorId },
    });

    if (!debtor || debtor.type !== 'INDIVIDUAL') {
      throw new BadRequestException('MERNİS sorgusu sadece gerçek kişiler için yapılabilir');
    }

    if (!tckn || tckn.length !== 11) {
      throw new BadRequestException('Geçerli bir TCKN gereklidir');
    }

    // Simulate MERNİS API call (in production, call actual API)
    // For now, simulate with 80% success rate and random address updates
    const simulatedSuccess = Math.random() > 0.2;
    
    if (simulatedSuccess) {
      // Simulate address found - sometimes with updates
      const hasUpdate = Math.random() > 0.7;
      
      const result: VerificationResultDto = {
        success: true,
        verified: true,
        source: 'MERNIS',
        message: hasUpdate 
          ? 'MERNİS kaydı bulundu. Adres güncellemesi mevcut.'
          : 'MERNİS kaydı doğrulandı. Adres güncel.',
        verifiedAt: new Date().toISOString(),
      };

      if (hasUpdate) {
        // Simulate minor address update
        result.newAddress = {
          street: address.street,
          city: address.city,
          district: address.district || undefined,
          postalCode: address.postalCode || undefined,
        };
      }

      // Update address in database
      await this.prisma.debtorAddress.update({
        where: { id: addressId },
        data: {
          verified: true,
          verifiedAt: new Date(),
          source: 'MERNIS',
          ...(hasUpdate && result.newAddress ? {
            street: result.newAddress.street,
            city: result.newAddress.city,
            district: result.newAddress.district,
            postalCode: result.newAddress.postalCode,
            fullText: this.buildFullText(result.newAddress as any),
          } : {}),
        },
      });

      return result;
    } else {
      // Simulate address not found or mismatch
      return {
        success: true,
        verified: false,
        source: 'MERNIS',
        message: 'MERNİS kaydında bu adres bulunamadı veya eşleşmiyor.',
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Verify address via MERSİS (for COMPANY debtors)
   * Simulates MERSİS API call - in production would call actual API
   */
  async verifyViaMersis(tenantId: string, addressId: string, vkn: string): Promise<VerificationResultDto> {
    const address = await this.findAddressWithTenantCheck(tenantId, addressId);
    
    // Get debtor to check type
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: address.debtorId },
    });

    if (!debtor || debtor.type !== 'COMPANY') {
      throw new BadRequestException('MERSİS sorgusu sadece tüzel kişiler için yapılabilir');
    }

    if (!vkn || vkn.length !== 10) {
      throw new BadRequestException('Geçerli bir VKN gereklidir');
    }

    // Simulate MERSİS API call
    const simulatedSuccess = Math.random() > 0.15;
    
    if (simulatedSuccess) {
      const hasUpdate = Math.random() > 0.6;
      
      const result: VerificationResultDto = {
        success: true,
        verified: true,
        source: 'MERSIS',
        message: hasUpdate 
          ? 'MERSİS kaydı bulundu. Ticaret Sicili adresi güncellemesi mevcut.'
          : 'MERSİS kaydı doğrulandı. Şirket merkez adresi güncel.',
        verifiedAt: new Date().toISOString(),
      };

      // Update address in database
      await this.prisma.debtorAddress.update({
        where: { id: addressId },
        data: {
          verified: true,
          verifiedAt: new Date(),
          source: 'MERSIS',
        },
      });

      return result;
    } else {
      return {
        success: true,
        verified: false,
        source: 'MERSIS',
        message: 'MERSİS kaydında bu şirket veya adres bulunamadı.',
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if address verification is outdated (older than 30 days)
   */
  isVerificationOutdated(verifiedAt: Date | null): boolean {
    if (!verifiedAt) return true;
    
    const daysSince = Math.floor((Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 30;
  }

  /**
   * Get verification status for an address
   */
  getVerificationStatus(address: any): { 
    status: 'NOT_VERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'OUTDATED';
    message: string;
    daysSince?: number;
  } {
    if (!address.verified) {
      return {
        status: 'NOT_VERIFIED',
        message: 'Bu adres henüz doğrulanmamış',
      };
    }

    if (!address.verifiedAt) {
      return {
        status: 'VERIFIED',
        message: 'Doğrulanmış (tarih bilinmiyor)',
      };
    }

    const daysSince = Math.floor((Date.now() - new Date(address.verifiedAt).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince > 30) {
      return {
        status: 'OUTDATED',
        message: `Son doğrulama ${daysSince} gün önce. Yeniden doğrulama önerilir.`,
        daysSince,
      };
    }

    return {
      status: 'VERIFIED',
      message: `${daysSince} gün önce doğrulandı`,
      daysSince,
    };
  }

  /**
   * Bulk verify all addresses for a debtor
   */
  async verifyAllAddresses(tenantId: string, debtorId: string): Promise<{
    total: number;
    verified: number;
    failed: number;
    results: Array<{ addressId: string; type: AddressType; result: VerificationResultDto }>;
  }> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      include: { debtorAddresses: true },
    });

    if (!debtor) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    const results: Array<{ addressId: string; type: AddressType; result: VerificationResultDto }> = [];
    let verified = 0;
    let failed = 0;

    for (const address of debtor.debtorAddresses) {
      try {
        let result: VerificationResultDto;

        if (debtor.type === 'INDIVIDUAL' && address.type === 'MERNIS') {
          result = await this.verifyViaMernis(tenantId, address.id, debtor.tckn || '');
        } else if (debtor.type === 'COMPANY' && address.type === 'LEGAL_CENTER') {
          result = await this.verifyViaMersis(tenantId, address.id, debtor.vkn || '');
        } else {
          // Skip non-verifiable addresses
          continue;
        }

        results.push({ addressId: address.id, type: address.type, result });
        
        if (result.verified) {
          verified++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        results.push({
          addressId: address.id,
          type: address.type,
          result: {
            success: false,
            verified: false,
            source: address.source,
            message: error instanceof Error ? error.message : 'Doğrulama hatası',
            verifiedAt: new Date().toISOString(),
          },
        });
      }
    }

    return {
      total: debtor.debtorAddresses.length,
      verified,
      failed,
      results,
    };
  }

  // ==================== HELPER METHODS ====================

  /**
   * Property 1: canApply21_2 Flag Consistency
   */
  private calculateCanApply21_2(type: AddressType): boolean {
    switch (type) {
      case "MERNIS":
        return true;
      case "LEGAL_CENTER":
        return true; // Conditional but allowed
      case "BUSINESS_HQ":
      case "BUSINESS_BRANCH":
      case "DECLARED":
      case "KEP":
        return false;
      default:
        return false;
    }
  }

  /**
   * Calculate legal priority based on address type
   */
  private calculateLegalPriority(type: AddressType): LegalPriority {
    switch (type) {
      case "MERNIS":
      case "LEGAL_CENTER":
        return "HIGH";
      case "DECLARED":
      case "BUSINESS_HQ":
        return "MEDIUM";
      case "BUSINESS_BRANCH":
      case "KEP":
        return "LOW";
      default:
        return "MEDIUM";
    }
  }

  /**
   * Property 2: Verified Flag Based on Source
   */
  private calculateVerified(source: AddressSource): boolean {
    switch (source) {
      case "MERNIS":
      case "MERSIS":
      case "UYAP":
        return true;
      case "USER_INPUT":
      case "CONTRACT":
      case "TICARET_SICILI":
        return false;
      default:
        return false;
    }
  }

  private buildFullText(dto: { street: string; city: string; district?: string }): string {
    const parts = [dto.street];
    if (dto.district) parts.push(dto.district);
    parts.push(dto.city);
    return parts.join(", ");
  }

  private async findAddressWithTenantCheck(tenantId: string, addressId: string) {
    const address = await this.prisma.debtorAddress.findFirst({
      where: {
        id: addressId,
        debtor: { tenantId },
      },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    return address;
  }

  private toDTO(address: any, lastHistory?: any): AddressDTO {
    const verificationInfo = this.getVerificationStatus(address);
    
    return {
      id: address.id,
      type: address.type,
      subType: address.subType,
      source: address.source,
      street: address.street,
      city: address.city,
      district: address.district,
      postalCode: address.postalCode,
      fullText: address.fullText || `${address.street}, ${address.district || ""} ${address.city}`.trim(),
      legalPriority: address.legalPriority,
      canApply21_2: address.canApply21_2,
      verified: address.verified,
      verifiedAt: address.verifiedAt?.toISOString(),
      riskFlags: address.riskFlags || [],
      isPrimary: address.isPrimary,
      tk21_2Applied: address.tk21_2Applied || false,
      lastNotificationResult: lastHistory
        ? {
            date: lastHistory.actionDate?.toISOString() || lastHistory.createdAt?.toISOString(),
            status: lastHistory.toStatus,
          }
        : undefined,
      // Verification status
      verificationStatus: verificationInfo.status,
      verificationMessage: verificationInfo.message,
      daysSinceVerification: verificationInfo.daysSince,
      // Confidence score from database
      confidenceScore: address.confidenceScore ?? undefined,
    };
  }

  /**
   * Calculate confidence score based on source and verification status
   * Score: 0-100
   * Factors:
   * - Source reliability (50%): MERNIS/UYAP = 100, TICARET_SICILI = 90, CLIENT = 60, etc.
   * - Verification (50%): Verified = 100, Not verified = 30
   */
  private calculateConfidenceScore(source: AddressSource, verified: boolean): number {
    // Source reliability scores
    const sourceScores: Record<AddressSource, number> = {
      MERNIS: 100,
      MERSIS: 95,
      TICARET_SICILI: 90,
      CONTRACT: 75,
      USER_INPUT: 40,
      UYAP: 95,
      UYAP_AA: 95,
      UYAP_AB: 90,
      UYAP_AF: 90,
      UYAP_AJ: 85,
      UYAP_AR: 80,
      SGK_LETTER: 85,
      VERGI_LETTER: 85,
      TICARET_SICILI_LETTER: 90,
      BELEDIYE_LETTER: 75,
      CLIENT: 60,
      CROSS_FILE: 70,
    };

    const sourceScore = sourceScores[source] || 30;
    const verificationScore = verified ? 100 : 30;
    
    // Weighted average (source: 50%, verification: 50%)
    const totalScore = Math.round(sourceScore * 0.5 + verificationScore * 0.5);
    
    return Math.min(100, Math.max(0, totalScore));
  }
}
