/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — DRY-RUN RUNNER (SALT OKUMA).
 *
 * Owner-onaylı girdi paketini canlı repository snapshot'ına karşı doğrular ve owner'a
 * sunulacak deterministik operate planını üretir. HİÇBİR YAZIM YAPMAZ — Prisma'dan
 * yalnız findMany okumaları yapılır; karar mantığının tamamı saf çekirdeklerdedir:
 *
 *   doğrulama : office-cap02-identity-binding-dry-run.core.ts  (dryRunIdentityBinding)
 *   plan      : office-cap02-identity-binding-plan.core.ts     (parse + buildOperatePlan)
 *
 * KULLANIM
 *   DATABASE_URL=... node -r ts-node/register \
 *     src/scripts/office-cap02-identity-binding-dry-run.ts \
 *     --input=<paket.json> [--authorityRef=<ref>]
 *
 * ÇIKIŞ KODLARI
 *   0 → paket geçerli, dry-run FAIL'siz (eligibleForOperate=true)
 *   2 → girdi paketi yapısal olarak geçersiz (fail-closed, dry-run HİÇ koşmadı)
 *   3 → dry-run en az bir FAIL üretti (eligibleForOperate=false)
 *
 * D1 SIRASI KORUNUR: bu runner'ın çıktısı owner onayına sunulur; operate ANCAK owner
 * diff'i onayladıktan sonra ayrı runner'la (bind) veya kanonik auth/invite akışıyla
 * (create) çalıştırılır. Bu dosya operate ÇAĞIRMAZ.
 */
import { readFileSync } from 'fs';

import { PrismaClient } from '@prisma/client';

import {
  assertNoForbiddenSecretFields,
  dryRunIdentityBinding,
  type RepositorySnapshot,
} from './office-cap02-identity-binding-dry-run.core';
import {
  buildOperatePlan,
  parseBindingInputPackage,
  type OperatePlanContext,
} from './office-cap02-identity-binding-plan.core';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const iso = (value: Date): string => value.toISOString();

async function main(): Promise<void> {
  const inputPath = arg('input');
  if (!inputPath) throw new Error('IDENTITY_BINDING_DRY_RUN_MISSING_ARG: --input');
  const authorityRef = arg('authorityRef') ?? null;

  const rawText = readFileSync(inputPath, 'utf8');
  const rawJson: unknown = JSON.parse(rawText);

  // Gizlilik sınırı: paket ham TCKN/IBAN/parola/token taşıyorsa hiçbir şey koşmadan dur.
  if (Array.isArray(rawJson)) {
    assertNoForbiddenSecretFields(
      rawJson.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null),
    );
  }

  const parsed = parseBindingInputPackage(rawJson);
  if (parsed.issues.length > 0) {
    console.log('PACKAGE_INVALID', JSON.stringify({ issues: parsed.issues }, null, 2));
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    // Snapshot: çekirdek sözleşmesi gereği TABLOLARIN TAMAMI verilir (e-posta tekilliği ve
    // ters bağ index'i kısmi snapshot'la yanlış-negatif üretirdi). Ölçek küçük (≤ yüzler).
    const [tenants, lawyers, staffMembers, users] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, slug: true } }),
      prisma.lawyer.findMany({
        select: { id: true, tenantId: true, isActive: true, userId: true, updatedAt: true },
      }),
      prisma.staffMember.findMany({
        select: { id: true, tenantId: true, isActive: true, userId: true, updatedAt: true },
      }),
      prisma.user.findMany({
        select: { id: true, tenantId: true, isActive: true, email: true, updatedAt: true },
      }),
    ]);

    const snapshot: RepositorySnapshot = {
      tenantIdBySlug: Object.fromEntries(tenants.map((t) => [t.slug, t.id])),
      profiles: [
        ...lawyers.map((l) => ({
          profileType: 'LAWYER' as const,
          profileId: l.id,
          tenantId: l.tenantId,
          isActive: l.isActive,
          boundUserId: l.userId,
        })),
        ...staffMembers.map((s) => ({
          profileType: 'STAFF_MEMBER' as const,
          profileId: s.id,
          tenantId: s.tenantId,
          isActive: s.isActive,
          boundUserId: s.userId,
        })),
      ],
      users: users.map((u) => ({
        userId: u.id,
        tenantId: u.tenantId,
        isActive: u.isActive,
        email: u.email.trim().toLowerCase(),
      })),
    };

    const report = dryRunIdentityBinding(parsed.records, snapshot);

    const planCtx: OperatePlanContext = {
      tenantIdBySlug: snapshot.tenantIdBySlug,
      profileUpdatedAtByKey: Object.fromEntries([
        ...lawyers.map((l) => [`LAWYER:${l.id}`, iso(l.updatedAt)] as const),
        ...staffMembers.map((s) => [`STAFF_MEMBER:${s.id}`, iso(s.updatedAt)] as const),
      ]),
      userUpdatedAtById: Object.fromEntries(users.map((u) => [u.id, iso(u.updatedAt)] as const)),
      authorityRef,
    };
    const plan = buildOperatePlan(parsed.records, report, planCtx);

    // Kanıt çıktısı: rapor + plan. Snapshot'ın kendisi (tüm kullanıcı e-postaları vb.)
    // BASILMAZ — çıktı yalnız pakete konu kayıtları ve sayaçları taşır.
    console.log(
      'DRY_RUN_REPORT',
      JSON.stringify(
        {
          measured: {
            tenants: tenants.length,
            lawyers: lawyers.length,
            staffMembers: staffMembers.length,
            users: users.length,
          },
          report,
          plan,
        },
        null,
        2,
      ),
    );
    console.log('ELIGIBLE_FOR_OPERATE', report.eligibleForOperate);
    console.log('PLAN_EXECUTABLE', plan.executable);

    if (!report.eligibleForOperate) {
      process.exitCode = 3;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'IDENTITY_BINDING_DRY_RUN_RUNNER_ERROR',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
