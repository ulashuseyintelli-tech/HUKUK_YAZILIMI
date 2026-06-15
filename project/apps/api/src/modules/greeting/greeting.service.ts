import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientNotificationService } from "../client-notification/client-notification.service";
import { Cron, CronExpression } from "@nestjs/schedule";

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
    private notificationService: ClientNotificationService
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


  // Özel gün ekle/güncelle
  async upsertSpecialDay(tenantId: string, data: {
    id?: string;
    name: string;
    type: string;
    month: number;
    day: number;
    isVariable?: boolean;
    year?: number;
    greetingMessage?: string;
    smsMessage?: string;
    isActive?: boolean;
    sendGreeting?: boolean;
  }) {
    if (data.id) {
      return (this.prisma as any).specialDay.update({
        where: { id: data.id },
        data,
      });
    }
    return (this.prisma as any).specialDay.create({
      data: { tenantId, ...data },
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

  // Tebrik gönder
  async sendGreeting(tenantId: string, userId: string, clientId: string, type: string, channel: string, specialDayId?: string) {
    const client = await (this.prisma as any).client.findFirst({
      where: { id: clientId, tenantId },
      include: { contacts: true },
    });

    if (!client) throw new NotFoundException("Müvekkil bulunamadı");

    let specialDay;
    if (specialDayId) {
      specialDay = await (this.prisma as any).specialDay.findUnique({ where: { id: specialDayId } });
    }

    const { subject, message, smsMessage } = this.createGreetingMessage(type, client, specialDay);

    const results = [];

    // E-posta gönder
    if (channel === "EMAIL" || channel === "BOTH") {
      try {
        const emailResult = await this.notificationService.sendEmail(tenantId, userId, {
          clientId,
          type: "TEBRIK",
          subject,
          body: message.replace(/\n/g, "<br>"),
        });
        results.push({ channel: "EMAIL", sent: true, ...emailResult });
      } catch (e: any) {
        results.push({ channel: "EMAIL", sent: false, error: e.message });
      }
    }

    // SMS gönder
    if (channel === "SMS" || channel === "BOTH") {
      try {
        const smsResult = await this.notificationService.sendSms(tenantId, userId, {
          clientId,
          type: "TEBRIK",
          body: smsMessage,
        });
        results.push({ channel: "SMS", sent: true, ...smsResult });
      } catch (e: any) {
        results.push({ channel: "SMS", sent: false, error: e.message });
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
   *     damgalanır (aynı-gün guard). Hata fırlarsa damgalama YOK → sonraki dakika tekrar denenir,
   *     böylece o gün tebrik atlanmaz.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - Yalnızca @Cron(EVERY_MINUTE) scheduler tetikler (harici/manuel çağrı yok).
   *   Manuel tebrik akışı ayrıdır ve DEĞİŞMEDİ: GreetingController.sendGreeting →
   *   service.sendGreeting() / findTodayGreetings().
   * </remarks>
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async greetingSchedulerTick() {
    const now = new Date();

    // Tüm tenant'ları al (otomatik tebrik için gerekli office alanlarıyla)
    const tenants = await this.prisma.tenant.findMany({
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

        // Doğum günü tebrikleri
        for (const client of greetings.birthdays) {
          await this.sendGreeting(tenant.id, systemUser.id, client.id, "BIRTHDAY", client.greetingChannel || "EMAIL");
        }

        // Kuruluş yıldönümü tebrikleri
        for (const client of greetings.foundingAnniversaries) {
          await this.sendGreeting(tenant.id, systemUser.id, client.id, "FOUNDING_ANNIVERSARY", client.greetingChannel || "EMAIL");
        }

        // Vekalet yıldönümü tebrikleri
        for (const client of greetings.poaAnniversaries) {
          await this.sendGreeting(tenant.id, systemUser.id, client.id, "POA_ANNIVERSARY", client.greetingChannel || "EMAIL");
        }

        // Bayram/özel gün tebrikleri
        for (const specialDay of greetings.specialDays) {
          for (const client of greetings.holidayClients) {
            const type = specialDay.type === "MEMORIAL" ? "MEMORIAL" : "HOLIDAY";
            await this.sendGreeting(tenant.id, systemUser.id, client.id, type, client.greetingChannel || "EMAIL", specialDay.id);
          }
        }

        // SADECE buraya HATASIZ ulaşıldıysa damgala → aynı-gün tekrar gönderim guard'ı
        await this.prisma.office.update({
          where: { id: office.id },
          data: { lastGreetingRunAt: new Date() },
        });

        this.logger.log(
          `Tenant ${tenant.id}: ${greetings.birthdays.length} doğum günü, ${greetings.foundingAnniversaries.length} kuruluş, ${greetings.poaAnniversaries.length} vekalet yıldönümü, ${greetings.specialDays.length} özel gün gönderildi (damgalandı)`
        );
      } catch (e: any) {
        // Hata → damgalama YOK → sonraki dakika tekrar denenir (o gün tebrik atlanmaz)
        this.logger.error(`Tenant ${tenant.id} tebrik hatası (damgalanmadı, retry edilecek): ${e.message}`);
      }
    }
  }
}
