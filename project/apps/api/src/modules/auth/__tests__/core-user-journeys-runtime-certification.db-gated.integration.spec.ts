import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as request from 'supertest';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { ClaimItemController } from '../../claim-item/claim-item.controller';
import { ClaimItemService } from '../../claim-item/claim-item.service';
import { ClaimItemWriteGateService } from '../../claim-item/claim-item-write-gate.service';
import { ClaimItemWriterRouterService } from '../../claim-item/claim-item-writer-router.service';
import { ClientController } from '../../client/client.controller';
import { ClientService } from '../../client/client.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { CollectionController } from '../../collection/collection.controller';
import { CollectionService } from '../../collection/collection.service';
import { ReceiptObjectScopeAuthorizationService } from '../../collection/receipt-object-scope-authorization.service';
import { CollectionChannel, CollectionSource, CollectionType } from '../../collection/dto/collection.dto';
import { DebtorController } from '../../debtor/debtor.controller';
import { DebtorService } from '../../debtor/debtor.service';
import { CaseDebtorService } from '../../debtor/case-debtor.service';
import { DebtorCrossCaseNotificationService } from '../../debtor/debtor-cross-case-notification.service';
import { DebtorCrossCaseNotificationTaskLinkService } from '../../debtor/debtor-cross-case-notification-task-link.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';
import { PoaService } from '../../poa/poa.service';
import { OfficeController } from '../../office/office.controller';
import { OfficeService } from '../../office/office.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

