import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/modules/auth/guards/jwt-auth.guard";
import { AddressService, CreateAddressDto, UpdateAddressDto, TK21_2RecordDto, AddressRiskFlagType } from "./address.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  // ==================== DEBTOR ADDRESSES ====================

  /**
   * Get all addresses for a debtor
   */
  @Get("debtors/:debtorId/addresses")
  async getAddresses(@Request() req: any, @Param("debtorId") debtorId: string) {
    return this.addressService.getAddressesForDebtor(req.user.tenantId, debtorId);
  }

  /**
   * Create a new address for a debtor
   */
  @Post("debtors/:debtorId/addresses")
  async createAddress(
    @Request() req: any,
    @Param("debtorId") debtorId: string,
    @Body() dto: CreateAddressDto
  ) {
    return this.addressService.create(req.user.tenantId, debtorId, dto);
  }

  // ==================== ADDRESS OPERATIONS ====================

  /**
   * Update an address
   */
  @Put("addresses/:addressId")
  async updateAddress(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() dto: UpdateAddressDto
  ) {
    return this.addressService.update(req.user.tenantId, addressId, dto);
  }

  /**
   * Delete an address
   */
  @Delete("addresses/:addressId")
  async deleteAddress(@Request() req: any, @Param("addressId") addressId: string) {
    await this.addressService.delete(req.user.tenantId, addressId);
    return { success: true };
  }

  /**
   * Get notification history for an address
   */
  @Get("addresses/:addressId/history")
  async getAddressHistory(@Request() req: any, @Param("addressId") addressId: string) {
    return this.addressService.getAddressHistory(req.user.tenantId, addressId);
  }

  /**
   * Add risk flag to an address
   */
  @Post("addresses/:addressId/risk-flags")
  async addRiskFlag(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() body: { flag: AddressRiskFlagType; reason?: string }
  ) {
    return this.addressService.addRiskFlag(
      req.user.tenantId,
      addressId,
      body.flag,
      body.reason
    );
  }

  /**
   * Remove risk flag from an address
   */
  @Delete("addresses/:addressId/risk-flags/:flag")
  async removeRiskFlag(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Param("flag") flag: AddressRiskFlagType
  ) {
    return this.addressService.removeRiskFlag(req.user.tenantId, addressId, flag);
  }

  /**
   * Record TK 21/2 application
   */
  @Post("addresses/:addressId/tk21-2")
  async recordTK21_2(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() dto: TK21_2RecordDto
  ) {
    return this.addressService.recordTK21_2(req.user.tenantId, addressId, dto);
  }

  // ==================== ADDRESS VERIFICATION ====================

  /**
   * Verify address via MERNİS (for INDIVIDUAL debtors)
   */
  @Post("addresses/:addressId/verify/mernis")
  async verifyViaMernis(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() body: { tckn: string }
  ) {
    return this.addressService.verifyViaMernis(
      req.user.tenantId,
      addressId,
      body.tckn
    );
  }

  /**
   * Verify address via MERSİS (for COMPANY debtors)
   */
  @Post("addresses/:addressId/verify/mersis")
  async verifyViaMersis(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() body: { vkn: string }
  ) {
    return this.addressService.verifyViaMersis(
      req.user.tenantId,
      addressId,
      body.vkn
    );
  }

  /**
   * Verify all addresses for a debtor
   */
  @Post("debtors/:debtorId/addresses/verify-all")
  async verifyAllAddresses(
    @Request() req: any,
    @Param("debtorId") debtorId: string
  ) {
    return this.addressService.verifyAllAddresses(req.user.tenantId, debtorId);
  }

  // ==================== PHASE 2: NEXT ADDRESS SUGGESTION ====================

  /**
   * Get next suggested address when notification fails
   */
  @Post("addresses/:addressId/suggest-next")
  async suggestNextAddress(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() body: { debtorId: string; returnReason: string }
  ) {
    return this.addressService.suggestNextAddress(
      req.user.tenantId,
      body.debtorId,
      addressId,
      body.returnReason as any
    );
  }

  // ==================== PHASE 3: ADDRESS SUCCESS STATS ====================

  /**
   * Get success statistics for an address
   */
  @Get("addresses/:addressId/stats")
  async getAddressStats(
    @Request() req: any,
    @Param("addressId") addressId: string
  ) {
    return this.addressService.getAddressSuccessStats(req.user.tenantId, addressId);
  }

  /**
   * Get addresses sorted by success rate
   */
  @Get("debtors/:debtorId/addresses/sorted")
  async getAddressesSorted(
    @Request() req: any,
    @Param("debtorId") debtorId: string
  ) {
    return this.addressService.getAddressesSortedBySuccessRate(req.user.tenantId, debtorId);
  }

  // ==================== PHASE 4: NOTIFICATION CHAIN ====================

  /**
   * Get notification chain for a debtor
   */
  @Get("debtors/:debtorId/notification-chain")
  async getNotificationChain(
    @Request() req: any,
    @Param("debtorId") debtorId: string
  ) {
    return this.addressService.getNotificationChain(req.user.tenantId, debtorId);
  }

  // ==================== CASE DEBTOR ACTIVE ADDRESS ====================

  /**
   * Set active address for a case debtor
   */
  @Post("case-debtors/:caseDebtorId/active-address")
  async setActiveAddress(
    @Request() req: any,
    @Param("caseDebtorId") caseDebtorId: string,
    @Body() body: { addressId: string }
  ) {
    await this.addressService.setActiveAddress(
      req.user.tenantId,
      caseDebtorId,
      body.addressId
    );
    return { success: true };
  }
}
