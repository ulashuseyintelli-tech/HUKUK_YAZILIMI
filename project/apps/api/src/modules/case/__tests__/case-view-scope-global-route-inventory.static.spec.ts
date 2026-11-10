import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CASE_RELATED_CONTROLLERS, RouteClass, UNREGISTERED_ICRABOT_CONTROLLERS, UNRELATED_CONTROLLERS } from "./case-view-scope-route-inventory.data";

/**
 * F02 P3 (owner kararları 09.11.2026) — dosya görünüm kapsamı BÜTÜN-CONTROLLER rota envanteri (fail-closed, kaynak taraması).
 *
 * Önceki altı envanter testi yalnız kendi controller sınıflarını okur; bayrak açılmadan önceki tarama, dosyaya bağlı okumaların
 * çoğunun hiçbir envanterde olmadığını gösterdi. Bu spec bütün `@Controller` dosyalarını kaynaktan okur ve şunları korur:
 *  1. Controller dosya kümesi kapalıdır: her dosya ya "dosyaya bağlı" (rotaları tek tek sınıflı) ya "dosyaya bağlı değil"
 *     (gerekçeli) ya da "çalışan uygulamada kayıtlı değil" listesindedir. Yeni controller dosyası sınıflanmadan geçemez.
 *  2. Dosyaya bağlı controller'larda her GET ve POST rotası veri dosyasında tek bir sınıfla yer alır. Yeni rota → kırmızı.
 *  3. KAPILI denen rotanın dekoratöründe kapı gerçekten vardır; KAPILI_ICERDE denen rotanın handler gövdesinde belirtilen
 *     kapsam çağrısı gerçekten geçer. Kapı taşıdığı hâlde başka sınıfta yazılmış rota da kırmızıdır (veri dürüst kalır).
 *  4. Kapısı henüz olmayan (ACIK) okumaların sayısı karar satırı başına burada sabitlenir; yalnız azalabilir.
 *  5. Dosyaya bağlı değil denen controller'da yolunda dosya kimliği taşıyan rota belirirse kırmızı.
 *
 * Bu spec davranışı ölçmez (onu HTTP + PostgreSQL spec'leri ölçer); yalnız sınıflamanın eksiksiz ve kaynakla uyumlu olduğunu ölçer.
 * PUT / PATCH / DELETE rotaları yazımdır ve owner kararıyla P3 okuma kapsamının dışındadır; tek tek listelenmez.
 */
const MODULES_DIR = resolve(__dirname, "../..");
const SRC_DIR = resolve(MODULES_DIR, "..");

/** Karar satırı başına kapısı henüz olmayan okuma sayısı (bu dilimden sonra). Envanter kapanışında boş nesne olur. */
const EXPECTED_OPEN: Record<string, number> = { S1: 23, S2: 15, S3: 23, S5: 6, S6: 15, S7: 8 };

