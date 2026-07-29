'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const BUNDLE_PATH = path.join(DOCS_ROOT, 'rcv-claim-legal-public-key-trust-root-v1.json');
const SCHEMA_PATH = path.join(DOCS_ROOT, 'rcv-claim-legal-public-key-trust-root-v1.schema.json');
const CHECKSUM_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-public-key-trust-root-v1.checksum.json',
);
const AWS_PARITY_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-public-key-trust-root-aws-parity-v1.json',
);
const KC01_MANIFEST_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-public-key-manifest-v1.json',
);
const KC01_CHECKSUM_PATH = path.join(
  DOCS_ROOT,
  'rcv-claim-legal-signer-public-key-manifest-v1.checksum.json',
);

const TRUST_ROOT_ID = 'RCV-CLAIM-LEGAL-PUBLIC-KEY-TRUST-ROOT';
const KC01_MANIFEST_ID = 'RCV-CLAIM-LEGAL-SIGNER-PUBLIC-KEY-MANIFEST';
const KC01_CHECKSUM = '1e80168ebc52e6601f9231834ddde81a339e69a2337a0630bd9daa993f0519ec';
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
const PURPOSES = Object.freeze([
  'LEGAL_REVIEW_APPROVAL',
  'FINAL_LEGAL_RATIFICATION',
  'PRODUCTION_RELEASE',
]);
const ROOT_KEYS = Object.freeze([
  'activatedAt',
  'awsParityRecordChecksum',
  'awsParityRecordId',
  'checksumAlgorithm',
  'createdAt',
  'entries',
  'environment',
  'kc01ManifestChecksum',
  'kc01ManifestId',
  'kc01ManifestVersion',
  'productionSignatureStatus',
  'provider',
  'runtimeStatus',
  'serializationAlgorithm',
  'signingAuthorityStatus',
  'status',
  'trustRootChecksum',
  'trustRootId',
  'trustRootVersion',
]);
const ENTRY_KEYS = Object.freeze([
  'algorithm',
  'allowedDocumentTypes',
  'allowedSignaturePurposes',
  'authorityEvidenceRef',
  'awsEvidenceHash',
  'compromisePolicyId',
  'createdAt',
  'custodyOwner',
  'displayName',
  'fingerprint',
  'fingerprintAlgorithm',
  'forbiddenSignaturePurposes',
  'keyId',
  'keyUsage',
  'kc01ManifestChecksum',
  'kc01ManifestVersion',
  'provider',
  'providerAlias',
  'providerPublicKey',
  'providerPublicKeyEncoding',
  'providerPublicKeyFingerprint',
  'providerPublicKeyFingerprintAlgorithm',
  'providerPublicKeyFormat',
  'publicKey',
  'publicKeyEncoding',
  'publicKeyFormat',
  'region',
  'revocationPolicyId',
  'revocationReason',
  'revokedAt',
  'role',
  'rotationPolicyId',
  'signerId',
  'signingAlgorithm',
  'signingAuthorityStatus',
  'status',
  'subjectType',
  'supersedesSignerKey',
  'validFrom',
  'validUntil',
]);
const AWS_ROOT_KEYS = Object.freeze([
  'accessKeys',
  'budget',
  'caller',
  'cloudTrail',
  'keys',
  'mfaStatus',
  'provider',
  'readOnlyPolicy',
  'recordChecksum',
  'recordId',
  'recordVersion',
  'region',
  'verificationMode',
  'verifiedAt',
]);
const AWS_KEY_KEYS = Object.freeze([
  'evidenceHash',
  'keyPolicyPresent',
  'keySpec',
  'keyState',
  'keyUsage',
  'multiRegion',
  'origin',
  'permanentSignPrincipal',
  'policyChecksumAfter',
  'policyChecksumBefore',
  'policyRestoreVerified',
  'providerAlias',
  'publicKey',
  'publicKeyFingerprint',
  'requiredTagsPresent',
  'signerId',
  'signingAlgorithms',
  'temporaryCeremonySignerPrincipal',
  'temporaryReadActionsRemoved',
]);
const LOWER_SHA_256 = /^[0-9a-f]{64}$/;
const RAW_BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ACCOUNT_ID_PATTERN = /(^|[^0-9A-Za-z])\d{12}([^0-9A-Za-z]|$)/;
const FORBIDDEN_KEYS = new Set(
  [
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
    'mfaSecret',
    'recoveryCode',
  ].map((value) => value.toLowerCase()),
);

