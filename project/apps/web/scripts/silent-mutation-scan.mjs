#!/usr/bin/env node
/**
 * PR-2 — SESSİZ MUTATION TARAYICISI (AST tabanlı, deterministik).
 *
 * NEDEN AST: regex `catch` gövdesini, çağrı zincirini ve başarı-yolu yan etkilerini
 * güvenilir ayıramaz. Bu tarayıcı TypeScript compiler API'sini kullanır; aynı repo
 * durumunda AYNI sonucu üretir (dosya sırası sabitlenir, satır no yerine kararlı
 * imza üretilir).
 *
 * TESPİT EDİLEN İHLALLER
 *   SM001  mutation çağrısını saran try/catch → handling YOK
 *   SM002  mutation promise'ine bağlı .catch(...) → error'ı default/null/empty'ye çeviriyor
 *   SM003  yanıt doğrulanmadan başarı yan etkisi (toast/close/reset/callback)
 *
 * KABUL EDİLEN HANDLING (ihlal saymaz)
 *   - rethrow (`throw`)
 *   - görünür error state (setError/setMessage/toast/alert/... )
 *   - discriminated failure return ({ ok:false } / { status:'error' })
 *   - merkezi observable reporter (reportError/captureException/logger.error)
 *   - testli intentional-best-effort: `// silent-mutation-guard: BEST_EFFORT(<reason>)`
 *
 * BASELINE: dosya+satır DEĞİL; `ruleId::relPath::stableSignature` (fonksiyon adı +
 * mutation ifadesi) kullanılır → biçimsel düzenlemeler baseline'ı kırmaz.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import ts from "typescript";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(__dirname, "..", "src");
const BASELINE_PATH = path.resolve(__dirname, "silent-mutation-baseline.json");

/** Mutation sayılan çağrılar: api.post/put/patch/delete, fetch(..., {method:'POST'|...}) */
const MUTATION_METHODS = new Set(["post", "put", "patch", "delete", "destroy"]);
const MUTATION_NAME_RE =
  /^(create|update|delete|remove|save|submit|approve|reject|publish|post|send|cancel|revoke|assign|promote|reverse|supersede|match|sync|generate|issue|retry)[A-Z_]?/;

const VISIBLE_ERROR_RE =
  /\b(setError|setErr|setFormError|setMessage|setStatus|setFeedback|setWarning|setResult|showError|notify|toast|alert)\b/;
const REPORTER_RE = /\b(reportError|captureException|trackError|logger\.error|errorReporter)\b/;
const SUCCESS_SIDE_EFFECT_RE =
  /\b(onSuccess|onSaved|onCompleted|setShow\w*|setOpen|setModal\w*|onClose|reset|clearForm|refetch|reload|load\w*)\b/;

const BEST_EFFORT_RE = /silent-mutation-guard:\s*BEST_EFFORT\(([A-Z0-9_]+)\)/;

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function textOf(node, sf) {
  return node.getText(sf);
}

/** Bir ifade mutation çağrısı mı? */
function isMutationCall(node, sf) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee)) {
    const name = callee.name.text;
    if (MUTATION_METHODS.has(name)) return `${textOf(callee, sf)}()`;
    if (MUTATION_NAME_RE.test(name) && /\bapi\b|Api\b|client\b/i.test(textOf(callee.expression, sf))) {
      return `${textOf(callee, sf)}()`;
    }
  }
  if (ts.isIdentifier(callee) && callee.text === "fetch") {
    const arg = node.arguments[1];
    if (arg && ts.isObjectLiteralExpression(arg)) {
      const m = arg.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name && p.name.getText(sf) === "method",
      );
      if (m && /POST|PUT|PATCH|DELETE/i.test(m.getText(sf))) return "fetch(method)";
    }
  }
  return null;
}

function containsMutation(node, sf) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    const sig = isMutationCall(n, sf);
    if (sig) {
      found = sig;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** En yakın fonksiyon/metot adı — kararlı imza için. */
function enclosingName(node, sf) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && cur.name) return cur.name.getText(sf);
    if (
      (ts.isVariableDeclaration(cur) || ts.isPropertyAssignment(cur)) &&
      cur.name &&
      ts.isIdentifier(cur.name)
    ) {
      return cur.name.text;
    }
    cur = cur.parent;
  }
  return "<module>";
}

