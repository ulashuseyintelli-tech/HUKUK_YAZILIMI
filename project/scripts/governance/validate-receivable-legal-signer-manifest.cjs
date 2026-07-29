'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const MANIFEST_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-public-key-manifest-v1.json',
);
const SCHEMA_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-public-key-manifest-v1.schema.json',
);
const CHECKSUM_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-public-key-manifest-v1.checksum.json',
);
const CHALLENGE_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-key-possession-evidence-v1.json',
);
const CLOUDTRAIL_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-cloudtrail-evidence-v1.json',
);

const MANIFEST_ID = 'RCV-CLAIM-LEGAL-SIGNER-PUBLIC-KEY-MANIFEST';
const SERIALIZATION_ALGORITHM =
  'RCV-CLAIM-LEGAL-SIGNER-PUBLIC-KEY-MANIFEST-CANONICAL-JSON-V1';
const ROLES = Object.freeze([
  'LEGAL_REVIEWER',
  'FINAL_LEGAL_RATIFIER',
  'PRODUCTION_RELEASE_SIGNER',
]);
const SIGNERS = Object.freeze([
  'TELLI-LEGAL-REVIEWER-01',
  'TELLI-FINAL-LEGAL-RATIFIER-01',
  'TELLI-PROD-LEGAL-01',
]);
const ALIASES = Object.freeze([
  'alias/telli-legal-reviewer-01',
  'alias/telli-final-legal-ratifier-01',
  'alias/telli-prod-legal-01',
]);
const ROOT_KEYS = Object.freeze([
  'entries',
  'keyCount',
  'manifestId',
  'manifestVersion',
  'privateEvidence',
  'productionSignatureStatus',
  'provider',
  'region',
  'serializationAlgorithm',
  'signingAuthorityStatus',
  'status',
  'trustRootStatus',
]);
const ENTRY_KEYS = Object.freeze([
  'algorithm',
  'alias',
  'createdAt',
  'displayName',
  'fingerprint',
  'fingerprintAlgorithm',
  'keyUsage',
  'provider',
  'publicKey',
  'publicKeyEncoding',
  'publicKeyFormat',
  'region',
  'revocationPolicyId',
  'role',
  'rotationPolicyId',
  'signerId',
  'signingAlgorithm',
  'signingAuthorityStatus',
  'status',
  'subjectType',
  'trustRootStatus',
]);
const PRIVATE_EVIDENCE_KEYS = Object.freeze([
  'checksumAlgorithm',
  'evidenceSetChecksum',
  'recordId',
]);
const FORBIDDEN_KEYS = new Set([
  'accountId',
  'keyArn',
  'principalArn',
  'privateKey',
  'secretKey',
  'seed',
  'credential',
  'token',
  'password',
  'session',
  'recoveryCode',
]);
const LOWER_SHA_256 = /^[0-9a-f]{64}$/;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ACCOUNT_ID_PATTERN = /(^|[^0-9A-Za-z])\d{12}([^0-9A-Za-z]|$)/;

function fail(message) {
  throw new Error(`LEGAL_SIGNER_MANIFEST_INVALID: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareCodePoints(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('canonical value contains a non-integer number');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort(compareCodePoints)
      .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  fail(`unsupported canonical value type ${typeof value}`);
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function manifestChecksum(manifest) {
  return sha256(Buffer.from(canonicalize(manifest), 'utf8'));
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ: expected ${wanted.join(', ')}; received ${actual.join(', ')}`);
  }
}

function assertNoForbiddenMaterial(value, label = 'manifest') {
  if (typeof value === 'string') {
    if (value.includes('arn:aws:')) fail(`${label} contains a full AWS ARN`);
    if (ACCOUNT_ID_PATTERN.test(value)) fail(`${label} contains an AWS account-id pattern`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenMaterial(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) fail(`${label} contains forbidden field ${key}`);
      assertNoForbiddenMaterial(entry, `${label}.${key}`);
    }
  }
}

