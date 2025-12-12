import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { OfficeService } from "./office.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("office")
@UseGuards(JwtAuthGuard)
export class OfficeController {
  constructor(private officeService: OfficeService) {}

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
    @Body()
    data: {
      smsProvider?: string;
      smsApiKey?: string;
      smsApiSecret?: string;
      smsSender?: string;
    }
  ) {
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
}
