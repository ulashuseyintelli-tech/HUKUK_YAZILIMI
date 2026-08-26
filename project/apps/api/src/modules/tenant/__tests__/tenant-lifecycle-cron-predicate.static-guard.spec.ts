/**
 * C15 PR-4A — CRON SANSÜSÜ + ACTIVE-PREDICATE KALICILIK KAPISI (AST).
 *
 * İki iddiayı statik olarak kilitler:
 *
 *  (A) SANSÜS KAPALI: `src/modules`+`src/scripts` altındaki `@Cron` dekoratörlü
 *      metotların kümesi TAM olarak onaylı envanterdir (33 bound + 2 dormant
 *      icrabot); `SchedulerRegistry.addCronJob` çağrısı TAM olarak 1'dir
 *      (client-statement dinamik kaydı — W3 kapısının 33 sayacına GÖRÜNMEZDİR,
 *      bu kapı o kör noktayı kapatır). Yeni bir zamanlayıcı yüzeyi eklemek bu
 *      kapıyı DÜŞÜRÜR ve yazarını sınıflandırmaya zorlar.
 *
 *  (B) PREDICATE KALICI: PR-4A'nın 24 onaylı call-site'ının HER BİRİNDE sorgu
 *      argümanı `ACTIVE_TENANT_WHERE` tanımlayıcısını içerir. Kimlik satır
 *      numarasına DEĞİL (dosya :: kapsayan metot :: model.metod [:: metot-içi
 *      sıra)) bağlıdır — satır kaydırmak kapıyı düşürmez, yüklemi kaldırmak
 *      düşürür. Mevcut hiçbir kapı where-şekillerini pinlemiyordu; kapı-yeşili
 *      "scoping indi" kanıtı değildi — bu kapı o boşluğu kapatır.
 *
 *  (C) NEGATİF PİN: `calculateDailyStats` bilinçli kapsam DIŞIDIR (OD-D owner
 *      kararı bekliyor). Sorgusuna yüklem eklenirse bu kapı DÜŞER — karar
 *      alınmadan sessiz kapsam genişletme yapılamaz.
 *
 * Regex DEĞİL, AST: dosyalar `ts.createSourceFile` ile ayrıştırılır; parse
 * hatası veya bulunamayan site FAIL-CLOSED düşürür. TypeChecker gerekmiyor:
 * iddia sözdizimsel varlıktır (tanımlayıcı adı + import kaynağı ayrıca
 * doğrulanır), tip çözümlemesi değil.
 */

import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import * as ts from "typescript";

const API_ROOT = path.resolve(__dirname, "../../../..").replace(/\\/g, "/");
const SCAN_ROOTS = ["src/modules", "src/scripts"] as const;

// ---------------------------------------------------------------------------
// (A) ONAYLI CRON SANSÜSÜ — dosya-soneki :: metot
// ---------------------------------------------------------------------------

