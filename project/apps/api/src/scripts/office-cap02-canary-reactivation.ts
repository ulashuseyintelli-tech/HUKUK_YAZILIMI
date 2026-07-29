/**
 * OFFICE-P2-CAP02-CANARY-FIXTURE-REACTIVATION-I01 — kontrollü reactivation runner.
 *
 * R01-G canary fixture'ı kanıt zinciri korunarak soft-delete edildi; R01-H
 * fazları aynı principal'ı yeniden gerektiriyor. Owner kararı (OPTION A):
 * satır silme YOK, ad hoc `isActive=true` YOK — yalnız TAM kimliği doğrulanmış
 * mevcut fixture'ı reaktive eden bu bounded runner kullanılır.
 *
 * KARAR MANTIĞI BU DOSYADA DEĞİL: `office-cap02-canary-reactivation.core.ts`.
 * Burada yalnız IO + guarded transaction vardır.
 *
 * GÜVENLİK
 *   - Parola YALNIZ `CANARY_PASSWORD` ortam değişkeninden okunur; stdout'a,
 *     log'a, dosyaya veya audit'e ASLA yazılmaz. Yalnız bcrypt hash'i saklanır.
 *   - Mutasyon guarded `updateMany` CAS'ı ile yapılır (id + tenantId + kimlik +
 *     isActive:false + updatedAt birebir): SELECT ... FOR UPDATE'in kanonik
 *     Prisma eşdeğeri. Tek satır eşleşmezse transaction TAMAMEN geri alınır.
 *   - `tokenVersion` artırılır: fixture'ın önceki yaşamında üretilmiş HER token
 *     (R01-G bounded incident dahil) kalıcı olarak geçersiz kalır.
 *   - Case/ReportingLine/CaseStatusHistory/DecisionLog OKUNUR ama YAZILMAZ;
 *     post-commit reconciliation Case satırının bit-değişmezliğini ayrıca kanıtlar.
 *   - `--apply` verilmezse hiçbir şey yazılmaz.
 *
 * KULLANIM
 *   CANARY_PASSWORD=... DATABASE_URL=... node office-cap02-canary-reactivation.js \
 *     --tenantId=<id> --canaryRunId=<a-z0-9> \
 *     --expectedUserId=<id> --expectedLawyerId=<id> --expectedCaseId=<id> \
 *     --expectedUserUpdatedAt=<ISO> --expectedLawyerUpdatedAt=<ISO> \
 *     --authorityRef=<ref> [--apply]
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  decideCanaryReactivation,
  toCanaryReactivationAuditEvent,
  type CanaryReactivationFacts,
  type CanaryReactivationInput,
} from './office-cap02-canary-reactivation.core';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const required = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`CANARY_MISSING_ARG: --${name}`);
  return value;
};

async function main(): Promise<void> {
  const input: CanaryReactivationInput = {
    tenantId: required('tenantId'),
    canaryRunId: required('canaryRunId'),
    expectedUserId: required('expectedUserId'),
    expectedLawyerId: required('expectedLawyerId'),
    expectedCaseId: required('expectedCaseId'),
    expectedUserUpdatedAt: required('expectedUserUpdatedAt'),
    expectedLawyerUpdatedAt: required('expectedLawyerUpdatedAt'),
    authorityRef: required('authorityRef'),
  };
  const apply = process.argv.includes('--apply');

  const prisma = new PrismaClient();
  try {
    // --- Snapshot: karar icin taze gercek + Case'in dokunulmazlik taban cizgisi ---
    const [tenant, user, lawyer, legalCase, otherUsers, otherLawyers, otherCases, clients, reportingLines] =
      await Promise.all([
        prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, slug: true } }),
        prisma.user.findUnique({
          where: { id: input.expectedUserId },
          select: { id: true, tenantId: true, email: true, isActive: true, updatedAt: true, tokenVersion: true },
        }),
        prisma.lawyer.findUnique({
          where: { id: input.expectedLawyerId },
          select: { id: true, tenantId: true, name: true, userId: true, lawyerRank: true, isActive: true, updatedAt: true },
        }),
        prisma.case.findUnique({
          where: { id: input.expectedCaseId },
          select: { id: true, tenantId: true, fileNumber: true, status: true, caseStatus: true, updatedAt: true },
        }),
        prisma.user.count({ where: { tenantId: input.tenantId, id: { not: input.expectedUserId } } }),
        prisma.lawyer.count({ where: { tenantId: input.tenantId, id: { not: input.expectedLawyerId } } }),
        prisma.case.count({ where: { tenantId: input.tenantId, id: { not: input.expectedCaseId } } }),
        prisma.client.count({ where: { tenantId: input.tenantId } }),
        prisma.reportingLine.count({ where: { tenantId: input.tenantId } }),
      ]);

    const facts: CanaryReactivationFacts = {
      tenant,
      user: user
        ? {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            isActive: user.isActive,
            updatedAt: user.updatedAt.toISOString(),
          }
        : null,
      lawyer: lawyer
        ? {
            id: lawyer.id,
            tenantId: lawyer.tenantId,
            name: lawyer.name,
            userId: lawyer.userId,
            lawyerRank: String(lawyer.lawyerRank),
            isActive: lawyer.isActive,
            updatedAt: lawyer.updatedAt.toISOString(),
          }
        : null,
      legalCase: legalCase
        ? { id: legalCase.id, tenantId: legalCase.tenantId, fileNumber: legalCase.fileNumber }
        : null,
      otherUserCount: otherUsers,
      otherLawyerCount: otherLawyers,
      otherCaseCount: otherCases,
      clientCount: clients,
    };

    const decision = decideCanaryReactivation(input, facts);
    console.log('DECISION', decision.kind, '-', decision.reason);
    // FACTS satiri kimlik DEGERLERINI degil yalniz bulunma/aktiflik/sayim bilgisini tasir.
    console.log('FACTS', JSON.stringify({
      tenantFound: tenant !== null,
      userFound: user !== null,
      userActive: user?.isActive ?? null,
      lawyerFound: lawyer !== null,
      lawyerActive: lawyer?.isActive ?? null,
      caseFound: legalCase !== null,
      otherUsers,
      otherLawyers,
      otherCases,
      clients,
      reportingLines,
    }));

    if (decision.kind === 'FAIL_CLOSED') {
      console.log('FAILURES', decision.failures.join(', '));
      console.log('MUTATED_ROWS 0');
      process.exitCode = 2;
      return;
    }
    if (decision.kind === 'ALREADY_APPLIED') {
      console.log('RESULT ALREADY_APPLIED — fixture zaten aktif, yazim yapilmadi');
      console.log('MUTATED_ROWS 0');
      console.log('NOT: mevcut parola bilinmez; login zincirine DEVAM ETME (owner §5).');
      return;
    }
    if (!apply) {
      console.log('RESULT DRY_RUN_ONLY — --apply verilmedi, hicbir sey yazilmadi');
      console.log('MUTATED_ROWS 0');
      return;
    }

    // Parola YALNIZ ortamdan; degeri hicbir yere yazilmaz.
    const password = process.env.CANARY_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error('CANARY_PASSWORD tanimsiz veya 16 karakterden kisa (deger loglanmaz)');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    // Guarded CAS transaction: her iki update de kimlik + pasiflik + updatedAt
    // esitligiyle sinirli. Beklenen tek satir eslesmezse throw → TAM rollback.
    const written = await prisma.$transaction(async (tx) => {
      const userRes = await tx.user.updateMany({
        where: {
          id: input.expectedUserId,
          tenantId: input.tenantId,
          isActive: false,
          updatedAt: new Date(input.expectedUserUpdatedAt),
        },
        data: {
          isActive: true,
          passwordHash,
          passwordChangedAt: now,
          // Onceki yasamin TUM token'lari (R01-G bounded incident dahil) olu kalir.
          tokenVersion: { increment: 1 },
        },
      });
      if (userRes.count !== 1) {
        throw new Error(`CANARY_REACTIVATION_CAS_USER: guard ${userRes.count} satir esledi (beklenen 1); rollback`);
      }
      const lawyerRes = await tx.lawyer.updateMany({
        where: {
          id: input.expectedLawyerId,
          tenantId: input.tenantId,
          userId: input.expectedUserId,
          isActive: false,
          updatedAt: new Date(input.expectedLawyerUpdatedAt),
        },
        data: { isActive: true },
      });
      if (lawyerRes.count !== 1) {
        throw new Error(`CANARY_REACTIVATION_CAS_LAWYER: guard ${lawyerRes.count} satir esledi (beklenen 1); rollback`);
      }
      return { userRows: userRes.count, lawyerRows: lawyerRes.count };
    });

    const audit = toCanaryReactivationAuditEvent(input, decision, new Date().toISOString(), written);
    console.log('AUDIT', JSON.stringify(audit));
    console.log(`MUTATED_ROWS ${written.userRows + written.lawyerRows}`);

    // --- Post-commit reconciliation (runner ciktisindan bagimsiz taze sorgular) ---
    const [afterUser, afterLawyer, afterCase, afterOtherUsers, afterOtherLawyers, afterOtherCases, afterClients, afterReportingLines] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: input.expectedUserId },
          select: { isActive: true, tokenVersion: true },
        }),
        prisma.lawyer.findUnique({ where: { id: input.expectedLawyerId }, select: { isActive: true } }),
        prisma.case.findUnique({
          where: { id: input.expectedCaseId },
          select: { fileNumber: true, status: true, caseStatus: true, updatedAt: true },
        }),
        prisma.user.count({ where: { tenantId: input.tenantId, id: { not: input.expectedUserId } } }),
        prisma.lawyer.count({ where: { tenantId: input.tenantId, id: { not: input.expectedLawyerId } } }),
        prisma.case.count({ where: { tenantId: input.tenantId, id: { not: input.expectedCaseId } } }),
        prisma.client.count({ where: { tenantId: input.tenantId } }),
        prisma.reportingLine.count({ where: { tenantId: input.tenantId } }),
      ]);

    // Case dokunulmazligi: TUM izlenen alanlar + updatedAt bit-degismez olmali.
    const caseUntouched =
      legalCase !== null &&
      afterCase !== null &&
      afterCase.fileNumber === legalCase.fileNumber &&
      afterCase.status === legalCase.status &&
      afterCase.caseStatus === legalCase.caseStatus &&
      afterCase.updatedAt.getTime() === legalCase.updatedAt.getTime();

    const pass =
      afterUser?.isActive === true &&
      afterUser.tokenVersion === (user!.tokenVersion + 1) &&
      afterLawyer?.isActive === true &&
      caseUntouched &&
      afterOtherUsers === 0 &&
      afterOtherLawyers === 0 &&
      afterOtherCases === 0 &&
      afterClients === 0 &&
      afterReportingLines === reportingLines;

    console.log('RECONCILIATION', JSON.stringify({
      userActive: afterUser?.isActive ?? null,
      tokenVersionBumped: afterUser ? afterUser.tokenVersion === user!.tokenVersion + 1 : null,
      lawyerActive: afterLawyer?.isActive ?? null,
      caseUntouched,
      afterOtherUsers,
      afterOtherLawyers,
      afterOtherCases,
      afterClients,
      reportingLinesBefore: reportingLines,
      reportingLinesAfter: afterReportingLines,
    }));
    console.log('RESULT', pass ? 'PASS' : 'FAIL');
    if (!pass) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  // Hata mesaji parola/hash TASIMAZ; yalnizca mesaj basilir (exception dump YOK).
  console.error('CANARY_REACTIVATION_ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
