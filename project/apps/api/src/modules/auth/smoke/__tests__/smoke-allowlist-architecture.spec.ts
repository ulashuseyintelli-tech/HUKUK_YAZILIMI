// C36 — SMOKE allowlist'inin MEKANİK sınırı.
//
// Bu test bir dokümantasyon değil, YAPTIRIMDIR: `@SmokeAllowed()` dekoratörü yeni bir
// route'a eklenirse test KIRILIR. Böylece allowlist'in genişlemesi sessizce olamaz ve
// owner'ın "en fazla şu dört yüzey" hükmü kod düzeyinde korunur.
//
// Ayrıca uygulamadaki TÜM mutating route'lar sayılır ve allowlist dışındakilerin
// tamamının SMOKE için DENY tarafında olduğu (N/N) gösterilir.
import * as fs from "fs";
import * as path from "path";

const API_SRC = path.resolve(__dirname, "../../../..");

/** Owner hükmü gereği izin verilen TEK allowlist. Genişletme owner kararı gerektirir. */
const PERMITTED_SMOKE_ROUTES = [
  "POST /auth/smoke/login",
  "POST /auth/smoke/revoke",
  "GET /auth/me",
] as const;

/** Allowlist'e ASLA girmemesi gereken iş yüzeyi kalıpları. */
const FORBIDDEN_ALLOWLIST_PATTERNS = [
  /office/i, /lawyer/i, /staff/i, /client/i, /case/i, /debtor/i, /task/i,
  /accounting/i, /journal/i, /finance/i, /payment/i, /collect/i, /approval/i,
  /notification/i, /cron/i, /escalation/i, /file/i, /document/i, /publication/i,
  /tenant/i, /invite/i, /user/i,
];

interface RouteRow {
  file: string;
  method: string;
  route: string;
  smokeAllowed: boolean;
  mutating: boolean;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".controller.ts") && !e.name.endsWith(".spec.ts")) acc.push(p);
  }
  return acc;
}

/** Çok satırlı dekoratörleri tek satıra indirger (paren derinliği > 0 iken newline → boşluk). */
function flatten(src: string): string {
  let out = "";
  let depth = 0;
  for (const c of src) {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "\n" && depth > 0) { out += " "; continue; }
    out += c;
  }
  return out;
}

const MUTATING = new Set(["Post", "Put", "Patch", "Delete"]);

function collectRoutes(): RouteRow[] {
  const rows: RouteRow[] = [];
  for (const file of walk(API_SRC)) {
    const lines = flatten(fs.readFileSync(file, "utf8")).split("\n");
    const ctrlIdx = lines.findIndex((l) => /^\s*@Controller\s*\(/.test(l));
    if (ctrlIdx < 0) continue;
    let clsIdx = -1;
    for (let k = ctrlIdx + 1; k < lines.length; k++) {
      if (/^\s*export\s+(abstract\s+)?class\s/.test(lines[k])) { clsIdx = k; break; }
    }
    if (clsIdx < 0) continue;

    const base = (lines[ctrlIdx].match(/\(\s*["'`]([^"'`]*)["'`]/) || ["", ""])[1];
    // Sınıf düzeyinde @SmokeAllowed() varsa tüm route'lara yayılır.
    let classSmokeAllowed = false;
    for (let i = clsIdx - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (l === "" || l.startsWith("//") || l.startsWith("*") || l.startsWith("/*")) continue;
      if (!l.startsWith("@")) break;
      if (/@SmokeAllowed\s*\(/.test(l)) classSmokeAllowed = true;
    }

    for (let i = clsIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      const hm = l.match(/^@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(/);
      if (!hm) continue;

      let smokeAllowed = classSmokeAllowed;
      for (let j = i - 1; j >= clsIdx; j--) {
        const p = lines[j].trim();
        if (p === "" || p.startsWith("//") || p.startsWith("*") || p.startsWith("/*") || p.startsWith("*/")) continue;
        if (!p.startsWith("@")) break;
        if (/@SmokeAllowed\s*\(/.test(p)) smokeAllowed = true;
      }
      for (let j = i + 1; j < lines.length; j++) {
        const n = lines[j].trim();
        if (n === "" || n.startsWith("//") || n.startsWith("*") || n.startsWith("/*") || n.startsWith("*/")) continue;
        if (!n.startsWith("@")) break;
        if (/@SmokeAllowed\s*\(/.test(n)) smokeAllowed = true;
      }

      const sub = (l.match(/\(\s*["'`]([^"'`]*)["'`]/) || ["", ""])[1];
      rows.push({
        file: path.relative(API_SRC, file).replace(/\\/g, "/"),
        method: hm[1].toUpperCase(),
        route: `/${base}${sub ? "/" + sub : ""}`,
        smokeAllowed,
        mutating: MUTATING.has(hm[1]),
      });
    }
  }
  return rows;
}

describe("C36 — SMOKE allowlist mekanik sınırı", () => {
  const rows = collectRoutes();

  it("controller taraması anlamlı bir route kümesi bulur", () => {
    expect(rows.length).toBeGreaterThan(500);
    expect(rows.filter((r) => r.mutating).length).toBeGreaterThan(400);
  });

  it("SMOKE-allowed route kümesi izin verilen listeye BİREBİR eşittir", () => {
    const actual = rows
      .filter((r) => r.smokeAllowed)
      .map((r) => `${r.method} ${r.route}`)
      .sort();
    const expected = [...PERMITTED_SMOKE_ROUTES].sort();
    // Fark varsa allowlist genişlemiş/daralmış demektir → owner kararı gerekir.
    expect(actual).toEqual(expected);
  });

  it("allowlist HİÇBİR iş yüzeyi kalıbı içermez", () => {
    for (const route of PERMITTED_SMOKE_ROUTES) {
      // `/auth/me` ve `/auth/smoke/*` dışında hiçbir şey olmamalı; kalıp taraması
      // yalnız auth yüzeyi dışına çıkışı yakalar.
      const withoutAuthPrefix = route.replace(/^(GET|POST) \/auth(\/smoke)?/, "");
      for (const pattern of FORBIDDEN_ALLOWLIST_PATTERNS) {
        expect(withoutAuthPrefix).not.toMatch(pattern);
      }
    }
  });

  it("N/N — allowlist dışındaki TÜM mutating route'lar SMOKE için DENY tarafındadır", () => {
    const mutating = rows.filter((r) => r.mutating);
    const allowedSet = new Set<string>(PERMITTED_SMOKE_ROUTES);
    const denied = mutating.filter((r) => !allowedSet.has(`${r.method} ${r.route}`));
    const leaked = denied.filter((r) => r.smokeAllowed);

    // Sızıntı 0 olmalı: allowlist dışında SmokeAllowed taşıyan route YOKTUR.
    expect(leaked.map((r) => `${r.method} ${r.route} (${r.file})`)).toEqual([]);

    // N/N muhasebesi: izin verilen mutating route sayısı + denied = toplam.
    const allowedMutating = mutating.filter((r) => allowedSet.has(`${r.method} ${r.route}`));
    expect(allowedMutating.length + denied.length).toBe(mutating.length);
    // Yalnız iki mutating route allowlisted'dır (smoke login + revoke).
    expect(allowedMutating.length).toBe(2);
  });

  it("okuma yüzeyinde de yalnız `/auth/me` allowlisted'dır", () => {
    const reads = rows.filter((r) => !r.mutating && r.smokeAllowed);
    expect(reads.map((r) => `${r.method} ${r.route}`)).toEqual(["GET /auth/me"]);
  });
});