const ONAYLI_CRON: readonly string[] = [
  // bound (33) — W3 sertifikalı 14 sınıf
  "modules/tariff/gazette-watcher.service.ts::checkGazette",
  "modules/automation/automation.service.ts::processPendingCases",
  "modules/automation/automation.service.ts::updateDaysLeft",
  "modules/automation/automation.service.ts::checkNotificationExpiries",
  "modules/automation/automation.service.ts::expireCrossCaseNotifications",
  "modules/automation/automation.service.ts::expireInactiveRecipientCrossCaseNotifications",
  "modules/automation/automation.service.ts::updateExpiredPoas",
  "modules/automation/automation.service.ts::sendExpiringPoaNotifications",
  "modules/automation/automation.service.ts::updateRiskScores",
  "modules/office-approval/office-approval-executor-cron.service.ts::handleCron",
  "modules/scheduler/scheduler.service.ts::checkPaymentOrderDeadlines",
  "modules/scheduler/scheduler.service.ts::processNafakaPeriods",
  "modules/scheduler/scheduler.service.ts::checkMtsReturns",
  "modules/scheduler/scheduler.service.ts::calculateDailyStats",
  "modules/scheduler/scheduler.service.ts::checkUpcomingTasks",
  "modules/scheduler/scheduler.service.ts::checkIhbarnameDeadlines",
  "modules/scheduler/scheduler.service.ts::checkExternalCaseFollowups",
  "modules/scheduler/scheduler.service.ts::checkTebligatStatus",
  "modules/policy-engine/deprecated-usage-tracker.service.ts::generateDailyReport",
  "modules/policy-engine/deprecated-usage-tracker.service.ts::flushBuffer",
  "modules/policy-engine/deprecated-usage-tracker.service.ts::cleanupOldRecords",
  "modules/policy-engine/decision-logger/decision-log-retention.service.ts::archiveOldRecords",
  "modules/exchange-rate/exchange-rate.service.ts::scheduledRateUpdate",
  "modules/address-task/address-task-scheduler.service.ts::checkOverdueTasks",
  "modules/address-task/address-task-scheduler.service.ts::checkAnnualRefreshTasks",
  "modules/address-task/address-task-scheduler.service.ts::publishOutboxEvents",
  "modules/interest-engine/rate-sync.service.ts::syncTcmbRates",
  "modules/interest-engine/rate-sync.service.ts::syncMonthlyMevduatRates",
  "modules/escalation/operational-escalation.service.ts::scheduledRun",
  "modules/escalation/case-task-escalation.service.ts::scheduledRun",
  "modules/error-log/retention/error-log-retention.service.ts::handleCron",
  "modules/icrabot/v28-engine/outbox-cron.service.ts::processOutboxActions",
  "modules/greeting/greeting.service.ts::greetingSchedulerTick",
  // dormant icrabot (2) — IcrabotModule unbound; DOKUNULMAZ
  "modules/icrabot/task-orchestrator.service.ts::processQueue",
  "modules/icrabot/scheduler/scheduler.service.ts::tick",
];

/** Dinamik kayıt: tam 1 site (W3 kapısının kör noktası). */
const ONAYLI_ADDCRONJOB: readonly string[] = [
  "modules/client-statement/client-statement-monthly-delivery.service.ts",
];

// ---------------------------------------------------------------------------
// (B) 24 ONAYLI PREDICATE SİTE — dosya :: kapsayanMetot :: model.metod :: metot-içi sıra
// ---------------------------------------------------------------------------

interface PredicateSite {
  readonly dosya: string;
  readonly metotIci: string; // kapsayan metot adı
  readonly sorgu: string; // model.metod
  readonly sira: number; // kapsayan metot içindeki kaçıncı model.metod çağrısı
}

const site = (dosya: string, metotIci: string, sorgu: string, sira = 0): PredicateSite => ({
  dosya,
  metotIci,
  sorgu,
  sira,
});

const ONAYLI_PREDICATE_SITELERI: readonly PredicateSite[] = [
  // scheduler (9)
  site("modules/scheduler/scheduler.service.ts", "checkPaymentOrderDeadlines", "case.findMany"),
  site("modules/scheduler/scheduler.service.ts", "processNafakaPeriods", "case.findMany"),
  site("modules/scheduler/scheduler.service.ts", "checkMtsReturns", "case.findMany"),
  site("modules/scheduler/scheduler.service.ts", "checkUpcomingTasks", "task.count"),
  site("modules/scheduler/scheduler.service.ts", "checkIhbarnameDeadlines", "thirdParty.findMany", 0),
  site("modules/scheduler/scheduler.service.ts", "checkIhbarnameDeadlines", "thirdParty.findMany", 1),
  site("modules/scheduler/scheduler.service.ts", "checkExternalCaseFollowups", "externalCase.findMany"),
  site("modules/scheduler/scheduler.service.ts", "checkTebligatStatus", "tebligat.findMany", 0),
  site("modules/scheduler/scheduler.service.ts", "checkTebligatStatus", "tebligat.findMany", 1),
  // automation (4)
  site("modules/automation/automation.service.ts", "processPendingCases", "case.findMany"),
  site("modules/automation/automation.service.ts", "updateDaysLeft", "case.findMany"),
  site("modules/automation/automation.service.ts", "updateExpiredPoas", "clientPowerOfAttorney.updateMany"),
  site("modules/automation/automation.service.ts", "updateRiskScores", "case.findMany"),
  // debtor cross-case (3)
  site(
    "modules/debtor/debtor-cross-case-notification.service.ts",
    "expireStaleNotifications",
    "debtorCrossCaseNotification.updateMany",
  ),
  site(
    "modules/debtor/debtor-cross-case-notification.service.ts",
    "expireStaleNotificationsForInactiveRecipients",
    "user.findMany",
  ),
  site(
    "modules/debtor/debtor-cross-case-notification.service.ts",
    "expireStaleNotificationsForInactiveRecipients",
    "debtorCrossCaseNotification.findMany",
  ),
  // poa delivery (1)
  site(
    "modules/automation/poa-expiry-delivery.service.ts",
    "sendExpiringPoaNotificationsScoped",
    "clientPowerOfAttorney.findMany",
  ),
  // address-task (4)
  site("modules/address-task/address-task.service.ts", "findOverdueTasks", "addressTask.findMany"),
  site("modules/address-task/address-task.service.ts", "findTasksAtMaxAttempts", "addressTask.findMany"),
  site("modules/address-task/address-task-scheduler.service.ts", "checkAnnualRefreshTasks", "addressTask.findMany"),
  site("modules/address-task/address-task-scheduler.service.ts", "publishOutboxEvents", "addressOutboxEvent.findMany"),
  // client-statement dinamik (1)
  site(
    "modules/client-statement/client-statement-monthly-delivery.service.ts",
    "runMonthlyDelivery",
    "client.findMany",
  ),
  // rate-sync (2)
  site("modules/interest-engine/rate-sync.service.ts", "syncTcmbRates", "office.findMany"),
  site("modules/interest-engine/rate-sync.service.ts", "syncMonthlyMevduatRates", "office.findMany"),
];

