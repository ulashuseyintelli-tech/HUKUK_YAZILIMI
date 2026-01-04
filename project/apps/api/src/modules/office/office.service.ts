import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class OfficeService {
  constructor(private prisma: PrismaService) {}

  // Büro bilgilerini getir (yoksa oluştur)
  async getOrCreate(tenantId: string) {
    let office = await this.prisma.office.findUnique({
      where: { tenantId },
      include: {
        bankAccounts: {
          orderBy: { isDefault: "desc" },
        },
        lawyers: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!office) {
      // Tenant bilgisini al
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      // Varsayılan büro oluştur
      office = await this.prisma.office.create({
        data: {
          tenantId,
          name: tenant?.name || "Hukuk Bürosu",
        },
        include: {
          bankAccounts: true,
          lawyers: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      });
    }

    return office;
  }

  // Büro bilgilerini güncelle
  async update(
    tenantId: string,
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
    const office = await this.getOrCreate(tenantId);

    return this.prisma.office.update({
      where: { id: office.id },
      data,
      include: {
        bankAccounts: {
          orderBy: { isDefault: "desc" },
        },
        lawyers: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });
  }

  // Banka hesabı ekle
  async addBankAccount(
    tenantId: string,
    data: {
      bankName: string;
      branchName?: string;
      iban: string;
      accountName?: string;
      isDefault?: boolean;
    }
  ) {
    const office = await this.getOrCreate(tenantId);

    // Eğer varsayılan olarak işaretlendiyse, diğerlerini kaldır
    if (data.isDefault) {
      await this.prisma.officeBankAccount.updateMany({
        where: { officeId: office.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.officeBankAccount.create({
      data: {
        officeId: office.id,
        ...data,
      },
    });
  }

  // Banka hesabı güncelle
  async updateBankAccount(
    tenantId: string,
    accountId: string,
    data: {
      bankName?: string;
      branchName?: string;
      iban?: string;
      accountName?: string;
      isDefault?: boolean;
    }
  ) {
    const office = await this.getOrCreate(tenantId);

    // Hesabın bu büroya ait olduğunu kontrol et
    const account = await this.prisma.officeBankAccount.findFirst({
      where: { id: accountId, officeId: office.id },
    });

    if (!account) {
      throw new NotFoundException("Banka hesabı bulunamadı");
    }

    // Eğer varsayılan olarak işaretlendiyse, diğerlerini kaldır
    if (data.isDefault) {
      await this.prisma.officeBankAccount.updateMany({
        where: { officeId: office.id, id: { not: accountId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.officeBankAccount.update({
      where: { id: accountId },
      data,
    });
  }

  // Banka hesabı sil
  async deleteBankAccount(tenantId: string, accountId: string) {
    const office = await this.getOrCreate(tenantId);

    const account = await this.prisma.officeBankAccount.findFirst({
      where: { id: accountId, officeId: office.id },
    });

    if (!account) {
      throw new NotFoundException("Banka hesabı bulunamadı");
    }

    return this.prisma.officeBankAccount.delete({
      where: { id: accountId },
    });
  }

  // SMTP ayarlarını güncelle
  async updateSmtpSettings(
    tenantId: string,
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
    const office = await this.getOrCreate(tenantId);

    return this.prisma.office.update({
      where: { id: office.id },
      data,
    });
  }

  // SMTP ayarlarını getir
  async getSmtpSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      smtpHost: office.smtpHost,
      smtpPort: office.smtpPort,
      smtpUser: office.smtpUser,
      smtpPass: office.smtpPass ? "********" : null, // Şifreyi gizle
      smtpSecure: office.smtpSecure,
      smtpFromName: office.smtpFromName,
      smtpFromEmail: office.smtpFromEmail,
    };
  }

  // SMS ayarlarını güncelle
  async updateSmsSettings(
    tenantId: string,
    data: {
      smsProvider?: string;
      smsApiKey?: string;
      smsApiSecret?: string;
      smsSender?: string;
    }
  ) {
    const office = await this.getOrCreate(tenantId);

    return this.prisma.office.update({
      where: { id: office.id },
      data,
    });
  }

  // Tam SMTP ayarlarını getir (e-posta gönderimi için - internal)
  async getFullSmtpSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      smtpHost: office.smtpHost,
      smtpPort: office.smtpPort,
      smtpUser: office.smtpUser,
      smtpPass: office.smtpPass,
      smtpSecure: office.smtpSecure,
      smtpFromName: office.smtpFromName,
      smtpFromEmail: office.smtpFromEmail,
    };
  }

  // SMS ayarlarını getir
  async getSmsSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      smsProvider: office.smsProvider,
      smsApiKey: office.smsApiKey ? "********" : null,
      smsApiSecret: office.smsApiSecret ? "********" : null,
      smsSender: office.smsSender,
    };
  }

  // Tam SMS ayarlarını getir (SMS gönderimi için - internal)
  async getFullSmsSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      smsProvider: office.smsProvider,
      smsApiKey: office.smsApiKey,
      smsApiSecret: office.smsApiSecret,
      smsSender: office.smsSender,
    };
  }

  // Otomatik tebrik ayarlarını getir
  async getGreetingSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      autoGreetingEnabled: office.autoGreetingEnabled ?? true,
      autoGreetingTime: office.autoGreetingTime || "09:00",
    };
  }

  // Otomatik tebrik ayarlarını güncelle
  async updateGreetingSettings(
    tenantId: string,
    data: {
      autoGreetingEnabled?: boolean;
      autoGreetingTime?: string;
    }
  ) {
    const office = await this.getOrCreate(tenantId);

    return this.prisma.office.update({
      where: { id: office.id },
      data,
    });
  }

  // İİK 78 ayarlarını getir (pasifleşme süresi)
  async getIik78Settings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      inactivityThresholdDays: office.inactivityThresholdDays ?? 365,
      inactivityWarningDays: office.inactivityWarningDays ?? 60,
    };
  }

  // İİK 78 ayarlarını güncelle
  async updateIik78Settings(
    tenantId: string,
    data: {
      inactivityThresholdDays?: number;
      inactivityWarningDays?: number;
    }
  ) {
    const office = await this.getOrCreate(tenantId);

    return this.prisma.office.update({
      where: { id: office.id },
      data,
    });
  }
}