function fail(message) {
  throw new Error(`LEGAL_PUBLIC_KEY_TRUST_ROOT_INVALID: ${message}`);
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

function checksumWithout(value, excludedKey) {
  const copy = structuredClone(value);
  delete copy[excludedKey];
  return sha256(Buffer.from(canonicalize(copy), 'utf8'));
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

function assertNoForbiddenMaterial(value, label = 'artifact') {
  if (typeof value === 'string') {
    if (value.toLowerCase().includes('arn:aws:')) fail(`${label} contains a full AWS ARN`);
    if (ACCOUNT_ID_PATTERN.test(value)) fail(`${label} contains an AWS account-id pattern`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenMaterial(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) fail(`${label} contains forbidden field ${key}`);
      assertNoForbiddenMaterial(entry, `${label}.${key}`);
    }
  }
}

function assertDistinct(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} values must be pairwise distinct`);
}

function assertUtcSeconds(value, label) {
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
  if (schema.additionalProperties !== false || schema.$defs.entry.additionalProperties !== false) {
    fail('schema root and entry must reject unknown fields');
  }
  const rootRequired = [...schema.required].sort(compareCodePoints);
  const entryRequired = [...schema.$defs.entry.required].sort(compareCodePoints);
  if (JSON.stringify(rootRequired) !== JSON.stringify([...ROOT_KEYS].sort(compareCodePoints))) {
    fail('schema root required fields differ from the bundle contract');
  }
  if (JSON.stringify(entryRequired) !== JSON.stringify([...ENTRY_KEYS].sort(compareCodePoints))) {
    fail('schema entry required fields differ from the bundle contract');
  }
  if (schema.properties.entries.minItems !== 3 || schema.properties.entries.maxItems !== 3) {
    fail('schema must require exactly three entries');
  }
}

function deriveRawIdentity(spkiBase64, label) {
  const der = Buffer.from(spkiBase64, 'base64');
  if (der.length === 0 || der.toString('base64') !== spkiBase64) {
    fail(`${label}.providerPublicKey is not canonical padded Base64`);
  }
  let key;
  try {
    key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    fail(`${label}.providerPublicKey is not valid SPKI DER`);
  }
  if (key.asymmetricKeyType !== 'ed25519') fail(`${label}.providerPublicKey is not Ed25519`);
  if (!key.export({ format: 'der', type: 'spki' }).equals(der)) {
    fail(`${label}.providerPublicKey does not round-trip exactly`);
  }
  const jwk = key.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') fail(`${label}.providerPublicKey has no raw Ed25519 value`);
  const raw = Buffer.from(jwk.x, 'base64url');
  if (raw.length !== 32) fail(`${label}.raw public key must contain exactly 32 bytes`);
  return Object.freeze({
    der,
    raw,
    rawBase64Url: raw.toString('base64url'),
    rawFingerprint: sha256(raw),
    spkiFingerprint: sha256(der),
  });
}

function validateAwsParity(record, kc01Manifest) {
  assertExactKeys(record, AWS_ROOT_KEYS, 'awsParity');
  assertNoForbiddenMaterial(record, 'awsParity');
  if (
    record.recordId !== 'RCV-CLAIM-LEGAL-PUBLIC-KEY-TRUST-ROOT-AWS-PARITY@1' ||
    record.recordVersion !== 1 ||
    record.provider !== 'AWS_KMS' ||
    record.region !== 'eu-central-1'
  ) {
    fail('AWS parity identity/provider/region is invalid');
  }
  assertUtcSeconds(record.verifiedAt, 'awsParity.verifiedAt');
  if (
    record.verificationMode !== 'MFA_READ_ONLY_ROOT_CONSOLE_WITH_TEMPORARY_POLICY_AMENDMENT' ||
    record.caller !== 'MFA_PROTECTED_ROOT_READ_ONLY' ||
    record.readOnlyPolicy !== 'TR01_OWNER_AMENDMENTS' ||
    record.mfaStatus !== 'VERIFIED' ||
    record.accessKeys !== 'ZERO'
  ) {
    fail('AWS parity session attestation is invalid');
  }
  if (!Array.isArray(record.keys) || record.keys.length !== 3) {
    fail('AWS parity must contain exactly three keys');
  }
  record.keys.forEach((entry, index) => {
    const label = `awsParity.keys[${index}]`;
    assertExactKeys(entry, AWS_KEY_KEYS, label);
    const manifestEntry = kc01Manifest.entries[index];
    if (entry.signerId !== SIGNERS[index] || entry.providerAlias !== ALIASES[index]) {
      fail(`${label} identity/order differs from KC01`);
    }
    if (
      entry.keyState !== 'Enabled' ||
      entry.keySpec !== 'ECC_NIST_EDWARDS25519' ||
      entry.keyUsage !== 'SIGN_VERIFY' ||
      entry.origin !== 'AWS_KMS' ||
      entry.multiRegion !== false ||
      JSON.stringify(entry.signingAlgorithms) !==
        JSON.stringify(['ED25519_SHA_512', 'ED25519_PH_SHA_512'])
    ) {
      fail(`${label} KMS state/spec/usage/origin/algorithm is invalid`);
    }
    if (
      entry.requiredTagsPresent !== true ||
      entry.keyPolicyPresent !== true ||
      entry.temporaryCeremonySignerPrincipal !== 'ABSENT' ||
      entry.permanentSignPrincipal !== 'ABSENT' ||
      !LOWER_SHA_256.test(entry.policyChecksumBefore) ||
      entry.policyChecksumAfter !== entry.policyChecksumBefore ||
      entry.policyRestoreVerified !== true ||
      entry.temporaryReadActionsRemoved !== true
    ) {
      fail(`${label} policy/tag/sign-principal attestation is invalid`);
    }
    if (
      entry.publicKey !== manifestEntry.publicKey ||
      entry.publicKeyFingerprint !== manifestEntry.fingerprint
    ) {
      fail(`${label} public key/fingerprint differs from KC01`);
    }
    if (!LOWER_SHA_256.test(entry.evidenceHash) || checksumWithout(entry, 'evidenceHash') !== entry.evidenceHash) {
      fail(`${label}.evidenceHash mismatch`);
    }
  });
  if (
    record.cloudTrail.status !== 'ACTIVE' ||
    record.cloudTrail.multiRegion !== true ||
    record.cloudTrail.logFileValidation !== true ||
    record.cloudTrail.managementEvents !== true ||
    record.cloudTrail.kmsEventsCaptured !== true ||
    !LOWER_SHA_256.test(record.cloudTrail.evidenceHash) ||
    checksumWithout(record.cloudTrail, 'evidenceHash') !== record.cloudTrail.evidenceHash ||
    record.cloudTrail.auditStorageStatus !== 'DELIVERY_VERIFIED' ||
    !Array.isArray(record.cloudTrail.observedEvents) ||
    record.cloudTrail.observedEvents.length !== 3 ||
    record.cloudTrail.observedEvents.some(
      (event, index) =>
        event.eventName !== 'GetPublicKey' ||
        event.providerAlias !== ALIASES[index] ||
        !LOWER_SHA_256.test(event.eventHash) ||
        checksumWithout(event, 'eventHash') !== event.eventHash,
    )
  ) {
    fail('CloudTrail parity is incomplete');
  }
  if (
    record.budget.status !== 'ACTIVE' ||
    record.budget.budgetId !== 'KC01-AWS-KMS-MONTHLY' ||
    record.budget.amountUsd !== 5 ||
    record.budget.period !== 'MONTHLY' ||
    JSON.stringify(record.budget.alertThresholdsPercent) !== JSON.stringify([50, 80, 100]) ||
    !LOWER_SHA_256.test(record.budget.evidenceHash) ||
    checksumWithout(record.budget, 'evidenceHash') !== record.budget.evidenceHash
  ) {
    fail('budget parity is incomplete');
  }
  if (checksumWithout(record, 'recordChecksum') !== record.recordChecksum) {
    fail('AWS parity record checksum mismatch');
  }
  return record.recordChecksum;
}

function validateEntry(entry, index, kc01Entry, awsKey, activatedAt) {
  const label = `entries[${index}]`;
  assertExactKeys(entry, ENTRY_KEYS, label);
  if (
    entry.role !== ROLES[index] ||
    entry.signerId !== SIGNERS[index] ||
    entry.providerAlias !== ALIASES[index]
  ) {
    fail(`${label} identity/order differs from the canonical matrix`);
  }
  if (
    entry.algorithm !== 'Ed25519' ||
    entry.signingAlgorithm !== 'ED25519_SHA_512' ||
    entry.keyUsage !== 'SIGN_VERIFY' ||
    entry.provider !== 'AWS_KMS' ||
    entry.region !== 'eu-central-1'
  ) {
    fail(`${label} provider/algorithm/usage contract is invalid`);
  }
  if (
    entry.publicKeyFormat !== 'RAW_32' ||
    entry.publicKeyEncoding !== 'BASE64URL_UNPADDED' ||
    !RAW_BASE64URL.test(entry.publicKey) ||
    entry.fingerprintAlgorithm !== 'SHA-256' ||
    !LOWER_SHA_256.test(entry.fingerprint)
  ) {
    fail(`${label} raw public-key contract is invalid`);
  }
  if (
    entry.providerPublicKeyFormat !== 'SPKI_DER' ||
    entry.providerPublicKeyEncoding !== 'BASE64' ||
    entry.providerPublicKeyFingerprintAlgorithm !== 'SHA-256' ||
    !LOWER_SHA_256.test(entry.providerPublicKeyFingerprint)
  ) {
    fail(`${label} provider public-key contract is invalid`);
  }
  const identity = deriveRawIdentity(entry.providerPublicKey, label);
  if (
    entry.providerPublicKey !== kc01Entry.publicKey ||
    identity.spkiFingerprint !== kc01Entry.fingerprint ||
    entry.providerPublicKeyFingerprint !== identity.spkiFingerprint
  ) {
    fail(`${label} SPKI identity differs from KC01`);
  }
  if (
    entry.publicKey !== identity.rawBase64Url ||
    entry.fingerprint !== identity.rawFingerprint ||
    entry.keyId !== `rcv-lb-ed25519-${identity.rawFingerprint}`
  ) {
    fail(`${label} raw identity does not match provider SPKI`);
  }
  if (
    entry.kc01ManifestVersion !== 1 ||
    entry.kc01ManifestChecksum !== KC01_CHECKSUM ||
    entry.awsEvidenceHash !== awsKey.evidenceHash
  ) {
    fail(`${label} evidence binding is invalid`);
  }
  if (
    entry.status !== 'ACTIVE_FOR_VERIFICATION' ||
    entry.signingAuthorityStatus !== 'NOT_ACTIVE' ||
    entry.revokedAt !== null ||
    entry.revocationReason !== null ||
    entry.supersedesSignerKey !== null ||
    entry.validUntil !== null ||
    entry.validFrom !== activatedAt
  ) {
    fail(`${label} active verification lifecycle is invalid`);
  }
  assertUtcSeconds(entry.createdAt, `${label}.createdAt`);
  assertUtcSeconds(entry.validFrom, `${label}.validFrom`);
  if (entry.createdAt !== kc01Entry.createdAt) fail(`${label}.createdAt differs from KC01`);
  if (!entry.authorityEvidenceRef || !entry.custodyOwner) {
    fail(`${label} authority/custody evidence is required`);
  }
  if (
    entry.rotationPolicyId !== 'RCV-CLAIM-LEGAL-SIGNER-ROTATION-POLICY@1' ||
    entry.revocationPolicyId !== 'RCV-CLAIM-LEGAL-SIGNER-REVOCATION-POLICY@1' ||
    entry.compromisePolicyId !== 'RCV-CLAIM-LEGAL-SIGNER-COMPROMISE-RESPONSE@1'
  ) {
    fail(`${label} lifecycle policy references are invalid`);
  }
  const expectedSubject = index < 2 ? 'HUMAN' : 'SERVICE';
  if (entry.subjectType !== expectedSubject) fail(`${label}.subjectType is invalid`);
  if (JSON.stringify(entry.allowedDocumentTypes) !== JSON.stringify(['LEGAL_BASIS_RELEASE'])) {
    fail(`${label} document allowlist is invalid`);
  }
  if (JSON.stringify(entry.allowedSignaturePurposes) !== JSON.stringify([PURPOSES[index]])) {
    fail(`${label} purpose allowlist is invalid`);
  }
  const forbidden = PURPOSES.filter((purpose) => purpose !== PURPOSES[index]);
  if (JSON.stringify(entry.forbiddenSignaturePurposes) !== JSON.stringify(forbidden)) {
    fail(`${label} forbidden purpose matrix is invalid`);
  }
  return identity;
}

function validateBundle(bundle, schema, kc01Manifest, awsParity) {
  assertExactKeys(bundle, ROOT_KEYS, 'bundle');
  assertNoForbiddenMaterial(bundle, 'bundle');
  validateSchemaContract(schema);
  if (
    bundle.trustRootId !== TRUST_ROOT_ID ||
    bundle.trustRootVersion !== 1 ||
    bundle.status !== 'ACTIVE' ||
    bundle.runtimeStatus !== 'DORMANT' ||
    bundle.signingAuthorityStatus !== 'NOT_ACTIVE' ||
    bundle.productionSignatureStatus !== 'NONE'
  ) {
    fail('trust-root identity/status/dormancy contract is invalid');
  }
  if (
    bundle.provider !== 'AWS_KMS' ||
    bundle.environment !== 'production' ||
    bundle.serializationAlgorithm !== 'CANONICAL_JSON_UTF8_V1' ||
    bundle.checksumAlgorithm !== 'SHA-256'
  ) {
    fail('trust-root provider/environment/serialization contract is invalid');
  }
  if (
    bundle.kc01ManifestId !== KC01_MANIFEST_ID ||
    bundle.kc01ManifestVersion !== 1 ||
    bundle.kc01ManifestChecksum !== KC01_CHECKSUM ||
    bundle.awsParityRecordId !== awsParity.recordId ||
    bundle.awsParityRecordChecksum !== awsParity.recordChecksum
  ) {
    fail('trust-root source evidence binding is invalid');
  }
  assertUtcSeconds(bundle.createdAt, 'bundle.createdAt');
  assertUtcSeconds(bundle.activatedAt, 'bundle.activatedAt');
  if (Date.parse(bundle.createdAt) > Date.parse(bundle.activatedAt)) {
    fail('bundle.createdAt must not be later than activatedAt');
  }
  if (!Array.isArray(bundle.entries) || bundle.entries.length !== 3) {
    fail('trust-root must contain exactly three entries');
  }
  const identities = bundle.entries.map((entry, index) =>
    validateEntry(entry, index, kc01Manifest.entries[index], awsParity.keys[index], bundle.activatedAt),
  );
  assertDistinct(bundle.entries.map((entry) => entry.signerId), 'signerId');
  assertDistinct(bundle.entries.map((entry) => entry.providerAlias), 'providerAlias');
  assertDistinct(bundle.entries.map((entry) => entry.publicKey), 'raw public key');
  assertDistinct(bundle.entries.map((entry) => entry.fingerprint), 'raw fingerprint');
  assertDistinct(bundle.entries.map((entry) => entry.providerPublicKey), 'SPKI public key');
  assertDistinct(
    bundle.entries.map((entry) => entry.providerPublicKeyFingerprint),
    'SPKI fingerprint',
  );
  if (checksumWithout(bundle, 'trustRootChecksum') !== bundle.trustRootChecksum) {
    fail('trust-root checksum mismatch');
  }
  return identities;
}

function validateChecksumRecord(bundle, checksumRecord, awsParity) {
  assertExactKeys(
    checksumRecord,
    [
      'algorithm',
      'awsParityRecordChecksum',
      'canonicalization',
      'trustRootChecksum',
      'trustRootId',
      'trustRootVersion',
    ],
    'checksumRecord',
  );
  if (
    checksumRecord.trustRootId !== TRUST_ROOT_ID ||
    checksumRecord.trustRootVersion !== 1 ||
    checksumRecord.algorithm !== 'SHA-256' ||
    checksumRecord.canonicalization !== 'CANONICAL_JSON_UTF8_V1 / EXCLUDES trustRootChecksum' ||
    checksumRecord.trustRootChecksum !== bundle.trustRootChecksum ||
    checksumRecord.awsParityRecordChecksum !== awsParity.recordChecksum
  ) {
    fail('checksum record differs from the trust-root bundle');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectFailure(bundle, schema, kc01, awsParity, mutate, fragment) {
  const changed = clone(bundle);
  mutate(changed);
  try {
    validateBundle(changed, schema, kc01, awsParity);
  } catch (error) {
    if (!String(error.message).includes(fragment)) {
      fail(`negative test expected ${fragment}; received ${error.message}`);
    }
    return;
  }
  fail(`negative test unexpectedly passed: ${fragment}`);
}

function runSelfTest(bundle, schema, kc01, awsParity) {
  expectFailure(bundle, schema, kc01, awsParity, (value) => value.entries.pop(), 'exactly three');
  expectFailure(bundle, schema, kc01, awsParity, (value) => value.entries.push(clone(value.entries[0])), 'exactly three');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[1].signerId = value.entries[0].signerId;
  }, 'identity/order');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[1].providerPublicKey = value.entries[0].providerPublicKey;
  }, 'SPKI identity differs');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[0].fingerprint = '0'.repeat(64);
  }, 'raw identity');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[0].algorithm = 'RSA';
  }, 'provider/algorithm');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[0].allowedSignaturePurposes = ['FINAL_LEGAL_RATIFICATION'];
  }, 'purpose allowlist');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[0].privateKey = 'forbidden';
  }, 'forbidden field privateKey');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.entries[0].authorityEvidenceRef = 'arn:aws:forbidden';
  }, 'full AWS ARN');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.signingAuthorityStatus = 'ACTIVE';
  }, 'identity/status/dormancy');
  expectFailure(bundle, schema, kc01, awsParity, (value) => {
    value.trustRootChecksum = '0'.repeat(64);
  }, 'checksum mismatch');
}

function validateRepository({ selfTest = false } = {}) {
  const bundle = readJson(BUNDLE_PATH);
  const schema = readJson(SCHEMA_PATH);
  const checksumRecord = readJson(CHECKSUM_PATH);
  const awsParity = readJson(AWS_PARITY_PATH);
  const kc01Manifest = readJson(KC01_MANIFEST_PATH);
  const kc01Checksum = readJson(KC01_CHECKSUM_PATH);
  if (kc01Checksum.manifestChecksum !== KC01_CHECKSUM) fail('KC01 manifest checksum drift');
  const awsChecksum = validateAwsParity(awsParity, kc01Manifest);
  const identities = validateBundle(bundle, schema, kc01Manifest, awsParity);
  validateChecksumRecord(bundle, checksumRecord, awsParity);
  if (selfTest) runSelfTest(bundle, schema, kc01Manifest, awsParity);
  return Object.freeze({
    awsChecksum,
    entryCount: bundle.entries.length,
    rawKeyCount: identities.length,
    trustRootChecksum: bundle.trustRootChecksum,
  });
}

if (require.main === module) {
  try {
    const result = validateRepository({ selfTest: process.argv.includes('--self-test') });
    process.stdout.write(
      `LEGAL_PUBLIC_KEY_TRUST_ROOT_VALID entryCount=${result.entryCount} ` +
        `rawKeyCount=${result.rawKeyCount} trustRootChecksum=${result.trustRootChecksum} ` +
        `awsParityChecksum=${result.awsChecksum}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  canonicalize,
  checksumWithout,
  validateAwsParity,
  validateBundle,
  validateRepository,
});