/** (C) OD-D bekleyen negatif pin: yüklem OLMAMALI. */
const NEGATIF_PIN: PredicateSite = site(
  "modules/scheduler/scheduler.service.ts",
  "calculateDailyStats",
  "case.groupBy",
);

const YUKLEM_TANIMLAYICI = "ACTIVE_TENANT_WHERE";

// ---------------------------------------------------------------------------
// AST yardımcıları
// ---------------------------------------------------------------------------

function kaynakOku(relSuffix: string): ts.SourceFile {
  const tam = path.join(API_ROOT, "src", relSuffix).replace(/\\/g, "/");
  let icerik: string;
  try {
    icerik = readFileSync(tam, "utf8");
  } catch {
    throw new Error(`FAIL-CLOSED: dosya okunamadı: ${relSuffix}`);
  }
  const sf = ts.createSourceFile(tam, icerik, ts.ScriptTarget.ES2020, true);
  // FAIL-CLOSED: ayrıştırılamayan dosya sessizce geçemez.
  if ((sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length) {
    throw new Error(`FAIL-CLOSED: sözdizimi hatası: ${relSuffix}`);
  }
  return sf;
}

/** Çağrının `alici.model.metod(...)` son iki adı. */
function sonIkiAd(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (!ts.isPropertyAccessExpression(e)) return null;
  const metod = e.name.text;
  let alici: ts.Expression = e.expression;
  while (ts.isParenthesizedExpression(alici) || ts.isAsExpression(alici) || ts.isNonNullExpression(alici)) {
    alici = alici.expression;
  }
  if (ts.isPropertyAccessExpression(alici)) return `${alici.name.text}.${metod}`;
  return null;
}

/** Düğümü kapsayan metot/fonksiyon adı. */
function kapsayanMetot(n: ts.Node): string | null {
  let p: ts.Node | undefined = n.parent;
  while (p) {
    if (ts.isMethodDeclaration(p) && p.name && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    p = p.parent;
  }
  return null;
}

function altAgacIcerir(n: ts.Node, ad: string): boolean {
  let var_ = false;
  const v = (x: ts.Node): void => {
    if (var_) return;
    if (ts.isIdentifier(x) && x.text === ad) var_ = true;
    else ts.forEachChild(x, v);
  };
  v(n);
  return var_;
}

/** dosya içindeki (metot, model.metod) çağrılarını metot-içi sırayla döndürür. */
function sorgulariBul(sf: ts.SourceFile, metotIci: string, sorgu: string): ts.CallExpression[] {
  const bulunan: ts.CallExpression[] = [];
  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && sonIkiAd(n) === sorgu && kapsayanMetot(n) === metotIci) {
      bulunan.push(n);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
  return bulunan;
}

// ---------------------------------------------------------------------------

describe("C15 PR-4A — cron sansüsü + ACTIVE-predicate kalıcılık kapısı (AST)", () => {
  // -- (A) sansüs ------------------------------------------------------------
  it("@Cron kümesi TAM olarak onaylı envanterdir (33 bound + 2 dormant); yeni zamanlayıcı = FAIL", () => {
    const bulunan: string[] = [];
    const addCron: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name).replace(/\\/g, "/");
        if (e.isDirectory()) {
          if (/node_modules|[/]dist$|__tests__|[/]generated$/.test(p)) continue;
          walk(p);
        } else if (/\.ts$/.test(p) && !/\.spec\.ts$|\.d\.ts$/.test(p)) {
          const sf = ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.ES2020, true);
          const rel = path.relative(path.join(API_ROOT, "src"), p).replace(/\\/g, "/");
          const v = (n: ts.Node): void => {
            if (ts.isDecorator(n) && ts.isCallExpression(n.expression)) {
              const ad = n.expression.expression.getText(sf);
              if (ad === "Cron") {
                const m = n.parent;
                if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name)) {
                  bulunan.push(`${rel}::${m.name.text}`);
                }
              }
            }
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
                n.expression.name.text === "addCronJob") {
              addCron.push(rel);
            }
            ts.forEachChild(n, v);
          };
          v(sf);
        }
      }
    };
    for (const r of SCAN_ROOTS) walk(path.join(API_ROOT, r));
    expect(bulunan.sort()).toEqual([...ONAYLI_CRON].sort());
    expect(addCron.sort()).toEqual([...ONAYLI_ADDCRONJOB].sort());
  });

  // -- (B) predicate kalıcılığı ---------------------------------------------
  describe("24 onaylı call-site ACTIVE_TENANT_WHERE taşır", () => {
    // Dosyaları bir kez ayrıştır.
    const dosyalar = [...new Set(ONAYLI_PREDICATE_SITELERI.map((s) => s.dosya))];
    const sfMap = new Map<string, ts.SourceFile>();
    beforeAll(() => {
      for (const d of dosyalar) sfMap.set(d, kaynakOku(d));
    });

    it.each(ONAYLI_PREDICATE_SITELERI.map((s) => [`${s.dosya} :: ${s.metotIci} :: ${s.sorgu}[${s.sira}]`, s] as const))(
      "%s",
      (_ad, s) => {
        const sf = sfMap.get(s.dosya)!;
        const cagrilar = sorgulariBul(sf, s.metotIci, s.sorgu);
        // FAIL-CLOSED: site bulunamıyorsa (yeniden adlandırma/taşıma) kapı düşer.
        expect(cagrilar.length).toBeGreaterThan(s.sira);
        const arg = cagrilar[s.sira].arguments[0];
        expect(arg).toBeDefined();
        expect(altAgacIcerir(arg, YUKLEM_TANIMLAYICI)).toBe(true);
      },
    );

    it("her onaylı dosya ACTIVE_TENANT_WHERE'i tenant-lifecycle modülünden import eder", () => {
      for (const d of dosyalar) {
        const sf = sfMap.get(d)!;
        let dogru = false;
        for (const st of sf.statements) {
          if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
          if (!/tenant-lifecycle$/.test(st.moduleSpecifier.text)) continue;
          if (altAgacIcerir(st, YUKLEM_TANIMLAYICI)) dogru = true;
        }
        expect(`${d}:${dogru}`).toBe(`${d}:true`);
      }
    });
  });

  // -- (C) negatif pin -------------------------------------------------------
  it("NEGATİF PİN — calculateDailyStats::case.groupBy yüklem TAŞIMAZ (OD-D owner kararı bekliyor)", () => {
    const sf = kaynakOku(NEGATIF_PIN.dosya);
    const cagrilar = sorgulariBul(sf, NEGATIF_PIN.metotIci, NEGATIF_PIN.sorgu);
    expect(cagrilar.length).toBeGreaterThan(0);
    expect(altAgacIcerir(cagrilar[0], YUKLEM_TANIMLAYICI)).toBe(false);
  });
});
