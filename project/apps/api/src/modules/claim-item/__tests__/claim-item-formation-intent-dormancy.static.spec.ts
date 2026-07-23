import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const CLAIM_ITEM_ROOT = path.join(API_ROOT, 'src/modules/claim-item');
const PACKAGE_ROOT = path.join(CLAIM_ITEM_ROOT, 'formation-intent');
const DORMANT_FINALIZER = path.join(
  CLAIM_ITEM_ROOT,
  'formation-finalizer/transactional-claim-item-formation-finalizer.service.ts',
);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(API_ROOT, relativePath), 'utf8');
}

function productionTypeScriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'node_modules') return [];
      return productionTypeScriptFiles(full);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

describe('RCV-CLAIM-FORM-P02-S08-I02B dormancy and boundary guard', () => {
  it('keeps the human route on the existing FORMATION_CONTEXT_REQUIRED containment', () => {
    const service = read('src/modules/claim-item/claim-item.service.ts');
    const controller = read('src/modules/claim-item/claim-item.controller.ts');

    expect(controller).toContain('this.service.createFromUser(tenantId, actorUserId, dto)');
    expect(service).toMatch(
      /async createFromUser[\s\S]*?evaluateHuman\([\s\S]*?throwClaimItemFormationContextRequired\(\);/,
    );
    expect(service).not.toContain('HumanClaimItemFormationAdmissionService');
  });

  it('does not register a production provider, resolver adapter or call-site', () => {
    const moduleSource = read('src/modules/claim-item/claim-item.module.ts');
    expect(moduleSource).not.toContain('formation-intent');
    expect(moduleSource).not.toContain('HumanClaimItemFormationAdmissionService');

    const importers = productionTypeScriptFiles(path.join(API_ROOT, 'src'))
      .filter((file) => !file.startsWith(PACKAGE_ROOT))
      .filter((file) => path.resolve(file) !== path.resolve(DORMANT_FINALIZER))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('formation-intent'))
      .map((file) => path.relative(API_ROOT, file));
    expect(importers).toEqual([]);
  });

  it('writes only intent, OfficeApproval and transaction-bound request audit', () => {
    const packageSource = productionTypeScriptFiles(PACKAGE_ROOT)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(packageSource).toContain('claimItemFormationIntent.create');
    expect(packageSource).toContain('officeApprovalRequest.create');
    expect(packageSource).toContain('audit.logInTransaction');
    expect(packageSource).not.toMatch(/\bclaimItem\.create\s*\(/);
    expect(packageSource).not.toMatch(/\bclaimFormationSnapshot\.create\s*\(/);
    expect(packageSource).not.toMatch(/\b(?:domainEvent|outbox).*\.create\s*\(/i);
    expect(packageSource).not.toContain('OfficeApprovalStatus.APPROVED_WITH_CHANGES');
  });

  it('keeps generic OfficeApproval schema and createPendingRequest signature unchanged', () => {
    const officeService = read('src/modules/office-approval/office-approval.service.ts');
    const schema = read('prisma/schema.prisma');

    expect(officeService).toContain(
      'async createPendingRequest(input: CreatePendingRequestInput): Promise<OfficeApprovalRequest>',
    );
    expect(officeService).not.toMatch(
      /createPendingRequest\([^)]*Prisma\.TransactionClient/,
    );
    expect(schema).not.toContain('CLAIM_ITEM_FORMATION_APPROVAL_REF_V1');
  });
});
