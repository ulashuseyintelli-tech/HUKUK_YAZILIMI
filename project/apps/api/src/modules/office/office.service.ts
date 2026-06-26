import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { StaffType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class OfficeService {
  // GET /office gibi GENEL uçlarda asla düz-metin dönmemesi gereken secret alanlar.
  private static readonly SECRET_FIELDS: string[] = [
    "smtpPass",
    "smsApiKey",
    "smsApiSecret",
  ];

  constructor(
    private prisma: PrismaService,
    private audit: AuditService
  ) {}

  // Secret alanları maskele (düz-metin sızıntısını önler). Internal gönderim
  // yolları (getFullSmtpSettings/getFullSmsSettings) ham değeri okumaya devam eder.
  private redactOfficeSecrets<T extends Record<string, any>>(office: T): T {
    const masked: Record<string, any> = { ...office };
    for (const f of OfficeService.SECRET_FIELDS) {
      if (f in masked) masked[f] = masked[f] ? "********" : null;
    }
    return masked as T;
  }

  // Büro bilgilerini GENEL uç için getir (secret'lar maskeli). getOrCreate
  // internal kullanım için saf (ham) kalır.
  async getPublicOffice(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return this.redactOfficeSecrets(office);
  }

  // Ayar değişikliğini AuditLog'a yaz: yalnız gönderilen alanların eski/yeni
  // değeri, secret'lar maskeli (AuditLog ikinci bir sızıntı kanalı olmasın).
  // audit.log hatayı içeride yutar → ayar güncellemesini bozmaz.
  private async logSettingsChange(
    tenantId: string,
    userId: string | undefined,
    section: string,
    before: Record<string, any>,
    data: Record<string, any>
  ) {
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    for (const k of Object.keys(data)) {
      const isSecret = OfficeService.SECRET_FIELDS.includes(k);
      oldValues[k] = isSecret ? (before?.[k] ? "********" : null) : before?.[k];
      newValues[k] = isSecret ? (data[k] ? "********" : null) : data[k];
    }
    await this.audit.log({
      tenantId,
      action: "UPDATE",
      entityType: "OFFICE_SETTINGS",
      entityId: before?.id,
      userId,
      description: `Büro ayarları güncellendi (${section})`,
      oldValues,
      newValues,
      metadata: { section },
    });
  }

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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
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
    await this.logSettingsChange(tenantId, userId, "OFFICE", office, data);
    return updated;
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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "SMTP", office, data);
    return updated;
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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "SMS", office, data);
    return updated;
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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "GREETING", office, data);
    return updated;
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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "IIK78", office, data);
    return updated;
  }

  // Görev & Eskalasyon ayarlarını getir (büro-geneli politika; motor PR-3b okur)
  async getEscalationSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      escalationManagerLawyerIds: office.escalationManagerLawyerIds,
      escalationFounderLawyerIds: office.escalationFounderLawyerIds,
      opReminderDays: office.opReminderDays,
      opFounderDays: office.opFounderDays,
      opRepeatMonths: office.opRepeatMonths,
      opEmailEnabled: office.opEmailEnabled,
      opSmsEnabled: office.opSmsEnabled,
      opStaffTypes: office.opStaffTypes, // L1 alıcı personel türleri
      // D-G5: dosya görevi (case-task) owner-first eskalasyon ayarları (operasyonelden AYRI)
      escalationTeamLeadLawyerIds: office.escalationTeamLeadLawyerIds,
      caseTaskOwnerDays: office.caseTaskOwnerDays,
      caseTaskTeamLeadDays: office.caseTaskTeamLeadDays,
      caseTaskManagerDays: office.caseTaskManagerDays,
    };
  }

  async updateEscalationSettings(
    tenantId: string,
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
    },
    userId?: string
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "ESCALATION", office, data);
    return updated;
  }
}
