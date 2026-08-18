import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
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
import { OfficeWorkPoolMutationService } from "./work-pool/office-work-pool.mutation.service";
import {
  OfficeWorkPoolTargetStates,
  OfficeWorkPoolUnknownMemberError,
  OfficeWorkPoolUnknownStateError,
  OFFICE_WORK_POOL_KINDS,
} from "./work-pool/office-work-pool.mutation-contract";

@Injectable()
export class OfficeService {
  // GET /office gibi GENEL uçlarda asla düz-metin dönmemesi gereken secret alanlar.
  private static readonly SECRET_FIELDS: string[] = [
    "smtpPass",
    "smsApiKey",
    "smsApiSecret",
  ];

  /**
   * OFFICE-WR01-B02 AŞAMA 4 — havuz mutation primitive'i (§11.5.7 tek writer).
   *
   * BİLEREK ENJEKTE EDİLMEZ, burada KURULUR. Gerekçe: dual-write AŞAMA 4'te "her zaman açık"
   * olmak zorundadır (§9.3) — opsiyonel bir bağımlılık, sağlanmadığında sessizce yalnız legacy
   * yazan bir DE FACTO FEATURE FLAG olurdu ve flag'in kapalı olduğu her çağrı drift üretirdi.
   * `officeApproval` gibi opsiyonel bir yüzey DEĞİLDİR; aynı `PrismaService` üzerinde çalışır,
   * yeni bir DI kenarı ve yeni bir modül bağı gerektirmez.
   */
  private readonly workPoolMutation: OfficeWorkPoolMutationService;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private readonly officeApproval?: OfficeApprovalService,
  ) {
    this.workPoolMutation = new OfficeWorkPoolMutationService(prisma);
  }

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

      // OFFICE-WR01-B02 AŞAMA 4 (§6.7): Office satırı ile üç knowledge-boundary anchor'ı AYNI
      // transaction'da doğar; biri olup diğeri OLAMAZ. Office tembel yaratıldığı için anchor
      // yalnız migration'da üretilemez — anchor'sız bir Office resolver tarafından
      // fail-closed `UNKNOWN/ANCHOR_MISSING` olarak okunur ve havuz mutasyonu reddedilir.
      //
      // knownFrom = Office.createdAt: büro O AN doğmuştur, öncesi hakkında bilgi GERÇEKTEN
      // yoktur — bu bir iddia icadı değil, ölçülen olgudur (§6.7 madde 2). provenance bu
      // yüzden TENANT_PROVISIONED'dır; LEGACY_CUTOVER_IMPORT (düz diziden ithal) burada
      // YANLIŞ olurdu, ithal edilen bir şey yoktur.
      office = await this.prisma.$transaction(async (tx) => {
        // Varsayılan büro oluştur
        const created = await tx.office.create({
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

        await tx.officeWorkPoolEpoch.createMany({
          data: OFFICE_WORK_POOL_KINDS.map((poolKind) => ({
            tenantId,
            poolKind,
            knownFrom: created.createdAt,
            provenance: "TENANT_PROVISIONED" as const,
          })),
          // @@unique([tenantId, poolKind]) üzerinde ON CONFLICT DO NOTHING — eşzamanlı iki
          // getOrCreate'te Office.tenantId @unique zaten birini eler; anchor tarafı da
          // sessizce tekilleşir (§6.7 madde 3).
          skipDuplicates: true,
        });

        // Yalnız anchor yazmak YETMEZ: `opStaffTypes` şema varsayılanı BOŞ DEĞİLDİR
        // (@default([MUHASEBE, ADLI_KATIP, SEKRETER])). Anchor'sız-üyeliksiz bir doğum,
        // legacy dizisi DOLU / üyelik tablosu BOŞ bir büro üretirdi ve resolver bunu
        // `RESOLVED / EMPTY` — yani "havuz gerçekten boştu" — diye YANLIŞ okurdu; §5.2'nin
        // gap Office için yasakladığı durumun aynısı. Üyelikler anchor'larla AYNI
        // transaction'da ve AYNI `createdAt` anında materyalize edilir.
        await this.workPoolMutation.materializeProvisioningSnapshot(tx, {
          tenantId,
          at: created.createdAt,
          legacyPools: created as unknown as Record<string, unknown>,
        });

        return created;
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

    // ── OFFICE-WR01-B02 AŞAMA 4 — DUAL-WRITE (§9.2 AŞAMA 4, §9.4) ────────────────────────
    // API sözleşmesi DEĞİŞMEZ: route, gövde şekli, authorization, response şekli ve admin
    // panelinin gönderim davranışı aynıdır. Değişen tek şey, üç havuz alanının artık TEK
    // mutation primitive'i üzerinden — legacy dizi + effective-dated üyelik AYNI transaction'da
    // — yazılmasıdır. Legacy diziler AUTHORITATIVE kalır; üyelik tablosu MIRROR'dır.
    //
    // Bu servis AYRICA transaction AÇMAZ (§11.5.7 madde 1): kilit alma, effectiveAt üretimi,
    // fark hesabı ve iki yazma primitive'in içindedir. İç içe transaction, Office kilidinin
    // transaction'ın İLK DB ifadesi olduğu garantisini bozardı.
    const { escalationManagerLawyerIds, escalationFounderLawyerIds, opStaffTypes, ...rest } = data;

    // `undefined` = UNCHANGED. Gövdede olmayan bir havuz "boş hedef" SAYILMAZ — bu, allowlist
    // projeksiyonu + tam-form POST vakasının (§11.4, PR-1.5) mutation tarafındaki eşdeğeri
    // olurdu ve gönderilmeyen havuzu SESSİZCE SİLERDİ.
    const targetStates: {
      -readonly [K in keyof OfficeWorkPoolTargetStates]: OfficeWorkPoolTargetStates[K];
    } = {};
    if (escalationManagerLawyerIds !== undefined) {
      targetStates.ESCALATION_MANAGER = escalationManagerLawyerIds;
    }
    if (escalationFounderLawyerIds !== undefined) {
      targetStates.ESCALATION_FOUNDER = escalationFounderLawyerIds;
    }
    if (opStaffTypes !== undefined) {
      targetStates.OP_STAFF_TYPE = opStaffTypes;
    }

    let updated: Record<string, unknown>;
    try {
      const result = await this.workPoolMutation.applyTargetState({
        tenantId,
        source: { mode: "EXPLICIT", targetStates },
        actorUserId: userId,
        // Havuz DIŞI eskalasyon alanları AYNI transaction'da yazılır; havuz kolonları buradan
        // GEÇEMEZ (primitive fail-closed reddeder).
        legacyPassthrough: rest as Record<string, unknown>,
      });
      updated = result.office;
    } catch (e) {
      throw this.toEscalationHttpError(e);
    }

    await this.logSettingsChange(tenantId, userId, "ESCALATION", office, data);
    return this.projectForActor(tenantId, updated, actor);
  }

  /**
   * B02 domain hatalarının HTTP karşılığı.
   *
   * İkisi de AŞAMA 1-2/4 ile gelen YAPISAL sıkılaştırmalardır ve bugünkü sessiz kabulün
   * yerine açık hata koyar:
   *  - `UNKNOWN` durum (anchor yok) → `503`: bu bir istek hatası değil, veri bütünlüğü
   *    eksiğidir; catch-up aracı çalıştırılana kadar yazma güvenli DEĞİLDİR (§5.2, rollout
   *    runbook adım 5). "Boş havuz" sayıp devam etmek üyelikleri sessizce revoke ederdi.
   *  - Tenant'ta olmayan üye → `400`: composite FK `Lawyer(id, tenantId)` (§6.2) bunu DB
   *    düzeyinde zaten reddeder; ham `23503` yerine okunur bir istemci hatası döndürülür.
   * Diğer her hata olduğu gibi yükselir (davranış değişikliği yok).
   */
  private toEscalationHttpError(error: unknown): unknown {
    if (error instanceof OfficeWorkPoolUnknownStateError) {
      return new ServiceUnavailableException(
        "Büro havuz geçmişi kaydı eksik; eskalasyon ayarları şu anda güvenle güncellenemiyor.",
      );
    }
    if (error instanceof OfficeWorkPoolUnknownMemberError) {
      return new BadRequestException(
        "Seçilen avukatlardan biri bu büroya ait değil veya artık mevcut değil.",
      );
    }
    return error;
  }
}
