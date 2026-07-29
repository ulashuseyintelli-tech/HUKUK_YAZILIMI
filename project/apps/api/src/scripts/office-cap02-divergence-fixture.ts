/**
 * OFFICE-P2-CAP02-HIERARCHY-DIVERGENCE-EVIDENCE-R02 — kontrollü fixture runner.
 *
 * Dört sentetik aktörü (User+Lawyer+Case) TEK transaction içinde yazar. Karar
 * mantığı BU DOSYADA DEĞİL: `office-cap02-divergence-fixture.core.ts`.
 *
 * NE YAPMAZ
 *   - ReportingLine YAZMAZ. Graph, kanonik `/reporting-lines/{top-level,assign}`
 *     yüzeyinden kurulur (owner §8). Bu runner yalnız principal+Case üretir.
 *   - Legacy (R01-G/H) satırlarına DOKUNMAZ; onları diriltmez, silmez.
 *   - Hiçbir statü değiştirmez; CHANGE_STATUS ayrı ve gerçek controller yolundadır.
 *
 * GÜVENLİK
 *   - Yalnız `CANARY_SAFE_TENANT_SLUGS` içindeki tenant; başka her şey FAIL_CLOSED.
 *   - Beklenen fixture + BEYAN EDİLEN legacy satırlar dışında tek kayıt varsa FAIL_CLOSED.
 *   - Parola YALNIZ `CANARY_PASSWORD` ortam değişkeninden okunur; stdout/stderr/
 *     log/dosya/audit'e ASLA yazılmaz. Yalnız bcrypt hash'i saklanır. Dört sentetik
 *     hesap aynı tek-kullanımlık parolayı paylaşır: tek imha adımıyla birlikte
 *     çürütülür ve ele alma yüzeyi dörde katlanmaz (bilinçli bounded karar).
 *   - `--apply` verilmezse hiçbir şey yazılmaz.
 *
 * KULLANIM
 *   CANARY_PASSWORD=... DATABASE_URL=... node office-cap02-divergence-fixture.js \
 *     --tenantId=<id> --runId=<a-z0-9> --authorityRef=<ref> \
 *     --legacyUserIds=<id,id> --legacyLawyerIds=<id,id> --legacyCaseIds=<id,id> [--apply]
 */
