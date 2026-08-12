/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — INVITE-ISSUE RUNNER (B03 operate, CREATE yolu).
 *
 * Owner-ratified kanonik eşleme paketindeki her aktif StaffMember için pending User +
 * UserInvite oluşturur ve profili AYNI transaction'da bağlar. Yazımı KENDİSİ YAPMAZ:
 * kanonik `UserInviteService.issue()` çağrılır (feature flag + tenant-scoped e-posta
 * tekilliği + race-safe OWN-01 bağ + audit + davet e-postası). Karar mantığı saf
 * çekirdektedir: `office-cap02-identity-binding-invite-issue.core.ts`.
 *
 * KULLANIM
 *   DATABASE_URL=... LOGIN_INVITE_PROVISIONING_ENABLED=true WEB_BASE_URL=... node \
 *     <derlenmiş runner> --input=<paket.json> --actorUserId=<adminUserId> [--apply]
 *
 * `--apply` VERİLMEZSE hiçbir şey yazılmaz: kişi başına karar + exact before/after diff
 * basılır. Tek bir FAIL_CLOSED bile varsa --apply İŞLEMEZ (paket bütünlüğü).
 *
 * ÇIKIŞ KODLARI: 0 başarı (dry-run temiz veya apply+doğrulama tamam) · 2 fail-closed ·
 * 1 runner hatası.
 */
import { readFileSync } from 'fs';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { EmailProviderService } from '../modules/notification/email-provider.service';
import { UserInviteService } from '../modules/auth/invite/user-invite.service';

import {
  buildInviteIssuePlan,
  decideInviteIssue,
  normalizeEmail,
  parseInviteIssuePackage,
  type InviteIssueDecision,
  type InviteIssueFacts,
} from './office-cap02-identity-binding-invite-issue.core';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

