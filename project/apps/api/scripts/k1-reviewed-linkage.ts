/**
 * K1-2 — reviewed-linkage STRATEGY validate + plan (thin shell). APPLY YOK (K1-3'e ertelendi).
 *
 * Tüm karar mantığı SAF çekirdektedir:
 *   src/modules/policy-engine/diagnostics/k1-reviewed-linkage.core.ts
 * Bu dosya YALNIZ PrismaClient'i bağlar (READ-ONLY), manifest dosyasını okur, doğrular ve
 * sayım-temelli planı basar. HİÇBİR YAZMA yapmaz — ne User oluşturur ne Lawyer/StaffMember.userId set eder.
 *
 * Çalıştırma (DATABASE_URL gerekir; Prisma .env'i otomatik yükler):
 *   npx --yes tsx scripts/k1-reviewed-linkage.ts --template --tenant <tenantId>          # iskelet üret (PII yok)
 *   npx --yes tsx scripts/k1-reviewed-linkage.ts --template --tenant <id> --verbose      # + _emailHint (PII; opt-in)
 *   npx --yes tsx scripts/k1-reviewed-linkage.ts --manifest ./k1-manifest.json           # validate + plan (counts-only)
 *   npx --yes tsx scripts/k1-reviewed-linkage.ts --manifest ./k1-manifest.json --json    # + makine-okur JSON (PII yok)
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
  ReferenceData,
  ReviewedLinkageManifest,
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
  const manifestPath = argValue(argv, "--manifest");
  const tenantId = argValue(argv, "--tenant");

  if (argv.includes("--apply")) {
    console.error("HATA: --apply bu araçta YOKTUR. K1-2 yalnız validate+plan üretir; gerçek yazma K1-3 (guarded apply).");
    process.exitCode = 1;
    return;
  }

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
    console.error("HATA: manifest okunamadı/çözümlenemedi: " + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
    return;
  }

  const validation = validateManifest(manifest, reference);
  const plan = planLinkage(manifest, reference);

  console.log(formatPlan(plan));
  console.log("");
  console.log(
    validation.ok
      ? "VALIDATION: OK — tüm entry'ler geçerli (apply K1-3'e ertelendi; bu araç YAZMAZ)."
      : `VALIDATION: ${plan.plan.blockedEntries} blocked entry — apply edilmeden önce düzeltilmeli. (bu araç YAZMAZ)`,
  );
  console.log("MODE: validate+plan only — HİÇBİR yazma. --apply yoktur (K1-3 guarded apply).");

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

main()
  .catch((err) => {
    console.error("K1-2 reviewed-linkage FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