import { PrismaClient, CaseStatus, CaseType, LawyerRank, LegalCaseStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  buildDivergenceIdentities,
  decideDivergenceFixture,
  toDivergenceFixtureAuditEvent,
  DIVERGENCE_ACTOR_MATRIX,
  DIVERGENCE_FIXTURE_PART_TOTAL,
  type DivergenceFixtureFacts,
} from './office-cap02-divergence-fixture.core';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const required = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`DIVERGENCE_MISSING_ARG: --${name}`);
  return value;
};
const list = (name: string): string[] =>
  (arg(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

async function main(): Promise<void> {
  const tenantId = required('tenantId');
  const runId = required('runId');
  const authorityRef = required('authorityRef');
  // Beyan edilen legacy satirlar: R01-G/H fixture'i. Bunlar "beklenen" sayilir
  // ama PASIF olmak zorundadir (cekirdek dogrular).
  const legacyUserIds = list('legacyUserIds');
  const legacyLawyerIds = list('legacyLawyerIds');
  const legacyCaseIds = list('legacyCaseIds');
  const apply = process.argv.includes('--apply');

  const identities = buildDivergenceIdentities(runId);
  const emails = identities.map((i) => i.email);
  const lawyerNames = identities.map((i) => i.lawyerName);
  const caseRefs = identities.map((i) => i.caseReference);

  const prisma = new PrismaClient();
  try {
    // --- Snapshot: karar icin taze gercek ------------------------------------
    const [
      tenant,
      fixtureUsers,
      fixtureLawyers,
      fixtureCases,
      undeclaredUsers,
      undeclaredLawyers,
      undeclaredCases,
      clients,
      staff,
      activeLegacyUsers,
      activeLegacyLawyers,
      activeReportingLines,
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } }),
      prisma.user.count({ where: { tenantId, email: { in: emails } } }),
      prisma.lawyer.count({ where: { tenantId, name: { in: lawyerNames } } }),
      prisma.case.count({ where: { tenantId, fileNumber: { in: caseRefs } } }),
      prisma.user.count({ where: { tenantId, email: { notIn: emails }, id: { notIn: legacyUserIds } } }),
      prisma.lawyer.count({ where: { tenantId, name: { notIn: lawyerNames }, id: { notIn: legacyLawyerIds } } }),
      prisma.case.count({ where: { tenantId, fileNumber: { notIn: caseRefs }, id: { notIn: legacyCaseIds } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.staffMember.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, id: { in: legacyUserIds }, isActive: true } }),
      prisma.lawyer.count({ where: { tenantId, id: { in: legacyLawyerIds }, isActive: true } }),
      prisma.reportingLine.count({ where: { tenantId, validUntil: null } }),
    ]);

    const facts: DivergenceFixtureFacts = {
      tenant,
      existingFixturePartCount: fixtureUsers + fixtureLawyers + fixtureCases,
      undeclaredUserCount: undeclaredUsers,
      undeclaredLawyerCount: undeclaredLawyers,
      undeclaredCaseCount: undeclaredCases,
      clientCount: clients,
      staffCount: staff,
      activeLegacyPrincipalCount: activeLegacyUsers + activeLegacyLawyers,
      activeReportingLineCount: activeReportingLines,
    };

    const decision = decideDivergenceFixture({ tenantId, runId }, facts);
    console.log('DECISION', decision.kind, '-', decision.reason);
    console.log('FACTS', JSON.stringify({
      tenantFound: tenant !== null,
      existingFixtureParts: `${facts.existingFixturePartCount}/${DIVERGENCE_FIXTURE_PART_TOTAL}`,
      undeclaredUsers,
      undeclaredLawyers,
      undeclaredCases,
      clients,
      staff,
      activeLegacyPrincipals: facts.activeLegacyPrincipalCount,
      activeReportingLines,
    }));

    if (decision.kind === 'FAIL_CLOSED') {
      console.log('FAILURES', decision.failures.join(', '));
      console.log('MUTATED_ROWS 0');
      process.exitCode = 2;
      return;
    }
    if (decision.kind === 'ALREADY_APPLIED') {
      console.log('RESULT ALREADY_APPLIED — fixture mevcut, yazim yapilmadi');
      console.log('MUTATED_ROWS 0');
      console.log('NOT: mevcut parola bilinmez; login zincirine devam etmeden once rotasyon gerekir.');
      return;
    }
    if (!apply) {
      console.log('RESULT DRY_RUN_ONLY — --apply verilmedi, hicbir sey yazilmadi');
      console.log('MUTATED_ROWS 0');
      return;
    }

    const password = process.env.CANARY_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error('CANARY_PASSWORD tanimsiz veya 16 karakterden kisa (deger loglanmaz)');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const written = await prisma.$transaction(async (tx) => {
      const out: { key: string; userId: string; lawyerId: string; caseId: string }[] = [];
      for (const profile of DIVERGENCE_ACTOR_MATRIX) {
        const identity = identities.find((i) => i.key === profile.key)!;
        const user = await tx.user.create({
          data: {
            tenantId,
            email: identity.email,
            passwordHash,
            name: 'CANARY',
            surname: `DIVERGENCE-${profile.key}-${runId.toUpperCase()}`,
            role: profile.userRole === 'ADMIN' ? UserRole.ADMIN : UserRole.USER,
            isActive: true,
          },
          select: { id: true },
        });
        const lawyer = await tx.lawyer.create({
          data: {
            tenantId,
            name: identity.lawyerName,
            surname: `DIVERGENCE-${profile.key}`,
            // Rutbe, YURURLUKTEKI incumbent seam'in sonucunu belirler; yeni policy
            // uretmez (PARTNER → SELF_AUTHORITY, AUTHORIZED → REQUIRES_APPROVAL).
            lawyerRank: profile.lawyerRank === 'PARTNER' ? LawyerRank.PARTNER : LawyerRank.AUTHORIZED,
            // Delege onaycilik KAPALI: aksi halde incumbent reasonCode degisir ve
            // olcum niyeti bulanir.
            canApproveOfficeActions: false,
            isActive: true,
            userId: user.id,
          },
          select: { id: true },
        });
        const legalCase = await tx.case.create({
          data: {
            tenantId,
            fileNumber: identity.caseReference,
            type: CaseType.GENERAL_EXECUTION,
            status: CaseStatus.ACTIVE,
            // Her aktore AYRI Case: resource-ownership ve audit belirsizligi olmaz.
            caseStatus: LegalCaseStatus.DERDEST,
          },
          select: { id: true },
        });
        out.push({ key: profile.key, userId: user.id, lawyerId: lawyer.id, caseId: legalCase.id });
      }
      return out;
    });

    const committed = written.length * 3;
    const audit = toDivergenceFixtureAuditEvent(
      { tenantId, runId, authorityRef },
      decision,
      new Date().toISOString(),
      committed,
    );
    console.log('AUDIT', JSON.stringify(audit));
    console.log(`MUTATED_ROWS ${committed}`);
    for (const w of written) {
      console.log(`FIXTURE_${w.key} ` + JSON.stringify(w));
    }

    // --- Post-commit reconciliation (bagimsiz taze sorgular) ------------------
    const [afterUsers, afterLawyers, afterCases, afterClients, afterLines] = await Promise.all([
      prisma.user.count({ where: { tenantId, email: { in: emails }, isActive: true } }),
      prisma.lawyer.count({ where: { tenantId, name: { in: lawyerNames }, isActive: true } }),
      prisma.case.count({ where: { tenantId, fileNumber: { in: caseRefs } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.reportingLine.count({ where: { tenantId, validUntil: null } }),
    ]);
    const pass =
      afterUsers === 4 && afterLawyers === 4 && afterCases === 4 && afterClients === 0 && afterLines === 0;
    console.log('RECONCILIATION', JSON.stringify({
      activeFixtureUsers: afterUsers,
      activeFixtureLawyers: afterLawyers,
      fixtureCases: afterCases,
      clients: afterClients,
      // Graph HENUZ kurulmadi: bu runner ReportingLine YAZMAZ.
      activeReportingLines: afterLines,
    }));
    console.log('RESULT', pass ? 'PASS' : 'FAIL');
    if (!pass) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  // Hata mesaji parola/hash TASIMAZ; exception dump YOK.
  console.error('DIVERGENCE_FIXTURE_ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
