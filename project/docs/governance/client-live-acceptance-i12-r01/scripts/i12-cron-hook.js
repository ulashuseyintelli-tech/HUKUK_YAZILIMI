/*
 * İ12 — AYLIK CRON GÖZLEM HOOK'U (G7) · YALNIZ İZOLE PROVA
 *
 * `node --require i12-cron-hook.js <dist>/main.js` ile YÜKLENİR. Ürün kodu DEĞİŞTİRİLMEZ:
 * `ClientStatementMonthlyDeliveryService.prototype.onModuleInit` sarmalanır; çalışma zamanında
 * (a) PREDICATE gözlemi (isEnabled + scheduler'da cron kaydı + cron ifadesi),
 * (b) DOĞRUDAN ÇAĞRI: `runMonthlyDelivery(now, scope)`,
 * (c) GERÇEK ZAMANLAYICI TETİĞİ: SchedulerRegistry'deki cron job'un `fireOnTick()` ile
 *     HIZLANDIRILMIŞ tetiklenmesi (üretim takvimini beklemeden — bu CANLI TAKVİM KANITI DEĞİLDİR).
 * Üçü de AYRI ölçülür; biri diğerinin yerine geçmez. Sonuçlar dosyaya yazılır; tetik dosya-sinyali.
 *
 * ENV: I12_CRON_STATE (predicate durum çıktısı) · I12_CRON_TRIGGER (tetik girdisi) ·
 *      I12_CRON_RESULT (çağrı sonuç çıktısı) · I3_DIST_ROOT (dist src kökü)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STATE = process.env.I12_CRON_STATE;
const TRIGGER = process.env.I12_CRON_TRIGGER;
const RESULT = process.env.I12_CRON_RESULT;
const DIST = process.env.I3_DIST_ROOT;
if (!STATE || !TRIGGER || !RESULT || !DIST) {
  console.error('[i12-cron-hook] I12_CRON_STATE/TRIGGER/RESULT + I3_DIST_ROOT gerekli — hook YUKLENMEDI');
} else {
  try {
    const svcPath = path.join(DIST, 'modules/client-statement/client-statement-monthly-delivery.service.js');
    const perPath = path.join(DIST, 'modules/client-statement/client-statement-monthly-period.js');
    const svcMod = require(svcPath);
    const per = require(perPath);
    const CRON_EXPR = per.CLIENT_STATEMENT_MONTHLY_CRON;
    const JOB_CLASS = per.CLIENT_STATEMENT_MONTHLY_JOB_CLASS;
    const Cls = svcMod.ClientStatementMonthlyDeliveryService
      || Object.values(svcMod).find((v) => v && v.prototype && typeof v.prototype.runMonthlyDelivery === 'function');
    if (!Cls) throw new Error('MonthlyDelivery servis sinifi bulunamadi');

    const writeState = (o) => { try { fs.writeFileSync(STATE, JSON.stringify(o), 'utf8'); } catch (e) {} };
    const writeResult = (o) => { try { fs.writeFileSync(RESULT, JSON.stringify(o), 'utf8'); } catch (e) {} };

    const origInit = Cls.prototype.onModuleInit;
    Cls.prototype.onModuleInit = function hookedInit(...args) {
      const ret = origInit ? origInit.apply(this, args) : undefined;
      try {
        const enabled = typeof this.isEnabled === 'function' ? this.isEnabled() : null;
        let registered = false; let expr = null;
        try {
          const job = this.scheduler && this.scheduler.getCronJob ? this.scheduler.getCronJob(JOB_CLASS) : null;
          registered = !!job;
          expr = registered ? String(CRON_EXPR) : null;
        } catch (e) { registered = false; }
        // (a) PREDICATE gozlemi — surecin ICINDEN
        writeState({ record: 'I12-CRON-PREDICATE', enabled, registered, cronExpr: registered ? String(CRON_EXPR) : null, jobClass: String(JOB_CLASS), pid: process.pid });
        console.log(`[i12-cron-hook] predicate: enabled=${enabled} registered=${registered} expr=${registered ? CRON_EXPR : '-'}`);

        // Tetik dosyasi izleyicisi — (b) dogrudan cagri, (c) gercek zamanlayici tetigi
        const self = this;
        let busy = false;
        const handle = async () => {
          if (busy) return; let cmd = '';
          try { cmd = fs.readFileSync(TRIGGER, 'utf8').trim(); } catch (e) { return; }
          if (!cmd || cmd === 'done') return;
          busy = true;
          try {
            if (cmd.startsWith('direct')) {
              const parts = cmd.split(/\s+/); const tenantId = parts[1] || undefined;
              const before = Date.now();
              const res = await self.runMonthlyDelivery(new Date(), tenantId ? { tenantId } : {});
              writeResult({ record: 'I12-CRON-DIRECT', mode: 'runMonthlyDelivery', scopeTenant: tenantId || null, result: res, ms: Date.now() - before });
              console.log('[i12-cron-hook] direct runMonthlyDelivery TAMAM');
            } else if (cmd.startsWith('shortcron')) {
              // (d) IZOLE ORTAMDA KISA TAKVIM: zamanlayici KENDILIGINDEN tetiklesin (fireOnTick DEGIL).
              // Yeni bir CronJob KISA ifade ('*/2 * * * * *' = her 2 sn) ile SchedulerRegistry'ye eklenir;
              // onTick urunun handleMonthlyCron'unu cagirir. Her OTONOM tetik sayilir + kaydedilir.
              // 'cron' paketi APP node_modules'inda (hook repo scripts'ten --require ile yuklenir);
              // app kokunden resolve et (DIST = .../api/dist/apps/api/src → api/node_modules).
              const APP_NM = path.resolve(DIST, '..', '..', '..', '..', 'node_modules');
              const { CronJob } = require(require.resolve('cron', { paths: [APP_NM] }));
              let fires = 0; let lastResult = null; const name = 'i12-shortcron-' + Date.now();
              const cj = new CronJob('*/2 * * * * *', async () => {
                fires += 1;
                try { lastResult = await self.runMonthlyDelivery(new Date(), {}); } catch (e) { lastResult = { error: e && e.message ? e.message : String(e) }; }
                writeResult({ record: 'I12-CRON-SHORT', mode: 'scheduler-self-tick (2s cron)', accelerated: true, autonomousFires: fires, lastResult, note: 'KISA TAKVIM izole prova hizlandirmasi — canli takvim (0 3 1 * *) kaniti DEGILDIR' });
              }, null, false);
              self.scheduler.addCronJob(name, cj); cj.start();
              console.log('[i12-cron-hook] shortcron kayitli (2s) — otonom tetik basladi');
              // 9 sn sonra durdur (birkac otonom tetik olusur)
              await new Promise((r) => setTimeout(r, 9000));
              try { cj.stop(); self.scheduler.deleteCronJob(name); } catch (e) {}
              console.log(`[i12-cron-hook] shortcron durdu — otonom tetik=${fires}`);
            } else if (cmd === 'fire') {
              // (c) GERCEK zamanlayici tetigi: SchedulerRegistry cron job'unu fireOnTick ile HIZLANDIR
              const job = self.scheduler.getCronJob(JOB_CLASS);
              let fired = false; let err = null;
              try {
                if (typeof job.fireOnTick === 'function') { await job.fireOnTick(); fired = true; }
                else if (job.job && typeof job.job.fireOnTick === 'function') { await job.job.fireOnTick(); fired = true; }
              } catch (e) { err = e && e.message ? e.message : String(e); }
              // fireOnTick handleMonthlyCron'u (dolayisiyla runMonthlyDelivery) cagirir; kisa bekle
              await new Promise((r) => setTimeout(r, 1500));
              writeResult({ record: 'I12-CRON-FIRE', mode: 'scheduler.fireOnTick', accelerated: true, fired, error: err, note: 'HIZLANDIRILMIS tetik — canli takvim (0 3 1 * *) kaniti DEGILDIR' });
              console.log(`[i12-cron-hook] scheduler fireOnTick fired=${fired}`);
            }
          } catch (e) {
            writeResult({ record: 'I12-CRON-ERROR', cmd, error: e && e.message ? e.message : String(e) });
          } finally {
            try { fs.writeFileSync(TRIGGER, 'done', 'utf8'); } catch (e) {}
            busy = false;
          }
        };
        fs.watchFile(TRIGGER, { interval: 300 }, handle);
      } catch (e) {
        writeState({ record: 'I12-CRON-PREDICATE', error: e && e.message ? e.message : String(e) });
      }
      return ret;
    };
    console.log('[i12-cron-hook] hazir — onModuleInit sarmalandi');
  } catch (e) {
    console.error(`[i12-cron-hook] kurulamadi: ${e && e.message ? e.message : e}`);
  }
}
