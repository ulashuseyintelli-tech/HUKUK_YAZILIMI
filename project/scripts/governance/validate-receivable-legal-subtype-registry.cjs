'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GOVERNANCE_ROOT = path.resolve(__dirname, '../../docs/governance');
const REGISTRY_PATH = path.join(
  GOVERNANCE_ROOT,
  'receivable-legal-subtype-registry-v1.json',
);
const SCHEMA_PATH = path.join(
  GOVERNANCE_ROOT,
  'receivable-legal-subtype-registry-v1.schema.json',
);
const CHECKSUM_PATH = path.join(
  GOVERNANCE_ROOT,
  'receivable-legal-subtype-registry-v1.checksum.json',
);

const REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
const SERIALIZATION_ALGORITHM = 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
const EXPECTED_CODES = Object.freeze([
  'COMMERCIAL_COLLECTION_COST',
  'COMMERCIAL_DEFAULT_INTEREST',
  'CONTRACTUAL_DEFAULT_INTEREST',
  'DEFAULT_INTEREST',
  'DELAY_DAMAGE',
  'STATUTORY_DEFAULT_INTEREST',
  'STATUTORY_INTEREST',
]);
const COMPONENT_CATEGORIES = Object.freeze([
  'PRINCIPAL',
  'COST',
  'ANCILLARY',
  'ACCRUED_INTEREST',
]);
const LEGAL_BASIS_CODES = Object.freeze([
  'KANUN_3095_1',
  'KANUN_3095_2',
  'TBK_117',
  'TBK_118',
  'TBK_120',
  'TTK_1530',
]);
const LIABILITY_TYPES = Object.freeze(['KISMI', 'SINIRLI', 'TAM']);
const EXPECTED_BINDINGS = Object.freeze({
  COMMERCIAL_COLLECTION_COST: Object.freeze({
    category: 'COST',
    allowedLegalBasisCodes: Object.freeze(['TTK_1530']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['TTK_1530']),
  }),
  COMMERCIAL_DEFAULT_INTEREST: Object.freeze({
    category: 'ACCRUED_INTEREST',
    allowedLegalBasisCodes: Object.freeze(['KANUN_3095_2', 'TTK_1530']),
    bindingMode: 'EXACTLY_ONE_OF',
    requiredLegalBasisCodes: Object.freeze([]),
  }),
  CONTRACTUAL_DEFAULT_INTEREST: Object.freeze({
    category: 'ACCRUED_INTEREST',
    allowedLegalBasisCodes: Object.freeze(['TBK_120']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['TBK_120']),
  }),
  DEFAULT_INTEREST: Object.freeze({
    category: 'ACCRUED_INTEREST',
    allowedLegalBasisCodes: Object.freeze(['TBK_117']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['TBK_117']),
  }),
  DELAY_DAMAGE: Object.freeze({
    category: 'ANCILLARY',
    allowedLegalBasisCodes: Object.freeze(['TBK_118']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['TBK_118']),
  }),
  STATUTORY_DEFAULT_INTEREST: Object.freeze({
    category: 'ACCRUED_INTEREST',
    allowedLegalBasisCodes: Object.freeze(['KANUN_3095_2']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['KANUN_3095_2']),
  }),
  STATUTORY_INTEREST: Object.freeze({
    category: 'ACCRUED_INTEREST',
    allowedLegalBasisCodes: Object.freeze(['KANUN_3095_1']),
    bindingMode: 'EXACTLY_ONE',
    requiredLegalBasisCodes: Object.freeze(['KANUN_3095_1']),
  }),
});
const PLACEHOLDER_TOKEN = /(^|[^A-Z])(TBD|TODO|UNKNOWN|UNRESOLVED|FIXME|LATER|TEMP|PLACEHOLDER)([^A-Z]|$)/i;

const ROOT_KEYS = Object.freeze([
  'entries',
  'registryId',
  'registryStatus',
  'registryVersion',
  'runtimeStatus',
  'serializationAlgorithm',
]);
const ENTRY_KEYS = Object.freeze([
  'admissionRequirements',
  'allowedFormationPaths',
  'amountSemantics',
  'calculationSemantics',
  'canonicalComponentCategory',
  'currencySemantics',
  'displayName',
  'effectiveFrom',
  'effectiveUntil',
  'finalizationRequirements',
  'forbiddenFormationPaths',
  'interestEligibility',
  'legalBasisBindings',
  'legalCharacter',
  'legalMeaning',
  'liabilityCompatibility',
  'lifecycle',
  'notes',
  'requiredEvidenceTypes',
  'requiredSourceTypes',
  'snapshotRequirements',
  'status',
  'subtypeCode',
  'subtypeVersion',
  'supersededBy',
  'supersedes',
]);

