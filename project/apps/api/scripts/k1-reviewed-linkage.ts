/**
 * K1-2 (validate+plan) + K1-3 (guarded apply) — reviewed-linkage CLI (thin shell).
 *
 * Tüm karar mantığı SAF çekirdektedir:
 *   src/modules/policy-engine/diagnostics/k1-reviewed-linkage.core.ts
 * Bu dosya YALNIZ PrismaClient'i bağlar, okur ve (yalnız üçlü-kapı + env/DB guard geçerse) tek
 * transaction içinde GÜVENLİ link yazar. İzin verilen TEK write: Lawyer.userId / StaffMember.userId.
 * CREATE_LOGIN_USER UYGULANMAZ (güvenli parola yolu yok → BLOCKED_NOT_IMPLEMENTED). User create YOK.
 *
 * Çalıştırma (DATABASE_URL gerekir):
 *   ... --template --tenant <tenantId>                       # iskelet üret (PII yok)
 *   ... --manifest ./k1-manifest.json                        # validate + plan (dry-run, counts-only)
 *   ... --manifest ./k1-manifest.json --json                 # + makine-okur JSON (PII yok)
 *   ... --manifest ./k1-manifest.json --apply \              # GUARDED APPLY (yalnız LINK_EXISTING_USER)
 *         --allow-dev-db-write --confirm-manifest-reviewed
 *
 * Apply ÜÇLÜ KAPI (üçü de gerekir): --apply + --allow-dev-db-write + --confirm-manifest-reviewed.
 * Prod hard-stop: NODE_ENV=production / DATABASE_URL prod|live|customer|staging / eksik / unknown hedef.
 * Preflight hard-stop (zero-write): blocked/conflict/manifest-level hata varsa HİÇBİR yazma.
 *
 * Çağrıldığı yerler:
 *  - manuel operatör CLI (geliştirici/DBA); HTTP/Nest call-site YOK → runtime davranışı DEĞİŞMEZ.
 */

import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import {
  validateManifest,
  planLinkage,
  formatPlan,
  generateManifestTemplate,
  parseManifest,
  evaluateApplyGuards,
  planApply,
  applyLinkages,
  verifyAppliedState,
  formatApplyReport,
  redactSecrets,
  ReferenceData,
  ReviewedLinkageManifest,
  LinkageApplyTx,
  ApplyExecutionResult,
} from "../src/modules/policy-engine/diagnostics/k1-reviewed-linkage.core";