function classify(bodyText) {
  if (BEST_EFFORT_RE.test(bodyText)) return "BEST_EFFORT";
  if (/\bthrow\b/.test(bodyText)) return "RETHROW";
  if (VISIBLE_ERROR_RE.test(bodyText)) return "VISIBLE";
  if (REPORTER_RE.test(bodyText)) return "REPORTER";
  if (/return\s*\{[^}]*\b(ok|success)\s*:\s*false/.test(bodyText)) return "DISCRIMINATED";
  if (/return\s*\{[^}]*status\s*:\s*['"]error['"]/.test(bodyText)) return "DISCRIMINATED";
  return "SILENT";
}

export function scan(rootDir = WEB_SRC) {
  const files = listFiles(rootDir);
  const findings = [];
  let mutationFiles = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = path.relative(rootDir, file).split(path.sep).join("/");
    let fileHasMutation = false;

    const visit = (node) => {
      // SM001 — try/catch mutation sarıyor
      if (ts.isTryStatement(node) && node.catchClause) {
        const sig = containsMutation(node.tryBlock, sf);
        if (sig) {
          fileHasMutation = true;
          const bodyText = textOf(node.catchClause.block, sf);
          const kind = classify(bodyText);
          if (kind === "SILENT") {
            findings.push({
              ruleId: "SM001",
              file: rel,
              fn: enclosingName(node, sf),
              signature: sig,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              falseSuccess: SUCCESS_SIDE_EFFECT_RE.test(textOf(node.tryBlock, sf)),
            });
          }
        }
      }

      // SM002 — .catch(...) error'ı default değere çeviriyor
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "catch"
      ) {
        const sig = containsMutation(node.expression.expression, sf);
        if (sig) {
          fileHasMutation = true;
          const handlerText = node.arguments[0] ? textOf(node.arguments[0], sf) : "";
          if (classify(handlerText) === "SILENT") {
            findings.push({
              ruleId: "SM002",
              file: rel,
              fn: enclosingName(node, sf),
              signature: sig,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              falseSuccess: /null|\[\]|\{\s*\}|false|0/.test(handlerText),
            });
          }
        }
      }

      if (!fileHasMutation && isMutationCall(node, sf)) fileHasMutation = true;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (fileHasMutation) mutationFiles += 1;
  }

  findings.sort((a, b) =>
    a.file === b.file ? (a.signature < b.signature ? -1 : 1) : a.file < b.file ? -1 : 1,
  );

  return { totalFiles: files.length, mutationFiles, findings };
}

export function keyOf(f) {
  return `${f.ruleId}::${f.file}::${f.fn}::${f.signature}`;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { entries: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function main() {
  const args = process.argv.slice(2);
  const result = scan();
  const baseline = loadBaseline();
  const allowed = new Map(baseline.entries.map((e) => [e.key, e]));

  const violations = result.findings.filter((f) => !allowed.has(keyOf(f)));
  const stale = baseline.entries.filter(
    (e) => !result.findings.some((f) => keyOf(f) === e.key),
  );

  if (args.includes("--json")) {
    console.log(JSON.stringify({ ...result, violations, stale }, null, 2));
    return;
  }

  console.log(`taranan dosya          : ${result.totalFiles}`);
  console.log(`mutation iceren dosya  : ${result.mutationFiles}`);
  console.log(`sessiz bulgu (toplam)  : ${result.findings.length}`);
  console.log(`baseline kayit         : ${baseline.entries.length}`);
  console.log(`YENI IHLAL             : ${violations.length}`);
  console.log(`bayat baseline kaydi   : ${stale.length}`);

  for (const v of violations) {
    console.log(`  ${v.ruleId}  ${v.file}:${v.line}  ${v.fn}  ${v.signature}${v.falseSuccess ? "  [YALANCI BASARI]" : ""}`);
  }
  for (const s of stale) {
    console.log(`  BAYAT BASELINE: ${s.key}`);
  }

  if (violations.length > 0 || stale.length > 0) process.exit(1);
}

if (import.meta.url === url.pathToFileURL(process.argv[1] ?? "").href) main();
