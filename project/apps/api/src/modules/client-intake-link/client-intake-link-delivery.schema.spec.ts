import { readFileSync } from 'fs';
import { join } from 'path';
import { ClientIntakeLinkDeliveryStatus, Prisma } from '@prisma/client';

describe('ClientIntakeLinkDelivery schema contract', () => {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === 'ClientIntakeLinkDelivery');

  it('exposes the delivery artifact model without persisting raw secrets', () => {
    expect(model).toBeDefined();
    const fieldNames = model?.fields.map((field) => field.name) ?? [];

    expect(fieldNames).toEqual(expect.arrayContaining([
      'id',
      'tenantId',
      'clientId',
      'caseId',
      'intakeLinkId',
      'idempotencyKey',
      'dedupeKey',
      'channel',
      'status',
      'notificationId',
      'attemptCount',
      'lastError',
      'createdById',
      'createdAt',
      'updatedAt',
    ]));
    expect(fieldNames).not.toContain('rawToken');
    expect(fieldNames).not.toContain('intakeUrl');
  });

  it('keeps idempotency and delivery dedupe as artifact-level unique constraints', () => {
    const uniqueFieldSets = [
      ...(model?.uniqueFields ?? []),
      ...(((model as any)?.uniqueIndexes ?? []).map((index: { fields: string[] }) => index.fields)),
    ].map((fields) => fields.join('|'));

    expect(uniqueFieldSets).toEqual(expect.arrayContaining([
      'tenantId|idempotencyKey',
      'tenantId|dedupeKey',
      'intakeLinkId|channel',
    ]));
  });

  it('defines the focused delivery status enum', () => {
    expect(Object.values(ClientIntakeLinkDeliveryStatus).sort()).toEqual(['FAILED', 'PENDING', 'SENDING', 'SENT']);
  });

  it('keeps migration SQL aligned with the secret-redaction contract', () => {
    const migrationSql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20260701210000_client_intake_link_delivery_artifact/migration.sql'),
      'utf8',
    );

    expect(migrationSql).toContain('CREATE TYPE "ClientIntakeLinkDeliveryStatus"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_tenantId_idempotencyKey_key"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_tenantId_dedupeKey_key"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "ClientIntakeLinkDelivery_intakeLinkId_channel_key"');
    expect(migrationSql).toContain('CREATE INDEX "ClientIntakeLinkDelivery_notificationId_idx"');
    expect(migrationSql).not.toMatch(/\b(rawToken|intakeUrl)\b/);
    expect(migrationSql).not.toContain('ClientNotification_dedupeKey_key');
  });
});