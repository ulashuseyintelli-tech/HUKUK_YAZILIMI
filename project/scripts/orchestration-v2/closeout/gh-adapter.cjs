'use strict';

/**
 * Closeout adapter — gercek `gh` ve `git` yuzeyi.
 *
 * Owner 3.11 security:
 *   - komutlar execFileSync ile argv dizisi olarak calistirilir; shell yok,
 *     string concatenation yok, dolayisiyla command injection yuzeyi yok
 *   - branch/path/sha girdileri core tarafinda sekil dogrulamasindan gecer
 *   - destructive reset/clean kullanilmaz
 *   - fiziksel recursive silme yapilmaz (AGENTS.md §6)
 *
 * Cagrildigi yerler:
 * - closeout/cli.cjs -> gercek calistirma
 * (testler bu dosyayi kullanmaz; core'a fake adapter verilir)
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

/** Gecici ag/servis hatasi mi? Yalniz bunlar yeniden denenir. */
const TRANSIENT = /(dial tcp|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|502 Bad Gateway|503|504|rate limit|secondary rate|timeout awaiting)/i;

function execOnce(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * READ-ONLY komutlar icin sinirli retry.
 *
 * Yalniz gecici ag/servis hatalarinda yeniden denenir; is mantigi hatasi
 * (ornegin "PR not found") ilk denemede yukselir. MUTATION komutlari bu yoldan
 * GECMEZ — `gh pr merge` retry edilirse cift merge riski dogar; oradaki hata
 * cagirana aynen gider ve closeout MERGE_FAILED ile fail-closed olur.
 *
 * Bu oturumda gercekten yasandi: `Post https://api.github.com/graphql: dial tcp
 * ... baglanti kurulamadi`. Tek seferlik bir ag hatasi, gate'leri gecmis bir
 * kapanisi gereksiz yere BLOCKED yapmamalidir.
 */
function run(cmd, args, cwd, opts) {
  const attempts = opts && opts.attempts != null ? opts.attempts : 3;
  const baseDelayMs = opts && opts.baseDelayMs != null ? opts.baseDelayMs : 800;
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return execOnce(cmd, args, cwd);
    } catch (e) {
      lastErr = e;
      const text = String((e && e.stderr) || (e && e.message) || '');
      if (i === attempts - 1 || !TRANSIENT.test(text)) throw e;
      sleepSync(baseDelayMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

/** Mutation komutlari: retry YOK. */
function runOnce(cmd, args, cwd) {
  return execOnce(cmd, args, cwd);
}

function tryRun(cmd, args, cwd) {
  try {
    return run(cmd, args, cwd);
  } catch (e) {
    return null;
  }
}

function ghJson(args, cwd) {
  const out = run('gh', args, cwd);
  return out ? JSON.parse(out) : null;
}

/**
 * @param {object} o
 * @param {string} o.repoCwd canonical repository root
 * @param {string} [o.repository] owner/name
 */
function createGhCloseoutAdapter(o) {
  const cwd = o.repoCwd;
  const targetBranch = o.targetBranch || 'main';

  return {
    async repositoryIdentity() {
      const j = ghJson(['repo', 'view', '--json', 'nameWithOwner'], cwd);
      return j ? j.nameWithOwner : null;
    },

    /**
     * Authority ledger opsiyoneldir. Repo'da bir kayit varsa baglayicidir;
     * yoksa null doner ve core reuse kontrolunu atlar (fail-open DEGIL:
     * authorityRef ve type zaten zorunlu ve dogrulanmistir).
     */
    async authorityLedgerEntry(ref) {
      const p = o.ledgerPath;
      if (!p || !fs.existsSync(p)) return null;
      try {
        const ledger = JSON.parse(fs.readFileSync(p, 'utf8'));
        return (ledger.entries || []).find((e) => e.authorityRef === ref) || null;
      } catch (e) {
        return null;
      }
    },

    async getPr(pr) {
      const j = ghJson(
        ['pr', 'view', String(pr), '--json', 'state,mergeable,mergeStateStatus,headRefOid,headRefName,baseRefName,mergeCommit'],
        cwd,
      );
      return {
        state: j.state,
        mergeable: j.mergeable,
        mergeStateStatus: j.mergeStateStatus,
        headRefOid: j.headRefOid,
        headRefName: j.headRefName,
        baseRefName: j.baseRefName,
        mergeCommitOid: j.mergeCommit ? j.mergeCommit.oid : null,
      };
    },

    async changedPaths(pr) {
      const j = ghJson(['pr', 'view', String(pr), '--json', 'files'], cwd);
      return (j.files || []).map((f) => f.path);
    },

    async getChecks(pr) {
      const j = ghJson(['pr', 'checks', String(pr), '--json', 'name,state,bucket'], cwd) || [];
      // gh'in bucket/state sozlugunu mergeready'nin bekledigi
      // status/conclusion ciftine cevirir.
      return j.map((c) => {
        const b = String(c.bucket || '').toLowerCase();
        const terminal = b !== 'pending';
        return {
          name: c.name,
          status: terminal ? 'COMPLETED' : 'IN_PROGRESS',
          conclusion: terminal ? (b === 'pass' ? 'SUCCESS' : 'FAILURE') : null,
        };
      });
    },

    async platformRequiredChecks() {
      const out = tryRun(
        'gh',
        ['api', 'repos/{owner}/{repo}/branches/' + targetBranch + '/protection', '--jq', '.required_status_checks.contexts[]?'],
        cwd,
      );
      return out ? out.split('\n').filter(Boolean) : [];
    },

    async remoteBranchHead(branch) {
      const out = tryRun('git', ['rev-parse', 'origin/' + branch], cwd);
      return out || null;
    },

    async localHead(worktree) {
      if (!fs.existsSync(worktree)) return null;
      return tryRun('git', ['rev-parse', 'HEAD'], worktree);
    },

    /** Instruction/scope yuzeyine dokunan baska ACIK PR var mi. */
    async competingWriters(pr, changedPaths) {
      const list = ghJson(['pr', 'list', '--state', 'open', '--json', 'number'], cwd) || [];
      const hits = [];
      for (const entry of list) {
        if (entry.number === pr) continue;
        const j = ghJson(['pr', 'view', String(entry.number), '--json', 'files'], cwd);
        const paths = (j.files || []).map((f) => f.path);
        const shared = paths.filter((p) => changedPaths.indexOf(p) !== -1);
        if (shared.length) hits.push('#' + entry.number + ':' + shared.join('|'));
      }
      return hits;
    },

    async ownerWipCollision() {
      const out = tryRun('git', ['status', '--porcelain', '--untracked-files=no'], cwd);
      return !!(out && out.length);
    },

    async squashMerge(pr) {
      // --delete-branch KULLANILMAZ: worktree cekiliyken local branch silinemez
      // ve komut hata verir. Branch temizligi ayri asamada yapilir (owner 3.6/4).
      // Mutation: retry YOK (cift merge riski).
      runOnce('gh', ['pr', 'merge', String(pr), '--squash'], cwd);
      return true;
    },

    async syncMain() {
      run('git', ['fetch', 'origin', '--prune'], cwd);
      const branch = tryRun('git', ['branch', '--show-current'], cwd);
      if (branch === targetBranch) run('git', ['merge', '--ff-only', 'origin/' + targetBranch], cwd);
      const mainSha = run('git', ['rev-parse', targetBranch], cwd);
      const counts = run('git', ['rev-list', '--left-right', '--count', 'origin/' + targetBranch + '...' + targetBranch], cwd);
      const [behind, ahead] = counts.split(/\s+/);
      return { mainSha, aheadBehind: behind + '/' + ahead };
    },

    async isAncestor(sha) {
      try {
        run('git', ['merge-base', '--is-ancestor', sha, 'origin/' + targetBranch], cwd);
        return true;
      } catch (e) {
        return false;
      }
    },

    async cleanupBranch(branch) {
      if (!branch) return 'NOT_APPLICABLE';
      const remote = tryRun('git', ['ls-remote', '--heads', 'origin', branch], cwd);
      if (remote) tryRun('git', ['push', 'origin', '--delete', branch], cwd);
      tryRun('git', ['branch', '-D', branch], cwd);
      // Her iki tarafi da DOGRULA. Yalniz remote'a bakmak, worktree checkout
      // tuttugu icin silinemeyen bir local branch'i DELETED gostermisti.
      const remoteLeft = tryRun('git', ['ls-remote', '--heads', 'origin', branch], cwd);
      const localLeft = tryRun('git', ['branch', '--list', branch], cwd);
      if (remoteLeft) return 'REMOTE_BRANCH_REMAINS';
      if (localLeft) return 'LOCAL_BRANCH_REMAINS';
      return 'DELETED';
    },

    /** AGENTS.md §6: yalniz remove --force + prune; fiziksel silme yok. */
    async cleanupWorktree(path) {
      if (!fs.existsSync(path)) {
        run('git', ['worktree', 'prune'], cwd);
        return 'ALREADY_ABSENT';
      }
      tryRun('git', ['worktree', 'remove', '--force', path], cwd);
      run('git', ['worktree', 'prune'], cwd);
      if (fs.existsSync(path)) return 'ORPHANED_WORKTREE_DIR';
      return 'REMOVED';
    },

    /**
     * Owner 3.2: authority reference tuketildi olarak isaretlenir; ayni ref
     * baska bir PR'da kullanilamaz. Ledger yoksa NO_LEDGER doner — kapanis
     * gecerlidir, yalniz reuse korumasi kayit tutmaz.
     */
    async consumeAuthority(ref, meta) {
      const p = o.ledgerPath;
      if (!p) return 'NO_LEDGER';
      let ledger = { entries: [] };
      if (fs.existsSync(p)) {
        try {
          ledger = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (e) {
          return 'LEDGER_UNREADABLE';
        }
      }
      if (!Array.isArray(ledger.entries)) ledger.entries = [];
      const existing = ledger.entries.find((e) => e.authorityRef === ref);
      const stamp = {
        consumed: true,
        consumedPr: meta ? meta.pr : null,
        consumedTaskId: meta ? meta.taskId : null,
        consumedMergeSha: meta ? meta.mergeSha : null,
      };
      if (existing) Object.assign(existing, stamp);
      else ledger.entries.push(Object.assign({ authorityRef: ref }, stamp));
      fs.writeFileSync(p, JSON.stringify(ledger, null, 2) + String.fromCharCode(10), 'utf8');
      return 'CONSUMED';
    },

    async verifyCanonical() {
      const status = tryRun('git', ['status', '--porcelain', '--untracked-files=no'], cwd);
      if (status === null) return 'GIT_STATUS_FAILED';
      const cfg = tryRun('git', ['config', '--list'], cwd);
      if (cfg === null) return 'GIT_CONFIG_UNREADABLE';
      const local = tryRun('git', ['rev-parse', targetBranch], cwd);
      const remote = tryRun('git', ['rev-parse', 'origin/' + targetBranch], cwd);
      if (!local || local !== remote) return 'CANONICAL_EQUALITY_FAILED';
      return 'OK';
    },
  };
}

module.exports = { createGhCloseoutAdapter };
