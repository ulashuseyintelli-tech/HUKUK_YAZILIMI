/**
 * W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01 — DB-free birim testi.
 *
 * scheduler-timezone.ts'nin canonical export'larini (SCHEDULER_TIMEZONE,
 * resolveSchedulerTimezone, assertValidSchedulerTimezone) VE altta yatan gercek
 * `cron` paketinin (cron@4.3.5 — @nestjs/schedule@6.1.0'in dogrudan bagimliligi)
 * takvim aritmetigini gercek CronJob/CronTime nesneleriyle dogrular.
 *
 * Nest bootstrap, DB, ag YOK — saf hesaplama. DB-gated runtime karsiligi:
 * w3-f03-scheduler-timezone-runtime.db-gated.integration.spec.ts (ayni dizin,
 * __tests__ alti).
 */
import * as path from "node:path";
import {
  SCHEDULER_TIMEZONE,
  resolveSchedulerTimezone,
  assertValidSchedulerTimezone,
} from "./scheduler-timezone";

/**
 * `cron`, apps/api'nin KENDI package.json'inda deklare edilmemistir — yalniz
 * @nestjs/schedule'in dogrudan bagimliligidir. pnpm'in izole (strict) node_modules
 * duzeninde `require('cron')` apps/api'nin kendi node_modules zincirinden ust
 * seviyeden COZULEMEZ (yalniz @nestjs/schedule'in kendi private node_modules'inde
 * bulunur). Cozumlemeyi bilincli olarak @nestjs/schedule'in kendi bagimlilik
 * grafiginden baslatiyoruz: hem hoisting varsayimina ihtiyac kalmiyor hem de
 * runtime'da SchedulerRegistry'nin fiilen kullandigi AYNI `cron` surumu test
 * edilmis oluyor. `require`'a dinamik (literal olmayan) bir yol verildigi icin
 * TypeScript bu cagriyi `any` olarak turetir — `cron` icin ayri tip cozumlemesi
 * gerekmez (tsc icin de guvenli).
 */
function loadCronFromScheduleDependency(): any {
  const schedulePkgPath = require.resolve("@nestjs/schedule/package.json");
  const scheduleDir = path.dirname(schedulePkgPath);
  const cronEntry = require.resolve("cron", { paths: [scheduleDir] });
  return require(cronEntry);
}

const { CronJob } = loadCronFromScheduleDependency();

/** Ortak probe job fabrikasi: no-op onTick, start:false (gercek timer/setTimeout YOK). */
function buildProbeCronJob(cronTime: string): any {
  return CronJob.from({
    cronTime,
    timeZone: SCHEDULER_TIMEZONE,
    onTick: () => {},
    start: false,
  });
}

describe("W3-F03 — SCHEDULER_TIMEZONE canonical sabiti + resolver/validator", () => {
  it("[1] SCHEDULER_TIMEZONE 'Europe/Istanbul'dur ve gercek, Intl ile ayristirilabilir bir IANA bolgesidir", () => {
    expect(SCHEDULER_TIMEZONE).toBe("Europe/Istanbul");
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: SCHEDULER_TIMEZONE })).not.toThrow();
  });

  it("[2] resolveSchedulerTimezone() argumansiz VE herhangi bir job-class argumaniyla ayni canonical degeri doner", () => {
    expect(resolveSchedulerTimezone()).toBe(SCHEDULER_TIMEZONE);
    expect(resolveSchedulerTimezone("AnyJobClass")).toBe(SCHEDULER_TIMEZONE);
    expect(resolveSchedulerTimezone("SchedulerService")).toBe(SCHEDULER_TIMEZONE);
  });

  it("[3] assertValidSchedulerTimezone(SCHEDULER_TIMEZONE) firlatmaz (GREEN yol)", () => {
    expect(() => assertValidSchedulerTimezone(SCHEDULER_TIMEZONE)).not.toThrow();
  });

  it("[4] assertValidSchedulerTimezone, gercekte var olmayan bir IANA string'ini fail-closed reddeder (RED kaniti)", () => {
    expect(() => assertValidSchedulerTimezone("Not/ARealZone")).toThrow(/INVALID_SCHEDULER_TIMEZONE/);
  });

  it("[5] assertValidSchedulerTimezone GERCEK ama allowlist DISI bir bolgeyi de reddeder ('UTC' — sadece Intl-parsable olmak yetmez)", () => {
    // 'UTC' Intl tarafindan tamamen gecerli kabul edilir (asagidaki satir firlatmaz) ama
    // canonical allowlist'te YOKTUR (yalniz Europe/Istanbul var) — bu, fonksiyonun
    // "gercek bir IANA TZ string'i mi" sorusunun OTESINDE acik bir allowlist kontrolu
    // yaptigini kanitlar; boylece yarin baska gercek bir bolge sessizce kabul edilemez.
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: "UTC" })).not.toThrow();
    expect(() => assertValidSchedulerTimezone("UTC")).toThrow(/INVALID_SCHEDULER_TIMEZONE/);
  });
});