/** KAPILI_ICERDE notunda kabul edilen handler içi kapsam çağrıları (keyfî metin kapı sayılmaz). */
const INNER_MARKERS = ["caseService.findAll", "findOneVisible", "assertCaseVisible", "isArtifactVisible", "findOneForActor", "caseRowFilter"];
/** `servis-dosyası::yöntem` biçimindeki notta, yöntemin gövdesinde bulunması gereken kapsam çağrılarından en az biri. */
const SERVICE_SCOPE_CALLS = /requireCaseViewScope\(|caseRowFilter\(|visibleCaseIds\(|assertCaseVisible\(|isCaseVisible\(|viewScopeWhere\(|maskHiddenCases\(/;
const SERVICE_NOTE = /^([\w./-]+\.ts)::(\w+)$/;

/** Servis dosyasındaki bir yöntemin gövdesi (aynı girintideki bir sonraki üye bildirimine kadar); bulunamazsa boş dize. */
function serviceMethodBody(file: string, method: string): string {
  const lines = readFileSync(join(MODULES_DIR, file), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^  (?:public |private |protected )?(?:async )?${method}\\s*(?:<[^>]*>)?\\(`).test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  \}\s*$/.test(lines[i])) {
      end = i + 1;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}
const GATE_DECORATOR = /CaseViewScoped\(|CaseViewScopedByObject\(|CaseViewScopeGuard|CaseObjectViewScopeGuard/;
const CASE_KEYED_PATH = /:caseId\b|:caseDebtorId\b|\/cases?(\/|$)/;
const CLASSES: RouteClass[] = ["KAPILI", "KAPILI_ICERDE", "BASKA_KAPI", "ISTISNA", "DOSYA_DISI", "YAZIM", "ACIK"];

type ParsedRoute = { key: string; verb: string; path: string; decorators: string; segment: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".spec.ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function literal(arg: string): string {
  const s = arg.trim();
  const quoted = /^['"`](.*?)['"`]$/.exec(s);
  if (quoted) return quoted[1];
  const path = /path\s*:\s*['"`](.*?)['"`]/.exec(s);
  if (path) return path[1];
  return s === "" ? "" : `<${s.replace(/\s+/g, " ").slice(0, 60)}>`;
}

const joinPath = (...parts: string[]) => "/" + parts.map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");

/** Rota dekoratörlerini kaynaktan çıkarır: fiil + tam yol + rota dekoratör bloğu + handler gövdesi (bir sonraki rotaya kadar). */
function parseController(source: string): ParsedRoute[] {
  const lines = source.split(/\r?\n/);
  const controllers: Array<{ line: number; prefix: string }> = [];
  const marks: Array<{ line: number; verb: string; sub: string }> = [];
  lines.forEach((ln, i) => {
    if (/^\s*@Controller\(/.test(ln)) {
      const m = /@Controller\(\s*([\s\S]*?)\s*\)/.exec(lines.slice(i, i + 6).join("\n"));
      controllers.push({ line: i, prefix: literal(m ? m[1] : "") });
    }
    let m = /^\s*@(Get|Post|Put|Patch|Delete|All|Sse)\(\s*(.*?)\s*\)\s*$/.exec(ln);
    if (!m && /^\s*@(Get|Post|Put|Patch|Delete|All|Sse)\(/.test(ln)) {
      m = /^@(Get|Post|Put|Patch|Delete|All|Sse)\(\s*(.*?)\s*\)/.exec(lines.slice(i, i + 4).map((l) => l.trim()).join(" "));
    }
    if (m) marks.push({ line: i, verb: m[1].toUpperCase(), sub: literal(m[2]) });
  });
  const blockStart = (i: number) => {
    let s = i;
    while (s > 0) {
      const prev = lines[s - 1].trim();
      if (prev === "}" || prev.endsWith("{") || prev.endsWith(";")) break;
      s--;
    }
    return s;
  };
  return marks.map((mark, idx) => {
    const start = blockStart(mark.line);
    const end = idx + 1 < marks.length ? blockStart(marks[idx + 1].line) : lines.length;
    let signatureEnd = mark.line + 1;
    for (let q = mark.line + 1; q < Math.min(mark.line + 40, lines.length); q++) {
      signatureEnd = q;
      if (lines[q].trimEnd().endsWith("{")) break;
    }
    const owner = [...controllers].reverse().find((c) => c.line <= mark.line) ?? controllers[0];
    const path = joinPath(owner?.prefix ?? "", mark.sub);
    return {
      key: `${mark.verb} ${path}`,
      verb: mark.verb,
      path,
      decorators: lines.slice(start, signatureEnd + 1).filter((l) => l.trim().startsWith("@")).join("\n"),
      segment: lines.slice(start, end).join("\n"),
    };
  });
}

const toKey = (file: string) => relative(MODULES_DIR, file).replace(/\\/g, "/");
const controllerFiles = walk(SRC_DIR).filter((file) => /^\s*@Controller\(/m.test(readFileSync(file, "utf8")));
const parsed: Record<string, ParsedRoute[]> = Object.fromEntries(controllerFiles.map((file) => [toKey(file), parseController(readFileSync(file, "utf8"))]));
const readRoutes = (file: string) => (parsed[file] ?? []).filter((r) => r.verb === "GET" || r.verb === "POST");

describe("F02 P3 — bütün-controller dosya görünüm kapsamı rota envanteri (fail-closed)", () => {
  it("envanter dolu: controller dosyaları ve rotaları kaynaktan okundu", () => {
    expect(controllerFiles.length).toBeGreaterThan(120);
    expect(Object.values(parsed).flat().length).toBeGreaterThan(1000);
    expect(parsed["case/case.controller.ts"].some((r) => r.key === "GET /cases/:id/notes")).toBe(true);
    expect(parsed["group/group.controller.ts"].map((r) => r.key)).toEqual(expect.arrayContaining(["GET /groups/:id", "GET /cases/:caseId/groups"]));
  });

  it("controller dosya kümesi kapalı: her dosya tam olarak bir listede (dosyaya bağlı / bağlı değil / kayıtlı değil)", () => {
    const listed = [...Object.keys(CASE_RELATED_CONTROLLERS), ...Object.keys(UNRELATED_CONTROLLERS), ...UNREGISTERED_ICRABOT_CONTROLLERS];
    expect(new Set(listed).size).toBe(listed.length);
    expect({ sınıflanmamış: Object.keys(parsed).filter((f) => !listed.includes(f)).sort(), kaynaktaYok: listed.filter((f) => !(f in parsed)).sort() }).toEqual({
      sınıflanmamış: [],
      kaynaktaYok: [],
    });
  });

  it("kayıtlı değil listesi yalnız karantinadaki icrabot controller'larıdır ve IcrabotModule AppModule'e bağlı değildir", () => {
    for (const file of UNREGISTERED_ICRABOT_CONTROLLERS) expect([file, file.startsWith("icrabot/") && !file.startsWith("icrabot/v28-engine/")]).toEqual([file, true]);
    const appModule = readFileSync(join(SRC_DIR, "app.module.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(appModule).not.toMatch(/\bIcrabotModule\b/);
    expect(appModule).toMatch(/\bV28EngineModule\b/);
  });

  it("karantinadaki icrabot controller'larında dosya kimliği taşıyan her GET kapı dekoratörü taşır (S11: modül bağlanırsa kapı hazır)", () => {
    // Bu rotalar çalışan uygulamada YOKTUR (gerçek HTTP ile ölçülemez); kaynak düzeyinde fail-closed tutulur.
    const missing: string[] = [];
    let count = 0;
    for (const file of UNREGISTERED_ICRABOT_CONTROLLERS) {
      for (const route of parsed[file] ?? []) {
        if (route.verb !== "GET" || !/:caseId\b/.test(route.path)) continue;
        count += 1;
        if (!GATE_DECORATOR.test(route.decorators)) missing.push(`${file} ${route.key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(count).toBe(12);
    const icrabotModule = readFileSync(join(MODULES_DIR, "icrabot/icrabot.module.ts"), "utf8");
    expect(icrabotModule).toMatch(/imports: \[[^\]]*\bCaseViewScopeModule\b/);
  });

  it("dosyaya bağlı controller'larda her GET ve POST rotası veri dosyasında tam bir kez sınıflı; fazla / eksik rota yok", () => {
    const problems: string[] = [];
    for (const [file, entries] of Object.entries(CASE_RELATED_CONTROLLERS)) {
      const source = readRoutes(file).map((r) => r.key);
      const listed = entries.map((e) => e[0]);
      if (new Set(source).size !== source.length) problems.push(`${file}: kaynakta yinelenen rota`);
      if (new Set(listed).size !== listed.length) problems.push(`${file}: veri dosyasında yinelenen rota`);
      for (const key of source) if (!listed.includes(key)) problems.push(`${file}: SINIFLANMAMIŞ ROTA ${key}`);
      for (const key of listed) if (!source.includes(key)) problems.push(`${file}: kaynakta olmayan rota ${key}`);
    }
    expect(problems).toEqual([]);
  });

  it("sınıf ve not geçerli: bilinen sınıf; kapı dışı her sınıf gerekçe taşır; ACIK notu karar satırıdır", () => {
    const problems: string[] = [];
    for (const [file, entries] of Object.entries(CASE_RELATED_CONTROLLERS)) {
      for (const [key, cls, note] of entries) {
        if (!CLASSES.includes(cls)) problems.push(`${file} ${key}: bilinmeyen sınıf ${cls}`);
        if ((cls === "BASKA_KAPI" || cls === "ISTISNA" || cls === "DOSYA_DISI") && note.trim().length < 5) problems.push(`${file} ${key}: ${cls} gerekçesiz`);
        if (cls === "ACIK" && !/^S(1|2|3|4|5|6|7|8|9|10|11)$/.test(note)) problems.push(`${file} ${key}: ACIK notu karar satırı değil`);
        if (cls === "KAPILI_ICERDE" && !INNER_MARKERS.includes(note) && !SERVICE_NOTE.test(note)) problems.push(`${file} ${key}: tanınmayan iç kapı işareti "${note}"`);
        if (cls === "YAZIM" && !key.startsWith("POST ")) problems.push(`${file} ${key}: YAZIM yalnız POST için (GET okuma sınıfı almalı)`);
      }
    }
    for (const [file, reason] of Object.entries(UNRELATED_CONTROLLERS)) if (reason.trim().length < 5) problems.push(`${file}: gerekçesiz`);
    expect(problems).toEqual([]);
  });

  it("KAPILI rotanın dekoratöründe kapı var; KAPILI_ICERDE rotanın gövdesinde kapsam çağrısı var; başka sınıftaki rota kapı taşımıyor", () => {
    const problems: string[] = [];
    let gated = 0;
    for (const [file, entries] of Object.entries(CASE_RELATED_CONTROLLERS)) {
      const byKey = new Map(readRoutes(file).map((r) => [r.key, r]));
      for (const [key, cls, note] of entries) {
        const route = byKey.get(key);
        if (!route) continue;
        const decorated = GATE_DECORATOR.test(route.decorators);
        if (cls === "KAPILI") {
          gated++;
          if (!decorated) problems.push(`${file} ${key}: KAPILI ama dekoratörde kapı yok`);
        } else if (cls === "KAPILI_ICERDE") {
          gated++;
          const service = SERVICE_NOTE.exec(note);
          if (service) {
            // Kapı serviste: handler o yöntemi çağırmalı VE yöntemin gövdesinde kapsam çağrısı bulunmalı.
            if (!route.segment.includes(`${service[2]}(`)) problems.push(`${file} ${key}: handler ${service[2]}() çağırmıyor`);
            if (!SERVICE_SCOPE_CALLS.test(serviceMethodBody(service[1], service[2]))) problems.push(`${file} ${key}: ${note} gövdesinde kapsam çağrısı yok`);
          } else if (!route.segment.includes(note)) problems.push(`${file} ${key}: KAPILI_ICERDE ama gövdede "${note}" yok`);
        } else if (decorated) problems.push(`${file} ${key}: kapı taşıyor ama sınıfı ${cls}`);
      }
    }
    expect(problems).toEqual([]);
    expect(gated).toBeGreaterThanOrEqual(134); // P3 D1–D3b-2 + #3170 + #3172 (81) + S8 3 + S9 3 + S10 1 + S4 31 + S11 15
  });

  it("kapısı henüz olmayan okumalar karar satırı başına sabit (yalnız azalabilir); kapanışta boş olur", () => {
    const open: Record<string, number> = {};
    for (const entries of Object.values(CASE_RELATED_CONTROLLERS)) for (const [, cls, note] of entries) if (cls === "ACIK") open[note] = (open[note] ?? 0) + 1;
    expect(open).toEqual(EXPECTED_OPEN);
  });

  it("dosyaya bağlı değil denen controller'larda yolunda dosya kimliği taşıyan GET / POST rota yok", () => {
    const offenders: string[] = [];
    for (const file of Object.keys(UNRELATED_CONTROLLERS)) for (const r of readRoutes(file)) if (CASE_KEYED_PATH.test(r.path)) offenders.push(`${file}: ${r.key}`);
    expect(offenders).toEqual([]);
  });

  it("ayrıştırıcı pozitif kontrol: bilinen kapılı rotalar kapılı, bilinen kapısız rota kapısız okunuyor", () => {
    const find = (file: string, key: string) => parsed[file].find((r) => r.key === key)!;
    expect(GATE_DECORATOR.test(find("case/case.controller.ts", "GET /cases/:id/notes").decorators)).toBe(true);
    expect(GATE_DECORATOR.test(find("precautionary-order/precautionary-order.controller.ts", "GET /precautionary-orders/:id").decorators)).toBe(true);
    expect(GATE_DECORATOR.test(find("related-lawsuits/related-lawsuits.controller.ts", "GET /related-lawsuits/generate/karsiliksiz-cek/:caseId/word").decorators)).toBe(true);
    expect(GATE_DECORATOR.test(find("precautionary-order/precautionary-order.controller.ts", "POST /precautionary-orders").decorators)).toBe(false);
    expect(GATE_DECORATOR.test(find("case/case.controller.ts", "GET /cases/stats").decorators)).toBe(false);
    expect(find("task/task.controller.ts", "GET /tasks/:id").segment).toContain("findOneForActor");
    // Servis içi kapı okuyucusu: kapsam çağrısı olan yöntem bulunur; olmayan yöntemde bulunmaz.
    expect(SERVICE_SCOPE_CALLS.test(serviceMethodBody("debtor/debtor.service.ts", "findOneForActor"))).toBe(true);
    expect(SERVICE_SCOPE_CALLS.test(serviceMethodBody("debtor/communication.service.ts", "getCommunicationHistory"))).toBe(true);
    expect(SERVICE_SCOPE_CALLS.test(serviceMethodBody("debtor/debtor.service.ts", "findOne"))).toBe(false);
    expect(serviceMethodBody("debtor/debtor.service.ts", "yokBoyleBirYontem")).toBe("");
  });
});
