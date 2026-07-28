/**
 * OFFICE-P2-CAP02-CANARY-PRINCIPAL-AND-CASE-PROVISION-I01 — kontrollü canary runner.
 *
 * `OFFICE-P2-CAP02-SHADOW-DEFAULT-OFF-PRODUCTION-SMOKE-I01` gerçek controller yolunu
 * çalıştırmak için kimlik doğrulanmış bir principal ister. Kanonik main'de üretim-güvenli
 * bir provisioning yolu YOKTUR (`tm47d-happy-path-seed.ts` kendi tenant'ını silip yeniden
 * yaratır ve `passwordHash: null` yazar → login edilemez). Bu runner o boşluğu YALNIZ
 * canary amaçlı, tek tenant'a çivilenmiş ve fail-closed biçimde doldurur.
 *
 * KARAR MANTIĞI BU DOSYADA DEĞİL: `office-cap02-canary-provision.core.ts` (saf çekirdek).
 * Burada yalnız IO + transaction vardır.
 *
 * GÜVENLİK
 *   - Yalnız `CANARY_SAFE_TENANT_SLUGS` içindeki tenant; başka her şey FAIL_CLOSED.
 *   - Tenant'ın BOŞ olduğu kanıtlanır (canary dışı User/Case/Client sayısı = 0).
 *   - Kısmi fixture'da sessiz onarım YAPILMAZ → FAIL_CLOSED.
 *   - Parola YALNIZ `CANARY_PASSWORD` ortam değişkeninden okunur; stdout'a, log'a,
 *     dosyaya veya audit'e ASLA yazılmaz. Yalnız bcrypt hash'i saklanır.
 *   - `--apply` verilmezse hiçbir şey yazılmaz.
 *
 * KULLANIM
 *   CANARY_PASSWORD=... DATABASE_URL=... node office-cap02-canary-provision.js \
 *     --tenantId=<id> --tenantSlug=local-development-office \
 *     --canaryRunId=<a-z0-9> --authorityRef=<ref> [--apply]
 */