describe("W3-F03 — takvim siniri determinizmi (gercek cron paketi, Nest sarmalayicisi YOK)", () => {
  it("[6a] ay-sonu rollover: '0 8 1 * *' (Nafaka aylik job), 31 Ocak'in HERHANGI bir saatinden 1 Subat 08:00 Europe/Istanbul'a", () => {
    const job = buildProbeCronJob("0 8 1 * *");
    // Ayin ayni gunu icinde erken/gec fark etmeksizin (04:00 UTC = 07:00 ist, 20:00 UTC = 23:00 ist)
    // her ikisi de HALA 31 Ocak Istanbul takviminde — ikisi de AYNI sonraki tetiklemeye (1 Subat 08:00) yuvarlanmali.
    const early = job.cronTime.getNextDateFrom(new Date("2027-01-31T04:00:00Z"), SCHEDULER_TIMEZONE);
    const late = job.cronTime.getNextDateFrom(new Date("2027-01-31T20:00:00Z"), SCHEDULER_TIMEZONE);
    for (const next of [early, late]) {
      expect(next.zoneName).toBe(SCHEDULER_TIMEZONE);
      expect([next.year, next.month, next.day, next.hour, next.minute]).toEqual([2027, 2, 1, 8, 0]);
    }
    expect(early.toMillis()).toBe(late.toMillis());
    expect(late.toISO()).toBe("2027-02-01T08:00:00.000+03:00");
  });

  it("[6b] yil-sonu rollover: '0 8 1 * *', 31 Aralik 2027'den 1 Ocak 2028 08:00'e", () => {
    const job = buildProbeCronJob("0 8 1 * *");
    const next = job.cronTime.getNextDateFrom(new Date("2027-12-31T20:00:00Z"), SCHEDULER_TIMEZONE);
    expect([next.year, next.month, next.day, next.hour, next.minute]).toEqual([2028, 1, 1, 8, 0]);
    expect(next.toISO()).toBe("2028-01-01T08:00:00.000+03:00");
  });

  it("[6c] gece-yarisi job'u ('0 0 * * *') process.env.TZ'den TAMAMEN bagimsiz AYNI ani hesaplar", () => {
    const ref = new Date("2027-06-14T10:00:00Z");
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const jobUnderUtc = buildProbeCronJob("0 0 * * *");
      const nextUnderUtc = jobUnderUtc.cronTime.getNextDateFrom(ref, SCHEDULER_TIMEZONE);

      process.env.TZ = "Europe/Istanbul";
      const jobUnderIstanbul = buildProbeCronJob("0 0 * * *");
      const nextUnderIstanbul = jobUnderIstanbul.cronTime.getNextDateFrom(ref, SCHEDULER_TIMEZONE);

      // Asil iddia: ayni cron ifadesi + ayni explicit timeZone secenegi + ayni referans an →
      // AYNI hesaplanan sonraki-tetiklenme instant'i, ambient process.env.TZ ne olursa olsun.
      expect(nextUnderUtc.toMillis()).toBe(nextUnderIstanbul.toMillis());
      expect(nextUnderUtc.toISO()).toBe("2027-06-15T00:00:00.000+03:00");
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("[6d] artik yil 29 Subat'i (2028) hatasiz ve dogru tarihte hesaplar (DST DEGIL — Europe/Istanbul 2016'dan beri DST kullanmiyor; bu saf takvim dogrulugu testidir)", () => {
    const job = buildProbeCronJob("0 8 29 2 *");
    const next = job.cronTime.getNextDateFrom(new Date("2028-02-20T10:00:00Z"), SCHEDULER_TIMEZONE);
    expect([next.year, next.month, next.day, next.hour, next.minute]).toEqual([2028, 2, 29, 8, 0]);
    expect(next.toISO()).toBe("2028-02-29T08:00:00.000+03:00");
  });
});