const prisma = new PrismaClient();

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function loadReference(): Promise<ReferenceData> {
  // READ-ONLY toplama (yalnız gerekli alanlar — K1-1 ile aynı select)
  const [users, lawyers, staff] = await Promise.all([
    prisma.user.findMany({ select: { id: true, tenantId: true, email: true } }),
    prisma.lawyer.findMany({ select: { id: true, tenantId: true, email: true, lawyerRank: true, userId: true } }),
    prisma.staffMember.findMany({ select: { id: true, tenantId: true, email: true, staffType: true, userId: true } }),
  ]);
  return {
    users,
    lawyers: lawyers.map((l) => ({ ...l, lawyerRank: String(l.lawyerRank) })),
    staff: staff.map((s) => ({ ...s, staffType: String(s.staffType) })),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const verbose = argv.includes("--verbose");
  const templateMode = argv.includes("--template");
  const applyMode = argv.includes("--apply");
  const allowDevDbWrite = argv.includes("--allow-dev-db-write");
  const confirmManifestReviewed = argv.includes("--confirm-manifest-reviewed");
  const manifestPath = argValue(argv, "--manifest");
  const tenantId = argValue(argv, "--tenant");

  const reference = await loadReference();

  if (templateMode) {
    if (!tenantId) {
      console.error("HATA: --template için --tenant <tenantId> gerekir.");
      process.exitCode = 1;
      return;
    }
    const tmpl = generateManifestTemplate(reference, { tenantId, includeEmailHint: verbose });
    console.log(`K1 REVIEWED LINKAGE TEMPLATE — tenant=${tenantId}, doldurulacak entry: ${tmpl.entries.length}`);
    console.log(verbose ? "(--verbose: _emailHint dahil — PII)" : "(PII yok; --verbose ile email ipucu eklenir)");
    console.log(JSON.stringify(tmpl, null, 2));
    return;
  }

  if (!manifestPath) {
    console.error("HATA: --manifest <dosya> veya --template --tenant <id> gerekir.");
    process.exitCode = 1;
    return;
  }

  let manifest: ReviewedLinkageManifest;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest = parseManifest(raw);
  } catch (e) {
    console.error("HATA: manifest okunamadı/çözümlenemedi: " + redactSecrets(e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
    return;
  }

  // ---- APPLY yolu (K1-3 guarded) ----
  if (applyMode) {
    await runGuardedApply(manifest, reference, { allowDevDbWrite, confirmManifestReviewed });
    return;
  }

  // ---- validate + plan (K1-2 dry-run) ----
  const validation = validateManifest(manifest, reference);
  const plan = planLinkage(manifest, reference);

  console.log(formatPlan(plan));
  console.log("");
  console.log(
    validation.ok
      ? "VALIDATION: OK — tüm entry'ler geçerli."
      : `VALIDATION: ${plan.plan.blockedEntries} blocked entry — apply edilmeden önce düzeltilmeli.`,
  );
  console.log("MODE: validate+plan only (dry-run) — HİÇBİR yazma. Apply için: --apply --allow-dev-db-write --confirm-manifest-reviewed");

  if (asJson) {
    // PII güvenliği: yalnız opak id + kod + sınıf; email/isim DEĞERLERİ basılmaz.
    const entries = validation.entries.map((ev) => ({
      index: ev.index,
      profileType: ev.profileType,
      profileId: ev.profileId,
      strategy: ev.strategy,
      applySafe: ev.applySafe,
      blocked: ev.blocked,
      unsafe: ev.unsafe,
      errorCodes: ev.errors.map((x) => x.code),
    }));
    console.log("");
    console.log("JSON " + JSON.stringify({ plan, manifestErrors: validation.manifestErrors.map((x) => x.code), entries }));
  }
}

/**
 * K1-3 GUARDED APPLY — üçlü kapı + env/DB guard + preflight (idempotency-aware) + tek transaction + post-verify.
 * İzin verilen TEK write: Lawyer.userId / StaffMember.userId set. CREATE_LOGIN_USER asla uygulanmaz.
 */
async function runGuardedApply(
  manifest: ReviewedLinkageManifest,
  reference: ReferenceData,
  opts: { allowDevDbWrite: boolean; confirmManifestReviewed: boolean },
): Promise<void> {
  const guard = evaluateApplyGuards({
    apply: true,
    allowDevDbWrite: opts.allowDevDbWrite,
    confirmManifestReviewed: opts.confirmManifestReviewed,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });

  // PII/secret güvenliği: ham DATABASE_URL ASLA basılmaz; yalnız sınıflandırma.
  const envMeta = {
    head: process.env.K1_APPLY_HEAD ?? "(n/a)",
    dbTargetMasked: guard.dbTarget,
    nodeEnv: process.env.NODE_ENV ?? "(unset)",
    manifest: "(operator file)",
    applyMode: "apply" as "dry-run" | "apply" | "refused",
  };

  const aplan = planApply(manifest, reference);

  // (a) env/üçlü-kapı guard
  if (!guard.canApply) {
    console.log(formatApplyReport({ env: { ...envMeta, applyMode: "refused" }, plan: aplan, transactionStarted: false, execution: null, verification: null, failed: 0 }));
    console.log("");
    console.log("APPLY REFUSED (guard hard-stop — HİÇBİR yazma):");
    for (const h of guard.hardStops) console.log("  ✗ " + h);
    process.exitCode = 1;
    return;
  }

  // (b) preflight hard-stop (blocked/conflict/manifest-level → zero write)
  if (!aplan.canApply) {
    console.log(formatApplyReport({ env: { ...envMeta, applyMode: "refused" }, plan: aplan, transactionStarted: false, execution: null, verification: null, failed: 0 }));
    console.log("");
    console.log("APPLY REFUSED (preflight hard-stop — partial apply YOK, HİÇBİR yazma):");
    for (const h of aplan.hardStops) console.log("  ✗ " + h);
    process.exitCode = 1;
    return;
  }

  // (c) yazılacak yeni link yoksa (hepsi already-applied/skip/create-blocked) → no-op
  if (aplan.operations.length === 0) {
    console.log(formatApplyReport({ env: envMeta, plan: aplan, transactionStarted: false, execution: { lawyerLinks: 0, staffLinks: 0, applied: [] }, verification: { expected: 0, verified: 0, mismatches: [] }, failed: 0 }));
    console.log("");
    console.log("APPLY: yazılacak yeni link yok (already-applied / skip / create-blocked). HİÇBİR yazma yapıldı.");
    return;
  }

  // (d) tek transaction içinde uygula (fail → rollback, partial YOK)
  let execution: ApplyExecutionResult;
  try {
    execution = await prisma.$transaction(async (ptx) => {
      // KOŞULLU yazma (optimistic concurrency): yalnız userId HÂLÂ NULL ise güncelle. snapshot'tan beri
      // profile başka user'a bağlanmış/silinmişse count=0 → applyLinkages fail-fast → tüm $transaction
      // ROLLBACK (sessiz üzerine-yazma YOK; read-time preflight'a ek olarak yazma anında da korur).
      const tx: LinkageApplyTx = {
        setLawyerUserId: async (profileId, userId) => {
          const res = await ptx.lawyer.updateMany({ where: { id: profileId, userId: null }, data: { userId } });
          return res.count;
        },
        setStaffUserId: async (profileId, userId) => {
          const res = await ptx.staffMember.updateMany({ where: { id: profileId, userId: null }, data: { userId } });
          return res.count;
        },
      };
      return applyLinkages(aplan.operations, tx);
    });
  } catch (e) {
    console.error("APPLY FAILED (transaction ROLLED BACK; partial state YOK): " + redactSecrets(e instanceof Error ? e.message : String(e)));
    console.log(formatApplyReport({ env: envMeta, plan: aplan, transactionStarted: true, execution: null, verification: null, failed: aplan.operations.length }));
    process.exitCode = 1;
    return;
  }

  // (e) post-verify (re-read)
  const postReference = await loadReference();
  const verification = verifyAppliedState(aplan.operations, postReference);

  console.log(formatApplyReport({ env: envMeta, plan: aplan, transactionStarted: true, execution, verification, failed: 0 }));
  if (verification.mismatches.length > 0) {
    console.log("");
    console.log(`UYARI: ${verification.mismatches.length} link post-verify'da doğrulanamadı.`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    // Ham err nesnesi (stack/connection-string içerebilir) BASILMAZ → yalnız maskeli ad+mesaj.
    console.error("K1 reviewed-linkage FAILED: " + redactSecrets(err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
