import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { BalanceDisplayShadowDiffAuditCorrelationPreparation } from '../balance-display-shadow-diff-audit-correlation';
import {
  ADR014_DURABLE_AUDIT_WRITER,
  type Adr014DurableAuditWriter,
  NoopAdr014DurableAuditWriter,
} from '../balance-display-shadow-diff-audit-writer';
import { buildAdr014OperationalEvent } from '../balance-display-shadow-diff.events';

function correlationCandidate() {
  const event = buildAdr014OperationalEvent(
    {
      eventType: 'ADR014_SHADOW_COMPARISON_BLOCKED',
      severity: 'HARD_STOP',
      component: 'SHADOW_COMPARE',
      operation: 'EVALUATE_READINESS',
      result: 'BLOCKED',
      failureCode: 'NON_ZERO_FINANCIAL_DELTA',
    },
    new Date('2026-07-13T10:00:00.000Z'),
    { GIT_SHA: 'a'.repeat(40), NODE_ENV: 'test' },
  );

  return new BalanceDisplayShadowDiffAuditCorrelationPreparation().prepare(event);
}

describe('ADR-014 durable audit writer preparation', () => {
  it('DI tokenini disabled NO-OP writer ile type-safe olarak cozer', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ADR014_DURABLE_AUDIT_WRITER,
          useClass: NoopAdr014DurableAuditWriter,
        },
      ],
    }).compile();

    const writer = moduleRef.get<Adr014DurableAuditWriter>(ADR014_DURABLE_AUDIT_WRITER);
    expect(writer).toBeInstanceOf(NoopAdr014DurableAuditWriter);
    expect(writer.enabled).toBe(false);
    expect(Object.isFrozen(writer)).toBe(true);

    await moduleRef.close();
  });

  it('candidate uzerinde mutation, serialization veya observable sonuc uretmez', async () => {
    const writer: Adr014DurableAuditWriter = new NoopAdr014DurableAuditWriter();
    const candidate = correlationCandidate();
    const before = JSON.stringify(candidate);

    await expect(writer.write(candidate)).resolves.toBeUndefined();

    expect(JSON.stringify(candidate)).toBe(before);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.source_event)).toBe(true);
  });

  it('module default providerini export eder fakat mevcut execution pathine writer eklemez', () => {
    const moduleSource = readFileSync(resolve(__dirname, '..', 'balance-display-shadow-diff.module.ts'), 'utf8');
    const serviceSource = readFileSync(resolve(__dirname, '..', 'balance-display-shadow-diff.service.ts'), 'utf8');

    expect(moduleSource).toContain('provide: ADR014_DURABLE_AUDIT_WRITER');
    expect(moduleSource).toContain('useClass: NoopAdr014DurableAuditWriter');
    expect(moduleSource).toMatch(/exports:\s*\[[^\]]*ADR014_DURABLE_AUDIT_WRITER[^\]]*\]/s);
    expect(serviceSource).not.toContain('ADR014_DURABLE_AUDIT_WRITER');
    expect(serviceSource).not.toContain('Adr014DurableAuditWriter');
  });

  it('writer abstraction persistence, telemetry, external sink veya finansal payload bagimliligi icermez', () => {
    const source = readFileSync(resolve(__dirname, '..', 'balance-display-shadow-diff-audit-writer.ts'), 'utf8');

    expect(source).not.toMatch(/Prisma|AuditService|AuditLog|HttpService|fetch\(|axios|Logger|prom-client/);
    expect(source).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.delete\(|\.emit\(|JSON\.stringify/);
    expect(source).not.toMatch(/tenantId|caseId|debtorId|clientId|personId|amount|principal|interest|fee|metadata/);
  });
});
