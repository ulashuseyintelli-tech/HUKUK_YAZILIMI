/**
 * OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-OPERATE-I01 — kontrollü operasyon runner'ı.
 *
 * Owner-onaylı tek bir personel profili ↔ User bağını production'da kurar. Doğrudan SQL
 * UPDATE ile DEĞİL; application veri katmanı (Prisma) üzerinden, transaction içinde,
 * satır kilidiyle ve koşullu yazımla çalışır.
 *
 * Karar mantığı bu dosyada DEĞİLDİR — `office-cap02-identity-binding-operate.core.ts`
 * içindeki saf `decideIdentityBinding()` verir. Runner yalnız: kilitle, oku, karara sor,
 * karara uy, kanıt üret.
 *
 * KULLANIM
 *   DATABASE_URL=... node -r ts-node/register \
 *     src/scripts/office-cap02-identity-binding-operate.ts \
 *     --tenantId=<id> --profileType=LAWYER --profileId=<id> --targetUserId=<id> \
 *     --authorityRef=<ref> --expectedProfileUpdatedAt=<iso> --expectedUserUpdatedAt=<iso> \
 *     [--apply]
 *
 * `--apply` VERİLMEZSE hiçbir şey yazılmaz: kararı ve reconciliation ön-görüsünü basar.
 * Varsayılan davranış DRY-RUN'dır; production yazımı açık niyet gerektirir.
 */
import { PrismaClient, Prisma } from '@prisma/client';

import {
  decideIdentityBinding,
  reconcileIdentityBinding,
  toIdentityBindingAuditEvent,
  type BindingFacts,
  type BindingOperationInput,
  type BindingProfileType,
  type LockedProfileRow,
  type LockedUserRow,
} from './office-cap02-identity-binding-operate.core';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const required = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`IDENTITY_BINDING_MISSING_ARG: --${name}`);
  return value;
};

const iso = (value: Date): string => value.toISOString();

/** Prisma tarafında tablo adları PascalCase quoted; profil tipine göre seçilir. */
const profileTable = (t: BindingProfileType) => (t === 'LAWYER' ? 'Lawyer' : 'StaffMember');

