import { ClientIntakeFieldCategory, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const DEFAULT_SEED_KEY = 'client-workspace-live-smoke-v1';
const DEMO_TENANT_SLUG = 'demo-firma';
const DEMO_ADMIN_EMAIL = 'admin@hukuk.com';

interface ClientWorkspaceLiveSmokeSeedIds {
  tenantId: string;
  actorUserId: string;
  clientId: string;
  clientContactId: string;
  caseId: string;
  caseClientId: string;
  poaId: string;
  intakeLinkId: string;
  intakeSubmissionId: string;
  notificationId: string;
}

interface ClientWorkspaceLiveSmokeSeedResult extends ClientWorkspaceLiveSmokeSeedIds {
  seedKey: string;
  mode: 'seed';
  route: string;
  tenantSlug: string;
  actorEmail: string;
  notificationDedupeKey: string;
  smokeEnv: {
    CLIENT_WORKSPACE_LIVE_SMOKE: '1';
    CLIENT_WORKSPACE_SMOKE_CLIENT_ID: string;
    CLIENT_WORKSPACE_SMOKE_EMAIL: string;
    CLIENT_WORKSPACE_SMOKE_PASSWORD: '<set-from-demo-seed-or-secret>';
  };
}

interface ClientWorkspaceLiveSmokeCleanupResult extends ClientWorkspaceLiveSmokeSeedIds {
  seedKey: string;
  mode: 'cleanup';
  tenantSlug: string;
  actorEmail: string;
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

function fixtureIds(seedKey = DEFAULT_SEED_KEY, tenantId = 'tenant', actorUserId = 'user'): ClientWorkspaceLiveSmokeSeedIds {
  const key = safeSeedKey(seedKey);
  return {
    tenantId,
    actorUserId,
    clientId: `${key}-client`,
    clientContactId: `${key}-client-email`,
    caseId: `${key}-case`,
    caseClientId: `${key}-case-client`,
    poaId: `${key}-poa`,
    intakeLinkId: `${key}-intake-link`,
    intakeSubmissionId: `${key}-intake-submission`,
    notificationId: `${key}-notification`,
  };
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

export function assertClientWorkspaceLiveSmokeSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Client Workspace live smoke seed production ortaminda calistirilamaz.');
  }
  if (env.ALLOW_CLIENT_WORKSPACE_LIVE_SMOKE_SEED !== '1') {
    throw new Error('Client Workspace live smoke seed icin ALLOW_CLIENT_WORKSPACE_LIVE_SMOKE_SEED=1 zorunludur.');
  }
}

async function resolveDemoContext(prisma: PrismaClient, seedKey: string): Promise<ClientWorkspaceLiveSmokeSeedIds> {
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

  return fixtureIds(seedKey, tenant.id, actor.id);
}

export async function cleanupClientWorkspaceLiveSmokeFixture(
  prisma: PrismaClient,
  seedKey = DEFAULT_SEED_KEY,
): Promise<ClientWorkspaceLiveSmokeCleanupResult> {
  const key = safeSeedKey(seedKey);
  const ids = await resolveDemoContext(prisma, key);

  await prisma.clientDocumentRequest.deleteMany({ where: { tenantId: ids.tenantId, clientId: ids.clientId } });
  await prisma.clientIntakeLinkDelivery.deleteMany({ where: { tenantId: ids.tenantId, clientId: ids.clientId } });
  await prisma.clientIntakeSubmission.deleteMany({ where: { id: ids.intakeSubmissionId } });
  await prisma.clientIntakeLink.deleteMany({ where: { id: ids.intakeLinkId } });
  await prisma.clientNotification.deleteMany({ where: { id: ids.notificationId } });
  await prisma.clientPowerOfAttorney.deleteMany({ where: { id: ids.poaId } });
  await prisma.clientContact.deleteMany({ where: { id: ids.clientContactId } });
  await prisma.caseClient.deleteMany({ where: { id: ids.caseClientId } });
  await prisma.case.deleteMany({ where: { id: ids.caseId } });
  await prisma.client.deleteMany({ where: { id: ids.clientId } });

  return {
    ...ids,
    seedKey: key,
    mode: 'cleanup',
    tenantSlug: DEMO_TENANT_SLUG,
    actorEmail: DEMO_ADMIN_EMAIL,
  };
}

export async function seedClientWorkspaceLiveSmokeFixture(
  prisma: PrismaClient,
  seedKey = DEFAULT_SEED_KEY,
): Promise<ClientWorkspaceLiveSmokeSeedResult> {
  const key = safeSeedKey(seedKey);
  const ids = await resolveDemoContext(prisma, key);
  const notificationDedupeKey = `${key}:client-workspace-live-smoke:${ids.clientId}`;
  const tokenHash = createHash('sha256').update(`${key}:intake-link-token`).digest('hex');
  const notificationAt = new Date('2026-06-15T09:00:00.000Z');
  const intakeSubmittedAt = new Date('2026-06-15T10:00:00.000Z');

  await prisma.client.upsert({
    where: { id: ids.clientId },
    update: {
      tenantId: ids.tenantId,
      type: 'PERSON',
      displayName: 'Client Workspace Live Smoke Client',
      firstName: 'Workspace',
      lastName: 'Smoke',
      email: 'client-workspace-live-smoke@example.test',
      phone: '+905551110000',
      isActive: true,
    },
    create: {
      id: ids.clientId,
      tenantId: ids.tenantId,
      type: 'PERSON',
      displayName: 'Client Workspace Live Smoke Client',
      firstName: 'Workspace',
      lastName: 'Smoke',
      email: 'client-workspace-live-smoke@example.test',
      phone: '+905551110000',
      isActive: true,
    },
  });

  await prisma.clientContact.upsert({
    where: { id: ids.clientContactId },
    update: {
      clientId: ids.clientId,
      type: 'EMAIL',
      value: 'client-workspace-live-smoke@example.test',
      label: 'Smoke',
      isPrimary: true,
    },
    create: {
      id: ids.clientContactId,
      clientId: ids.clientId,
      type: 'EMAIL',
      value: 'client-workspace-live-smoke@example.test',
      label: 'Smoke',
      isPrimary: true,
    },
  });

  await prisma.case.upsert({
    where: { id: ids.caseId },
    update: {
      tenantId: ids.tenantId,
      clientId: ids.clientId,
      fileNumber: `${key}-CASE`,
      type: 'GENERAL_EXECUTION',
      currency: 'TRY',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      createdById: ids.actorUserId,
    },
    create: {
      id: ids.caseId,
      tenantId: ids.tenantId,
      clientId: ids.clientId,
      fileNumber: `${key}-CASE`,
      type: 'GENERAL_EXECUTION',
      currency: 'TRY',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      createdById: ids.actorUserId,
    },
  });

  await prisma.caseClient.upsert({
    where: { id: ids.caseClientId },
    update: {
      caseId: ids.caseId,
      clientId: ids.clientId,
      role: 'ALACAKLI',
      assignedById: ids.actorUserId,
    },
    create: {
      id: ids.caseClientId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      role: 'ALACAKLI',
      assignedById: ids.actorUserId,
    },
  });

  await prisma.clientPowerOfAttorney.upsert({
    where: { id: ids.poaId },
    update: {
      clientId: ids.clientId,
      notaryName: 'Smoke Noterligi',
      notaryCity: 'Istanbul',
      journalNo: `${key}-001`,
      poaNumber: `${key}-POA`,
      dateIssued: new Date('2026-06-01T00:00:00.000Z'),
      isLimited: true,
      validUntil: daysFromNow(14),
      status: 'ACTIVE',
      scopeType: 'GENEL',
      scopeDescription: 'Client Workspace live smoke vekalet kaydi.',
      filePath: null,
      fileSize: null,
      mimeType: null,
      isActive: true,
    },
    create: {
      id: ids.poaId,
      clientId: ids.clientId,
      notaryName: 'Smoke Noterligi',
      notaryCity: 'Istanbul',
      journalNo: `${key}-001`,
      poaNumber: `${key}-POA`,
      dateIssued: new Date('2026-06-01T00:00:00.000Z'),
      isLimited: true,
      validUntil: daysFromNow(14),
      status: 'ACTIVE',
      scopeType: 'GENEL',
      scopeDescription: 'Client Workspace live smoke vekalet kaydi.',
      filePath: null,
      fileSize: null,
      mimeType: null,
      isActive: true,
    },
  });

  await prisma.clientIntakeLink.upsert({
    where: { id: ids.intakeLinkId },
    update: {
      tenantId: ids.tenantId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      tokenHash,
      status: 'USED',
      scope: [ClientIntakeFieldCategory.INCOME_SOURCE, ClientIntakeFieldCategory.CONTACT],
      maxUses: 1,
      useCount: 1,
      createdById: ids.actorUserId,
    },
    create: {
      id: ids.intakeLinkId,
      tenantId: ids.tenantId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      tokenHash,
      status: 'USED',
      scope: [ClientIntakeFieldCategory.INCOME_SOURCE, ClientIntakeFieldCategory.CONTACT],
      maxUses: 1,
      useCount: 1,
      createdById: ids.actorUserId,
    },
  });

  await prisma.clientIntakeSubmission.upsert({
    where: { id: ids.intakeSubmissionId },
    update: {
      tenantId: ids.tenantId,
      intakeLinkId: ids.intakeLinkId,
      caseId: ids.caseId,
      clientId: ids.clientId,
      status: 'CLIENT_SUBMITTED',
      submittedAt: intakeSubmittedAt,
      sourceMeta: { smokeSeed: key },
    },
    create: {
      id: ids.intakeSubmissionId,
      tenantId: ids.tenantId,
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
      tenantId: ids.tenantId,
      clientId: ids.clientId,
      caseId: ids.caseId,
      channel: 'EMAIL',
      type: 'CLIENT_WORKSPACE_LIVE_SMOKE',
      subject: 'Client Workspace live smoke notification',
      body: 'Client Workspace live smoke notification body.',
      status: 'SENT',
      sentAt: notificationAt,
      deliveredAt: null,
      errorMessage: null,
      sentById: ids.actorUserId,
      metadata: { smokeSeed: key },
      dedupeKey: notificationDedupeKey,
    },
    create: {
      id: ids.notificationId,
      tenantId: ids.tenantId,
      clientId: ids.clientId,
      caseId: ids.caseId,
      channel: 'EMAIL',
      type: 'CLIENT_WORKSPACE_LIVE_SMOKE',
      subject: 'Client Workspace live smoke notification',
      body: 'Client Workspace live smoke notification body.',
      status: 'SENT',
      sentAt: notificationAt,
      deliveredAt: null,
      errorMessage: null,
      sentById: ids.actorUserId,
      metadata: { smokeSeed: key },
      dedupeKey: notificationDedupeKey,
      createdAt: notificationAt,
    },
  });

  return {
    ...ids,
    seedKey: key,
    mode: 'seed',
    route: `/clients/${ids.clientId}`,
    tenantSlug: DEMO_TENANT_SLUG,
    actorEmail: DEMO_ADMIN_EMAIL,
    notificationDedupeKey,
    smokeEnv: {
      CLIENT_WORKSPACE_LIVE_SMOKE: '1',
      CLIENT_WORKSPACE_SMOKE_CLIENT_ID: ids.clientId,
      CLIENT_WORKSPACE_SMOKE_EMAIL: DEMO_ADMIN_EMAIL,
      CLIENT_WORKSPACE_SMOKE_PASSWORD: '<set-from-demo-seed-or-secret>',
    },
  };
}

function readSeedKey(argv: string[], env: NodeJS.ProcessEnv): string {
  const arg = argv.find((value) => value.startsWith('--seed-key='));
  return arg?.slice('--seed-key='.length) ?? env.CLIENT_WORKSPACE_LIVE_SMOKE_SEED_KEY ?? DEFAULT_SEED_KEY;
}

async function main(): Promise<void> {
  assertClientWorkspaceLiveSmokeSeedAllowed();

  const args = process.argv.slice(2);
  const seedKey = readSeedKey(args, process.env);
  const prisma = new PrismaClient();
  try {
    if (args.includes('--cleanup')) {
      const result = await cleanupClientWorkspaceLiveSmokeFixture(prisma, seedKey);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (args.includes('--reset')) {
      await cleanupClientWorkspaceLiveSmokeFixture(prisma, seedKey);
    }

    const result = await seedClientWorkspaceLiveSmokeFixture(prisma, seedKey);
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
