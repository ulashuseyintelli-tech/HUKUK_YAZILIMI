import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { StaffType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { withPublicLawyers } from "../lawyer/lawyer-public-projection";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { projectF01Office } from "./office-f01-projection";
import {
  encryptCredential,
  decryptCredential,
  isCredentialEncryptionConfigured,
} from "./office-credential-encryption.util";

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
    private audit: AuditService,
    private readonly officeApproval?: OfficeApprovalService,
  ) {}

  // ACT-02: yazma anında fail-closed — anahtar yoksa "şifreli" iddiası yalan olur, sessizce
  // düz-metin kaydetmeyiz. Yalnız secret alanı GERÇEKTEN gönderildiğinde (dokunulan alan) çağrılır.
  private assertEncryptionConfigured(): void {
    if (!isCredentialEncryptionConfigured()) {
      throw new ServiceUnavailableException(
        "Kimlik bilgisi şifreleme anahtarı yapılandırılmamış (CREDENTIAL_ENCRYPTION_KEY)"
      );
    }
  }

  // Secret alanları maskele (düz-metin sızıntısını önler). Internal gönderim
  // yolları (getFullSmtpSettings/getFullSmsSettings) ham değeri okumaya devam eder.
  private redactOfficeSecrets<T extends Record<string, any>>(office: T): T {
    const masked: Record<string, any> = { ...office };
    for (const f of OfficeService.SECRET_FIELDS) {
      if (f in masked) masked[f] = masked[f] ? "********" : null;
    }
    return masked as T;
  }

  private async projectForActor<T extends Record<string, any>>(
    tenantId: string,
    office: T,
    actor?: { userId?: string; role?: string },
  ): Promise<Record<string, unknown>> {
    if (!actor?.userId || !this.officeApproval) {
      return this.redactOfficeSecrets(office);
    }
    const targetOfficeId = typeof office.id === 'string' ? office.id : undefined;
    const authorized = await this.officeApproval.isF01ActorAuthorized(
      actor.userId,
      tenantId,
      targetOfficeId,
    );
    return projectF01Office(
      office as Record<string, unknown> & {
        lawyers?: Record<string, unknown>[];
        bankAccounts?: Record<string, unknown>[];
      },
      authorized ? 'AUTHORIZED_S0_S1' : 'PUBLIC_S0_ONLY',
    ) as Record<string, unknown>;
  }

  // Büro bilgilerini GENEL uç için getir (secret'lar maskeli). getOrCreate
  // internal kullanım için saf (ham) kalır.
  async getPublicOffice(
    tenantId: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);
    // Existing internal callers without an actor context retain the previous
    // credential-masked contract; HTTP always supplies actor context below.
    return this.projectForActor(tenantId, office, actor);
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

    // P01: nested `lawyers` credential alanlari public yanittan CIKARILIR.
    return withPublicLawyers(office);
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
      vergiNo?: string;
      vergiDairesi?: string;
      mersisNo?: string;
      kepAddress?: string;
      defaultExecutionOfficeId?: string;
    },
    userId?: string,
    actor?: { userId?: string; role?: string },
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
    // P01: nested `lawyers` credential alanlari public yanittan CIKARILIR.
    return this.projectForActor(tenantId, withPublicLawyers(updated), actor);
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
    },
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    // Eğer varsayılan olarak işaretlendiyse, diğerlerini kaldır
    if (data.isDefault) {
      await this.prisma.officeBankAccount.updateMany({
        where: { officeId: office.id },
        data: { isDefault: false },
      });
    }

    const created = await this.prisma.officeBankAccount.create({
      data: {
        officeId: office.id,
        ...data,
      },
    });
    const projected = await this.projectForActor(tenantId, { id: office.id, bankAccounts: [created] }, actor);
    const bankAccounts = projected.bankAccounts as Record<string, unknown>[] | undefined;
    return bankAccounts?.[0] ?? projected;
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
    },
    actor?: { userId?: string; role?: string },
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

    const updated = await this.prisma.officeBankAccount.update({
      where: { id: accountId },
      data,
    });
    const projected = await this.projectForActor(tenantId, { id: office.id, bankAccounts: [updated] }, actor);
    const bankAccounts = projected.bankAccounts as Record<string, unknown>[] | undefined;
    return bankAccounts?.[0] ?? projected;
  }

  // Banka hesabı sil
  async deleteBankAccount(
    tenantId: string,
    accountId: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    const account = await this.prisma.officeBankAccount.findFirst({
      where: { id: accountId, officeId: office.id },
    });

    if (!account) {
      throw new NotFoundException("Banka hesabı bulunamadı");
    }

    const deleted = await this.prisma.officeBankAccount.delete({
      where: { id: accountId },
    });
    const projected = await this.projectForActor(tenantId, { id: office.id, bankAccounts: [deleted] }, actor);
    const bankAccounts = projected.bankAccounts as Record<string, unknown>[] | undefined;
    return bankAccounts?.[0] ?? projected;
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
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    // ACT-02: yeni parola gönderildiyse at-rest şifrele (boş string/undefined dokunulmaz sayılır).
    const toPersist = { ...data };
    if (toPersist.smtpPass) {
      this.assertEncryptionConfigured();
      toPersist.smtpPass = encryptCredential(toPersist.smtpPass);
    }

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data: toPersist,
    });
    await this.logSettingsChange(tenantId, userId, "SMTP", office, data);
    return this.projectForActor(tenantId, updated, actor);
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
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    // ACT-02: yeni API key/secret gönderildiyse at-rest şifrele.
    const toPersist = { ...data };
    if (toPersist.smsApiKey || toPersist.smsApiSecret) {
      this.assertEncryptionConfigured();
      if (toPersist.smsApiKey) toPersist.smsApiKey = encryptCredential(toPersist.smsApiKey);
      if (toPersist.smsApiSecret) toPersist.smsApiSecret = encryptCredential(toPersist.smsApiSecret);
    }

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data: toPersist,
    });
    await this.logSettingsChange(tenantId, userId, "SMS", office, data);
    return this.projectForActor(tenantId, updated, actor);
  }

  // Tam SMTP ayarlarını getir (e-posta gönderimi için - internal)
  async getFullSmtpSettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      smtpHost: office.smtpHost,
      smtpPort: office.smtpPort,
      smtpUser: office.smtpUser,
      smtpPass: office.smtpPass ? decryptCredential(office.smtpPass) : office.smtpPass,
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
      smsApiKey: office.smsApiKey ? decryptCredential(office.smsApiKey) : office.smsApiKey,
      smsApiSecret: office.smsApiSecret ? decryptCredential(office.smsApiSecret) : office.smsApiSecret,
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
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "GREETING", office, data);
    return this.projectForActor(tenantId, updated, actor);
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
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "IIK78", office, data);
    return this.projectForActor(tenantId, updated, actor);
  }

  // ACT-07: Vekalet Süresi Uyarısı büro-geneli ayarlarını getir (E-POSTA-ONLY kapsam; SMS/kanal
  // genişletmesi OWN-20'nin ayrı owner kararı — burada YOK). Motor poa-expiry-delivery.service.ts okur.
  async getPoaExpirySettings(tenantId: string) {
    const office = await this.getOrCreate(tenantId);
    return {
      poaExpiryNotificationEnabled: office.poaExpiryNotificationEnabled ?? true,
      poaExpiryThresholdDays: office.poaExpiryThresholdDays ?? 30,
      poaExpiryRecipientLawyerIds: office.poaExpiryRecipientLawyerIds ?? [],
    };
  }

  // ACT-07: Vekalet Süresi Uyarısı büro-geneli ayarlarını güncelle
  async updatePoaExpirySettings(
    tenantId: string,
    data: {
      poaExpiryNotificationEnabled?: boolean;
      poaExpiryThresholdDays?: number;
      poaExpiryRecipientLawyerIds?: string[];
    },
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "POA_EXPIRY", office, data);
    return this.projectForActor(tenantId, updated, actor);
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
    userId?: string,
    actor?: { userId?: string; role?: string },
  ) {
    const office = await this.getOrCreate(tenantId);

    const updated = await this.prisma.office.update({
      where: { id: office.id },
      data,
    });
    await this.logSettingsChange(tenantId, userId, "ESCALATION", office, data);
    return this.projectForActor(tenantId, updated, actor);
  }
}
