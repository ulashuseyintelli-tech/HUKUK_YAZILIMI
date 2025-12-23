import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { DebtorService } from "./debtor.service";
import {
  CreateDebtorDto,
  UpdateDebtorDto,
  CheckDuplicateDto,
  CreateDebtorAddressDto,
  UpdateDebtorAddressDto,
} from "./dto/debtor.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("debtors")
@UseGuards(JwtAuthGuard)
export class DebtorController {
  constructor(private debtorService: DebtorService) {}

  // ==================== DEBTOR CRUD ====================

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("city") city?: string
  ) {
    return this.debtorService.findAll(tenantId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      type,
      riskLevel,
      city,
    });
  }

  @Get("statistics")
  getStatistics(@CurrentUser("tenantId") tenantId: string) {
    return this.debtorService.getStatistics(tenantId);
  }

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.debtorService.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @Body() dto: CreateDebtorDto) {
    return this.debtorService.create(tenantId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDebtorDto
  ) {
    return this.debtorService.update(tenantId, id, dto);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.debtorService.delete(tenantId, id);
  }

  // ==================== DUPLICATE CHECK ====================

  @Post("check-duplicate")
  checkDuplicate(
    @CurrentUser("tenantId") tenantId: string,
    @Body() dto: CheckDuplicateDto
  ) {
    return this.debtorService.checkDuplicate(tenantId, dto);
  }

  // ==================== ADDRESS MANAGEMENT ====================

  @Post(":id/addresses")
  addAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Body() dto: CreateDebtorAddressDto
  ) {
    return this.debtorService.addAddress(tenantId, debtorId, dto);
  }

  @Put(":id/addresses/:addressId")
  updateAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string,
    @Body() dto: UpdateDebtorAddressDto
  ) {
    return this.debtorService.updateAddress(tenantId, debtorId, addressId, dto);
  }

  @Delete(":id/addresses/:addressId")
  deleteAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string
  ) {
    return this.debtorService.deleteAddress(tenantId, debtorId, addressId);
  }

  @Post(":id/addresses/:addressId/set-primary")
  setPrimaryAddress(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") debtorId: string,
    @Param("addressId") addressId: string
  ) {
    return this.debtorService.setPrimaryAddress(tenantId, debtorId, addressId);
  }
}
