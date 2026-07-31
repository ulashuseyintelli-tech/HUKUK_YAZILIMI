'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GOVERNANCE_ROOT = path.resolve(__dirname, '../../docs/governance');
const PACK_PATH = path.join(
  GOVERNANCE_ROOT,
  'RECEIVABLE-NAFAKA-LEGAL-BASIS-DECISION-PACK-v2.md',
);
const CHECKSUM_PATH = path.join(
  GOVERNANCE_ROOT,
  'RECEIVABLE-NAFAKA-LEGAL-BASIS-DECISION-PACK-v2.checksum.json',
);
const BEGIN = '<!-- DECISION_PACK_JSON_BEGIN -->';
const END = '<!-- DECISION_PACK_JSON_END -->';
const EXPECTED_CODES = Object.freeze([
  'ADULT_CHILD_EDUCATION_MAINTENANCE',
  'FAMILY_SUPPORT_MAINTENANCE',
  'INTERIM_MAINTENANCE',
  'MINOR_CHILD_MAINTENANCE',
  'POVERTY_MAINTENANCE',
  'SEPARATE_LIVING_SPOUSAL_MAINTENANCE',
]);
const EXPECTED_LEGAL_BASES = Object.freeze([
  'TMK_169',
  'TMK_175_176',
  'TMK_182_2',
  'TMK_197',
  'TMK_327_330',
  'TMK_328_2',
  'TMK_364_366',
]);
const EXACT_ENTRY_KEYS = Object.freeze([
  'admissionRequirements',
  'allowedFormationPaths',
  'amountSemantics',
  'calculationSemantics',
  'canonicalComponentCategory',
  'currencySemantics',
  'displayName',
  'effectiveFrom',
  'effectiveUntil',
  'finalRatifier',
  'finalizationRequirements',
  'forbiddenFormationPaths',
  'interestEligibility',
  'legalBasisBindings',
  'legalCharacter',
  'legalMeaning',
  'liabilityCompatibility',
  'lifecycleStatus',
  'productionSigner',
  'requiredEvidenceTypes',
  'requiredSourceTypes',
  'reviewer',
  'snapshotRequirements',
  'subtypeCode',
  'subtypeVersion',
  'supersededBy',
  'supersedes',
]);
const LIABILITY_TYPES = Object.freeze(['KISMI', 'SINIRLI', 'TAM']);
const SOURCE_TYPES = Object.freeze([
  'COURT_JUDGMENT',
  'ENFORCEABLE_AGREEMENT_OR_PROTOCOL',
  'INTERIM_COURT_ORDER',
  'OTHER_ENFORCEABLE_SOURCE',
]);
const PLACEHOLDER = /(^|[^A-Z])(TBD|TODO|FIXME|PLACEHOLDER|OWNER DECISION REQUIRED)([^A-Z]|$)/i;

function fail(message) {
  throw new Error(`NAFAKA_DECISION_PACK_V2_INVALID: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = sorted(Object.keys(value));
  const wanted = sorted(expected);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ`);
  }
}

function assertExactSet(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected))) {
    fail(`${label} differs`);
  }
}

function assertNonEmptyStrings(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() !== item || item.length === 0) {
      fail(`${label} contains an invalid string`);
    }
  }
}

function extractPayload(markdown) {
  const beginIndex = markdown.indexOf(BEGIN);
  const endIndex = markdown.indexOf(END);
  if (beginIndex < 0 || endIndex <= beginIndex || markdown.indexOf(BEGIN, beginIndex + 1) >= 0) {
    fail('JSON markers are missing or duplicated');
  }
  const block = markdown.slice(beginIndex + BEGIN.length, endIndex).trim();
  const match = /^```json\n([\s\S]+)\n```$/.exec(block);
  if (!match) fail('JSON block is not exact');
  return JSON.parse(match[1]);
}

