'use strict';
/**
 * How the panel reads.
 *
 * One rule governs every choice here: the failures must be the easiest thing on
 * the screen to find. A verifier whose output is skimmed is a verifier that is
 * not consulted, and the specific way that happens is a wall of green with one
 * red line in the middle of it.
 *
 * So: every selected capability is printed, PASS included — hiding the green
 * lines would make "capability absent from the manifest" invisible, which is
 * itself one of the failures being guarded against — and the ones that are not
 * PASS are repeated underneath with their reason spelled out.
 */

const COLUMNS = [
  { key: 'capabilityId', head: 'CAPABILITY', width: 42 },
  { key: 'deliveryClass', head: 'CLASS', width: 20 },
  { key: 'targetState', head: 'TARGET', width: 16 },
  { key: 'observedState', head: 'OBSERVED', width: 16 },
  { key: 'verdict', head: 'VERDICT', width: 10 },
  { key: 'probeClass', head: 'PROBE', width: 15 },
  { key: 'verifiedAtSha', head: 'VERIFIED_AT_SHA', width: 14 },
];

function pad(s, n) {
  const v = String(s === null || s === undefined ? '—' : s);
  return v.length >= n ? v.slice(0, n - 1) + '…' : v + ' '.repeat(n - v.length);
}

function shortClass(c) {
  // The class names are long because they are load-bearing prose in the
  // manifest. In a table they only need to be distinguishable.
  return String(c || '')
    .replace('INTERNAL_ENFORCEMENT_REACHED_THROUGH_PUBLIC_PATH', 'INTERNAL(PUBLIC)')
    .replace('SERVICE_FINALIZATION', 'SERVICE_FINAL')
    .replace('PROBE_', '');
}

/** The human panel. */
function panel(p) {
  const lines = [];
  lines.push('HUKUK PLATFORM — OPERATIONAL DELIVERY');
  lines.push('');
  lines.push('  mode          : ' + p.mode);
  lines.push('  verified at   : ' + (p.verifiedAtSha || '(unknown)') + (p.sourceBranch ? '  [' + p.sourceBranch + ']' : ''));
  if (p.dirtyTree) {
    // Stated at the top, not in a footnote. Every verdict below is suspect and
    // the reader has to know that before reading them.
    lines.push('  TREE IS DIRTY : evidence taken with uncommitted changes is not evidence for this SHA');
  }
  if (p.expectedMergeSha) lines.push('  expected merge: ' + p.expectedMergeSha);
  lines.push('');

  lines.push(COLUMNS.map((c) => pad(c.head, c.width)).join('') + 'DETAIL');
  lines.push('─'.repeat(COLUMNS.reduce((a, c) => a + c.width, 0) + 8));

  for (const r of p.capabilities) {
    lines.push(
      COLUMNS.map((c) => {
        if (c.key === 'verifiedAtSha') return pad((r.verifiedAtSha || '').slice(0, 12), c.width);
        if (c.key === 'deliveryClass' || c.key === 'probeClass') return pad(shortClass(r[c.key]), c.width);
        return pad(r[c.key], c.width);
      }).join('') + (r.verdict === 'PASS' ? '' : r.failureCode || ''),
    );
  }

  lines.push('');
  lines.push('SUMMARY');
  for (const k of Object.keys(p.counts)) {
    if (p.counts[k]) lines.push('  ' + pad(k, 20) + p.counts[k]);
  }
  lines.push('');
  lines.push('OVERALL: ' + p.overall);

  const bad = p.capabilities.filter((r) => r.verdict !== 'PASS' && r.verdict !== 'NOT_APPLICABLE');
  if (bad.length) {
    lines.push('');
    lines.push('NOT DELIVERED');
    for (const r of bad) {
      lines.push('');
      lines.push('  ' + r.capabilityId + '  —  target ' + r.targetState + ', observed ' + r.observedState);
      if (r.failureCode) lines.push('    code   : ' + r.failureCode);
      if (r.detail) lines.push('    detail : ' + r.detail);
      const failedStep = (r.steps || []).filter((s) => s.verdict !== 'PASS' && s.verdict !== 'REFUSED' && s.verdict !== 'ADMITTED')[0];
      if (failedStep) lines.push('    step   : ' + failedStep.name + ' -> ' + failedStep.verdict);
    }
  }
  lines.push('');
  lines.push('evidence digest: ' + p.evidenceDigest);
  return lines.join('\n');
}

/** The machine panel. Same data, no formatting decisions. */
function json(p) {
  return JSON.stringify(p, null, 2);
}

module.exports = { COLUMNS, pad, shortClass, panel, json };
