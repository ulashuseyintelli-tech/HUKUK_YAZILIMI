/** ADR-014 W0.2 static guards for PAYMENT-only test-support isolation. */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');
const MATERIALIZER_DIR = path.resolve(__dirname, '..', 'scenario-materializer');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function isTestSupportPath(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return (
    normalized.includes('/__tests__/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.includes('/scenario-materializer/') ||
    normalized.includes('/scenario-support/')
  );
}

describe('W0.2 scenario-materializer static boundaries', () => {
  const allSrcFiles = walk(SRC_ROOT);
  const materializerFiles = walk(MATERIALIZER_DIR);

  it('is unreachable from production source paths', () => {
    const offenders: string[] = [];
    for (const file of allSrcFiles) {
      if (isTestSupportPath(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('scenario-materializer')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('has no runtime, controller, API, UI, environment, or engine dependency', () => {
    const forbiddenTokens = [
      '@nestjs/',
      'process.env',
      'DATABASE_URL',
      '/controller',
      '/apps/web',
      'interest-engine.service',
      'allocation/',
      'CollectionService',
    ];

    for (const file of materializerFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const token of forbiddenTokens) {
        expect({ file, token, found: content.includes(token) }).toEqual({
          file,
          token,
          found: false,
        });
      }
    }
  });

  it('imports only Prisma typing and the canonical scenario contract', () => {
    for (const file of materializerFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
      const disallowed = imports.filter(
        (dependency) =>
          dependency !== '@prisma/client' && !dependency.startsWith('../scenario-support/'),
      );
      expect({ file, disallowed }).toEqual({ file, disallowed: [] });
      expect(content).toContain("import type { ScenarioDefinition } from '../scenario-support/");
      expect(content).not.toMatch(/interface\s+(ScenarioDefinition|ScenarioDomainInput|ScenarioExpected)\b/);
    }
  });

  it('keeps owner-removed relationship surfaces absent', () => {
    const removedTokens = [
      ['REVER', 'SAL'].join(''),
      ['reverses', 'LedgerEntryId'].join(''),
      ['Materialize', 'ReversalIntent'].join(''),
      ['rever', 'sals'].join(''),
    ];
    const content = materializerFiles.map((file) => fs.readFileSync(file, 'utf-8')).join('\n');
    for (const token of removedTokens) expect(content).not.toContain(token);
  });

  it('uses one callback transaction for materialization', () => {
    const content = materializerFiles.map((file) => fs.readFileSync(file, 'utf-8')).join('\n');
    expect(content).toContain('prisma.$transaction((tx) => materializeInTransaction(tx, def))');
  });
});
