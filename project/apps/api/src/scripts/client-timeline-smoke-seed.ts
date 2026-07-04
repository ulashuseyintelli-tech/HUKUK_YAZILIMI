import { ClientIntakeFieldCategory, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const DEFAULT_SEED_KEY = 'client-timeline-smoke-v1';
const DEMO_TENANT_SLUG = 'demo-firma';
const DEMO_ADMIN_EMAIL = 'admin@hukuk.com';

interface ClientTimelineSmokeSeedIds {
  tenantId: string;
  actorUserId: string;
  clientId: string;
  caseId: string;
  caseClientId: string;
  intakeLinkId: string;
  intakeSubmissionId: string;
  notificationId: string;
}

interface ClientTimelineSmokeSeedResult extends ClientTimelineSmokeSeedIds {
  seedKey: string;
  route: string;
  notificationDedupeKey: string;
}

function safeSeedKey(seedKey: string): string {
  const safe = seedKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return safe || DEFAULT_SEED_KEY;
}

function fixtureIds(seedKey = DEFAULT_SEED_KEY, tenantId = 'tenant', actorUserId = 'user'): ClientTimelineSmokeSeedIds {
  const key = safeSeedKey(seedKey);
  return {
    tenantId,
    actorUserId,
    clientId: `${key}-client`,
    caseId: `${key}-case`,
    caseClientId: `${key}-case-client`,
    intakeLinkId: `${key}-intake-link`,
    intakeSubmissionId: `${key}-intake-submission`,
    notificationId: `${key}-notification`,
  };
}

export function assertClientTimelineSmokeSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Client timeline smoke seed production ortaminda calistirilamaz.');
  }
  if (env.ALLOW_CLIENT_TIMELINE_SMOKE_SEED !== '1') {
    throw new Error('Client timeline smoke seed icin ALLOW_CLIENT_TIMELINE_SMOKE_SEED=1 zorunludur.');
  }
}