function assertDistinct(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} values must be pairwise distinct`);
}

function assertIsoUtcSeconds(value, label) {
  if (typeof value !== 'string' || !UTC_SECONDS.test(value)) {
    fail(`${label} must be UTC RFC3339 at second precision`);
  }
  if (new Date(value).toISOString().replace('.000Z', 'Z') !== value) {
    fail(`${label} is not a canonical timestamp`);
  }
}

function validateSchemaContract(schema) {
  assertRecord(schema, 'schema');
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    fail('schema must use JSON Schema draft 2020-12');
  }
  if (schema.additionalProperties !== false) fail('schema root must reject unknown fields');
  if (!schema.$defs || schema.$defs.entry.additionalProperties !== false) {
    fail('schema entry must reject unknown fields');
  }
  if (schema.$defs.privateEvidence.additionalProperties !== false) {
    fail('schema privateEvidence must reject unknown fields');
  }
  if (JSON.stringify([...schema.required].sort(compareCodePoints)) !== JSON.stringify([...ROOT_KEYS].sort(compareCodePoints))) {
    fail('schema root required fields differ from the manifest contract');
  }
  if (JSON.stringify([...schema.$defs.entry.required].sort(compareCodePoints)) !== JSON.stringify([...ENTRY_KEYS].sort(compareCodePoints))) {
    fail('schema entry required fields differ from the manifest contract');
  }
  if (JSON.stringify(schema.$defs.entry.properties.role.enum) !== JSON.stringify(ROLES)) {
    fail('schema role order differs from the canonical role order');
  }
}

function validateEntry(entry, index) {
  const label = `entries[${index}]`;
  assertExactKeys(entry, ENTRY_KEYS, label);
  if (entry.role !== ROLES[index]) fail(`${label}.role differs from canonical role order`);
  if (entry.signerId !== SIGNERS[index]) fail(`${label}.signerId differs from canonical signer`);
  if (entry.alias !== ALIASES[index]) fail(`${label}.alias differs from canonical alias`);
  if (entry.algorithm !== 'Ed25519' || entry.signingAlgorithm !== 'ED25519_SHA_512') {
    fail(`${label} must use Ed25519 / ED25519_SHA_512`);
  }
  if (entry.keyUsage !== 'SIGN_VERIFY' || entry.provider !== 'AWS_KMS') {
    fail(`${label} must be an AWS KMS SIGN_VERIFY key`);
  }
  if (entry.region !== 'eu-central-1') fail(`${label}.region must equal eu-central-1`);
  if (entry.publicKeyFormat !== 'SPKI_DER' || entry.publicKeyEncoding !== 'BASE64') {
    fail(`${label} must expose SPKI DER encoded as Base64`);
  }
  if (entry.fingerprintAlgorithm !== 'SHA-256' || !LOWER_SHA_256.test(entry.fingerprint)) {
    fail(`${label}.fingerprint contract is invalid`);
  }
  if (entry.status !== 'ENABLED') fail(`${label}.status must equal ENABLED`);
  if (entry.trustRootStatus !== 'PENDING_ONBOARDING') {
    fail(`${label}.trustRootStatus must remain PENDING_ONBOARDING`);
  }
  if (entry.signingAuthorityStatus !== 'NOT_ACTIVE') {
    fail(`${label}.signingAuthorityStatus must remain NOT_ACTIVE`);
  }
  if ((index < 2 && entry.subjectType !== 'HUMAN') || (index === 2 && entry.subjectType !== 'SERVICE')) {
    fail(`${label}.subjectType violates human/service separation`);
  }
  if (typeof entry.displayName !== 'string' || entry.displayName.trim() === '') {
    fail(`${label}.displayName must be non-blank`);
  }
  assertIsoUtcSeconds(entry.createdAt, `${label}.createdAt`);

  let der;
  try {
    der = Buffer.from(entry.publicKey, 'base64');
  } catch {
    fail(`${label}.publicKey is not Base64`);
  }
  if (der.length === 0 || der.toString('base64') !== entry.publicKey) {
    fail(`${label}.publicKey is not canonical padded Base64`);
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    fail(`${label}.publicKey is not valid SPKI DER`);
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') fail(`${label}.publicKey is not Ed25519`);
  if (!publicKey.export({ format: 'der', type: 'spki' }).equals(der)) {
    fail(`${label}.publicKey does not round-trip as exact SPKI DER`);
  }
  if (sha256(der) !== entry.fingerprint) fail(`${label}.fingerprint does not match SPKI DER`);
  return Object.freeze({ der, publicKey });
}

function validateManifest(manifest, schema) {
  assertExactKeys(manifest, ROOT_KEYS, 'manifest');
  validateSchemaContract(schema);
  assertNoForbiddenMaterial(manifest);
  if (manifest.manifestId !== MANIFEST_ID || manifest.manifestVersion !== 1) {
    fail('manifest identity must equal the canonical V1 identity');
  }
  if (manifest.serializationAlgorithm !== SERIALIZATION_ALGORITHM) {
    fail('serialization algorithm differs from the canonical contract');
  }
  if (manifest.status !== 'RATIFIED' || manifest.provider !== 'AWS_KMS') {
    fail('manifest status/provider is invalid');
  }
  if (manifest.region !== 'eu-central-1' || manifest.keyCount !== 3) {
    fail('manifest region/keyCount is invalid');
  }
  if (manifest.trustRootStatus !== 'PENDING_ONBOARDING') {
    fail('manifest trust root must remain pending');
  }
  if (manifest.signingAuthorityStatus !== 'NOT_ACTIVE' || manifest.productionSignatureStatus !== 'NONE') {
    fail('manifest must not activate signing or claim a production signature');
  }
  assertExactKeys(manifest.privateEvidence, PRIVATE_EVIDENCE_KEYS, 'manifest.privateEvidence');
  if (
    manifest.privateEvidence.recordId !== 'KC01-AWS-PRIVATE-OPERATIONAL-EVIDENCE' ||
    manifest.privateEvidence.checksumAlgorithm !== 'SHA-256' ||
    !LOWER_SHA_256.test(manifest.privateEvidence.evidenceSetChecksum)
  ) {
    fail('private evidence reference is invalid');
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 3) {
    fail('manifest must contain exactly three entries');
  }
  const keys = manifest.entries.map(validateEntry);
  assertDistinct(manifest.entries.map((entry) => entry.signerId), 'signerId');
  assertDistinct(manifest.entries.map((entry) => entry.alias), 'alias');
  assertDistinct(manifest.entries.map((entry) => entry.publicKey), 'publicKey');
  assertDistinct(manifest.entries.map((entry) => entry.fingerprint), 'fingerprint');
  return keys;
}

function validateChecksumManifest(manifest, checksumManifest) {
  assertExactKeys(
    checksumManifest,
    ['checksumAlgorithm', 'manifestChecksum', 'manifestId', 'manifestVersion', 'serializationAlgorithm'],
    'checksum manifest',
  );
  if (
    checksumManifest.manifestId !== MANIFEST_ID ||
    checksumManifest.manifestVersion !== 1 ||
    checksumManifest.serializationAlgorithm !== SERIALIZATION_ALGORITHM ||
    checksumManifest.checksumAlgorithm !== 'SHA-256'
  ) {
    fail('checksum manifest identity differs from the canonical contract');
  }
  const actual = manifestChecksum(manifest);
  if (!LOWER_SHA_256.test(checksumManifest.manifestChecksum) || checksumManifest.manifestChecksum !== actual) {
    fail(`manifest checksum mismatch: expected ${checksumManifest.manifestChecksum}; received ${actual}`);
  }
  return actual;
}

function validateChallengeEvidence(evidence, entries) {
  assertNoForbiddenMaterial(evidence, 'challenge evidence');
  if (
    evidence.recordId !== 'RCV-CLAIM-LEGAL-SIGNER-KEY-POSSESSION-EVIDENCE@1' ||
    evidence.provider !== 'AWS_KMS' ||
    evidence.signingAlgorithm !== 'ED25519_SHA_512' ||
    evidence.messageType !== 'RAW' ||
    evidence.productionAuthority !== false ||
    evidence.trustRootStatus !== 'PENDING_ONBOARDING'
  ) {
    fail('challenge evidence identity or authority boundary is invalid');
  }
  assertIsoUtcSeconds(evidence.observedAt, 'challenge evidence observedAt');
  const challenge = evidence.challenge;
  assertExactKeys(
    challenge,
    ['challengeType', 'environment', 'manifestId', 'manifestVersion', 'productionAuthority', 'taskId'],
    'challenge',
  );
  if (
    challenge.challengeType !== 'KEY_POSSESSION' ||
    challenge.environment !== 'CEREMONY' ||
    challenge.productionAuthority !== false ||
    challenge.taskId !== 'RCV-CLAIM-FORM-P02-S08-D02-KC01' ||
    challenge.manifestId !== MANIFEST_ID ||
    challenge.manifestVersion !== 1
  ) {
    fail('challenge payload differs from the canonical ceremony payload');
  }
  const challengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
  if (challengeBytes.length >= 4096 || sha256(challengeBytes) !== evidence.challengeChecksum) {
    fail('challenge size/checksum is invalid');
  }
  if (!Array.isArray(evidence.challengeSignatures) || evidence.challengeSignatures.length !== 3) {
    fail('challenge evidence must contain exactly three signatures');
  }
  const signatures = evidence.challengeSignatures.map((item, index) => {
    assertExactKeys(
      item,
      ['kmsVerify', 'offlineVerify', 'role', 'signature', 'signatureChecksum', 'signatureEncoding', 'signerId'],
      `challengeSignatures[${index}]`,
    );
    if (
      item.role !== ROLES[index] ||
      item.signerId !== SIGNERS[index] ||
      item.signatureEncoding !== 'BASE64' ||
      item.kmsVerify !== true ||
      item.offlineVerify !== true
    ) {
      fail(`challengeSignatures[${index}] role or verification status is invalid`);
    }
    const signature = Buffer.from(item.signature, 'base64');
    if (signature.toString('base64') !== item.signature || sha256(signature) !== item.signatureChecksum) {
      fail(`challengeSignatures[${index}] encoding/checksum is invalid`);
    }
    if (!crypto.verify(null, challengeBytes, entries[index].publicKey, signature)) {
      fail(`challengeSignatures[${index}] offline verification failed`);
    }
    return signature;
  });
  let negativeCount = 0;
  signatures.forEach((signature, signatureIndex) => {
    entries.forEach((entry, keyIndex) => {
      if (signatureIndex === keyIndex) return;
      if (crypto.verify(null, challengeBytes, entry.publicKey, signature)) {
        fail(`cross-role signature ${signatureIndex}/${keyIndex} unexpectedly verified`);
      }
      negativeCount += 1;
    });
  });
  if (
    negativeCount !== 6 ||
    evidence.crossRoleNegativeCount !== 6 ||
    evidence.crossRoleNegativeStatus !== 'PASS' ||
    evidence.temporarySignAuthorityRemoved !== true ||
    evidence.postRemovalSign !== 'ACCESS_DENIED'
  ) {
    fail('challenge negative/removal evidence is invalid');
  }
}

function validateCloudTrailEvidence(evidence) {
  const rootKeys = [
    'auditTrailStatus',
    'eventCounts',
    'events',
    'managementEvents',
    'recordId',
    'region',
    'requiredEventGate',
    'signAccessDeniedCount',
    'signSuccessCount',
    'verifySuccessCount',
  ];
  const eventNames = [
    'CreateAlias',
    'CreateKey',
    'GetPublicKey',
    'PutKeyPolicy',
    'Sign',
    'TagResource',
    'Verify',
  ];
  const eventKeys = [
    'disposition',
    'eventHash',
    'eventName',
    'eventTime',
    'keyAlias',
    'redactedKeyReference',
    'role',
  ];

  assertExactKeys(evidence, rootKeys, 'CloudTrail evidence');
  assertNoForbiddenMaterial(evidence, 'CloudTrail evidence');
  assertExactKeys(evidence.eventCounts, eventNames, 'CloudTrail evidence eventCounts');
  if (
    evidence.recordId !== 'RCV-CLAIM-LEGAL-SIGNER-CLOUDTRAIL-EVIDENCE@1' ||
    evidence.region !== 'eu-central-1' ||
    evidence.auditTrailStatus !== 'ACTIVE_DURABLE_S3_LOG_VALIDATION_ENABLED' ||
    evidence.managementEvents !== 'ALL' ||
    evidence.requiredEventGate !== 'PASS'
  ) {
    fail('CloudTrail evidence identity or durable-audit boundary is invalid');
  }
  if (!Array.isArray(evidence.events) || evidence.events.length === 0) {
    fail('CloudTrail evidence must contain redacted events');
  }

  const computedCounts = Object.fromEntries(eventNames.map((eventName) => [eventName, 0]));
  let signSuccess = 0;
  let signDenied = 0;
  let verifySuccess = 0;
  const aliasRoles = new Map(ALIASES.map((alias, index) => [alias, ROLES[index]]));
  evidence.events.forEach((event, index) => {
    const label = `CloudTrail evidence events[${index}]`;
    assertExactKeys(event, eventKeys, label);
    if (!eventNames.includes(event.eventName)) fail(`${label}.eventName is outside the KC01 allowlist`);
    assertIsoUtcSeconds(event.eventTime, `${label}.eventTime`);
    if (!LOWER_SHA_256.test(event.eventHash) || !LOWER_SHA_256.test(event.redactedKeyReference)) {
      fail(`${label} hashes must be lowercase SHA-256`);
    }
    if (event.keyAlias === 'REDACTED_AT_AUTHORIZATION_BOUNDARY') {
      if (
        event.eventName !== 'Sign' ||
        event.disposition !== 'AccessDenied' ||
        event.role !== 'UNATTRIBUTED_AUTHORIZATION_DENIAL'
      ) {
        fail(`${label} authorization-boundary redaction is invalid`);
      }
    } else if (aliasRoles.get(event.keyAlias) !== event.role) {
      fail(`${label} alias/role binding differs from the manifest`);
    }
    computedCounts[event.eventName] += 1;
    if (event.eventName === 'Sign' && event.disposition === 'SUCCESS') signSuccess += 1;
    if (event.eventName === 'Sign' && event.disposition === 'AccessDenied') signDenied += 1;
    if (event.eventName === 'Verify' && event.disposition === 'SUCCESS') verifySuccess += 1;
  });

  if (JSON.stringify(computedCounts) !== JSON.stringify(evidence.eventCounts)) {
    fail('CloudTrail eventCounts do not match the redacted event list');
  }
  if (
    evidence.eventCounts.CreateKey !== 3 ||
    evidence.eventCounts.CreateAlias !== 3 ||
    evidence.eventCounts.TagResource < 3 ||
    evidence.eventCounts.GetPublicKey < 3 ||
    evidence.eventCounts.PutKeyPolicy < 3 ||
    signSuccess !== 3 ||
    signDenied !== 3 ||
    verifySuccess !== 3 ||
    evidence.signSuccessCount !== signSuccess ||
    evidence.signAccessDeniedCount !== signDenied ||
    evidence.verifySuccessCount !== verifySuccess
  ) {
    fail('CloudTrail required-event gate is incomplete');
  }
  return evidence.events.length;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectFailure(manifest, schema, mutate, expectedFragment) {
  const changed = clone(manifest);
  mutate(changed);
  try {
    validateManifest(changed, schema);
  } catch (error) {
    if (!String(error.message).includes(expectedFragment)) {
      fail(`negative test expected ${expectedFragment}; received ${error.message}`);
    }
    return;
  }
  fail(`negative test unexpectedly passed: ${expectedFragment}`);
}

function runSelfTest(manifest, schema) {
  expectFailure(manifest, schema, (value) => value.entries.pop(), 'exactly three');
  expectFailure(manifest, schema, (value) => {
    value.entries[1].publicKey = value.entries[0].publicKey;
    value.entries[1].fingerprint = value.entries[0].fingerprint;
  }, 'pairwise distinct');
  expectFailure(manifest, schema, (value) => {
    value.entries[0].publicKey = 'not-base64';
  }, 'canonical padded Base64');
  expectFailure(manifest, schema, (value) => {
    value.entries[0].fingerprint = '0'.repeat(64);
  }, 'fingerprint does not match');
  expectFailure(manifest, schema, (value) => {
    value.entries[0].keyArn = 'forbidden';
  }, 'forbidden field keyArn');
  expectFailure(manifest, schema, (value) => {
    value.trustRootStatus = 'ACTIVE';
  }, 'trust root must remain pending');
  expectFailure(manifest, schema, (value) => {
    value.signingAuthorityStatus = 'ACTIVE';
  }, 'must not activate signing');
}

function validateRepository({ selfTest = false } = {}) {
  const manifest = readJson(MANIFEST_PATH);
  const schema = readJson(SCHEMA_PATH);
  const checksumManifest = readJson(CHECKSUM_PATH);
  const challengeEvidence = readJson(CHALLENGE_PATH);
  const cloudTrailEvidence = readJson(CLOUDTRAIL_PATH);
  const keys = validateManifest(manifest, schema);
  const checksum = validateChecksumManifest(manifest, checksumManifest);
  validateChallengeEvidence(challengeEvidence, keys);
  const cloudTrailEvents = validateCloudTrailEvidence(cloudTrailEvidence);
  if (selfTest) runSelfTest(manifest, schema);
  return Object.freeze({
    checksum,
    cloudTrailEvents,
    entryCount: manifest.entries.length,
    crossRoleNegatives: 6,
  });
}

if (require.main === module) {
  try {
    const result = validateRepository({ selfTest: process.argv.includes('--self-test') });
    process.stdout.write(
      `LEGAL_SIGNER_MANIFEST_VALID entryCount=${result.entryCount} ` +
        `crossRoleNegatives=${result.crossRoleNegatives} ` +
        `cloudTrailEvents=${result.cloudTrailEvents} checksum=${result.checksum}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  canonicalize,
  manifestChecksum,
  validateChallengeEvidence,
  validateCloudTrailEvidence,
  validateManifest,
  validateRepository,
});