async function main(): Promise<void> {
  const inputPath = arg('input');
  if (!inputPath) throw new Error('INVITE_ISSUE_MISSING_ARG: --input');
  const actorUserId = arg('actorUserId');
  if (!actorUserId) throw new Error('INVITE_ISSUE_MISSING_ARG: --actorUserId');
  const apply = process.argv.includes('--apply');

  const parsed = parseInviteIssuePackage(JSON.parse(readFileSync(inputPath, 'utf8')));
  if (parsed.issues.length > 0) {
    console.log('PACKAGE_INVALID', JSON.stringify({ issues: parsed.issues }, null, 2));
    process.exitCode = 2;
    return;
  }
  const records = parsed.records;

  const prisma = new PrismaService();
  try {
    // Aktör: aktif ADMIN olmalı ve TÜM kayıtlar aktörün tenant'ında olmalı —
    // UserInviteService.issue() tenant'ı aktörden alır; sapma cross-tenant yazım demektir.
    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, tenantId: true, role: true, isActive: true },
    });
    if (!actor || !actor.isActive || actor.role !== 'ADMIN') {
      console.log('ACTOR_INVALID', JSON.stringify({ actorUserId, found: !!actor }));
      process.exitCode = 2;
      return;
    }

    const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    const tenantIdBySlug = Object.fromEntries(tenants.map((t) => [t.slug, t.id]));

    for (const record of records) {
      if (tenantIdBySlug[record.tenantSlug] !== actor.tenantId) {
        console.log(
          'ACTOR_TENANT_MISMATCH',
          JSON.stringify({ recordTenant: record.tenantSlug, staffMemberId: record.staffMemberId }),
        );
        process.exitCode = 2;
        return;
      }
    }

    // Taze gerçekler + karar (saf çekirdek).
    const factsByStaffId: Record<string, InviteIssueFacts> = {};
    const decisions: InviteIssueDecision[] = [];
    for (const record of records) {
      const tenantId = tenantIdBySlug[record.tenantSlug] ?? null;
      const staff = await prisma.staffMember.findUnique({
        where: { id: record.staffMemberId },
        select: { id: true, tenantId: true, isActive: true, userId: true, email: true },
      });
      const boundUser = staff?.userId
        ? await prisma.user.findUnique({ where: { id: staff.userId }, select: { email: true } })
        : null;
      const existingUser = tenantId
        ? await prisma.user.findFirst({
            where: { tenantId, email: normalizeEmail(record.canonicalEmail) },
            select: { id: true },
          })
        : null;

      const facts: InviteIssueFacts = {
        tenantId,
        staff: staff
          ? {
              staffMemberId: staff.id,
              tenantId: staff.tenantId,
              isActive: staff.isActive,
              userId: staff.userId,
              profileEmail: staff.email ? normalizeEmail(staff.email) : null,
            }
          : null,
        existingUserIdWithEmail: existingUser?.id ?? null,
        boundUserEmail: boundUser ? normalizeEmail(boundUser.email) : null,
      };
      factsByStaffId[record.staffMemberId] = facts;
      decisions.push(decideInviteIssue(record, facts));
    }

    const plan = buildInviteIssuePlan(records, decisions, factsByStaffId);
    console.log('INVITE_ISSUE_PLAN', JSON.stringify(plan, null, 2));

    if (!plan.executable) {
      console.log('FAIL_CLOSED_PRESENT', 'hiçbir yazım yapılmadı');
      process.exitCode = 2;
      return;
    }
    if (!apply) {
      console.log('DRY_RUN_ONLY', 'yazım için --apply gerekir');
      return;
    }

    // --apply: feature flag açık olmalı (yalnız BU process'in env'i — runtime'a dokunulmaz).
    if (String(process.env.LOGIN_INVITE_PROVISIONING_ENABLED ?? '').toLowerCase() !== 'true') {
      console.log('FLAG_DISABLED', 'LOGIN_INVITE_PROVISIONING_ENABLED=true değil; yazım yapılmadı');
      process.exitCode = 2;
      return;
    }

    const config = new ConfigService();
    const audit = new AuditService(prisma);
    const email = new EmailProviderService(config);
    const inviteService = new UserInviteService(prisma, audit, email, config);

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const decision = decisions[i];
      if (decision.kind === 'ALREADY_APPLIED') {
        console.log('SKIP_ALREADY_APPLIED', record.staffMemberId);
        continue;
      }
      const result = await inviteService.issue(
        { id: actor.id, tenantId: actor.tenantId, role: actor.role },
        {
          email: normalizeEmail(record.canonicalEmail),
          name: record.userName,
          surname: record.userSurname,
          role: record.userRole,
          staffMemberId: record.staffMemberId,
        },
      );
      console.log(
        'ISSUE_RESULT',
        JSON.stringify({ staffMemberId: record.staffMemberId, ...result }),
      );
    }

    // Kişi bazlı post-operate doğrulama: bağ + pending hesap + açık davet.
    let verificationFailures = 0;
    for (const record of records) {
      const staff = await prisma.staffMember.findUnique({
        where: { id: record.staffMemberId },
        select: { id: true, userId: true, email: true, isActive: true },
      });
      const user = staff?.userId
        ? await prisma.user.findUnique({
            where: { id: staff.userId },
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
              passwordHash: true,
              tenantId: true,
              staffMember: { select: { id: true } },
              lawyer: { select: { id: true } },
            },
          })
        : null;
      const invites = user
        ? await prisma.userInvite.findMany({
            where: { userId: user.id },
            select: { id: true, email: true, consumedAt: true, revokedAt: true, expiresAt: true },
          })
        : [];
      const openInvites = invites.filter((i) => !i.consumedAt && !i.revokedAt);

      const canonical = normalizeEmail(record.canonicalEmail);
      const ok =
        !!staff &&
        !!user &&
        user.tenantId === actor.tenantId &&
        normalizeEmail(user.email) === canonical &&
        user.role === record.userRole &&
        user.isActive === false &&
        user.passwordHash === null &&
        user.staffMember?.id === record.staffMemberId &&
        user.lawyer === null &&
        (staff.email ? normalizeEmail(staff.email) : null) === canonical &&
        openInvites.length === 1 &&
        normalizeEmail(openInvites[0].email) === canonical;

      if (!ok) verificationFailures += 1;
      console.log(
        'PERSON_VERIFICATION',
        JSON.stringify({
          staffMemberId: record.staffMemberId,
          canonicalEmail: canonical,
          ok,
          staffUserId: staff?.userId ?? null,
          userId: user?.id ?? null,
          userRole: user?.role ?? null,
          userPendingInactive: user ? user.isActive === false && user.passwordHash === null : null,
          boundBackToSameStaff: user?.staffMember?.id === record.staffMemberId,
          openInviteCount: openInvites.length,
          inviteExpiresAt: openInvites[0]?.expiresAt?.toISOString() ?? null,
        }),
      );
    }

    console.log('VERIFICATION', verificationFailures === 0 ? 'PASS' : 'FAIL');
    if (verificationFailures > 0) process.exitCode = 3;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'INVITE_ISSUE_RUNNER_ERROR',
    error instanceof Error ? `${error.name}: ${error.message}` : error,
  );
  process.exitCode = 1;
});