function fail(message) {
  throw new Error(`LEGAL_SUBTYPE_REGISTRY_INVALID: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('canonical payload contains a non-integer number');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort(compareCodePoints)
      .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  fail(`canonical payload contains unsupported value type ${typeof value}`);
}

function registryChecksum(registry) {
  return crypto.createHash('sha256').update(Buffer.from(canonicalize(registry), 'utf8')).digest('hex');
}

function compareCodePoints(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    const delta = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ: expected ${wanted.join(', ')}; received ${actual.join(', ')}`);
  }
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}

function assertNonBlank(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be non-blank`);
  if (value !== value.normalize('NFC')) fail(`${label} must use NFC normalization`);
  if (PLACEHOLDER_TOKEN.test(value)) fail(`${label} contains a forbidden placeholder token`);
}

function assertStringArray(value, label, { allowEmpty = false, sorted = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  value.forEach((entry, index) => assertNonBlank(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length) fail(`${label} contains duplicate values`);
  if (sorted && JSON.stringify(value) !== JSON.stringify([...value].sort(compareCodePoints))) {
    fail(`${label} must use canonical code-point ordering`);
  }
}

function assertIsoUtc(value, label) {
  assertNonBlank(value, label);
  const date = new Date(value);
  const canonicalMilliseconds = Number.isFinite(date.getTime()) ? date.toISOString() : '';
  const canonicalSeconds = canonicalMilliseconds.replace('.000Z', 'Z');
  if (value !== canonicalMilliseconds && value !== canonicalSeconds) {
    fail(`${label} must be an exact UTC RFC3339 timestamp`);
  }
}

function assertNestedNoPlaceholders(value, label = 'registry') {
  if (typeof value === 'string') {
    assertNonBlank(value, label);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNestedNoPlaceholders(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      assertNonBlank(key, `${label} key`);
      assertNestedNoPlaceholders(entry, `${label}.${key}`);
    });
  }
}

function validateSchemaContract(schema) {
  assertRecord(schema, 'schema');
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    fail('schema must use JSON Schema draft 2020-12');
  }
  if (schema.additionalProperties !== false) fail('schema root must reject unknown fields');
  const entry = schema.$defs && schema.$defs.entry;
  assertRecord(entry, 'schema.$defs.entry');
  if (entry.additionalProperties !== false) fail('schema entry must reject unknown fields');
  const required = [...entry.required].sort(compareCodePoints);
  const expected = [...ENTRY_KEYS].sort(compareCodePoints);
  if (JSON.stringify(required) !== JSON.stringify(expected)) {
    fail('schema entry required fields differ from the canonical contract');
  }
  const schemaCodes = entry.properties.subtypeCode.enum;
  if (JSON.stringify(schemaCodes) !== JSON.stringify(EXPECTED_CODES)) {
    fail('schema subtype enum differs from the canonical registry code set');
  }
  const schemaCategories = entry.properties.canonicalComponentCategory.enum;
  if (JSON.stringify(schemaCategories) !== JSON.stringify(COMPONENT_CATEGORIES)) {
    fail('schema component-category enum differs from the canonical formation union');
  }
}

function validateEntry(entry, index) {
  const label = `entries[${index}]`;
  assertExactKeys(entry, ENTRY_KEYS, label);
  assertNonBlank(entry.subtypeCode, `${label}.subtypeCode`);
  if (!EXPECTED_CODES.includes(entry.subtypeCode)) fail(`${label}.subtypeCode is not ratified`);
  if (entry.subtypeVersion !== 1) fail(`${label}.subtypeVersion must equal 1`);
  if (entry.status !== 'RATIFIED') fail(`${label}.status must equal RATIFIED`);
  assertNonBlank(entry.displayName, `${label}.displayName`);
  if (!COMPONENT_CATEGORIES.includes(entry.canonicalComponentCategory)) {
    fail(`${label}.canonicalComponentCategory is not canonical`);
  }
  assertNonBlank(entry.legalMeaning, `${label}.legalMeaning`);
  assertNonBlank(entry.legalCharacter, `${label}.legalCharacter`);

  assertExactKeys(
    entry.legalBasisBindings,
    ['allowedLegalBasisCodes', 'bindingMode', 'requiredLegalBasisCodes'],
    `${label}.legalBasisBindings`,
  );
  assertStringArray(
    entry.legalBasisBindings.allowedLegalBasisCodes,
    `${label}.legalBasisBindings.allowedLegalBasisCodes`,
    { sorted: true },
  );
  if (entry.legalBasisBindings.allowedLegalBasisCodes.some((code) => !LEGAL_BASIS_CODES.includes(code))) {
    fail(`${label}.legalBasisBindings contains an unratified Legal Basis code`);
  }
  assertStringArray(
    entry.legalBasisBindings.requiredLegalBasisCodes,
    `${label}.legalBasisBindings.requiredLegalBasisCodes`,
    { allowEmpty: true, sorted: true },
  );
  if (
    entry.legalBasisBindings.requiredLegalBasisCodes.some(
      (code) => !entry.legalBasisBindings.allowedLegalBasisCodes.includes(code),
    )
  ) {
    fail(`${label}.legalBasisBindings requires a code outside the allowed set`);
  }
  if (!['EXACTLY_ONE', 'EXACTLY_ONE_OF'].includes(entry.legalBasisBindings.bindingMode)) {
    fail(`${label}.legalBasisBindings.bindingMode is invalid`);
  }
  if (
    entry.legalBasisBindings.bindingMode === 'EXACTLY_ONE' &&
    (entry.legalBasisBindings.allowedLegalBasisCodes.length !== 1 ||
      entry.legalBasisBindings.requiredLegalBasisCodes.length !== 1)
  ) {
    fail(`${label}.legalBasisBindings EXACTLY_ONE must identify one required code`);
  }
  if (
    entry.legalBasisBindings.bindingMode === 'EXACTLY_ONE_OF' &&
    (entry.legalBasisBindings.allowedLegalBasisCodes.length < 2 ||
      entry.legalBasisBindings.requiredLegalBasisCodes.length !== 0)
  ) {
    fail(`${label}.legalBasisBindings EXACTLY_ONE_OF must expose alternatives without a fallback`);
  }

  const expectedBinding = EXPECTED_BINDINGS[entry.subtypeCode];
  if (
    entry.canonicalComponentCategory !== expectedBinding.category ||
    entry.legalBasisBindings.bindingMode !== expectedBinding.bindingMode ||
    JSON.stringify(entry.legalBasisBindings.allowedLegalBasisCodes) !==
      JSON.stringify(expectedBinding.allowedLegalBasisCodes) ||
    JSON.stringify(entry.legalBasisBindings.requiredLegalBasisCodes) !==
      JSON.stringify(expectedBinding.requiredLegalBasisCodes)
  ) {
    fail(`${label} differs from the ratified subtype/category/Legal Basis crosswalk`);
  }

  assertStringArray(entry.requiredSourceTypes, `${label}.requiredSourceTypes`, { sorted: true });
  assertStringArray(entry.requiredEvidenceTypes, `${label}.requiredEvidenceTypes`, { sorted: true });
  if (
    !entry.requiredSourceTypes.includes('EXACT_LEGAL_BASIS_RELEASE_ENTRY') ||
    !entry.requiredSourceTypes.includes('EXACT_LIABILITY_CONTEXT') ||
    !entry.requiredEvidenceTypes.includes('LIABILITY_CONTEXT_HASH')
  ) {
    fail(`${label} must pin exact Legal Basis, liability context and liability hash evidence`);
  }
  if (
    entry.canonicalComponentCategory === 'ACCRUED_INTEREST' &&
    !entry.requiredSourceTypes.includes('EXACT_INTEREST_POLICY_VERSION')
  ) {
    fail(`${label} accrued interest must pin an exact InterestPolicy version`);
  }
  assertExactKeys(
    entry.liabilityCompatibility,
    ['allowedLiabilityTypes', 'crossLiabilityUse', 'scope'],
    `${label}.liabilityCompatibility`,
  );
  if (JSON.stringify(entry.liabilityCompatibility.allowedLiabilityTypes) !== JSON.stringify(LIABILITY_TYPES)) {
    fail(`${label}.liabilityCompatibility must preserve the canonical liability-type set`);
  }
  if (
    entry.liabilityCompatibility.scope !== 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP' ||
    entry.liabilityCompatibility.crossLiabilityUse !== 'PROHIBITED'
  ) {
    fail(`${label}.liabilityCompatibility must fail closed across liability contexts`);
  }

  assertExactKeys(
    entry.interestEligibility,
    [
      'componentAccruesFurtherInterest',
      'eligibilityRule',
      'requiresExactInterestPolicy',
      'requiresExactRateAuthority',
    ],
    `${label}.interestEligibility`,
  );
  if (entry.interestEligibility.componentAccruesFurtherInterest !== false) {
    fail(`${label}.interestEligibility cannot create compound-interest authority`);
  }
  assertNonBlank(entry.interestEligibility.eligibilityRule, `${label}.interestEligibility.eligibilityRule`);
  if (typeof entry.interestEligibility.requiresExactInterestPolicy !== 'boolean') {
    fail(`${label}.interestEligibility.requiresExactInterestPolicy must be boolean`);
  }
  if (typeof entry.interestEligibility.requiresExactRateAuthority !== 'boolean') {
    fail(`${label}.interestEligibility.requiresExactRateAuthority must be boolean`);
  }

  assertExactKeys(
    entry.amountSemantics,
    ['fixedAtFormation', 'minorUnitRepresentation', 'roundingFallback', 'semanticAuthority'],
    `${label}.amountSemantics`,
  );
  if (
    entry.amountSemantics.fixedAtFormation !== true ||
    entry.amountSemantics.minorUnitRepresentation !== 'POSITIVE_INTEGER_STRING' ||
    entry.amountSemantics.roundingFallback !== 'PROHIBITED'
  ) {
    fail(`${label}.amountSemantics must preserve exact minor-unit authority`);
  }
  assertNonBlank(entry.amountSemantics.semanticAuthority, `${label}.amountSemantics.semanticAuthority`);

  assertExactKeys(
    entry.currencySemantics,
    ['conversion', 'currencyAuthority', 'minorUnitAuthority'],
    `${label}.currencySemantics`,
  );
  if (
    entry.currencySemantics.conversion !== 'PROHIBITED' ||
    entry.currencySemantics.minorUnitAuthority !== 'ISO_CURRENCY_MINOR_UNIT'
  ) {
    fail(`${label}.currencySemantics must prohibit implicit conversion and preserve ISO minor units`);
  }
  assertNonBlank(entry.currencySemantics.currencyAuthority, `${label}.currencySemantics.currencyAuthority`);

  assertExactKeys(
    entry.calculationSemantics,
    ['futureAccrual', 'rule', 'sourceAmountDerivation'],
    `${label}.calculationSemantics`,
  );
  if (!['INTEREST_POLICY_ONLY', 'PROHIBITED'].includes(entry.calculationSemantics.futureAccrual)) {
    fail(`${label}.calculationSemantics.futureAccrual is invalid`);
  }
  assertNonBlank(entry.calculationSemantics.rule, `${label}.calculationSemantics.rule`);
  assertNonBlank(
    entry.calculationSemantics.sourceAmountDerivation,
    `${label}.calculationSemantics.sourceAmountDerivation`,
  );

  assertStringArray(entry.allowedFormationPaths, `${label}.allowedFormationPaths`);
  if (
    JSON.stringify(entry.allowedFormationPaths) !==
    JSON.stringify(['CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION'])
  ) {
    fail(`${label}.allowedFormationPaths must contain only approved typed formation finalization`);
  }
  assertStringArray(entry.forbiddenFormationPaths, `${label}.forbiddenFormationPaths`);
  for (const requiredGuard of [
    'DIRECT_CLAIM_ITEM_WRITE',
    'GENERIC_COMPONENT_FALLBACK',
    'CURRENT_LATEST_OR_DEFAULT_RESOLUTION',
    'HISTORICAL_RECLASSIFICATION',
  ]) {
    if (!entry.forbiddenFormationPaths.includes(requiredGuard)) {
      fail(`${label}.forbiddenFormationPaths is missing ${requiredGuard}`);
    }
  }
  assertStringArray(entry.admissionRequirements, `${label}.admissionRequirements`);
  assertStringArray(entry.finalizationRequirements, `${label}.finalizationRequirements`);
  assertStringArray(entry.snapshotRequirements, `${label}.snapshotRequirements`);

  assertExactKeys(
    entry.lifecycle,
    ['activation', 'revocationBehavior', 'versionUpgrade'],
    `${label}.lifecycle`,
  );
  if (
    entry.lifecycle.activation !== 'RATIFIED_BUT_RUNTIME_DORMANT' ||
    entry.lifecycle.revocationBehavior !== 'FAIL_CLOSED_FOR_NEW_FORMATION' ||
    entry.lifecycle.versionUpgrade !== 'EXPLICIT_NEW_VERSION_ONLY'
  ) {
    fail(`${label}.lifecycle violates dormant fail-closed versioning`);
  }
  assertStringArray(entry.supersedes, `${label}.supersedes`, { allowEmpty: true, sorted: true });
  if (entry.supersededBy !== null) fail(`${label}.supersededBy must be null for registry version 1`);
  assertIsoUtc(entry.effectiveFrom, `${label}.effectiveFrom`);
  if (entry.effectiveUntil !== null) assertIsoUtc(entry.effectiveUntil, `${label}.effectiveUntil`);
  assertNonBlank(entry.notes, `${label}.notes`);
}

function validateRegistry(registry, schema) {
  assertExactKeys(registry, ROOT_KEYS, 'registry');
  if (registry.registryId !== REGISTRY_ID) fail('registryId is invalid');
  if (registry.registryVersion !== 1) fail('registryVersion must equal 1');
  if (registry.registryStatus !== 'RATIFIED') fail('registryStatus must equal RATIFIED');
  if (registry.runtimeStatus !== 'DORMANT') fail('runtimeStatus must equal DORMANT');
  if (registry.serializationAlgorithm !== SERIALIZATION_ALGORITHM) {
    fail('serializationAlgorithm is invalid');
  }
  if (!Array.isArray(registry.entries) || registry.entries.length !== 7) {
    fail('registry must contain exactly seven entries');
  }
  const codes = registry.entries.map((entry) => entry.subtypeCode);
  if (JSON.stringify(codes) !== JSON.stringify(EXPECTED_CODES)) {
    fail('entries must contain the exact ratified code set in canonical code-point order');
  }
  if (new Set(codes).size !== codes.length) fail('registry contains duplicate subtype codes');
  registry.entries.forEach(validateEntry);
  assertNestedNoPlaceholders(registry);
  validateSchemaContract(schema);

  const defaultInterest = registry.entries.find((entry) => entry.subtypeCode === 'DEFAULT_INTEREST');
  if (
    !defaultInterest.forbiddenFormationPaths.includes('DEFAULT_INTEREST_AS_CATCH_ALL') ||
    defaultInterest.legalBasisBindings.allowedLegalBasisCodes.length !== 1 ||
    defaultInterest.legalBasisBindings.allowedLegalBasisCodes[0] !== 'TBK_117'
  ) {
    fail('DEFAULT_INTEREST must remain narrow and explicitly non-fallback');
  }
}

function validateChecksumManifest(registry, manifest) {
  assertExactKeys(
    manifest,
    [
      'checksumAlgorithm',
      'entryCount',
      'generatedFromCanonicalPayload',
      'registryChecksum',
      'registryId',
      'registryVersion',
      'serializationAlgorithm',
    ],
    'checksum manifest',
  );
  if (manifest.registryId !== REGISTRY_ID || manifest.registryVersion !== 1) {
    fail('checksum manifest identity differs from the registry');
  }
  if (manifest.serializationAlgorithm !== SERIALIZATION_ALGORITHM) {
    fail('checksum manifest serializationAlgorithm differs from the registry');
  }
  if (manifest.checksumAlgorithm !== 'SHA-256') fail('checksumAlgorithm must equal SHA-256');
  if (manifest.entryCount !== 7) fail('checksum manifest entryCount must equal 7');
  if (manifest.generatedFromCanonicalPayload !== 'receivable-legal-subtype-registry-v1.json') {
    fail('checksum manifest must name the exact canonical payload');
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.registryChecksum)) {
    fail('registryChecksum must be lowercase SHA-256 hexadecimal');
  }
  const actual = registryChecksum(registry);
  if (manifest.registryChecksum !== actual) {
    fail(`registryChecksum mismatch: expected ${actual}; received ${manifest.registryChecksum}`);
  }
  if (Object.prototype.hasOwnProperty.call(registry, 'registryChecksum')) {
    fail('canonical payload must not contain the checksum that is calculated over it');
  }
  return actual;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reverseObjectKeyOrder(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).reverse()) {
      result[key] = reverseObjectKeyOrder(value[key]);
    }
    return result;
  }
  return value;
}

function expectFailure(registry, schema, mutate, expectedFragment) {
  const changed = clone(registry);
  mutate(changed);
  try {
    validateRegistry(changed, schema);
  } catch (error) {
    if (!String(error.message).includes(expectedFragment)) {
      fail(`negative test expected ${expectedFragment}; received ${error.message}`);
    }
    return;
  }
  fail(`negative test unexpectedly passed: ${expectedFragment}`);
}

function runSelfTest(registry, schema, manifest) {
  const checksum = validateChecksumManifest(registry, manifest);
  const canonical = canonicalize(registry);
  const reversedObjects = reverseObjectKeyOrder(registry);
  if (registryChecksum(reversedObjects) !== checksum) {
    fail('object key order changed the registry checksum');
  }
  const crlfParsed = JSON.parse(JSON.stringify(registry, null, 2).replace(/\n/g, '\r\n'));
  if (registryChecksum(crlfParsed) !== checksum) {
    fail('line-ending or formatting differences changed the registry checksum');
  }
  if (Buffer.from(canonical, 'utf8').toString('utf8') !== canonical) {
    fail('canonical payload is not stable UTF-8');
  }
  const semanticMutation = clone(registry);
  semanticMutation.entries[0].legalMeaning += ' changed';
  if (registryChecksum(semanticMutation) === checksum) {
    fail('semantic mutation did not change the registry checksum');
  }

  expectFailure(registry, schema, (value) => value.entries.pop(), 'exactly seven');
  expectFailure(registry, schema, (value) => {
    value.entries[1].subtypeCode = value.entries[0].subtypeCode;
  }, 'exact ratified code set');
  expectFailure(registry, schema, (value) => {
    value.entries[0].subtypeVersion = 0;
  }, 'subtypeVersion');
  expectFailure(registry, schema, (value) => {
    value.entries[0].canonicalComponentCategory = 'OTHER';
  }, 'canonicalComponentCategory');
  expectFailure(registry, schema, (value) => {
    value.entries[0].legalBasisBindings.allowedLegalBasisCodes = ['GENERIC'];
  }, 'unratified Legal Basis');
  expectFailure(registry, schema, (value) => {
    value.entries[0].requiredEvidenceTypes = [];
  }, 'non-empty');
  expectFailure(registry, schema, (value) => {
    value.entries[0].notes = 'TBD';
  }, 'placeholder');
  expectFailure(registry, schema, (value) => {
    value.entries[0].unexpected = true;
  }, 'keys differ');
  expectFailure(registry, schema, (value) => {
    value.registryChecksum = checksum;
  }, 'keys differ');
  expectFailure(registry, schema, (value) => {
    value.entries.reverse();
  }, 'canonical code-point order');
  expectFailure(registry, schema, (value) => {
    const defaultInterest = value.entries.find((entry) => entry.subtypeCode === 'DEFAULT_INTEREST');
    defaultInterest.forbiddenFormationPaths = defaultInterest.forbiddenFormationPaths.filter(
      (entry) => entry !== 'DEFAULT_INTEREST_AS_CATCH_ALL',
    );
  }, 'non-fallback');
}

function validateRepository({ selfTest = false } = {}) {
  const registry = readJson(REGISTRY_PATH);
  const schema = readJson(SCHEMA_PATH);
  const manifest = readJson(CHECKSUM_PATH);
  validateRegistry(registry, schema);
  const checksum = validateChecksumManifest(registry, manifest);
  if (selfTest) runSelfTest(registry, schema, manifest);
  return Object.freeze({ checksum, entryCount: registry.entries.length });
}

if (require.main === module) {
  try {
    const result = validateRepository({ selfTest: process.argv.includes('--self-test') });
    process.stdout.write(
      `LEGAL_SUBTYPE_REGISTRY_VALID entryCount=${result.entryCount} checksum=${result.checksum}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  canonicalize,
  registryChecksum,
  validateRegistry,
  validateRepository,
});
