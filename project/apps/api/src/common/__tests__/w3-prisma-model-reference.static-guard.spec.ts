/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3 — PRISMA MODEL REFERANS GUARD.
 *
 * NEDEN: Async consumer'lar Prisma'ya `(this.prisma as any).<model>` kalibiyla
 * eriyor. `as any` cast'i derleme zamani kontrolunu KALDIRIR: semada var olmayan
 * bir modele yazan handler derlenir, tip-kontrolunden gecer, CI'da gorunmez ve
 * yalniz gercek dispatch aninda `TypeError: Cannot read properties of undefined`
 * atar. Outbox platformunda bu, action'in 8 denemeyi tuketip dead-letter'a
 * dusmesi demektir — yani sessiz degil ama GEC ve tekrar-tekrar basarisiz.
 *
 * W3 runtime probe'u bu sinifin TEK ornegini uretti: `icrabotWebhookLog`
 * (webhook action handler). W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01
 * bunu KAPATTI — sema eklemek yerine handler KALDIRILDI ve producer
 * (`EngineRunnerService`) `action: 'webhook'`'u outbox'a hic yazmadan reddeder
 * (bkz. engine-runner.service.ts, action-handler.service.ts). Gerekce: handler
 * zaten gercek bir HTTP cagrisi yapmadan kosulsuz status:'sent' yaziyordu
 * (CAN-P0-001'deki send_email/send_sms "fake-sent" deseninin ayni ornegi) ve
 * aktif/test hicbir rule-pack bu action tipini uretmiyordu.
 *
 * KNOWN_GAPS artik BOS. Guard, ayni sinifin YENI ornekleri icin fail-closed
 * olarak kalir.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..');
const SCHEMA = join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma');

/**
 * Bilinen ve KAYIT ALTINA ALINMIS bosluklar. Bu liste rastgele BUYUYEMEZ:
 * yeni bir giris eklemek, ayni kusur sinifinin tekrar uretildigi anlamina gelir.
 * Su an BOS — tek kayitli bosluk (icrabotWebhookLog) W3-F01 ile kapatildi.
 */
const KNOWN_GAPS: ReadonlySet<string> = new Set();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(SRC, p).split(sep).join('/');
const isTest = (p: string) => /__tests__|\.spec\.ts$|\.test\.ts$/.test(p);

/** schema.prisma model adlari -> Prisma client erisim adi (bas harf kucuk). */
const SCHEMA_MODELS: ReadonlySet<string> = (() => {
  const src = readFileSync(SCHEMA, 'utf8');
  const out = new Set<string>();
  const re = /^model\s+([A-Za-z0-9_]+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.add(m[1].charAt(0).toLowerCase() + m[1].slice(1));
  return out;
})();

/** `(... as any).<ad>` kalibiyla erisilen tum Prisma model adlari + dosyalari. */
const CAST_REFS: Array<{ file: string; model: string }> = (() => {
  const out: Array<{ file: string; model: string }> = [];
  for (const f of walk(SRC)) {
    if (isTest(f)) continue;
    const src = readFileSync(f, 'utf8');
    const re = /prisma\s+as\s+any\s*\)\s*\.\s*([a-z][A-Za-z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push({ file: rel(f), model: m[1] });
  }
  return out;
})();

describe('W3 — Prisma model referans guard (as-any kacaklari)', () => {
  it('[1] sema modelleri okunabildi', () => {
    expect(SCHEMA_MODELS.size).toBeGreaterThan(100);
    expect(SCHEMA_MODELS.has('icrabotOutboxAction')).toBe(true);
  });

  it('[2] `as any` ile erisilen model referanslari taranabildi', () => {
    expect(CAST_REFS.length).toBeGreaterThan(0);
  });

  it('[3] semada KARSILIGI OLMAYAN yeni bir model referansi eklenemez', () => {
    const unresolved = [...new Set(CAST_REFS.map((r) => r.model))]
      .filter((m) => !SCHEMA_MODELS.has(m))
      .filter((m) => !KNOWN_GAPS.has(m))
      .sort();
    expect(unresolved).toEqual([]);
  });

  it('[4] KNOWN_GAPS gercekten hala bir bosluktur (gereksiz istisna birikmez)', () => {
    for (const gap of KNOWN_GAPS) {
      // Bosluk kapandiysa (model semaya eklendiyse) bu giris SILINMELIDIR.
      expect(SCHEMA_MODELS.has(gap)).toBe(false);
      // Bosluk hala kodda referans ediliyor olmalidir; edilmiyorsa giris SILINMELIDIR.
      expect(CAST_REFS.some((r) => r.model === gap)).toBe(true);
    }
  });

  it('[5] KNOWN_GAPS listesi BOS (W3-F01 sonrasi kayitli bosluk kalmadi)', () => {
    expect([...KNOWN_GAPS].sort()).toEqual([]);
  });

  it('[6] icrabotWebhookLog referansi kaynaktan tamamen kaldirildi (W3-F01)', () => {
    expect(CAST_REFS.some((r) => r.model === 'icrabotWebhookLog')).toBe(false);
  });
});