function validateEntry(entry) {
  assertExactKeys(entry, EXACT_ENTRY_KEYS, `entry ${entry?.subtypeCode ?? '<unknown>'}`);
  if (!EXPECTED_CODES.includes(entry.subtypeCode)) fail(`unknown subtype ${entry.subtypeCode}`);
  if (entry.subtypeVersion !== 1) fail(`${entry.subtypeCode} subtypeVersion must be 1`);
  if (entry.canonicalComponentCategory !== 'PRINCIPAL') {
    fail(`${entry.subtypeCode} must be PRINCIPAL`);
  }
  if (entry.lifecycleStatus !== 'RATIFIED_DORMANT') fail(`${entry.subtypeCode} is not dormant`);
  if (entry.effectiveFrom !== '2026-08-01T00:00:00Z' || entry.effectiveUntil !== null) {
    fail(`${entry.subtypeCode} effective interval differs`);
  }
  assertNonEmptyStrings(entry.requiredSourceTypes, `${entry.subtypeCode}.requiredSourceTypes`);
  for (const source of entry.requiredSourceTypes) {
    if (!SOURCE_TYPES.includes(source)) fail(`${entry.subtypeCode} contains unsupported source ${source}`);
  }
  assertNonEmptyStrings(entry.requiredEvidenceTypes, `${entry.subtypeCode}.requiredEvidenceTypes`);
  assertNonEmptyStrings(entry.admissionRequirements, `${entry.subtypeCode}.admissionRequirements`);
  assertNonEmptyStrings(entry.finalizationRequirements, `${entry.subtypeCode}.finalizationRequirements`);
  assertNonEmptyStrings(entry.snapshotRequirements, `${entry.subtypeCode}.snapshotRequirements`);
  assertExactSet(
    entry.allowedFormationPaths,
    ['CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION'],
    `${entry.subtypeCode}.allowedFormationPaths`,
  );
  for (const required of [
    'CASE_SUBCATEGORY_NAFAKA_AUTHORITY',
    'CURRENT_LATEST_OR_DEFAULT_RESOLUTION',
    'DIRECT_CLAIM_ITEM_WRITE',
    'DUETYPE_NAFAKA_AUTHORITY',
    'GENERIC_PRINCIPAL_FALLBACK',
    'HISTORICAL_RECLASSIFICATION',
    'INTEREST_OR_COST_INFERENCE',
    'LEGACY_CODE_AUTHORITY',
  ]) {
    if (!entry.forbiddenFormationPaths.includes(required)) {
      fail(`${entry.subtypeCode} lacks forbidden path ${required}`);
    }
  }
  if (
    entry.interestEligibility.automaticInterest !== false ||
    entry.interestEligibility.formationProjection !== 'UNKNOWN' ||
    entry.interestEligibility.rule !== 'SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED'
  ) {
    fail(`${entry.subtypeCode} interest boundary differs`);
  }
  assertExactSet(
    entry.liabilityCompatibility.allowedLiabilityTypes,
    LIABILITY_TYPES,
    `${entry.subtypeCode}.liability types`,
  );
  if (entry.liabilityCompatibility.implicitAllDebtors !== 'PROHIBITED') {
    fail(`${entry.subtypeCode} permits implicit all-debtor liability`);
  }
  if (
    entry.amountSemantics.minorUnitRepresentation !== 'POSITIVE_INTEGER_STRING' ||
    entry.currencySemantics.conversion !== 'PROHIBITED'
  ) {
    fail(`${entry.subtypeCode} money contract differs`);
  }
  if (
    entry.reviewer.ratifierCode !== 'TELLI-LEGAL-REVIEWER-01' ||
    entry.finalRatifier.ratifierCode !== 'TELLI-FINAL-LEGAL-RATIFIER-01' ||
    entry.productionSigner.signerId !== 'TELLI-PROD-LEGAL-01' ||
    entry.productionSigner.signatureStatus !== 'PENDING_NOT_EXECUTED'
  ) {
    fail(`${entry.subtypeCode} role separation differs`);
  }
  const text = JSON.stringify(entry);
  if (PLACEHOLDER.test(text)) fail(`${entry.subtypeCode} contains a placeholder`);
}