export async function seedClientTimelineSmokeFixture(
  prisma: PrismaClient,
  seedKey = DEFAULT_SEED_KEY,
): Promise<ClientTimelineSmokeSeedResult> {
  const key = safeSeedKey(seedKey);
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
    select: { id: true },
  });
  if (!tenant) {
    throw new Error(`Demo tenant bulunamadi. Once pnpm db:seed calistirin: ${DEMO_TENANT_SLUG}`);
  }

  const actor = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: DEMO_ADMIN_EMAIL, isActive: true },
    select: { id: true },
  });
  if (!actor) {
    throw new Error(`Demo admin kullanicisi bulunamadi. Once pnpm db:seed calistirin: ${DEMO_ADMIN_EMAIL}`);
  }

  const ids = fixtureIds(key, tenant.id, actor.id);
  const notificationDedupeKey = `${key}:client-timeline-smoke:${ids.clientId}`;
  const tokenHash = createHash('sha256').update(`${key}:intake-link-token`).digest('hex');
  const notificationAt = new Date('2026-06-15T09:00:00.000Z');
  const intakeSubmittedAt = new Date('2026-06-15T10:00:00.000Z');

  await prisma.client.upsert({
    where: { id: ids.clientId },
    update: {
      tenantId: tenant.id,
      type: 'PERSON',
      displayName: 'Client Timeline Smoke Client',
      firstName: 'Timeline',
      lastName: 'Smoke',
      isActive: true,
    },
    create: {
      id: ids.clientId,
      tenantId: tenant.id,
      type: 'PERSON',
      displayName: 'Client Timeline Smoke Client',
      firstName: 'Timeline',
      lastName: 'Smoke',
      isActive: true,
    },
  });

  await prisma.case.upsert({
    where: { id: ids.caseId },
    update: {
      tenantId: tenant.id,
      clientId: ids.clientId,
      fileNumber: `${key}-CASE`,
      type: 'GENERAL_EXECUTION',
      currency: 'TRY',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      createdById: actor.id,
    },
    create: {
      id: ids.caseId,
      tenantId: tenant.id,
      clientId: ids.clientId,
      fileNumber: `${key}-CASE`,
      type: 'GENERAL_EXECUTION',
      currency: 'TRY',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      createdById: actor.id,
    },
  });

  await prisma.caseClient.upsert({
    where: { id: ids.caseClientId },
    update: {
      caseId: ids.caseId,
      clientId: ids.clientId,
      role: 'ALACAKLI',
      assignedById: actor.id,
    },
    create: {
      id: ids.caseClientId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      role: 'ALACAKLI',
      assignedById: actor.id,
    },
  });

  await prisma.clientIntakeLink.upsert({
    where: { id: ids.intakeLinkId },
    update: {
      tenantId: tenant.id,
      caseId: ids.caseId,
      clientId: ids.clientId,
      tokenHash,
      status: 'USED',
      scope: [ClientIntakeFieldCategory.INCOME_SOURCE, ClientIntakeFieldCategory.CONTACT],
      maxUses: 1,
      useCount: 1,
      createdById: actor.id,
    },
    create: {
      id: ids.intakeLinkId,
      tenantId: tenant.id,
      caseId: ids.caseId,
      clientId: ids.clientId,
      tokenHash,
      status: 'USED',
      scope: [ClientIntakeFieldCategory.INCOME_SOURCE, ClientIntakeFieldCategory.CONTACT],
      maxUses: 1,
      useCount: 1,
      createdById: actor.id,
    },
  });

  await prisma.clientIntakeSubmission.upsert({
    where: { id: ids.intakeSubmissionId },
    update: {
      tenantId: tenant.id,
      intakeLinkId: ids.intakeLinkId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      status: 'CLIENT_SUBMITTED',
      submittedAt: intakeSubmittedAt,
      sourceMeta: { smokeSeed: key },
    },
    create: {
      id: ids.intakeSubmissionId,
      tenantId: tenant.id,
      intakeLinkId: ids.intakeLinkId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      status: 'CLIENT_SUBMITTED',
      submittedAt: intakeSubmittedAt,
      createdAt: intakeSubmittedAt,
      sourceMeta: { smokeSeed: key },
    },
  });

  await prisma.clientNotification.upsert({
    where: { id: ids.notificationId },
    update: {
      tenantId: tenant.id,
      clientId: ids.clientId,
      caseId: ids.caseId,
      channel: 'EMAIL',
      type: 'CLIENT_TIMELINE_SMOKE',
      subject: 'Client timeline smoke notification',
      body: 'Client timeline smoke notification body.',
      status: 'SENT',
      sentAt: notificationAt,
      deliveredAt: null,
      errorMessage: null,
      sentById: actor.id,
      metadata: { smokeSeed: key },
      dedupeKey: notificationDedupeKey,
    },
    create: {
      id: ids.notificationId,
      tenantId: tenant.id,
      clientId: ids.clientId,
      caseId: ids.caseId,
      channel: 'EMAIL',
      type: 'CLIENT_TIMELINE_SMOKE',
      subject: 'Client timeline smoke notification',
      body: 'Client timeline smoke notification body.',
      status: 'SENT',
      sentAt: notificationAt,
      deliveredAt: null,
      errorMessage: null,
      sentById: actor.id,
      metadata: { smokeSeed: key },
      dedupeKey: notificationDedupeKey,
      createdAt: notificationAt,
    },
  });

  return {
    ...ids,
    seedKey: key,
    route: `/clients/${ids.clientId}`,
    notificationDedupeKey,
  };
}

async function main(): Promise<void> {
  assertClientTimelineSmokeSeedAllowed();

  const prisma = new PrismaClient();
  try {
    const result = await seedClientTimelineSmokeFixture(
      prisma,
      process.env.CLIENT_TIMELINE_SMOKE_SEED_KEY ?? DEFAULT_SEED_KEY,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
