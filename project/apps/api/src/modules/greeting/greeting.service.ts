import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientNotificationService } from "../client-notification/client-notification.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SCHEDULER_TIMEZONE } from "../../common/scheduler-timezone";
import { reportCronJobFailure } from "../../common/cron-failure-reporting";
import { runWithOverlapGuard } from "../../common/scheduler-overlap-guard";
import { IntegrationErrorReporter } from "../error-log/integration-error-reporter";
import { ACTIVE_TENANT_WHERE } from "../tenant/tenant-lifecycle";
import { UpsertSpecialDayDto, validateSpecialDayInput } from "./dto/upsert-special-day.dto";

/**
 * Office.autoGreetingTime ("HH:mm") değerini saat/dakikaya ayrıştırır.
 * Parse edilemezse (null/boş/hatalı format/aralık dışı) 09:00 fallback döner ve
 * fallbackUsed=true işaretler — çağıran taraf bu durumda warn loglar.
 */
export function parseGreetingTime(
  raw?: string | null
): { hour: number; minute: number; fallbackUsed: boolean } {
  const fallback = { hour: 9, minute: 0, fallbackUsed: true };
  if (typeof raw !== "string") return fallback;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return { hour, minute, fallbackUsed: false };
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Bir tenant için otomatik tebrik scheduler'ının ŞU AN çalışıp çalışmayacağına karar verir.
 * Her dakika çağrılır; catch-up mantığı: now >= bugünkü planlanan saat ise tetikler
 * (tam-dakika eşleşmesi GEREKMEZ → sunucu kapalı kalsa bile açılınca aynı gün yakalar).
 *
 * true döner ⇔ enabled=true VE now >= bugünkü autoGreetingTime VE bugün henüz çalışılmadı
 * (lastRunAt bugün değil). Aynı-gün guard'ı son koşulla sağlanır.
 */
export function shouldRunGreetingNow(
  now: Date,
  autoGreetingTime: string | null | undefined,
  lastRunAt: Date | null | undefined,
  enabled: boolean
): boolean {
  if (!enabled) return false;
  const { hour, minute } = parseGreetingTime(autoGreetingTime);
  const scheduled = new Date(now);
  scheduled.setHours(hour, minute, 0, 0);
  if (now.getTime() < scheduled.getTime()) return false; // bugünkü saat henüz gelmedi
  if (lastRunAt && isSameLocalDay(lastRunAt, now)) return false; // bugün zaten çalıştı (guard)
  return true;
}

@Injectable()
export class GreetingService {
  private readonly logger = new Logger(GreetingService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: ClientNotificationService,
    private errorReporter: IntegrationErrorReporter
  ) {}

  // Varsayılan özel günleri oluştur
  async createDefaultSpecialDays(tenantId: string) {
    const defaultDays = [
      // Dini Bayramlar (değişken tarihli - her yıl güncellenmeli)
      { name: "Ramazan Bayramı", type: "RELIGIOUS", month: 4, day: 10, isVariable: true, year: 2025,
        greetingMessage: "Ramazan Bayramınızı en içten dileklerimizle kutlar, sağlık ve mutluluklar dileriz.",
        smsMessage: "Ramazan Bayramınız kutlu olsun. Sağlık ve mutluluklar dileriz." },
      { name: "Kurban Bayramı", type: "RELIGIOUS", month: 6, day: 17, isVariable: true, year: 2025,
        greetingMessage: "Kurban Bayramınızı en içten dileklerimizle kutlar, sağlık ve mutluluklar dileriz.",
        smsMessage: "Kurban Bayramınız kutlu olsun. Sağlık ve mutluluklar dileriz." },
      
      // Milli Bayramlar
      { name: "Yılbaşı", type: "NATIONAL", month: 1, day: 1,
        greetingMessage: "Yeni yılınızı en içten dileklerimizle kutlar, sağlık, mutluluk ve başarılar dileriz.",
        smsMessage: "Yeni yılınız kutlu olsun. Sağlık ve mutluluklar dileriz." },
      { name: "Ulusal Egemenlik ve Çocuk Bayramı", type: "NATIONAL", month: 4, day: 23,
        greetingMessage: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı'nı kutlar, en iyi dileklerimizi sunarız.",
        smsMessage: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramınız kutlu olsun." },
      { name: "Emek ve Dayanışma Günü", type: "NATIONAL", month: 5, day: 1,
        greetingMessage: "1 Mayıs Emek ve Dayanışma Günü'nüzü kutlarız.",
        smsMessage: "1 Mayıs Emek ve Dayanışma Günü'nüz kutlu olsun." },
      { name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", type: "NATIONAL", month: 5, day: 19,
        greetingMessage: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı'nı kutlar, en iyi dileklerimizi sunarız.",
        smsMessage: "19 Mayıs Gençlik ve Spor Bayramınız kutlu olsun." },
      { name: "Demokrasi ve Milli Birlik Günü", type: "NATIONAL", month: 7, day: 15,
        greetingMessage: "15 Temmuz Demokrasi ve Milli Birlik Günü'nü saygıyla anıyoruz.",
        smsMessage: "15 Temmuz Demokrasi ve Milli Birlik Günü'nü saygıyla anıyoruz." },
      { name: "Zafer Bayramı", type: "NATIONAL", month: 8, day: 30,
        greetingMessage: "30 Ağustos Zafer Bayramı'nı kutlar, en iyi dileklerimizi sunarız.",
        smsMessage: "30 Ağustos Zafer Bayramınız kutlu olsun." },
      { name: "Cumhuriyet Bayramı", type: "NATIONAL", month: 10, day: 29,
        greetingMessage: "29 Ekim Cumhuriyet Bayramı'nı kutlar, en iyi dileklerimizi sunarız.",
        smsMessage: "29 Ekim Cumhuriyet Bayramınız kutlu olsun." },
      
      // Anma Günleri
      { name: "Atatürk'ü Anma Günü", type: "MEMORIAL", month: 11, day: 10, sendGreeting: false,
        greetingMessage: "Ulu Önder Mustafa Kemal Atatürk'ü saygı ve minnetle anıyoruz.",
        smsMessage: "Atatürk'ü saygı ve minnetle anıyoruz." },
    ];

    for (const day of defaultDays) {
      const existing = await (this.prisma as any).specialDay.findFirst({
        where: { tenantId, name: day.name },
      });

      if (!existing) {
        await (this.prisma as any).specialDay.create({
          data: { tenantId, ...day, isActive: true },
        });
      }
    }

    return { message: "Varsayılan özel günler oluşturuldu" };
  }

  // Özel günleri listele
  async getSpecialDays(tenantId: string) {
    return (this.prisma as any).specialDay.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: [{ month: "asc" }, { day: "asc" }],
    });
  }


  /** Caller: GreetingController.upsertSpecialDay. Global days remain read-only here. */
  async upsertSpecialDay(tenantId: string, input: UpsertSpecialDayDto) {
    const data = await validateSpecialDayInput(input);
    const fields = {
      name: data.name, type: data.type, month: data.month, day: data.day,
      isVariable: data.isVariable, year: data.year,
      greetingMessage: data.greetingMessage, smsMessage: data.smsMessage,
      isActive: data.isActive, sendGreeting: data.sendGreeting,
    };
    if (data.id) {
      return this.prisma.$transaction(async tx => {
        const updated = await tx.specialDay.updateMany({
          where: { id: data.id, tenantId }, data: fields,
        });
        if (updated.count !== 1) throw new NotFoundException("Özel gün bulunamadı");
        return tx.specialDay.findUniqueOrThrow({ where: { id: data.id } });
      });
    }
    return this.prisma.specialDay.create({
      data: { ...fields, tenantId },
    });
  }

  // Bugünkü tebrik edilecekleri bul
  async findTodayGreetings(tenantId: string) {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Doğum günleri (şahıslar)
    const birthdays = await (this.prisma as any).client.findMany({
      where: {
        tenantId,
        isActive: true,
        sendBirthdayGreeting: true,
        birthDate: { not: null },
      },
    });
    const birthdayClients = birthdays.filter((c: any) => {
      if (!c.birthDate) return false;
      const bd = new Date(c.birthDate);
      return bd.getMonth() + 1 === month && bd.getDate() === day;
    });

    // Kuruluş yıldönümleri (şirketler)
    const foundingAnniversaries = await (this.prisma as any).client.findMany({
      where: {
        tenantId,
        isActive: true,
        sendAnniversaryGreeting: true,
        foundingDate: { not: null },
        type: { in: ["COMPANY", "PUBLIC"] },
      },
    });
    const foundingClients = foundingAnniversaries.filter((c: any) => {
      if (!c.foundingDate) return false;
      const fd = new Date(c.foundingDate);
      return fd.getMonth() + 1 === month && fd.getDate() === day;
    });

    // Vekalet yıldönümleri
    const poaAnniversaries = await (this.prisma as any).client.findMany({
      where: {
        tenantId,
        isActive: true,
        sendAnniversaryGreeting: true,
        poaStartDate: { not: null },
      },
    });
    const poaClients = poaAnniversaries.filter((c: any) => {
      if (!c.poaStartDate) return false;
      const pd = new Date(c.poaStartDate);
      return pd.getMonth() + 1 === month && pd.getDate() === day;
    });

    // Bugünkü özel günler
    const specialDays = await (this.prisma as any).specialDay.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        isActive: true,
        sendGreeting: true,
        month,
        day,
      },
    });

    // Bayram tebriği alacak müvekkiller
    let holidayClients: any[] = [];
    if (specialDays.length > 0) {
      holidayClients = await (this.prisma as any).client.findMany({
        where: {
          tenantId,
          isActive: true,
          sendHolidayGreeting: true,
        },
      });
    }

    return {
      birthdays: birthdayClients,
      foundingAnniversaries: foundingClients,
      poaAnniversaries: poaClients,
      specialDays,
      holidayClients,
    };
  }

  // Tebrik mesajı oluştur
  private createGreetingMessage(type: string, client: any, specialDay?: any): { subject: string; message: string; smsMessage: string } {
    const clientName = client.displayName || client.companyName || `${client.firstName || ""} ${client.lastName || ""}`.trim();
    const today = new Date();
    const year = today.getFullYear();

    switch (type) {
      case "BIRTHDAY": {
        const age = client.birthDate ? year - new Date(client.birthDate).getFullYear() : null;
        return {
          subject: `Doğum Gününüz Kutlu Olsun! 🎂`,
          message: `Sayın ${clientName},\n\nDoğum gününüzü en içten dileklerimizle kutlar, sağlık, mutluluk ve başarı dolu nice yıllar dileriz.\n\nSaygılarımızla`,
          smsMessage: `Sayın ${clientName}, doğum gününüzü kutlar, nice mutlu yıllar dileriz.`,
        };
      }
      case "FOUNDING_ANNIVERSARY": {
        const years = client.foundingDate ? year - new Date(client.foundingDate).getFullYear() : null;
        return {
          subject: `Kuruluş Yıldönümünüz Kutlu Olsun! 🎉`,
          message: `Sayın ${clientName},\n\n${years ? `${years}. ` : ""}kuruluş yıldönümünüzü en içten dileklerimizle kutlar, nice başarılı yıllar dileriz.\n\nSaygılarımızla`,
          smsMessage: `${clientName} ${years ? `${years}. ` : ""}kuruluş yıldönümünüz kutlu olsun. Başarılar dileriz.`,
        };
      }
      case "POA_ANNIVERSARY": {
        const years = client.poaStartDate ? year - new Date(client.poaStartDate).getFullYear() : null;
        return {
          subject: `İşbirliğimizin ${years ? `${years}. ` : ""}Yıldönümü 🤝`,
          message: `Sayın ${clientName},\n\nİşbirliğimizin ${years ? `${years}. ` : ""}yıldönümünde, bize duyduğunuz güven için teşekkür eder, birlikte nice başarılı yıllar dileriz.\n\nSaygılarımızla`,
          smsMessage: `Sayın ${clientName}, işbirliğimizin ${years ? `${years}. ` : ""}yılında güveniniz için teşekkür ederiz.`,
        };
      }
      case "HOLIDAY":
      case "MEMORIAL": {
        return {
          subject: specialDay?.name || "Özel Gün Tebriği",
          message: specialDay?.greetingMessage || `Sayın ${clientName},\n\n${specialDay?.name} vesilesiyle en iyi dileklerimizi sunarız.\n\nSaygılarımızla`,
          smsMessage: specialDay?.smsMessage || `${specialDay?.name} kutlu olsun.`,
        };
      }
      default:
        return { subject: "Tebrik", message: "Tebrikler!", smsMessage: "Tebrikler!" };
    }
  }

  /** Callers: GreetingController.sendGreeting and greetingSchedulerTick. Reuses the existing durable notification claim. */
  async sendGreeting(tenantId: string, userId: string, clientId: string, type: string, channel: string, specialDayId?: string) {
    if (!['EMAIL', 'SMS', 'BOTH'].includes(channel) || !['BIRTHDAY', 'FOUNDING_ANNIVERSARY', 'POA_ANNIVERSARY', 'HOLIDAY', 'MEMORIAL'].includes(type)) {
      throw new BadRequestException('Geçersiz tebrik türü veya kanalı');
    }
    const client = await (this.prisma as any).client.findFirst({
      where: { id: clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) throw new NotFoundException("Müvekkil bulunamadı");

    let specialDay;
    if (specialDayId) {
      specialDay = await this.prisma.specialDay.findFirst({ where: { id: specialDayId, OR: [{ tenantId }, { tenantId: null }] } });
      if (!specialDay) throw new NotFoundException('Özel gün bulunamadı');
    }

    const { subject, message, smsMessage } = this.createGreetingMessage(type, client, specialDay);

    const results: Array<{ channel: 'EMAIL' | 'SMS'; sent: boolean; success: boolean; status: string; notificationId?: string; alreadySent?: boolean; error?: string }> = [];
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: SCHEDULER_TIMEZONE });
    const channels: Array<'EMAIL' | 'SMS'> = channel === 'BOTH' ? ['EMAIL', 'SMS'] : [channel as 'EMAIL' | 'SMS'];
    for (const target of channels) {
      // Stable tenant-scoped claim: same day/event/client/channel is never blindly resent.
      const dedupeKey = `greeting:${JSON.stringify([day, clientId, type, specialDayId ?? null, target])}`;
      const body = target === 'EMAIL' ? message.replace(/\n/g, '<br>') : smsMessage;
      try {
        const claim = await this.notificationService.claimNotificationSlot(tenantId, userId, { clientId, type: 'TEBRIK', subject, body, dedupeKey }, target);
        if (claim.kind !== 'ACQUIRED') {
          const sent = claim.kind === 'EXISTING_SENT';
          results.push({ channel: target, sent, success: sent, status: sent ? 'SENT' : claim.kind === 'EXISTING_FAILED' ? 'FAILED' : 'PENDING', notificationId: claim.notificationId, ...(sent ? { alreadySent: true } : {}) });
          continue;
        }
        const result = target === 'EMAIL'
          ? await this.notificationService.sendEmail(tenantId, userId, { clientId, type: 'TEBRIK', subject, body, dedupeKey, reuseNotificationId: claim.notificationId })
          : await this.notificationService.sendSms(tenantId, userId, { clientId, type: 'TEBRIK', body }, { notificationId: claim.notificationId, dedupeKey });
        const sent = result.success === true;
        results.push({ channel: target, sent, success: sent, status: sent ? 'SENT' : 'UNCONFIRMED', notificationId: claim.notificationId });
      } catch {
        results.push({ channel: target, sent: false, success: false, status: 'UNCONFIRMED', error: 'Gönderim doğrulanamadı; bildirim kayıtlarını kontrol edin. Otomatik yeniden gönderilmedi.' });
      }
    }

    return results;
  }

  /**
   * Otomatik tebrik scheduler'ı — HER DAKİKA çalışır, ama her tenant için gün içinde
   * yalnızca BİR KEZ (tenant'ın autoGreetingTime'ında veya sonrasındaki ilk uygun dakikada)
   * tebrik gönderir. Eski sabit "0 9 * * *" cron'unun yerini alır; artık tenant'ın ayarladığı
   * saat gerçekten dikkate alınır.
   *
   * Akış (tenant başına):
   *  1. Office kaydı yoksa atla (guard damgası tutulamaz → güvenli taraf).
   *  2. autoGreetingTime parse edilemezse 09:00 fallback + warn.
   *  3. shouldRunGreetingNow(...) === false ise atla (saat gelmedi / kapalı / bugün çalıştı).
   *  4. Tebrikleri gönder; SADECE baştan sona hatasız tamamlanırsa lastGreetingRunAt = now
   *     damgalanır (aynı-gün guard). Başarısız/kısmi/belirsiz sonuçta damga YOK.
   *     Sonraki tick kalıcı kanal claim'ini okur; SENT/PENDING/FAILED otomatik yeniden gönderilmez.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - Yalnızca @Cron(EVERY_MINUTE) scheduler tetikler (harici/manuel çağrı yok).
   *   Manuel akış aynı kalıcı kanal claim'ini ve sonuç sözleşmesini kullanır:
   *   GreetingController.sendGreeting → service.sendGreeting().
   * </remarks>
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'GreetingService.greetingSchedulerTick', timeZone: SCHEDULER_TIMEZONE })
  async greetingSchedulerTick() {
    const guardResult = await runWithOverlapGuard('GreetingService.greetingSchedulerTick', async () => {
      const now = new Date();

      // Tüm tenant'ları al (otomatik tebrik için gerekli office alanlarıyla)
      const tenants = await this.findTenantsForGreetingTick();
      if (tenants === null) return;

      for (const tenant of tenants) {
        const office = tenant.office;

        // Office kaydı yoksa: aynı-gün guard'ı için damgalanacak satır yok → güvenli tarafta atla
        // (henüz hiç büro ayarı yapılmamış tenant; otomatik tebrik yapılandırılmamış sayılır).
        if (!office) continue;

        const enabled = office.autoGreetingEnabled ?? true;

        // autoGreetingTime ayarı bozuksa 09:00'a düş ve uyar (sessizce yanlış saatte çalışma)
        const parsed = parseGreetingTime(office.autoGreetingTime);
        if (parsed.fallbackUsed && office.autoGreetingTime != null) {
          this.logger.warn(
            `Tenant ${tenant.id}: autoGreetingTime ayrıştırılamadı ("${office.autoGreetingTime}"), 09:00 varsayılanı kullanılıyor`
          );
        }

        if (!shouldRunGreetingNow(now, office.autoGreetingTime, office.lastGreetingRunAt, enabled)) {
          continue;
        }

        try {
          const greetings = await this.findTodayGreetings(tenant.id);

          // Sistem kullanıcısı (ilk admin) — yoksa gönderim yapılamaz, damgalama YOK
          const systemUser = await this.prisma.user.findFirst({
            where: { tenantId: tenant.id, role: "ADMIN" },
          });
          if (!systemUser) {
            this.logger.warn(`Tenant ${tenant.id}: ADMIN kullanıcı yok, tebrik gönderilemedi (damgalanmadı)`);
            continue;
          }

          let unconfirmed = 0;
          const send = async (clientId: string, type: string, channel: string, specialDayId?: string) => {
            const results = await this.sendGreeting(tenant.id, systemUser.id, clientId, type, channel, specialDayId);
            if (!results.length || results.some(result => result.sent !== true)) unconfirmed++;
          };

          // Doğum günü tebrikleri
          for (const client of greetings.birthdays) {
            await send(client.id, "BIRTHDAY", client.greetingChannel || "EMAIL");
          }

          // Kuruluş yıldönümü tebrikleri
          for (const client of greetings.foundingAnniversaries) {
            await send(client.id, "FOUNDING_ANNIVERSARY", client.greetingChannel || "EMAIL");
          }

          // Vekalet yıldönümü tebrikleri
          for (const client of greetings.poaAnniversaries) {
            await send(client.id, "POA_ANNIVERSARY", client.greetingChannel || "EMAIL");
          }

          // Bayram/özel gün tebrikleri
          for (const specialDay of greetings.specialDays) {
            for (const client of greetings.holidayClients) {
              const type = specialDay.type === "MEMORIAL" ? "MEMORIAL" : "HOLIDAY";
              await send(client.id, type, client.greetingChannel || "EMAIL", specialDay.id);
            }
          }

          if (unconfirmed) throw new BadRequestException(`${unconfirmed} tebrik için tüm kanallar doğrulanamadı`);

          // Only persisted success (including existing SENT) permits the daily stamp.
          await this.prisma.office.update({
            where: { id: office.id },
            data: { lastGreetingRunAt: new Date() },
          });

          this.logger.log(
            `Tenant ${tenant.id}: ${greetings.birthdays.length} doğum günü, ${greetings.foundingAnniversaries.length} kuruluş, ${greetings.poaAnniversaries.length} vekalet yıldönümü, ${greetings.specialDays.length} özel gün gönderildi (damgalandı)`
          );
        } catch (e: any) {
          // No success stamp. Existing notification claims prevent blind resends on the next tick.
          this.logger.error(`Tenant ${tenant.id} tebrik hatası (damgalanmadı; kalıcı kanal sonuçları korunur): ${e.message}`);
          reportCronJobFailure(this.errorReporter, "greeting.greetingSchedulerTick", e, { tenantId: tenant.id });
        }
      }
    });
    if (guardResult === 'SKIPPED_ALREADY_RUNNING') {
      this.logger.warn('[scheduler] GreetingService.greetingSchedulerTick already running, skipping');
    }
  }

  /**
   * greetingSchedulerTick'in dış sorgusu — hata halinde bu tick'i güvenli şekilde atlar.
   *
   * C15-S1-MODIFIED PR-2: eleme QUERY-LEVEL'dır. Yüklem enumeration sorgusunun KENDİSİNDE
   * bulunur; "önce hepsini çek, sonra ikinci bir kontrolle ele" YAPILMAZ — aradaki pencerede
   * ACTIVE olmayan bir tenant seçilmiş olurdu. ACTIVE dışındaki tüm durumlar
   * (PROVISIONING/QUIESCING/SUSPENDED/RETIRED) DB tarafında elenir.
   */
  private async findTenantsForGreetingTick() {
    try {
      return await this.prisma.tenant.findMany({
        where: ACTIVE_TENANT_WHERE,
        include: {
          office: {
            select: {
              id: true,
              autoGreetingEnabled: true,
              autoGreetingTime: true,
              lastGreetingRunAt: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error("Tebrik scheduler tenant listesi alınamadı:", error);
      reportCronJobFailure(this.errorReporter, "greeting.greetingSchedulerTick", error);
      return null;
    }
  }
}
