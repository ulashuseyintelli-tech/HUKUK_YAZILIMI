/**
 * K1-1 — User ↔ Lawyer/StaffMember capacity-linkage DIAGNOSTIC + dry-run repair (thin shell).
 *
 * Tüm karar/sınıflandırma mantığı test edilebilir çekirdektedir:
 *   src/modules/policy-engine/diagnostics/k1-capacity-linkage.core.ts
 * Bu dosya YALNIZ PrismaClient'i bağlar, okur, raporu basar ve (yalnız açık --apply ile) güvenli
 * SAFE adayları yazar. Varsayılan: HİÇBİR yazma (dry-run).
 *
 * Çalıştırma (DATABASE_URL gerekir; Prisma .env'i otomatik yükler):
 *   npx --yes tsx scripts/k1-capacity-linkage.ts                 # dry-run (default, yazma yok)
 *   npx --yes tsx scripts/k1-capacity-linkage.ts --json          # rapor + makine-okur JSON
 *   npx --yes tsx scripts/k1-capacity-linkage.ts --apply --allow-dev-db-write   # yalnız SAFE linkleri yaz
 *
 * Hard guard'lar (core.evaluateApplyGuards): NODE_ENV=production / DATABASE_URL prod|live|customer /
 * --allow-dev-db-write yok / herhangi ambiguous|duplicate-email|both → apply TÜMDEN durur.
 */

import { PrismaClient } from "@prisma/client";
import {
  analyzeLinkage,
  evaluateApplyGuards,
  formatReport,
  selectSafeWrites,
  LinkageInput,
} from "../src/modules/policy-engine/diagnostics/k1-capacity-linkage.core";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const allowDevDbWrite = argv.includes("--allow-dev-db-write");
  const asJson = argv.includes("--json");

  // READ-ONLY toplama (yalnız gerekli alanlar)
  const [users, lawyers, staff] = await Promise.all([
    prisma.user.findMany({ select: { id: true, tenantId: true, email: true } }),
    prisma.lawyer.findMany({ select: { id: true, tenantId: true, email: true, lawyerRank: true, userId: true } }),
    prisma.staffMember.findMany({ select: { id: true, tenantId: true, email: true, staffType: true, userId: true } }),
  ]);

  const input: LinkageInput = {
    users,
    lawyers: lawyers.map((l) => ({ ...l, lawyerRank: String(l.lawyerRank) })),
    staff: staff.map((s) => ({ ...s, staffType: String(s.staffType) })),
  };

  const report = analyzeLinkage(input);

  console.log(formatReport(report));
  console.log("");

  const guard = evaluateApplyGuards({
    apply,
    allowDevDbWrite,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    flags: report.flags,
  });

  if (guard.mode === "dry-run") {
    console.log("MODE: dry-run (varsayılan) — HİÇBİR yazma yapıldı. --apply --allow-dev-db-write ile güvenli linkler yazılır.");
  } else if (!guard.canApply) {
    console.log("MODE: apply İSTENDİ ama HARD-STOP — yazma YAPILMADI:");
    for (const h of guard.hardStops) console.log("  ✗ " + h);
  } else {
    const writes = selectSafeWrites(report);
    console.log(`MODE: apply — ${writes.length} SAFE link yazılıyor (yalnız tek-tek exact match)...`);
    let done = 0;
    for (const w of writes) {
      if (w.kind === "lawyer") {
        await prisma.lawyer.update({ where: { id: w.profileId }, data: { userId: w.userId } });
      } else {
        await prisma.staffMember.update({ where: { id: w.profileId }, data: { userId: w.userId } });
      }
      done++;
    }
    console.log(`APPLIED: ${done} link yazıldı. (ambiguous/duplicate/both/blocked: yazılmadı)`);
  }

  if (asJson) {
    // PII güvenliği: yalnız sayım/sınıflandırma + opak id'ler; email DEĞERLERİ basılmaz.
    const safeCandidates = report.candidates.map((c) => ({
      kind: c.kind,
      profileId: c.profileId,
      tenantId: c.tenantId,
      capacityValue: c.capacityValue,
      matchedUserId: c.matchedUserId,
      classification: c.classification,
    }));
    console.log("");
    console.log("JSON " + JSON.stringify({ report: { ...report, candidates: undefined }, candidates: safeCandidates }));
  }
}

main()
  .catch((err) => {
    console.error("K1 linkage diagnostic FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
