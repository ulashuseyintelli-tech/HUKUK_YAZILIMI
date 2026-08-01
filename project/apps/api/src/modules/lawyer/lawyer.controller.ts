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
import { OfficeF01AuthorizationGuard } from "../office-approval/office-f01-authorization.guard";

@Controller("lawyers")
@UseGuards(JwtAuthGuard)
export class LawyerController {
  constructor(private lawyerService: LawyerService) {}

  // Tüm avukatları getir
  @Get()
  @UseGuards(OfficeF01AuthorizationGuard)
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("search") search?: string,
    @Query("includeInactive") includeInactive?: string,
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.findAll(tenantId, search, includeInactive === "true", {
          userId: actorUserId,
          role: actorRole,
        })
      : this.lawyerService.findAll(tenantId, search, includeInactive === "true");
  }

  // Varsayılan avukatları getir
  @Get("defaults")
  @UseGuards(OfficeF01AuthorizationGuard)
  findDefaults(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.findDefaults(tenantId, { userId: actorUserId, role: actorRole })
      : this.lawyerService.findDefaults(tenantId);
  }

  // Tek avukat getir
  @Get(":id")
  @UseGuards(OfficeF01AuthorizationGuard)
  findOne(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.findOne(tenantId, id, { userId: actorUserId, role: actorRole })
      : this.lawyerService.findOne(tenantId, id);
  }

  // Avukat oluştur
  @Post()
  @UseGuards(OfficeF01AuthorizationGuard)
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
    },
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.create(tenantId, data, { userId: actorUserId, role: actorRole })
      : this.lawyerService.create(tenantId, data);
  }

  // Avukat güncelle
  @Put(":id")
  @UseGuards(OfficeF01AuthorizationGuard)
  update(
    @CurrentUser("tenantId") tenantId: string,
    // K1-4b: actor kimliği (canApproveOfficeActions guard + audit için). body.userId DEĞİL, truthful @CurrentUser.
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("role") actorRole: string,
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
      // K1-4b: Office Approval delegation flag — yalnız ADMIN/PARTNER yazabilir (service'te guard + audit).
      canApproveOfficeActions?: boolean;
    }
  ) {
    return this.lawyerService.update(tenantId, id, data, { userId: actorUserId, role: actorRole });
  }

  // Avukat kısmi güncelle (PATCH)
  @Patch(":id")
  @UseGuards(OfficeF01AuthorizationGuard)
  patch(
    @CurrentUser("tenantId") tenantId: string,
    // K1-4b: actor — PATCH yolundan da canApproveOfficeActions gelirse aynı guard/audit uygulansın.
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("role") actorRole: string,
    @Param("id") id: string,
    @Body()
    data: {
      phone?: string;
      email?: string;
      address?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      // K1-4b: delegation flag PATCH ile de gelebilir; service guard+audit uygular.
      canApproveOfficeActions?: boolean;
    }
  ) {
    return this.lawyerService.update(tenantId, id, data, { userId: actorUserId, role: actorRole });
  }

  // Avukat pasifleştir (L1A: fiziksel silme değil, isActive=false)
  // H1: sorumlu olduğu dosya varsa body.replacementLawyerId ZORUNLU (service'te doğrulanır).
  @Delete(":id")
  @UseGuards(OfficeF01AuthorizationGuard)
  delete(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body?: { replacementLawyerId?: string }
  ) {
    return this.lawyerService.delete(tenantId, id, { userId }, body?.replacementLawyerId);
  }

  // Sıralama güncelle
  @Put("order/update")
  @UseGuards(OfficeF01AuthorizationGuard)
  updateOrder(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: { lawyerIds: string[] },
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.updateOrder(tenantId, data.lawyerIds, { userId: actorUserId, role: actorRole })
      : this.lawyerService.updateOrder(tenantId, data.lawyerIds);
  }

  // Varsayılanları ayarla
  @Put("defaults/set")
  @UseGuards(OfficeF01AuthorizationGuard)
  setDefaults(
    @CurrentUser("tenantId") tenantId: string,
    @Body() data: { lawyerIds: string[] },
    @CurrentUser("id") actorUserId?: string,
    @CurrentUser("role") actorRole?: string,
  ) {
    return actorUserId
      ? this.lawyerService.setDefaults(tenantId, data.lawyerIds, { userId: actorUserId, role: actorRole })
      : this.lawyerService.setDefaults(tenantId, data.lawyerIds);
  }
}