function validatePayload(payload) {
  assertRecord(payload, 'payload');
  if (
    payload.decisionPackId !== 'RECEIVABLE-NAFAKA-LEGAL-BASIS-DECISION-PACK' ||
    payload.decisionPackVersion !== 2 ||
    payload.schemaVersion !== 'RECEIVABLE_NAFAKA_LEGAL_BASIS_DECISION_PACK_V2'
  ) {
    fail('identity/version differs');
  }
  if (payload.legacyDecisionPackV1Status !== 'UNVERIFIABLE_NOT_USABLE') {
    fail('legacy v1 status differs');
  }
  if (
    payload.status !== 'OWNER_RATIFIED_HASH_BOUND' ||
    payload.runtimeStatus !== 'DORMANT_DEFAULT_OFF' ||
    payload.authorityBoundary.runtimeActivation !== 'NOT_AUTHORIZED'
  ) {
    fail('ratification or dormancy status differs');
  }
  if (
    payload.modelSufficiency.schemaChangeRequired !== false ||
    payload.modelSufficiency.migrationRequired !== false
  ) {
    fail('unexpected schema/migration requirement');
  }
  if (!Array.isArray(payload.entries) || payload.entries.length !== 6) {
    fail('entryCount must be 6');
  }
  for (const entry of payload.entries) validateEntry(entry);
  assertExactSet(
    payload.entries.map((entry) => entry.subtypeCode),
    EXPECTED_CODES,
    'subtype codes',
  );
  const legalBases = new Set();
  for (const entry of payload.entries) {
    for (const code of entry.legalBasisBindings.allowedLegalBasisCodes) legalBases.add(code);
  }
  assertExactSet([...legalBases], EXPECTED_LEGAL_BASES, 'Legal Basis codes');
  if (
    payload.ratification.finalRatifier.disposition !==
      'RATIFIED_BY_OWNER_EX_ANTE_CONDITIONS_SATISFIED' ||
    payload.ratification.legalReviewer.signatureStatus !== 'PENDING_NOT_EXECUTED' ||
    payload.ratification.productionSigner.signatureStatus !== 'PENDING_NOT_EXECUTED'
  ) {
    fail('ratification/signature precision differs');
  }
  for (const source of payload.officialSources) {
    if (!/^https:\/\/(cdn\.tbmm\.gov\.tr|kararlarbilgibankasi\.anayasa\.gov\.tr|normkararlarbilgibankasi\.anayasa\.gov\.tr)\//.test(source.url)) {
      fail(`non-official source ${source.url}`);
    }
  }
}

function validateRepository() {
  const markdownBytes = fs.readFileSync(PACK_PATH);
  const markdown = markdownBytes.toString('utf8');
  if (markdown.includes('\r')) fail('preimage must use LF line endings');
  if (!markdown.endsWith('\n')) fail('preimage must end with a single LF');
  const payload = extractPayload(markdown);
  validatePayload(payload);

  const manifest = JSON.parse(fs.readFileSync(CHECKSUM_PATH, 'utf8'));
  const actual = sha256(markdownBytes);
  if (
    manifest.algorithm !== 'SHA-256' ||
    manifest.preimageFile !== path.basename(PACK_PATH) ||
    manifest.preimageSha256 !== actual ||
    manifest.entryCount !== 6 ||
    manifest.signatureStatus !== 'PENDING_NOT_EXECUTED'
  ) {
    fail('checksum manifest differs');
  }
  return Object.freeze({ checksum: actual, entryCount: payload.entries.length });
}

function runSelfTest() {
  const markdown = fs.readFileSync(PACK_PATH, 'utf8');
  const payload = extractPayload(markdown);
  validatePayload(payload);

  const invalidCategory = structuredClone(payload);
  invalidCategory.entries[0].canonicalComponentCategory = 'ACCRUED_INTEREST';
  expectFailure(invalidCategory, 'must be PRINCIPAL');

  const implicitLiability = structuredClone(payload);
  implicitLiability.entries[0].liabilityCompatibility.implicitAllDebtors = 'ALLOWED';
  expectFailure(implicitLiability, 'implicit all-debtor');

  const automaticInterest = structuredClone(payload);
  automaticInterest.entries[0].interestEligibility.automaticInterest = true;
  expectFailure(automaticInterest, 'interest boundary');

  const latestFallback = structuredClone(payload);
  latestFallback.entries[0].forbiddenFormationPaths =
    latestFallback.entries[0].forbiddenFormationPaths.filter(
      (entry) => entry !== 'CURRENT_LATEST_OR_DEFAULT_RESOLUTION',
    );
  expectFailure(latestFallback, 'CURRENT_LATEST_OR_DEFAULT_RESOLUTION');

  const callerAuthority = structuredClone(payload);
  callerAuthority.entries[0].forbiddenFormationPaths =
    callerAuthority.entries[0].forbiddenFormationPaths.filter(
      (entry) => entry !== 'DUETYPE_NAFAKA_AUTHORITY',
    );
  expectFailure(callerAuthority, 'DUETYPE_NAFAKA_AUTHORITY');
}

function expectFailure(payload, expected) {
  try {
    validatePayload(payload);
  } catch (error) {
    if (String(error.message).includes(expected)) return;
    fail(`self-test expected ${expected}; received ${error.message}`);
  }
  fail(`self-test unexpectedly passed: ${expected}`);
}

if (require.main === module) {
  try {
    const result = validateRepository();
    if (process.argv.includes('--self-test')) runSelfTest();
    process.stdout.write(
      `NAFAKA_DECISION_PACK_V2_VALID entryCount=${result.entryCount} checksum=${result.checksum}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  extractPayload,
  sha256,
  validatePayload,
  validateRepository,
});