const TEST_SECRET = 'w2-controlled-runtime-test-secret-at-least-32-bytes';
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('R01 W2 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const projectRoot = path.resolve(__dirname, '../../../../../..');
const repositoryRoot = path.resolve(projectRoot, '..');
const auditBaseSha = '9cd51295db434b437bf240a26a4421c6c8e7a211';
const artifactDirectory = path.join(
  projectRoot,
  'docs',
  'audit',
  'runtime-operability-certification-r01',
  'w2-core-user-journeys',
);
const runtimeSpecPath =
  'project/apps/api/src/modules/auth/__tests__/core-user-journeys-runtime-certification.db-gated.integration.spec.ts';
const manifestPath = path.join(projectRoot, 'apps', 'api', 'ci-manifests', 'db', 'domain-integration.txt');
const generatorPath = path.join(projectRoot, 'scripts', 'runtime-core-user-journeys-certification-r01.cjs');
const w2ArtifactDirectoryPath =
  'project/docs/audit/runtime-operability-certification-r01/w2-core-user-journeys';
const w1ArtifactDirectory =
  'project/docs/audit/runtime-operability-certification-r01/w1-security-tenant-certification';
const w1DecisionLogPath = `${w1ArtifactDirectory}/decision-log.md`;
const expectedW1DecisionLogBlob = '97258db18a61cd418b60af170b1eafe1292f6bbc';
const outputFiles = [
  'journey-inventory.json',
  'journey-certification-matrix.csv',
  'core-user-journeys-certification.md',
  'negative-boundary-validation.md',
  'remediation-register.md',
  'methodology-validation-report.md',
  'decision-log.md',
];
const expectedW2ChangedFiles = [
  runtimeSpecPath,
  'project/apps/api/ci-manifests/db/domain-integration.txt',
  'project/scripts/runtime-core-user-journeys-certification-r01.cjs',
  ...outputFiles.map((file) => `${w2ArtifactDirectoryPath}/${file}`),
].sort();

function git(...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

function changedFileCountFromGitHubEvent(event: unknown): number {
  if (!event || typeof event !== 'object') {
    throw new Error('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE');
  }
  const record = event as Record<string, unknown>;
  if ('pull_request' in record) {
    const pullRequest = record.pull_request;
    const changedFiles = pullRequest && typeof pullRequest === 'object'
      ? (pullRequest as Record<string, unknown>).changed_files
      : undefined;
    if (!Number.isSafeInteger(changedFiles) || (changedFiles as number) < 0) {
      throw new Error('W2_CHANGED_FILE_COUNT_INVALID');
    }
    return changedFiles as number;
  }

  const headCommit = record.head_commit;
  if (!headCommit || typeof headCommit !== 'object') {
    throw new Error('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE');
  }
  const changedFiles = new Set<string>();
  for (const field of ['added', 'modified', 'removed']) {
    const paths = (headCommit as Record<string, unknown>)[field];
    if (!Array.isArray(paths) || paths.some((file) => typeof file !== 'string')) {
      throw new Error('W2_PUSH_CHANGESET_INVALID');
    }
    for (const file of paths) changedFiles.add(file);
  }
  return changedFiles.size;
}

/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01-W2-MAIN-PUSH-CHANGESET-GUARD-RECONCILIATION-R01
 *
 * Root cause (fresh CI evidence, run 30568183053): main-push'ta `head_commit` GitHub
 * Actions'in event context'inde `added`/`modified`/`removed` alanlarini TASIMAZ — bu
 * alanlar API ile olusturulan (squash-merge) commit'ler icin garanti degildir. Onceki
 * kod yalniz bu alanlara bakiyordu ve HICBIR fallback denemeden `W2_PUSH_CHANGESET_INVALID`
 * firlatiyordu. Oysa push event payload'i her zaman guvenilir bir `before`/`after` SHA
 * cifti tasir (GitHub'in push webhook semasinin sabit parcasi, diff hesaplamasi
 * gerektirmez) ve bu repo PUBLIC oldugu icin token gerektirmeyen bounded
 * `git fetch --depth=1 origin <sha>` ile o SHA'yi shallow checkout'ta bile lokal hale
 * getirebiliriz (empirik dogrulandi: shallow clone + tek SHA fetch -> PASS).
 *
 * Bu nedenle `ci.yml` DEGISTIRILMEDI — repo public oldugu icin fetch-depth degisikligi
 * gerekmiyor; duzeltme tamamen bu dosyada, mevcut `git()`/spawnSync deseniyle.
 */
type ChangedFileEvidenceSource = 'GIT_RANGE' | 'PR_PAYLOAD' | 'PUSH_PAYLOAD' | 'LOCAL_PARENT';

interface ChangedFileEvidence {
  source: ChangedFileEvidenceSource;
  /** GIT_RANGE / LOCAL_PARENT icin gercek dosya yollari. Yalniz sayi bilinen kaynaklarda bos dizi. */
  files: string[];
  /** Her kaynakta guvenilir sekilde bilinen degisen dosya sayisi. */
  fileCount: number;
  complete: boolean;
}

const ZERO_SHA = '0000000000000000000000000000000000000000';
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

function commitExistsLocally(sha: string, cwd: string): boolean {
  if (!FULL_SHA_RE.test(sha)) return false;
  return spawnSync('git', ['cat-file', '-e', sha], { cwd, encoding: 'utf8' }).status === 0;
}

function hasResolvableLocalParent(cwd: string): boolean {
  return spawnSync('git', ['cat-file', '-e', 'HEAD^'], { cwd, encoding: 'utf8' }).status === 0;
}

/**
 * Verilen SHA lokalde yoksa, `origin`'den EXACT o commit'i bounded (`--depth=1`)
 * fetch eder. Sha, checkout'un mevcut shallow tarihinden ne kadar uzakta olursa
 * olsun calisir (`git diff A B` iki agac karsilastirir; ortak ata gerektirmez) —
 * bu, tek-commit'lik push'larla sinirli olan `HEAD^` yaklasimindan farkli olarak
 * coklu-commit push'larda da doğru kalir.
 */
function tryMakeCommitAvailable(sha: string, cwd: string): boolean {
  if (!FULL_SHA_RE.test(sha)) return false;
  if (commitExistsLocally(sha, cwd)) return true;
  const fetch = spawnSync('git', ['fetch', '--depth=1', '--no-tags', 'origin', sha], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return fetch.status === 0 && commitExistsLocally(sha, cwd);
}

function gitDiffNameOnlyAt(cwd: string, a: string, b: string): string[] {
  // `--no-renames` acikca verilir: rename-tespiti git surumune/global diff.renames
  // ayarina gore degisebilir (bu ortamda git 2.55 varsayilani rename'i tek path'e
  // katliyor). Guard'in davranisi calistigi makinenin git config'inden BAGIMSIZ ve
  // deterministik olmali; bu yuzden hem eski hem yeni path ayri ayri raporlanir.
  const result = spawnSync('git', ['diff', '--no-renames', '--name-only', a, b, '--'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`W2_GIT_DIFF_FAILED: ${(result.stderr || '').trim().slice(0, 200)}`);
  }
  // git her zaman '/' ayiricili path raporlar (Windows dahil) — ayrica normalize
  // etmeye gerek yok; bu davranis asagida bir testle dogrulanir.
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

interface ResolveChangedFileEvidenceOptions {
  cwd?: string;
  eventName?: string;
  eventPath?: string;
  /** Local/dev override: acik base/head (brief §6 "explicit base/head"). */
  baseShaOverride?: string;
  headShaOverride?: string;
}

/**
 * Event-aware degisen-dosya kaniti cozucusu. Yalniz `complete: true` sonuc W2
 * sertifikasyon hukmu icin kullanilabilir (brief §7).
 *
 * Oncelik sirasi:
 *   pull_request : GIT_RANGE (base..head, bounded fetch) -> PR_PAYLOAD (changed_files sayisi)
 *   push         : GIT_RANGE (before..after, bounded fetch; zero-SHA/eksik before atlanir) ->
 *                  LOCAL_PARENT (HEAD^) -> PUSH_PAYLOAD (head_commit dizileri) -> fail-closed
 *                  (BEFORE_SHA_MISSING / RANGE_UNFETCHABLE / PAYLOAD_INCOMPLETE)
 *   local/no-event: explicit override -> LOCAL_PARENT (HEAD^) -> UNSUPPORTED_EVENT / fail-closed
 */
function resolveChangedFileEvidence(options: ResolveChangedFileEvidenceOptions = {}): ChangedFileEvidence {
  const cwd = options.cwd ?? repositoryRoot;
  const eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME;
  const eventPath = options.eventPath ?? process.env.GITHUB_EVENT_PATH;

  if (options.baseShaOverride && options.headShaOverride) {
    if (!tryMakeCommitAvailable(options.baseShaOverride, cwd) || !tryMakeCommitAvailable(options.headShaOverride, cwd)) {
      throw new Error('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE:RANGE_UNFETCHABLE');
    }
    const files = gitDiffNameOnlyAt(cwd, options.baseShaOverride, options.headShaOverride);
    return { source: 'GIT_RANGE', files, fileCount: files.length, complete: true };
  }

  let event: Record<string, unknown> | null = null;
  if (eventPath && fs.existsSync(eventPath)) {
    event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as Record<string, unknown>;
  }

  const isPullRequest = eventName === 'pull_request' || (!!event && 'pull_request' in event);
  if (isPullRequest) {
    const pr = (event?.pull_request ?? {}) as Record<string, unknown>;
    const base = (pr.base as Record<string, unknown> | undefined)?.sha;
    const head = (pr.head as Record<string, unknown> | undefined)?.sha;
    if (typeof base === 'string' && typeof head === 'string'
      && tryMakeCommitAvailable(base, cwd) && tryMakeCommitAvailable(head, cwd)) {
      const files = gitDiffNameOnlyAt(cwd, base, head);
      return { source: 'GIT_RANGE', files, fileCount: files.length, complete: true };
    }
    // PR_PAYLOAD: yalniz sayi guvenilir (GitHub API tarafindan hesaplanir); dosya adi YOK.
    const count = changedFileCountFromGitHubEvent(event); // W2_CHANGED_FILE_COUNT_INVALID zaten fail-closed
    return { source: 'PR_PAYLOAD', files: [], fileCount: count, complete: true };
  }

  const isPush = eventName === 'push' || (!!event && 'head_commit' in event);
  if (isPush) {
    const before = event?.before;
    const after = (event?.after as string | undefined) ?? (event?.head_commit as Record<string, unknown> | undefined)?.id;
    // "usable shape" = yapisal olarak kullanilabilir bir SHA (dolu string, zero-SHA degil).
    // Zero-SHA (yeni branch/ilk push, brief §8 ozel durum) BEFORE_SHA_MISSING ile ayni
    // aile: her ikisi de "karsilastirilacak onceki commit YOK" anlamina gelir.
    const beforeUsable = typeof before === 'string' && before !== ZERO_SHA;
    const afterUsable = typeof after === 'string';

    if (beforeUsable && afterUsable
      && tryMakeCommitAvailable(before as string, cwd) && tryMakeCommitAvailable(after as string, cwd)) {
      const files = gitDiffNameOnlyAt(cwd, before as string, after as string);
      return { source: 'GIT_RANGE', files, fileCount: files.length, complete: true };
    }
    if (hasResolvableLocalParent(cwd)) {
      const files = gitDiffNameOnlyAt(cwd, 'HEAD^', 'HEAD');
      return { source: 'LOCAL_PARENT', files, fileCount: files.length, complete: true };
    }
    // Son care: push payload'inin head_commit dizileri (yalniz gercekten string[] ise).
    // Bu, coklu-commit push'larda tek bir commit'in diff-stat'ini yansitir ve GIT_RANGE
    // kadar guvenilir DEGILDIR — bu yuzden GIT_RANGE/LOCAL_PARENT'tan SONRA denenir.
    try {
      const count = changedFileCountFromGitHubEvent(event);
      return { source: 'PUSH_PAYLOAD', files: [], fileCount: count, complete: true };
    } catch (payloadError) {
      // Reason secimi (en spesifik/eylemsel gerekce once):
      //   1) head_commit VARDI ama dizi sekli bozuktu -> PAYLOAD_INCOMPLETE
      //   2) before hic yoktu/zero-SHA'ydi -> BEFORE_SHA_MISSING
      //   3) before/after yapisal olarak gecerliydi ama fetch/diff basarisiz oldu -> RANGE_UNFETCHABLE
      const payloadWasMalformed = payloadError instanceof Error
        && payloadError.message === 'W2_PUSH_CHANGESET_INVALID';
      if (payloadWasMalformed) throw new Error('W2_PUSH_CHANGESET_INVALID:PAYLOAD_INCOMPLETE');
      if (!beforeUsable) throw new Error('W2_PUSH_CHANGESET_INVALID:BEFORE_SHA_MISSING');
      throw new Error('W2_PUSH_CHANGESET_INVALID:RANGE_UNFETCHABLE');
    }
  }

  // Local/no-event execution (brief §6): HEAD^ varsa kullan, yoksa sessizce 0 uretme —
  // fail-closed. Yeni bir "local skip" semantigi icat EDILMEZ. Event adi bilinen ama
  // desteklenmeyen bir CI tetikleyicisiyse (ornek: workflow_dispatch) ayri tanilanir.
  if (hasResolvableLocalParent(cwd)) {
    const files = gitDiffNameOnlyAt(cwd, 'HEAD^', 'HEAD');
    return { source: 'LOCAL_PARENT', files, fileCount: files.length, complete: true };
  }
  if (eventName && eventName !== 'pull_request' && eventName !== 'push') {
    throw new Error('W2_PUSH_CHANGESET_INVALID:UNSUPPORTED_EVENT');
  }
  throw new Error('W2_GITHUB_EVENT_PATH_REQUIRED');
}

function currentCheckoutChangedFileCount(
  resolver: () => ChangedFileEvidence = resolveChangedFileEvidence,
): number {
  const evidence = resolver();
  if (!evidence.complete) throw new Error('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE:INCOMPLETE');
  return evidence.fileCount;
}

describe('R01 W2 changed-file evidence', () => {
  it.each([2, 10])('accepts a valid pull-request change count of %i files', (changedFiles) => {
    expect(changedFileCountFromGitHubEvent({
      pull_request: { changed_files: changedFiles },
    })).toBe(changedFiles);
  });

  it('derives the unique changed-file count from a push head commit', () => {
    expect(changedFileCountFromGitHubEvent({
      head_commit: {
        added: ['added.ts'],
        modified: ['modified.ts', 'shared.ts'],
        removed: ['shared.ts'],
      },
    })).toBe(3);
  });

  it('fails closed when the pull-request change count is undefined', () => {
    expect(() => changedFileCountFromGitHubEvent({ pull_request: {} }))
      .toThrow('W2_CHANGED_FILE_COUNT_INVALID');
  });

  it('fails closed when a push event carries no head_commit at all', () => {
    expect(() => changedFileCountFromGitHubEvent({ before: 'a'.repeat(40), after: 'b'.repeat(40) }))
      .toThrow('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE');
  });

  it('fails closed when a push head commit array field is partially malformed', () => {
    expect(() => changedFileCountFromGitHubEvent({
      head_commit: { added: 'not-an-array', modified: [], removed: [] },
    })).toThrow('W2_PUSH_CHANGESET_INVALID');
  });
});

/**
 * R01 W2 event-aware changed-file evidence resolver — RECONCILIATION-R01 test matrix.
 * Her senaryo `resolveChangedFileEvidence()`'i kendi izole gecici git deposunda
 * calistirir; hicbir test bu spec dosyasinin kendi checkout'una veya CI ortamina
 * baglidir degildir (fail-closed davranisi ortamdan bagimsiz kanitlanir).
 */
function runFixtureGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`W2_FIXTURE_GIT_FAILED: git ${args.join(' ')} :: ${(result.stderr || result.stdout || '').trim().slice(0, 300)}`);
  }
  return result.stdout.trim();
}

function withTempGitFixture<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    const resolved = path.resolve(dir);
    expect(resolved.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function configFixtureIdentity(dir: string): void {
  runFixtureGit(dir, ['config', 'user.email', 'w2-fixture@example.invalid']);
  runFixtureGit(dir, ['config', 'user.name', 'W2 Fixture']);
}

function initFixtureRepo(dir: string): void {
  runFixtureGit(dir, ['init', '--quiet']);
  configFixtureIdentity(dir);
}

function commitFixtureFile(dir: string, fileName: string, content: string, message: string): string {
  const filePath = path.join(dir, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  runFixtureGit(dir, ['add', '-A']);
  runFixtureGit(dir, ['commit', '--quiet', '-m', message]);
  return runFixtureGit(dir, ['rev-parse', 'HEAD']);
}

function removeFixtureFile(dir: string, fileName: string, message: string): string {
  fs.rmSync(path.join(dir, fileName));
  runFixtureGit(dir, ['add', '-A']);
  runFixtureGit(dir, ['commit', '--quiet', '-m', message]);
  return runFixtureGit(dir, ['rev-parse', 'HEAD']);
}

function writeFixtureEvent(dir: string, event: unknown): string {
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(event));
  return eventPath;
}

describe('R01 W2 event-aware changed-file evidence resolver', () => {
  describe('pull_request event', () => {
    it('resolves via GIT_RANGE when base/head commits are locally available (parent available)', () => {
      withTempGitFixture('roc-w2-pr-parent-', (dir) => {
        initFixtureRepo(dir);
        const base = commitFixtureFile(dir, 'base.txt', 'base', 'base commit');
        commitFixtureFile(dir, 'middle.txt', 'middle', 'middle commit');
        const head = commitFixtureFile(dir, 'head.txt', 'head', 'head commit');
        const eventPath = writeFixtureEvent(dir, {
          pull_request: { base: { sha: base }, head: { sha: head }, changed_files: 999 },
        });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'pull_request', eventPath });
        expect(evidence.source).toBe('GIT_RANGE');
        expect(evidence.complete).toBe(true);
        expect(evidence.files.slice().sort()).toEqual(['head.txt', 'middle.txt']);
        expect(evidence.fileCount).toBe(2);
      });
    });

    it('falls back to PR_PAYLOAD when base/head commits are not fetchable (shallow)', () => {
      withTempGitFixture('roc-w2-pr-shallow-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, {
          pull_request: {
            base: { sha: 'a'.repeat(40) },
            head: { sha: 'b'.repeat(40) },
            changed_files: 4,
          },
        });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'pull_request', eventPath });
        expect(evidence).toEqual({ source: 'PR_PAYLOAD', files: [], fileCount: 4, complete: true });
      });
    });

    it('uses the payload changed_files count when no base/head SHAs are present at all', () => {
      withTempGitFixture('roc-w2-pr-payload-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, { pull_request: { changed_files: 7 } });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'pull_request', eventPath });
        expect(evidence).toEqual({ source: 'PR_PAYLOAD', files: [], fileCount: 7, complete: true });
      });
    });

    it('resolves an explicit local base/head override via GIT_RANGE regardless of CI event context', () => {
      withTempGitFixture('roc-w2-explicit-', (dir) => {
        initFixtureRepo(dir);
        const base = commitFixtureFile(dir, 'base.txt', 'base', 'base');
        const head = commitFixtureFile(dir, 'changed.txt', 'changed', 'head');
        const evidence = resolveChangedFileEvidence({ cwd: dir, baseShaOverride: base, headShaOverride: head });
        expect(evidence).toEqual({ source: 'GIT_RANGE', files: ['changed.txt'], fileCount: 1, complete: true });
      });
    });
  });

  describe('push event', () => {
    it('resolves a single-commit push via GIT_RANGE using top-level before/after SHAs', () => {
      withTempGitFixture('roc-w2-push-single-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'a.txt', 'a', 'before');
        const after = commitFixtureFile(dir, 'b.txt', 'b', 'after');
        const eventPath = writeFixtureEvent(dir, { before, after, head_commit: { id: after } });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence).toEqual({ source: 'GIT_RANGE', files: ['b.txt'], fileCount: 1, complete: true });
      });
    });

    it('aggregates every intermediate commit of a multi-commit push via GIT_RANGE', () => {
      withTempGitFixture('roc-w2-push-multi-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'a.txt', 'a', 'before');
        commitFixtureFile(dir, 'b.txt', 'b', 'middle 1');
        commitFixtureFile(dir, 'c.txt', 'c', 'middle 2');
        const after = commitFixtureFile(dir, 'd.txt', 'd', 'after');
        const eventPath = writeFixtureEvent(dir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.source).toBe('GIT_RANGE');
        expect(evidence.complete).toBe(true);
        expect(evidence.files.slice().sort()).toEqual(['b.txt', 'c.txt', 'd.txt']);
      });
    });

    it('resolves a squash-style push via GIT_RANGE without relying on head_commit arrays', () => {
      withTempGitFixture('roc-w2-push-squash-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'a.txt', 'a', 'before');
        fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
        fs.writeFileSync(path.join(dir, 'y.txt'), 'y');
        runFixtureGit(dir, ['add', '-A']);
        runFixtureGit(dir, ['commit', '--quiet', '-m', 'squash-merge PR #123']);
        const after = runFixtureGit(dir, ['rev-parse', 'HEAD']);
        // Kasitli: head_commit'te added/modified/removed YOK — API ile olusturulan
        // squash-merge commit'lerin gercek sekli (root cause).
        const eventPath = writeFixtureEvent(dir, { before, after, head_commit: { id: after } });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.source).toBe('GIT_RANGE');
        expect(evidence.files.slice().sort()).toEqual(['x.txt', 'y.txt']);
      });
    });

    it('CRITICAL: resolves a shallow-checkout push via bounded SHA fetch when before/after are not locally available', () => {
      withTempGitFixture('roc-w2-push-shallow-', (dir) => {
        runFixtureGit(dir, ['init', '--quiet', '--bare', 'origin.git']);
        const originUrl = pathToFileURL(path.join(dir, 'origin.git')).href;

        runFixtureGit(dir, ['clone', '--quiet', originUrl, 'work']);
        const workDir = path.join(dir, 'work');
        configFixtureIdentity(workDir);
        const before = commitFixtureFile(workDir, 'a.txt', 'a', 'c1');
        commitFixtureFile(workDir, 'b.txt', 'b', 'c2');
        const after = commitFixtureFile(workDir, 'c.txt', 'c', 'c3 (after, simulated squash-merge)');
        runFixtureGit(workDir, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main']);

        runFixtureGit(dir, ['clone', '--quiet', '--depth', '1', originUrl, 'shallow']);
        const shallowDir = path.join(dir, 'shallow');

        // On-kosul: gercekten shallow ve 'before' lokalde YOK (aksi halde bu test
        // hicbir sey kanitlamaz).
        expect(fs.existsSync(path.join(shallowDir, '.git', 'shallow'))).toBe(true);
        expect(commitExistsLocally(before, shallowDir)).toBe(false);

        const eventPath = writeFixtureEvent(shallowDir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: shallowDir, eventName: 'push', eventPath });
        expect(evidence.source).toBe('GIT_RANGE');
        expect(evidence.complete).toBe(true);
        expect(evidence.files.slice().sort()).toEqual(['b.txt', 'c.txt']);

        // Negatif kanit: fetch GERCEKTEN calisti, sadece tesadufen zaten mevcut degildi.
        expect(commitExistsLocally(before, shallowDir)).toBe(true);
      });
    });

    it('fails closed with BEFORE_SHA_MISSING when before is entirely absent and no fallback resolves', () => {
      withTempGitFixture('roc-w2-push-nobefore-', (dir) => {
        initFixtureRepo(dir);
        const after = commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, { after });
        expect(() => resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath }))
          .toThrow('W2_PUSH_CHANGESET_INVALID:BEFORE_SHA_MISSING');
      });
    });

    it('fails closed with BEFORE_SHA_MISSING when before is the zero-SHA (new branch) and no fallback resolves', () => {
      withTempGitFixture('roc-w2-push-zerobefore-', (dir) => {
        initFixtureRepo(dir);
        const after = commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, { before: '0'.repeat(40), after });
        expect(() => resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath }))
          .toThrow('W2_PUSH_CHANGESET_INVALID:BEFORE_SHA_MISSING');
      });
    });

    it('falls back to PUSH_PAYLOAD when the range is unfetchable but head_commit arrays are valid', () => {
      withTempGitFixture('roc-w2-push-payload-fallback-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, {
          before: 'a'.repeat(40),
          after: 'b'.repeat(40),
          head_commit: { added: ['added.ts'], modified: [], removed: [] },
        });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence).toEqual({ source: 'PUSH_PAYLOAD', files: [], fileCount: 1, complete: true });
      });
    });

    it('fails closed with RANGE_UNFETCHABLE when before/after look valid but no fallback resolves', () => {
      withTempGitFixture('roc-w2-push-unfetchable-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, { before: 'a'.repeat(40), after: 'b'.repeat(40) });
        expect(() => resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath }))
          .toThrow('W2_PUSH_CHANGESET_INVALID:RANGE_UNFETCHABLE');
      });
    });

    it('fails closed with PAYLOAD_INCOMPLETE when head_commit is present but its arrays are malformed', () => {
      withTempGitFixture('roc-w2-push-malformed-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, {
          head_commit: { added: 'not-an-array', modified: [], removed: [] },
        });
        expect(() => resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath }))
          .toThrow('W2_PUSH_CHANGESET_INVALID:PAYLOAD_INCOMPLETE');
      });
    });
  });

  describe('local execution and unsupported events', () => {
    it('resolves via LOCAL_PARENT when HEAD^ is available and there is no CI event', () => {
      withTempGitFixture('roc-w2-local-parent-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'a.txt', 'a', 'c1');
        commitFixtureFile(dir, 'b.txt', 'b', 'c2');
        const evidence = resolveChangedFileEvidence({ cwd: dir });
        expect(evidence).toEqual({ source: 'LOCAL_PARENT', files: ['b.txt'], fileCount: 1, complete: true });
      });
    });

    it('fails closed with UNSUPPORTED_EVENT for a named non-push/pull_request CI trigger with no local parent', () => {
      withTempGitFixture('roc-w2-unsupported-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        expect(() => resolveChangedFileEvidence({ cwd: dir, eventName: 'workflow_dispatch' }))
          .toThrow('W2_PUSH_CHANGESET_INVALID:UNSUPPORTED_EVENT');
      });
    });

    it('fails closed with W2_GITHUB_EVENT_PATH_REQUIRED when there is no event and no local parent at all', () => {
      withTempGitFixture('roc-w2-no-evidence-', (dir) => {
        initFixtureRepo(dir);
        commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        expect(() => resolveChangedFileEvidence({ cwd: dir }))
          .toThrow('W2_GITHUB_EVENT_PATH_REQUIRED');
      });
    });
  });

  describe('integrity of the resolved changeset', () => {
    it('deduplicates a path that is added, removed, and re-added across intermediate commits', () => {
      withTempGitFixture('roc-w2-dedup-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'root.txt', 'root', 'root');
        commitFixtureFile(dir, 'foo.txt', 'v1', 'add foo');
        removeFixtureFile(dir, 'foo.txt', 'remove foo');
        const after = commitFixtureFile(dir, 'foo.txt', 'v2', 're-add foo');
        const eventPath = writeFixtureEvent(dir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.files.filter((file) => file === 'foo.txt')).toHaveLength(1);
        expect(evidence.fileCount).toBe(1);
      });
    });

    it('reports both the old and new path of a rename deterministically regardless of git rename heuristics', () => {
      withTempGitFixture('roc-w2-rename-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'old-name.txt', 'a reasonably long body so similarity heuristics could apply', 'add');
        runFixtureGit(dir, ['mv', 'old-name.txt', 'new-name.txt']);
        runFixtureGit(dir, ['commit', '--quiet', '-am', 'rename']);
        const after = runFixtureGit(dir, ['rev-parse', 'HEAD']);
        const eventPath = writeFixtureEvent(dir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.files.slice().sort()).toEqual(['new-name.txt', 'old-name.txt']);
      });
    });

    it('reports a deleted file as part of the changeset', () => {
      withTempGitFixture('roc-w2-deleted-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'gone.txt', 'x', 'add');
        const after = removeFixtureFile(dir, 'gone.txt', 'remove');
        const eventPath = writeFixtureEvent(dir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.files).toEqual(['gone.txt']);
      });
    });

    it('reports nested paths with forward-slash separators regardless of host OS', () => {
      withTempGitFixture('roc-w2-pathsep-', (dir) => {
        initFixtureRepo(dir);
        const before = commitFixtureFile(dir, 'root.txt', 'root', 'root');
        const after = commitFixtureFile(dir, 'nested/dir/file.ts', 'x', 'nested');
        const eventPath = writeFixtureEvent(dir, { before, after });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence.files).toEqual(['nested/dir/file.ts']);
        expect(evidence.files.every((file) => !file.includes('\\'))).toBe(true);
      });
    });

    it('reports a valid empty changeset (before === after) as complete with zero files, not a silent skip', () => {
      withTempGitFixture('roc-w2-empty-', (dir) => {
        initFixtureRepo(dir);
        const sha = commitFixtureFile(dir, 'only.txt', 'x', 'only commit');
        const eventPath = writeFixtureEvent(dir, { before: sha, after: sha });
        const evidence = resolveChangedFileEvidence({ cwd: dir, eventName: 'push', eventPath });
        expect(evidence).toEqual({ source: 'GIT_RANGE', files: [], fileCount: 0, complete: true });
      });
    });

    it('rejects incomplete evidence at the currentCheckoutChangedFileCount guard boundary', () => {
      expect(() => currentCheckoutChangedFileCount(() => ({
        source: 'PUSH_PAYLOAD',
        files: [],
        fileCount: 3,
        complete: false,
      }))).toThrow('W2_CHANGED_FILE_EVIDENCE_UNAVAILABLE:INCOMPLETE');
    });
  });
});

