/**
 * UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — RETRY OWNERSHIP: SINGLE
 *
 * Owner §7: *"UyapAttempt tek retry owner olmalıdır"* ve *"Aynı retry state
 * UyapOperation, CpeExecutionRecord veya request log'da BAĞIMSIZ source-of-truth
 * OLMAMALIDIR."*
 *
 * ## Kapatılan durum
 *
 * `UyapRequestLog.status`/`retryCount`, `UyapAttempt` lineage'ından bağımsız İKİNCİ
 * bir retry state machine'iydi ve iki ayrı yerden yazılıyordu:
 *
 *  1. `SchedulerService.retryFailedUyapRequests()` — `@Cron(EVERY_6_HOURS)`, CANLI,
 *     tenant sınırı YOK, `FAILED → RETRY` + `retryCount++`. Dispatcher'ı
 *     (`UyapService.retryFailedRequests`) UYAP-RETRY-CONTAIN-01 ile kapatılmış
 *     olduğundan satırlar `RETRY`'a girip bir daha ÇIKMIYORDU.
 *  2. `UyapService.retryFailedRequests()` — erişilemez ama gövdesi hâlâ
 *     terminal-state kontrolü olmadan, `actorUserId`/`Idempotency-Key` olmadan
 *     re-dispatch ediyordu.
 *
 * Bu spec kaynak-metin seviyesinde davranış kilidi kurar: retry state'inin geri
 * gelmesi CI'da kırmızıya döner.
 */
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(API_ROOT, rel), 'utf8');

const UYAP_SERVICE = read('src/modules/uyap/uyap.service.ts');
const SCHEDULER = read('src/modules/scheduler/scheduler.service.ts');
const SCHEMA = read('prisma/schema.prisma');

/** Blok yorumlarını ve satır yorumlarını atar — iddialar YALNIZ gerçek koda bakar. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const UYAP_SERVICE_CODE = stripComments(UYAP_SERVICE);
const SCHEDULER_CODE = stripComments(SCHEDULER);

describe('UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — retry ownership tekilligi', () => {
  describe('UyapRequestLog retry state ARTIK YAZILMIYOR', () => {
    it('uyap.service: retryCount artirimi YOK', () => {
      expect(UYAP_SERVICE_CODE).not.toMatch(/retryCount:\s*\{\s*increment/);
    });

    it('scheduler: retryCount artirimi YOK', () => {
      expect(SCHEDULER_CODE).not.toMatch(/retryCount:\s*\{\s*increment/);
    });

    it('hicbir yerde status: RETRY yazilmiyor', () => {
      expect(UYAP_SERVICE_CODE).not.toMatch(/status:\s*'RETRY'/);
      expect(SCHEDULER_CODE).not.toMatch(/status:\s*'RETRY'/);
    });

    it('scheduler: uyapRequestLog uzerinde HICBIR yazma yolu kalmadi', () => {
      expect(SCHEDULER_CODE).not.toMatch(/uyapRequestLog\.(update|updateMany|create|delete|deleteMany|upsert)/);
    });
  });

  describe('retry dispatcher yollari kapali', () => {
    it('scheduler cron kaydi KALDIRILDI (retryFailedUyapRequests artik @Cron degil)', () => {
      // Metot tanimindan onceki 3 satirda @Cron dekoratoru OLMAMALI.
      const idx = SCHEDULER_CODE.indexOf('async retryFailedUyapRequests(');
      expect(idx).toBeGreaterThan(-1);
      const preceding = SCHEDULER_CODE.slice(Math.max(0, idx - 400), idx);
      expect(preceding).not.toMatch(/@Cron\([^)]*\)\s*$/);
    });

    it('uyap.service.retryFailedRequests re-dispatch ETMIYOR', () => {
      const idx = UYAP_SERVICE_CODE.indexOf('async retryFailedRequests(');
      expect(idx).toBeGreaterThan(-1);
      const body = UYAP_SERVICE_CODE.slice(idx, idx + 1200);
      expect(body).not.toContain('this.sendPaymentOrder(');
      expect(body).not.toContain('this.pushHacizRequest(');
      expect(body).toContain('UYAP_RETRY_CONTRACT_MISSING');
    });

    it('retryFailedRequests sessiz no-op DEGIL — acik hata atar', () => {
      const idx = UYAP_SERVICE_CODE.indexOf('async retryFailedRequests(');
      const body = UYAP_SERVICE_CODE.slice(idx, idx + 1200);
      expect(body).toMatch(/throw\s+new\s+BadRequestException/);
    });
  });

  describe('canonical retry sahibi UyapAttempt', () => {
    const attemptBlock = (() => {
      const m = SCHEMA.match(/model UyapAttempt \{[\s\S]*?\n\}/);
      return m ? m[0] : '';
    })();
    const requestLogBlock = (() => {
      const m = SCHEMA.match(/model UyapRequestLog \{[\s\S]*?\n\}/);
      return m ? m[0] : '';
    })();

    it('UyapAttempt provider/legal-effect durumlarini TASIR', () => {
      expect(attemptBlock).toContain('providerState');
      expect(attemptBlock).toContain('legalEffectState');
      expect(attemptBlock).toContain('attemptNumber');
      expect(attemptBlock).toContain('previousAttemptId');
    });

    it('UyapAttempt lineage i gap-free ve tenant-safe FK ile kilitli', () => {
      expect(attemptBlock).toContain('@@unique([operationId, attemptNumber])');
      expect(attemptBlock).toContain('references: [id, tenantId]');
    });

    it('UyapRequestLog attempt/operation state kolonu TASIMAZ', () => {
      // Retry sayaci semada duruyor (legacy veri) ama artik hicbir yerden YAZILMIYOR;
      // yukaridaki kaynak-metin kilitleri bunu garanti eder. Burada onemli olan:
      // request log attempt/operation lineage'ini KOPYALAMAZ.
      expect(requestLogBlock).not.toContain('providerState');
      expect(requestLogBlock).not.toContain('legalEffectState');
      expect(requestLogBlock).not.toContain('attemptNumber');
    });
  });
});