async function main(): Promise<void> {
  const input: BindingOperationInput = {
    tenantId: required('tenantId'),
    profileType: required('profileType') as BindingProfileType,
    profileId: required('profileId'),
    targetUserId: required('targetUserId'),
    authorityRef: required('authorityRef'),
    expectedProfileUpdatedAt: required('expectedProfileUpdatedAt'),
    expectedUserUpdatedAt: required('expectedUserUpdatedAt'),
  };
  const apply = process.argv.includes('--apply');

  if (input.profileType !== 'LAWYER' && input.profileType !== 'STAFF_MEMBER') {
    throw new Error(`IDENTITY_BINDING_INVALID_PROFILE_TYPE: ${input.profileType}`);
  }

  const prisma = new PrismaClient();
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const table = profileTable(input.profileType);

      // Satır kilidi: karar verilirken profil ve User başka bir işlem tarafından
      // değiştirilemez. Prisma'nın tip-güvenli API'sinde FOR UPDATE yok; kilit için
      // parametreli raw SELECT kullanılır — yazım yine Prisma API'siyle yapılır.
      const lockedProfiles = await tx.$queryRaw<
        Array<{ id: string; tenantId: string; isActive: boolean; userId: string | null; updatedAt: Date }>
      >(
        Prisma.sql`SELECT id, "tenantId", "isActive", "userId", "updatedAt"
                   FROM ${Prisma.raw(`"${table}"`)}
                   WHERE id = ${input.profileId}
                   FOR UPDATE`,
      );
      const lockedUsers = await tx.$queryRaw<
        Array<{ id: string; tenantId: string; isActive: boolean; updatedAt: Date }>
      >(
        Prisma.sql`SELECT id, "tenantId", "isActive", "updatedAt"
                   FROM "User"
                   WHERE id = ${input.targetUserId}
                   FOR UPDATE`,
      );

      const profile: LockedProfileRow | null = lockedProfiles[0]
        ? {
            profileType: input.profileType,
            profileId: lockedProfiles[0].id,
            tenantId: lockedProfiles[0].tenantId,
            isActive: lockedProfiles[0].isActive,
            userId: lockedProfiles[0].userId,
            updatedAt: iso(lockedProfiles[0].updatedAt),
          }
        : null;

      const targetUser: LockedUserRow | null = lockedUsers[0]
        ? {
            userId: lockedUsers[0].id,
            tenantId: lockedUsers[0].tenantId,
            isActive: lockedUsers[0].isActive,
            updatedAt: iso(lockedUsers[0].updatedAt),
          }
        : null;

      const [otherLawyers, staffBindings] = await Promise.all([
        tx.lawyer.findMany({ where: { userId: input.targetUserId }, select: { id: true } }),
        tx.staffMember.findMany({ where: { userId: input.targetUserId }, select: { id: true } }),
      ]);

      const facts: BindingFacts = {
        profile,
        targetUser,
        otherLawyerBindings: otherLawyers.map((r) => r.id),
        staffMemberBindings: staffBindings.map((r) => r.id),
      };

      const decision = decideIdentityBinding(input, facts);

      if (decision.kind !== 'APPLY' || !apply) {
        return { decision, mutatedRows: 0 };
      }

      // Koşullu yazım: karar anındaki varsayımlar WHERE'de tekrar edilir. Satır bu
      // arada değiştiyse updateMany 0 döner ve transaction geri alınır.
      const where = {
        id: input.profileId,
        tenantId: input.tenantId,
        isActive: true,
        userId: null,
      } as const;
      const data = { userId: input.targetUserId };

      const result =
        input.profileType === 'LAWYER'
          ? await tx.lawyer.updateMany({ where, data })
          : await tx.staffMember.updateMany({ where, data });

      if (result.count !== 1) {
        throw new Error(
          `IDENTITY_BINDING_CONDITIONAL_UPDATE_FAILED: beklenen 1 satir, gerceklesen ${result.count}`,
        );
      }
      return { decision, mutatedRows: result.count };
    });

    const occurredAt = new Date().toISOString();
    const audit = toIdentityBindingAuditEvent(input, outcome.decision, occurredAt);
    console.log('AUDIT', JSON.stringify(audit));
    console.log('DECISION', outcome.decision.kind, '-', outcome.decision.reason);
    console.log('MUTATED_ROWS', outcome.mutatedRows);

    if (outcome.decision.kind === 'FAIL_CLOSED') {
      console.log('FAILURES', outcome.decision.failures.join(', '));
      process.exitCode = 2;
      return;
    }

    // Post-commit reconciliation — yazım yapılmadıysa da mevcut durumu doğrular.
    const [profileAfter, lawyerBindings, staffBindings, crossTenant, duplicates, inactiveDup] =
      await Promise.all([
        input.profileType === 'LAWYER'
          ? prisma.lawyer.findUnique({ where: { id: input.profileId }, select: { userId: true } })
          : prisma.staffMember.findUnique({
              where: { id: input.profileId },
              select: { userId: true },
            }),
        prisma.lawyer.findMany({ where: { userId: input.targetUserId }, select: { id: true } }),
        prisma.staffMember.findMany({ where: { userId: input.targetUserId }, select: { id: true } }),
        prisma.$queryRaw<Array<{ n: bigint }>>(
          Prisma.sql`SELECT count(*)::bigint AS n FROM "Lawyer" l
                     JOIN "User" u ON u.id = l."userId"
                     WHERE u."tenantId" <> l."tenantId"`,
        ),
        prisma.$queryRaw<Array<{ n: bigint }>>(
          Prisma.sql`SELECT count(*)::bigint AS n FROM (
                       SELECT "userId" FROM "Lawyer" WHERE "userId" IS NOT NULL
                       GROUP BY 1 HAVING count(*) > 1
                     ) x`,
        ),
        arg('inactiveDuplicateUserId')
          ? prisma.user.findUnique({
              where: { id: arg('inactiveDuplicateUserId') as string },
              select: { isActive: true },
            })
          : Promise.resolve(null),
      ]);

    const inactiveDuplicateOk = arg('inactiveDuplicateUserId')
      ? inactiveDup !== null &&
        inactiveDup.isActive === false &&
        (await prisma.lawyer.count({ where: { userId: arg('inactiveDuplicateUserId') as string } })) === 0
      : true;

    const reconciliation = reconcileIdentityBinding(input, {
      profileUserId: profileAfter?.userId ?? null,
      lawyerBindingsForTargetUser: lawyerBindings.map((r) => r.id),
      staffBindingsForTargetUser: staffBindings.map((r) => r.id),
      crossTenantBindingCount: Number(crossTenant[0]?.n ?? 0n),
      duplicateUserBindingCount: Number(duplicates[0]?.n ?? 0n),
      inactiveDuplicateStillInactiveAndUnbound: inactiveDuplicateOk,
    });

    console.log('RECONCILIATION', reconciliation.pass ? 'PASS' : 'FAIL');
    if (!reconciliation.pass) {
      console.log('PROBLEMS', reconciliation.problems.join(' | '));
      process.exitCode = 3;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('IDENTITY_BINDING_RUNNER_ERROR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