interface RuntimeFixture {
  tenantA: string;
  tenantB: string;
  userA: string;
  userB: string;
  officeA: string;
  officeB: string;
  seededClientId: string;
  seededDebtorId: string;
  caseId: string;
  caseDebtorId: string;
  claimItemId: string;
}

describeWithDisposableDb('R01 W2 core user journeys - controlled Nest runtime and disposable PostgreSQL', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let fixture: RuntimeFixture;
  let auditService: AuditService;
  let clientService: ClientService;
  let debtorService: DebtorService;
  let claimItemService: ClaimItemService;
  let collectionService: CollectionService;
  let officeService: OfficeService;
  let domainEvents: DomainEventIngestService;
  let summaryEngine: SummaryEngineService;
  let journalWriter: AccountingJournalWriterService;
  const tenantIdsToClean = new Set<string>();

  const auth = {
    validateUser: jest.fn(async (userId: string | undefined) => {
      if (!userId || !prisma) return null;
      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tenantId: true,
          email: true,
          name: true,
          surname: true,
          role: true,
          isActive: true,
          tokenVersion: true,
        },
      });
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();

    auditService = new AuditService(prisma as never);
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
    clientService = new ClientService(prisma as never, auditService, officeApproval as never);
    debtorService = new DebtorService(prisma as never, auditService, officeApproval as never);

    domainEvents = new DomainEventIngestService();
    const claimWriteGate = new ClaimItemWriteGateService(prisma as never);
    const claimWriterRouter = new ClaimItemWriterRouterService(
      prisma as never,
      claimWriteGate,
      domainEvents,
    );
    claimItemService = new ClaimItemService(
      prisma as never,
      undefined,
      auditService,
      officeApproval as never,
      claimWriterRouter,
      domainEvents,
    );

    summaryEngine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await summaryEngine.onModuleInit();
    journalWriter = new AccountingJournalWriterService(prisma as never);
    collectionService = new CollectionService(
      prisma as never,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      summaryEngine,
      journalWriter,
      undefined,
      auditService,
    );
    officeService = new OfficeService(prisma as never, auditService);

    const receiptAuthorization = new ReceiptObjectScopeAuthorizationService(
      prisma as never,
      { isSecretConfigured: () => false } as never,
    );

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [
        ClientController,
        DebtorController,
        ClaimItemController,
        CollectionController,
        OfficeController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        { provide: AuthService, useValue: auth },
        { provide: ClientService, useValue: clientService },
        { provide: ClientIntakeLinkService, useValue: {} },
        { provide: PoaService, useValue: {} },
        { provide: DebtorService, useValue: debtorService },
        { provide: DebtorCrossCaseNotificationService, useValue: {} },
        { provide: CaseDebtorService, useValue: {} },
        { provide: DebtorCrossCaseNotificationTaskLinkService, useValue: {} },
        { provide: ClaimItemService, useValue: claimItemService },
        { provide: CollectionService, useValue: collectionService },
        { provide: ReceiptObjectScopeAuthorizationService, useValue: receiptAuthorization },
        { provide: OfficeService, useValue: officeService },
        { provide: GuidedOpenObserveService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) =>
              key === 'JWT_SECRET' ? TEST_SECRET : defaultValue,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useLogger(false);
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const tenantId of [...tenantIdsToClean]) await cleanupTenant(tenantId);
    if (prisma) await prisma.$disconnect();
  });

  function bearer(userId: string, tenantId: string, overrides: Record<string, unknown> = {}): string {
    return `Bearer ${jwt.sign({
      sub: userId,
      tenantId,
      email: `${userId}@example.test`,
      role: 'USER',
      tokenVersion: 0,
      ...overrides,
    })}`;
  }

  async function createFixture(): Promise<RuntimeFixture> {
    const suffix = randomUUID();
    const tenantA = `w2-a-${suffix}`;
    const tenantB = `w2-b-${suffix}`;
    tenantIdsToClean.add(tenantA);
    tenantIdsToClean.add(tenantB);

    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'W2 Tenant A', slug: tenantA },
        { id: tenantB, name: 'W2 Tenant B', slug: tenantB },
      ],
    });
    const userA = await prisma.user.create({
      data: { tenantId: tenantA, email: `w2-a-${suffix}@example.test`, name: 'W2', surname: 'Actor A' },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB, email: `w2-b-${suffix}@example.test`, name: 'W2', surname: 'Actor B' },
    });
    const officeA = await prisma.office.create({ data: { tenantId: tenantA, name: 'W2 Office A' } });
    const officeB = await prisma.office.create({ data: { tenantId: tenantB, name: 'W2 Office B' } });
    const lawyerA = await prisma.lawyer.create({
      data: {
        tenantId: tenantA,
        officeId: officeA.id,
        userId: userA.id,
        name: 'W2',
        surname: 'Lawyer',
      },
    });
    const seededClient = await prisma.client.create({
      data: { tenantId: tenantA, displayName: 'W2 Seed Client', type: 'INDIVIDUAL' },
    });
    const seededDebtor = await prisma.debtor.create({
      data: { tenantId: tenantA, name: 'W2 Seed Debtor', type: 'INDIVIDUAL' },
    });
    const legalCase = await prisma.case.create({
      data: {
        tenantId: tenantA,
        clientId: seededClient.id,
        fileNumber: `W2-${suffix}`,
        type: 'GENERAL_EXECUTION',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        interestType: 'YASAL',
      },
    });
    await prisma.caseLawyer.create({
      data: {
        caseId: legalCase.id,
        lawyerId: lawyerA.id,
        casePermissions: { canEditFinance: true },
      },
    });
    const caseDebtor = await prisma.caseDebtor.create({
      data: { caseId: legalCase.id, debtorId: seededDebtor.id, role: 'ASIL_BORCLU' },
    });
    const claimItem = await prisma.claimItem.create({
      data: {
        tenantId: tenantA,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: 10_000,
        demandedAmount: 10_000,
        amount: 10_000,
        currency: 'TRY',
        interestType: 'YASAL',
        interestStartDate: new Date('2026-06-01T00:00:00.000Z'),
        interestAccrualStatus: 'ACCRUES',
        interestStartDateProvenance: 'MANUAL_LAWYER_CONFIRMED',
        liableDebtorIds: [],
      },
    });

    return {
      tenantA,
      tenantB,
      userA: userA.id,
      userB: userB.id,
      officeA: officeA.id,
      officeB: officeB.id,
      seededClientId: seededClient.id,
      seededDebtorId: seededDebtor.id,
      caseId: legalCase.id,
      caseDebtorId: caseDebtor.id,
      claimItemId: claimItem.id,
    };
  }

  async function cleanupTenant(tenantId: string): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.icrabotOutboxAction.deleteMany({ where: { tenantId } });
    await prisma.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await prisma.collectionOverpayment.deleteMany({ where: { tenantId } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId } });
    await prisma.collection.deleteMany({ where: { tenantId } });
    await prisma.claimItem.deleteMany({ where: { tenantId } });
    await prisma.task.deleteMany({ where: { tenantId } });
    await prisma.caseLawyer.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.office.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    tenantIdsToClean.delete(tenantId);
    // IcrabotTimelineEntry is append-only. Random tenant/case identities isolate the
    // residue, and the disposable PostgreSQL service is destroyed after the test job.
  }

  it.each([
    ['CLIENT', () => `/api/clients/${fixture.seededClientId}`],
    ['DEBTOR', () => `/api/debtors/${fixture.seededDebtorId}`],
    ['RECEIVABLE', () => `/api/claim-items/${fixture.claimItemId}`],
    ['COLLECTION', () => '/api/collections/unauthorized-probe'],
    ['OFFICE', () => '/api/office'],
  ])('%s protected entry point rejects an unauthorized actor', async (_module, url) => {
    await request(app.getHttpServer()).get(url()).expect(401);
  });

  it('missing or unknown subject identity fails closed and a tenant claim cannot replace trusted persisted identity', async () => {
    const missingSubject = `Bearer ${jwt.sign({ tenantId: fixture.tenantA, role: 'USER' })}`;
    await request(app.getHttpServer()).get('/api/office').set('Authorization', missingSubject).expect(401);
    await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', bearer(`missing-${randomUUID()}`, fixture.tenantA))
      .expect(401);

    const response = await request(app.getHttpServer())
      .get(`/api/clients/${fixture.seededClientId}`)
      .set('Authorization', bearer(fixture.userA, fixture.tenantB))
      .expect(200);
    expect(response.body.data.id).toBe(fixture.seededClientId);
    expect(response.body.data.tenantId).toBe(fixture.tenantA);
  });

  it('CLIENT: actual create/read persists tenant-scoped client and audit; forced audit failure rolls both back', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const created = await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', tokenA)
      .send({ firstName: 'Controlled', lastName: 'Client', email: 'client@example.test', phone: '+900000000001' })
      .expect(201);
    const clientId = created.body.data.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body.data).toMatchObject({ id: clientId, tenantId: fixture.tenantA, displayName: 'Controlled Client' });
    await expect(prisma.client.findFirst({ where: { id: clientId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ displayName: 'Controlled Client' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: clientId, action: 'CLIENT_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const clientCountBefore = await prisma.client.count({ where: { tenantId: fixture.tenantA } });
    const auditCountBefore = await prisma.auditLog.count({ where: { tenantId: fixture.tenantA } });
    const failingService = new ClientService(
      prisma as never,
      { logInTransaction: jest.fn().mockRejectedValue(new Error('FORCED_W2_CLIENT_AUDIT_FAILURE')) } as never,
      { isApproverEligible: jest.fn().mockResolvedValue(false) } as never,
    );
    await expect(failingService.create(
      fixture.tenantA,
      { firstName: 'Rollback', lastName: 'Client', email: 'rollback@example.test', phone: '+900000000002' },
      { userId: fixture.userA },
    )).rejects.toThrow('FORCED_W2_CLIENT_AUDIT_FAILURE');
    await expect(prisma.client.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(clientCountBefore);
    await expect(prisma.auditLog.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(auditCountBefore);
  });

  it('DEBTOR: actual create/read is tenant isolated and duplicate failure leaves no partial state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const body = {
      type: 'INDIVIDUAL',
      firstName: 'Controlled',
      lastName: 'Debtor',
      tckn: '10000000146',
      forceCreate: true,
    };
    const created = await request(app.getHttpServer())
      .post('/api/debtors')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    const debtorId = created.body.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/debtors/${debtorId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: debtorId, tenantId: fixture.tenantA, name: 'Controlled Debtor' });
    await expect(prisma.debtor.findFirst({ where: { id: debtorId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ identityNo: '10000000146' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: debtorId, action: 'DEBTOR_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    await request(app.getHttpServer())
      .get(`/api/debtors/${debtorId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const countBefore = await prisma.debtor.count({ where: { tenantId: fixture.tenantA } });
    await request(app.getHttpServer())
      .post('/api/debtors')
      .set('Authorization', tokenA)
      .send(body)
      .expect(409);
    await expect(prisma.debtor.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(countBefore);
  });

  it('RECEIVABLE: active ClaimItem read-back works and contained human create leaves no state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const list = await request(app.getHttpServer())
      .get(`/api/claim-items/case/${fixture.caseId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(list.body.data.map((item: { id: string }) => item.id)).toContain(fixture.claimItemId);

    const detail = await request(app.getHttpServer())
      .get(`/api/claim-items/${fixture.claimItemId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(detail.body.data).toMatchObject({ id: fixture.claimItemId, tenantId: fixture.tenantA, caseId: fixture.caseId });
    await expect(prisma.claimItem.findFirst({
      where: { id: fixture.claimItemId, tenantId: fixture.tenantA, caseId: fixture.caseId },
    })).resolves.toMatchObject({ status: 'ACTIVE' });

    const foreignList = await request(app.getHttpServer())
      .get(`/api/claim-items/case/${fixture.caseId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(200);
    expect(foreignList.body.data).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/claim-items/${fixture.claimItemId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const countBefore = await prisma.claimItem.count({ where: { tenantId: fixture.tenantA } });
    const rejected = await request(app.getHttpServer())
      .post('/api/claim-items')
      .set('Authorization', tokenA)
      .send({ caseId: fixture.caseId, itemType: 'EXPENSE', amount: 125, currency: 'TRY' })
      .expect(400);
    expect(rejected.body).toMatchObject({
      code: 'FORMATION_CONTEXT_REQUIRED',
      message: 'Complete claim formation context is required.',
    });
    await expect(prisma.claimItem.count({ where: { tenantId: fixture.tenantA } })).resolves.toBe(countBefore);
  });

  it('COLLECTION: actual receipt dispatch writes/read-backs every side effect, replays idempotently, and rolls back on audit failure', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const body = {
      caseId: fixture.caseId,
      caseDebtorId: fixture.caseDebtorId,
      idempotencyKey: randomUUID(),
      amount: 500,
      currency: 'TRY',
      type: CollectionType.BANK_TRANSFER,
      channel: CollectionChannel.BANKA,
      date: '2026-07-20T00:00:00.000Z',
      sourceType: CollectionSource.MANUAL,
      receiptNo: `W2-${randomUUID()}`,
      autoAllocate: false,
    };
    const created = await request(app.getHttpServer())
      .post('/api/collections')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    const collectionId = created.body.id as string;

    const read = await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: collectionId, tenantId: fixture.tenantA, status: 'CONFIRMED' });
    await expect(prisma.collection.findFirst({ where: { id: collectionId, tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ caseId: fixture.caseId });
    await expect(prisma.ledgerEntry.findFirst({
      where: { tenantId: fixture.tenantA, collectionId, entryType: 'PAYMENT' },
    })).resolves.toMatchObject({ caseId: fixture.caseId, status: 'CONFIRMED' });
    await expect(prisma.accountingJournalEntry.findFirst({
      where: { tenantId: fixture.tenantA, sourceId: collectionId, sourceAction: 'recorded' },
    })).resolves.toBeTruthy();
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: collectionId, action: 'COLLECTION_CREATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });
    const event = await prisma.icrabotTimelineEntry.findFirstOrThrow({
      where: { tenantId: fixture.tenantA, caseId: fixture.caseId, type: 'PAYMENT_RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });
    const eventId = (event.body as any).header.eventId as string;
    await expect(prisma.icrabotOutboxAction.findUnique({ where: { idempotencyKey: `evt:${eventId}` } }))
      .resolves.toBeTruthy();
    await request(app.getHttpServer())
      .get(`/api/collections/${collectionId}`)
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(404);

    const replay = await request(app.getHttpServer())
      .post('/api/collections')
      .set('Authorization', tokenA)
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(collectionId);
    await expect(prisma.collection.count({ where: { tenantId: fixture.tenantA, idempotencyKey: body.idempotencyKey } }))
      .resolves.toBe(1);

    const countsBefore = await Promise.all([
      prisma.collection.count({ where: { tenantId: fixture.tenantA } }),
      prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.auditLog.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotTimelineEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantA } }),
    ]);
    const failingService = new CollectionService(
      prisma as never,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as never),
      summaryEngine,
      journalWriter,
      undefined,
      { logInTransaction: jest.fn().mockRejectedValue(new Error('FORCED_W2_COLLECTION_AUDIT_FAILURE')) } as never,
    );
    await expect(failingService.create(
      fixture.tenantA,
      { ...body, idempotencyKey: randomUUID(), receiptNo: `W2-ROLLBACK-${randomUUID()}` },
      fixture.userA,
      { correlationId: `w2-rollback-${randomUUID()}` },
    )).rejects.toThrow('FORCED_W2_COLLECTION_AUDIT_FAILURE');
    const countsAfter = await Promise.all([
      prisma.collection.count({ where: { tenantId: fixture.tenantA } }),
      prisma.ledgerEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.accountingJournalEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.auditLog.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotTimelineEntry.count({ where: { tenantId: fixture.tenantA } }),
      prisma.icrabotOutboxAction.count({ where: { tenantId: fixture.tenantA } }),
    ]);
    expect(countsAfter).toEqual(countsBefore);
  });

  it('OFFICE: actual non-secret update/read is tenant isolated and rejected update preserves prior state', async () => {
    const tokenA = bearer(fixture.userA, fixture.tenantA);
    const updated = await request(app.getHttpServer())
      .put('/api/office')
      .set('Authorization', tokenA)
      .send({ name: 'W2 Certified Office', address: 'Controlled Local', city: 'Ankara' })
      .expect(200);
    expect(updated.body).toMatchObject({ id: fixture.officeA, tenantId: fixture.tenantA, name: 'W2 Certified Office' });

    const read = await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', tokenA)
      .expect(200);
    expect(read.body).toMatchObject({ id: fixture.officeA, tenantId: fixture.tenantA, name: 'W2 Certified Office' });
    await expect(prisma.office.findUnique({ where: { tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ name: 'W2 Certified Office', city: 'Ankara' });
    await expect(prisma.auditLog.findFirst({
      where: { tenantId: fixture.tenantA, entityId: fixture.officeA, entityType: 'OFFICE_SETTINGS', action: 'UPDATE' },
    })).resolves.toMatchObject({ userId: fixture.userA });

    const foreign = await request(app.getHttpServer())
      .get('/api/office')
      .set('Authorization', bearer(fixture.userB, fixture.tenantB))
      .expect(200);
    expect(foreign.body).toMatchObject({ id: fixture.officeB, tenantId: fixture.tenantB, name: 'W2 Office B' });
    expect(foreign.body.id).not.toBe(fixture.officeA);

    await request(app.getHttpServer())
      .put('/api/office')
      .set('Authorization', tokenA)
      .send({ name: null })
      .expect(500);
    await expect(prisma.office.findUnique({ where: { tenantId: fixture.tenantA } }))
      .resolves.toMatchObject({ name: 'W2 Certified Office', city: 'Ankara' });
  });
});

describe('R01 W2 certification artifact, static composition and boundary integrity', () => {
  const readModel = () => JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'journey-inventory.json'), 'utf8'));

  it('binds exactly five module journeys with J0-J7 PASS and separate deployment axes', () => {
    const model = readModel();
    expect(model.schemaVersion).toBe(1);
    expect(model.program).toBe('RUNTIME-OPERABILITY-CERTIFICATION-R01');
    expect(model.task).toBe('W2-CORE-USER-JOURNEYS');
    expect(model.journeys).toHaveLength(5);
    expect(model.journeys.map((item: any) => item.module).sort())
      .toEqual(['CLIENT', 'COLLECTION', 'DEBTOR', 'OFFICE', 'RECEIVABLE']);
    expect(model.journeys.every((item: any) =>
      Object.values(item.certificationLevels).every((status) => status === 'PASS') &&
      item.finalStatus === 'CONTROLLED_LOCAL_CERTIFIED')).toBe(true);
    expect(model.statusAxes).toMatchObject({
      codeDeploymentStatus: 'NOT PERFORMED',
      controlledLocalRuntimeStatus: 'CONTROLLED_LOCAL_CERTIFIED',
      deployedEnvironmentRuntimeStatus: 'NOT ASSESSED',
    });
  });

  it('verifies production AppModule composition for all five selected controllers/services', () => {
    const appModule = fs.readFileSync(path.join(projectRoot, 'apps', 'api', 'src', 'app.module.ts'), 'utf8');
    for (const moduleName of ['ClientModule', 'DebtorModule', 'ClaimItemModule', 'CollectionModule', 'OfficeModule']) {
      expect(appModule).toMatch(new RegExp(`\\b${moduleName}\\b`));
    }
    const bindings = [
      ['client/client.module.ts', 'ClientController', 'ClientService'],
      ['debtor/debtor.module.ts', 'DebtorController', 'DebtorService'],
      ['claim-item/claim-item.module.ts', 'ClaimItemController', 'ClaimItemService'],
      ['collection/collection.module.ts', 'CollectionController', 'CollectionService'],
      ['office/office.module.ts', 'OfficeController', 'OfficeService'],
    ];
    for (const [relative, controller, service] of bindings) {
      const source = fs.readFileSync(path.join(projectRoot, 'apps', 'api', 'src', 'modules', relative), 'utf8');
      expect(source).toContain(controller);
      expect(source).toContain(service);
    }
  });

  it('regenerates all seven artifacts byte-for-byte deterministically', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'roc-w2-'));
    try {
      const result = spawnSync(process.execPath, [
        generatorPath,
        '--audit-base-sha',
        auditBaseSha,
        '--out-dir',
        tempRoot,
      ], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      expect(result.status).toBe(0);
      for (const file of outputFiles) {
        expect(fs.readFileSync(path.join(tempRoot, file)))
          .toEqual(fs.readFileSync(path.join(artifactDirectory, file)));
      }
    } finally {
      const resolved = path.resolve(tempRoot);
      expect(resolved.startsWith(path.resolve(os.tmpdir()))).toBe(true);
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  it('pins W0/W1 seals and binds the runtime spec exactly once to required DB CI', () => {
    const model = readModel();
    for (const [file, expectedBlob] of Object.entries(model.metadata.w0ArtifactBlobs)) {
      expect(git('hash-object', file)).toBe(expectedBlob);
    }
    expect(git('hash-object', w1DecisionLogPath)).toBe(expectedW1DecisionLogBlob);
    expect(git('rev-parse', `HEAD:${w1ArtifactDirectory}`))
      .toBe(model.metadata.w1ArtifactTreeSha);
    expect(git(
      'status',
      '--porcelain',
      '--',
      ...Object.keys(model.metadata.w0ArtifactBlobs),
      w1ArtifactDirectory,
    )).toBe('');
    const manifestLines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).map((line) => line.trim());
    expect(manifestLines.filter((line) => line === runtimeSpecPath.replace('project/apps/api/', ''))).toHaveLength(1);
  });

  it('enforces the exact W2 changed-file allowlist and prohibited activation boundary', () => {
    expect(currentCheckoutChangedFileCount()).toBeGreaterThan(0);
    const tracked = git(
      'ls-files',
      '--',
      runtimeSpecPath,
      'project/apps/api/ci-manifests/db/domain-integration.txt',
      'project/scripts/runtime-core-user-journeys-certification-r01.cjs',
      w2ArtifactDirectoryPath,
    ).split(/\r?\n/).filter(Boolean);
    const untracked = git(
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      w2ArtifactDirectoryPath,
    ).split(/\r?\n/).filter(Boolean);
    expect([...new Set([...tracked, ...untracked])].sort()).toEqual(expectedW2ChangedFiles);
    expect(expectedW2ChangedFiles.some((file) =>
      /schema\.prisma|\/migrations\/|\.github\/workflows|playbook|manifest-admin|break-glass/i.test(file)))
      .toBe(false);
  });
});
