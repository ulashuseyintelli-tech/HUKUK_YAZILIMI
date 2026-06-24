import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { OfficeService } from "./office.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { StaffType } from "@prisma/client";

@Controller("office")
@UseGuards(JwtAuthGuard)
export class OfficeController {
  constructor(private officeService: OfficeService) {}

  // WP-4c-hotfix-1: ofis kimlik bilgisi (SMTP/SMS) GÜNCELLEME yalnız ADMIN.
  // WP-4c-0 envanteri bu uçları TENANT_ONLY (tenant içi herkes değiştirebilir) olarak işaretledi.
  // Minimal hard guard; mevcut report.controller ADMIN-gate deseniyle aynı. Genel RBAC framework DEĞİL.
  private assertCredentialAdmin(role: string) {
    if (role !== "ADMIN") {
      throw new ForbiddenException(
        "Ofis kimlik bilgisi (SMTP/SMS) ayarlarını yalnız yönetici (ADMIN) güncelleyebilir"
      );
    }
  }

  // Büro bilgilerini getir
  @Get()
  getOffice(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getOrCreate(tenantId);
  }

  // Büro bilgilerini güncelle
  @Put()
  updateOffice(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      name?: string;
      address?: string;
      city?: string;
      district?: string;
      postalCode?: string;
      phone?: string;
      fax?: string;
      email?: string;
      website?: string;
      barAssociation?: string;
      defaultExecutionOfficeId?: string;
    }
  ) {
    return this.officeService.update(tenantId, data);
  }

  // Banka hesabı ekle
  @Post("bank-accounts")
  addBankAccount(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      bankName: string;
      branchName?: string;
      iban: string;
      accountName?: string;
      isDefault?: boolean;
    }
  ) {
    return this.officeService.addBankAccount(tenantId, data);
  }

  // Banka hesabı güncelle
  @Put("bank-accounts/:id")
  updateBankAccount(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") accountId: string,
    @Body()
    data: {
      bankName?: string;
      branchName?: string;
      iban?: string;
      accountName?: string;
      isDefault?: boolean;
    }
  ) {
    return this.officeService.updateBankAccount(tenantId, accountId, data);
  }

  // Banka hesabı sil
  @Delete("bank-accounts/:id")
  deleteBankAccount(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") accountId: string
  ) {
    return this.officeService.deleteBankAccount(tenantId, accountId);
  }

  // SMTP ayarlarını getir
  @Get("smtp-settings")
  getSmtpSettings(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getSmtpSettings(tenantId);
  }

  // SMTP ayarlarını güncelle
  @Put("smtp-settings")
  updateSmtpSettings(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") role: string,
    @Body()
    data: {
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      smtpSecure?: boolean;
      smtpFromName?: string;
      smtpFromEmail?: string;
    }
  ) {
    this.assertCredentialAdmin(role);
    return this.officeService.updateSmtpSettings(tenantId, data);
  }

  // SMS ayarlarını getir
  @Get("sms-settings")
  getSmsSettings(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getSmsSettings(tenantId);
  }

  // SMS ayarlarını güncelle
  @Put("sms-settings")
  updateSmsSettings(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") role: string,
    @Body()
    data: {
      smsProvider?: string;
      smsApiKey?: string;
      smsApiSecret?: string;
      smsSender?: string;
    }
  ) {
    this.assertCredentialAdmin(role);
    return this.officeService.updateSmsSettings(tenantId, data);
  }

  // Otomatik tebrik ayarlarını getir
  @Get("greeting-settings")
  getGreetingSettings(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getGreetingSettings(tenantId);
  }

  // Otomatik tebrik ayarlarını güncelle
  @Put("greeting-settings")
  updateGreetingSettings(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      autoGreetingEnabled?: boolean;
      autoGreetingTime?: string;
    }
  ) {
    return this.officeService.updateGreetingSettings(tenantId, data);
  }

  // İİK 78 ayarlarını getir (pasifleşme süresi)
  @Get("iik78-settings")
  getIik78Settings(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getIik78Settings(tenantId);
  }

  // İİK 78 ayarlarını güncelle
  @Put("iik78-settings")
  updateIik78Settings(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      inactivityThresholdDays?: number;
      inactivityWarningDays?: number;
    }
  ) {
    return this.officeService.updateIik78Settings(tenantId, data);
  }

  // Görev & Eskalasyon ayarlarını getir
  @Get("escalation-settings")
  getEscalationSettings(@CurrentUser("tenantId") tenantId: string) {
    return this.officeService.getEscalationSettings(tenantId);
  }

  // Görev & Eskalasyon ayarlarını güncelle
  @Put("escalation-settings")
  updateEscalationSettings(
    @CurrentUser("tenantId") tenantId: string,
    @Body()
    data: {
      escalationManagerLawyerIds?: string[];
      escalationFounderLawyerIds?: string[];
      opReminderDays?: number;
      opFounderDays?: number;
      opRepeatMonths?: number;
      opEmailEnabled?: boolean;
      opSmsEnabled?: boolean;
      opStaffTypes?: StaffType[];
      // D-G5: dosya görevi (case-task) eskalasyon ayarları
      escalationTeamLeadLawyerIds?: string[];
      caseTaskOwnerDays?: number;
      caseTaskTeamLeadDays?: number;
      caseTaskManagerDays?: number;
    }
  ) {
    return this.officeService.updateEscalationSettings(tenantId, data);
  }
}
