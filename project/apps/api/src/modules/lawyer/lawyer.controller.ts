import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { LawyerService } from "./lawyer.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LawyerRole, LawyerRank } from "@prisma/client";

@Controller("lawyers")
@UseGuards(JwtAuthGuard)
export class LawyerController {
  constructor(private lawyerService: LawyerService) {}

  // Tüm avukatları getir
  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("search") search?: string,
    @Query("includeInactive") includeInactive?: string
  ) {
    return this.lawyerService.findAll(
      tenantId,
      search,
      includeInactive === "true"
    );
  }

  // Varsayılan avukatları getir
  @Get("defaults")
  findDefaults(@CurrentUser("tenantId") tenantId: string) {
    return this.lawyerService.findDefaults(tenantId);
  }

  // Tek avukat getir
  @Get(":id")
  findOne(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.lawyerService.findOne(tenantId, id);
  }

  // Avukat oluştur
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      name: string;
      surname: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
      whatsappPhone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string;
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      // Yeni alanlar
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    }
  ) {
    return this.lawyerService.create(tenantId, data);
  }

  // Avukat güncelle
  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body()
    data: {
      name?: string;
      surname?: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
      whatsappPhone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string;
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      sortOrder?: number;
      isActive?: boolean;
      // Yeni alanlar
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    }
  ) {
    return this.lawyerService.update(tenantId, id, data);
  }

  // Avukat kısmi güncelle (PATCH)
  @Patch(":id")
  patch(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body()
    data: {
      phone?: string;
      email?: string;
      address?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
    }
  ) {
    return this.lawyerService.update(tenantId, id, data);
  }

  // Avukat sil
  @Delete(":id")
  delete(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string
  ) {
    return this.lawyerService.delete(tenantId, id);
  }

  // Sıralama güncelle
  @Put("order/update")
  updateOrder(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: { lawyerIds: string[] }
  ) {
    return this.lawyerService.updateOrder(tenantId, data.lawyerIds);
  }

  // Varsayılanları ayarla
  @Put("defaults/set")
  setDefaults(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: { lawyerIds: string[] }
  ) {
    return this.lawyerService.setDefaults(tenantId, data.lawyerIds);
  }
}