import { PrismaClient, CaseStatus, CaseType, LawyerRank, LegalCaseStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  buildCanaryIdentity,
  decideCanaryProvision,
  toCanaryProvisionAuditEvent,
  type CanaryProvisionInput,
  type CanaryTenantFacts,
} from './office-cap02-canary-provision.core';

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
  const input: CanaryProvisionInput = {
    tenantId: required('tenantId'),
    tenantSlug: required('tenantSlug'),
    canaryRunId: required('canaryRunId'),
    authorityRef: required('authorityRef'),
  };
  const apply = process.argv.includes('--apply');
  const identity = buildCanaryIdentity(input.canaryRunId);

  const prisma = new PrismaClient();
  try {
    // --- Snapshot: karar icin taze gercek ------------------------------------
    const [tenant, canaryUser, canaryLawyer, canaryCase, users, cases, clients] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, slug: true },
      }),
      prisma.user.findFirst({ where: { tenantId: input.tenantId, email: identity.email }, select: { id: true } }),
      prisma.lawyer.findFirst({ where: { tenantId: input.tenantId, name: identity.name }, select: { id: true } }),
      prisma.case.findFirst({
        where: { tenantId: input.tenantId, fileNumber: identity.caseReference },
        select: { id: true },
      }),
      // Canary DISINDAKI (gercek) kayitlar — bosluk KANITLANIR, varsayilmaz.
      prisma.user.count({ where: { tenantId: input.tenantId, email: { not: identity.email } } }),
      prisma.case.count({ where: { tenantId: input.tenantId, fileNumber: { not: identity.caseReference } } }),
      prisma.client.count({ where: { tenantId: input.tenantId } }),
    ]);

    const facts: CanaryTenantFacts = {
      tenant,
      nonCanaryUserCount: users,
      nonCanaryCaseCount: cases,
      nonCanaryClientCount: clients,
      existing: {
        userId: canaryUser?.id ?? null,
        lawyerId: canaryLawyer?.id ?? null,
        caseId: canaryCase?.id ?? null,
      },
    };

    const decision = decideCanaryProvision(input, facts);
    console.log('DECISION', decision.kind, '-', decision.reason);
    console.log('FACTS', JSON.stringify({
      tenantFound: tenant !== null,
      nonCanaryUsers: facts.nonCanaryUserCount,
      nonCanaryCases: facts.nonCanaryCaseCount,
      nonCanaryClients: facts.nonCanaryClientCount,
      existing: facts.existing,
    }));

    if (decision.kind === 'FAIL_CLOSED') {
      console.log('FAILURES', decision.failures.join(', '));
      process.exitCode = 2;
      return;
    }
    if (decision.kind === 'ALREADY_APPLIED') {
      console.log('RESULT ALREADY_APPLIED — fixture mevcut, yazim yapilmadi');
      console.log('FIXTURE', JSON.stringify(facts.existing));
      return;
    }
    if (!apply) {
      console.log('RESULT DRY_RUN_ONLY — --apply verilmedi, hicbir sey yazilmadi');
      return;
    }

    // Parola YALNIZ ortamdan; degeri hicbir yere yazilmaz.
    const password = process.env.CANARY_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error('CANARY_PASSWORD tanimsiz veya 16 karakterden kisa (deger loglanmaz)');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const written = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: input.tenantId,
          email: identity.email,
          passwordHash,
          name: 'CANARY',
          surname: `OFFICE-CAP02-${input.canaryRunId.toUpperCase()}`,
          role: 'ADMIN',
          isActive: true,
        },
        select: { id: true },
      });

      // PARTNER: incumbent seam'in sonucu ONCEDEN bilinsin diye (ALLOW /
      // PARTNER_SELF_AUTHORITY). Bu, ReportingLine'dan policy TURETMEZ.
      const lawyer = await tx.lawyer.create({
        data: {
          tenantId: input.tenantId,
          name: identity.name,
          surname: `CANARY-${input.canaryRunId.toUpperCase()}`,
          lawyerRank: LawyerRank.PARTNER,
          isActive: true,
          userId: user.id,
        },
        select: { id: true },
      });

      const legalCase = await tx.case.create({
        data: {
          tenantId: input.tenantId,
          fileNumber: identity.caseReference,
          type: CaseType.GENERAL_EXECUTION,
          status: CaseStatus.ACTIVE,
          // CHANGE_STATUS controller'i `caseStatus` (LegalCaseStatus) uzerinde calisir;
          // DERDEST baslangici ISLEMDE'ye gecise izin verir.
          caseStatus: LegalCaseStatus.DERDEST,
        },
        select: { id: true, status: true, caseStatus: true },
      });

      return { userId: user.id, lawyerId: lawyer.id, caseId: legalCase.id, caseStatus: legalCase.caseStatus, count: 3 };
    });

    const audit = toCanaryProvisionAuditEvent(input, decision, new Date().toISOString(), written.count);
    console.log('AUDIT', JSON.stringify(audit));
    console.log('FIXTURE', JSON.stringify({
      userId: written.userId,
      lawyerId: written.lawyerId,
      caseId: written.caseId,
      caseStatus: written.caseStatus,
    }));

    // --- Post-commit reconciliation (runner ciktisindan bagimsiz sorgular) ---
    const [afterUsers, afterCases, afterClients, afterLawyerBound] = await Promise.all([
      prisma.user.count({ where: { tenantId: input.tenantId } }),
      prisma.case.count({ where: { tenantId: input.tenantId } }),
      prisma.client.count({ where: { tenantId: input.tenantId } }),
      prisma.lawyer.count({ where: { tenantId: input.tenantId, userId: written.userId } }),
    ]);
    const pass = afterUsers === 1 && afterCases === 1 && afterClients === 0 && afterLawyerBound === 1;
    console.log('RECONCILIATION', JSON.stringify({ afterUsers, afterCases, afterClients, afterLawyerBound }));
    console.log('RESULT', pass ? 'PASS' : 'FAIL');
    if (!pass) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  // Hata mesaji parola TASIMAZ; yalnizca mesaj basilir.
  console.error('CANARY_PROVISION_ERROR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
