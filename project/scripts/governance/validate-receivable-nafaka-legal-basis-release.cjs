'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GOVERNANCE_ROOT = path.resolve(__dirname, '../../docs/governance');
const DECISION_PACK_FILE = 'RECEIVABLE-NAFAKA-LEGAL-BASIS-DECISION-PACK-v2.md';
const DECISION_PACK_CHECKSUM =
  '1e1fa725107a63cb736e927d810f07c5e70b6120f3b34248e2e87f5a61088a77';
const V1_REGISTRY_FILE = 'receivable-legal-subtype-registry-v1.json';
const V1_MANIFEST_FILE = 'receivable-legal-subtype-registry-v1.checksum.json';
const V2_REGISTRY_FILE = 'receivable-legal-subtype-registry-v2.json';
const V2_MANIFEST_FILE = 'receivable-legal-subtype-registry-v2.checksum.json';
const RELEASE_FILE = 'receivable-legal-basis-release-r1.json';
const RELEASE_MANIFEST_FILE = 'receivable-legal-basis-release-r1.manifest.json';
const REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
const SERIALIZATION_ALGORITHM = 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1';
const RELEASE_SCHEMA = 'RECEIVABLE_LEGAL_BASIS_RELEASE_V1';
const RELEASE_ID = 'RCV-LB-R1';
const EFFECTIVE_AT = '2026-08-01T00:00:00Z';
const V1_RAW_SHA256 = Object.freeze({
  'receivable-legal-subtype-registry-v1.json':
    '447e1863892b5b403a873d3afe46c066609d80451ad04918075f50cd997945bf',
  'receivable-legal-subtype-registry-v1.checksum.json':
    'eb63de365f3176a7cdc733c29085d238794512705b03751046c138eab05861f1',
  'receivable-legal-subtype-registry-v1.schema.json':
    'bfe75e0abc68e88cec03bdeaa70782e28640f8b05886b70ffd2768cbea604445',
  'receivable-legal-subtype-registry-v1.md':
    'd4fb62e426f8277ebf877a015ec1e2380faf688b366a7ced6a36c523edbe0095',
  'receivable-legal-subtype-registry-v1-crosswalk.md':
    '48c7fb62afb5dbdeb1deede8ceec43faf1262fde3e0787f0bcfc6f7af96a80ac',
});
const NAFAKA_SUBTYPE_CODES = Object.freeze([
  'ADULT_CHILD_EDUCATION_MAINTENANCE',
  'FAMILY_SUPPORT_MAINTENANCE',
  'INTERIM_MAINTENANCE',
  'MINOR_CHILD_MAINTENANCE',
  'POVERTY_MAINTENANCE',
  'SEPARATE_LIVING_SPOUSAL_MAINTENANCE',
]);
const LEGAL_BASIS_CODES = Object.freeze([
  'TMK_169',
  'TMK_175_176',
  'TMK_182_2',
  'TMK_197',
  'TMK_327_330',
  'TMK_328_2',
  'TMK_364_366',
]);
const BASIS_METADATA = Object.freeze({
  TMK_169: Object.freeze({
    title: 'Boşanma Davası Süresince Geçici Nafaka Tedbiri',
    provisions: Object.freeze(['TMK 169']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2018/6904',
    ]),
  }),
  TMK_175_176: Object.freeze({
    title: 'Yoksulluk Nafakası ve Ödeme Biçimi',
    provisions: Object.freeze(['TMK 175', 'TMK 176']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://normkararlarbilgibankasi.anayasa.gov.tr/ND/2009/94',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2016/3140',
    ]),
  }),
  TMK_182_2: Object.freeze({
    title: 'Boşanma Sonrası Çocuk Giderlerine Katılım',
    provisions: Object.freeze(['TMK 182/2']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2016/3140',
    ]),
  }),
  TMK_197: Object.freeze({
    title: 'Haklı Ayrı Yaşamada Parasal Katkı',
    provisions: Object.freeze(['TMK 197']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2013/6616',
    ]),
  }),
  TMK_327_330: Object.freeze({
    title: 'Çocuğun Bakım ve Eğitim Giderlerine Katılım',
    provisions: Object.freeze(['TMK 327', 'TMK 330']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2016/3140',
    ]),
  }),
  TMK_328_2: Object.freeze({
    title: 'Erginlik Sonrası Devam Eden Eğitim Nafakası',
    provisions: Object.freeze(['TMK 328/2']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
    ]),
  }),
  TMK_364_366: Object.freeze({
    title: 'Aile İçinde Yardım Nafakası',
    provisions: Object.freeze(['TMK 364', 'TMK 365', 'TMK 366']),
    urls: Object.freeze([
      'https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html',
      'https://kararlarbilgibankasi.anayasa.gov.tr/BB/2014/10261',
    ]),
  }),
});

function fail(message) {
  throw new Error(`NAFAKA_LEGAL_BASIS_RELEASE_INVALID: ${message}`);
}

function compareCodePoints(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const delta = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

function sorted(values) {
  return [...new Set(values)].sort(compareCodePoints);
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
  fail('canonical payload contains an unsupported value');
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareCodePoints)
        .map((key) => [key.normalize('NFC'), ordered(value[key])]),
    );
  }
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

function pretty(value) {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(GOVERNANCE_ROOT, fileName), 'utf8'));
}

function readDecisionPack() {
  const validator = require('./validate-receivable-nafaka-decision-pack-v2.cjs');
  const validation = validator.validateRepository();
  if (validation.checksum !== DECISION_PACK_CHECKSUM) fail('Decision Pack checksum differs');
  const markdown = fs.readFileSync(path.join(GOVERNANCE_ROOT, DECISION_PACK_FILE), 'utf8');
  return validator.extractPayload(markdown);
}

function assertV1ByteExact() {
  for (const [fileName, expected] of Object.entries(V1_RAW_SHA256)) {
    const actual = sha256(fs.readFileSync(path.join(GOVERNANCE_ROOT, fileName)));
    if (actual !== expected) fail(`immutable v1 history changed: ${fileName}`);
  }
}

function buildNafakaSubtype(entry) {
  return {
    admissionRequirements: entry.admissionRequirements,
    allowedFormationPaths: entry.allowedFormationPaths,
    amountSemantics: {
      fixedAtFormation: true,
      minorUnitRepresentation: entry.amountSemantics.minorUnitRepresentation,
      roundingFallback: 'PROHIBITED',
      semanticAuthority: entry.amountSemantics.semanticAuthority,
    },
    calculationSemantics: {
      futureAccrual: 'INTEREST_POLICY_ONLY',
      rule: entry.calculationSemantics.rule,
      sourceAmountDerivation: entry.calculationSemantics.sourceAmountDerivation,
    },
    canonicalComponentCategory: 'PRINCIPAL',
    currencySemantics: entry.currencySemantics,
    displayName: entry.displayName,
    effectiveFrom: entry.effectiveFrom,
    effectiveUntil: entry.effectiveUntil,
    finalizationRequirements: entry.finalizationRequirements,
    forbiddenFormationPaths: sorted([
      ...entry.forbiddenFormationPaths,
      'GENERIC_COMPONENT_FALLBACK',
    ]),
    interestEligibility: {
      componentAccruesFurtherInterest: false,
      eligibilityRule: entry.interestEligibility.rule,
      requiresExactInterestPolicy: true,
      requiresExactRateAuthority: true,
    },
    legalBasisBindings: entry.legalBasisBindings,
    legalCharacter: entry.legalCharacter,
    legalMeaning: entry.legalMeaning,
    liabilityCompatibility: {
      allowedLiabilityTypes: sorted(entry.liabilityCompatibility.allowedLiabilityTypes),
      crossLiabilityUse: 'PROHIBITED',
      scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP',
    },
    lifecycle: {
      activation: 'RATIFIED_BUT_RUNTIME_DORMANT',
      revocationBehavior: 'FAIL_CLOSED_FOR_NEW_FORMATION',
      versionUpgrade: 'EXPLICIT_NEW_VERSION_ONLY',
    },
    notes:
      'Claim-level nafaka principal only; implicit all-debtor liability, interest, costs, fallbacks and historical reclassification are prohibited.',
    requiredEvidenceTypes: sorted(entry.requiredEvidenceTypes),
    requiredSourceTypes: sorted([
      ...entry.requiredSourceTypes,
      'EXACT_LEGAL_BASIS_RELEASE_ENTRY',
      'EXACT_LIABILITY_CONTEXT',
    ]),
    snapshotRequirements: entry.snapshotRequirements,
    status: 'RATIFIED',
    subtypeCode: entry.subtypeCode,
    subtypeVersion: entry.subtypeVersion,
    supersededBy: null,
    supersedes: entry.supersedes,
  };
}

function buildRegistryV2(v1, pack) {
  const nafakaEntries = pack.entries.map(buildNafakaSubtype);
  return {
    entries: [...v1.entries, ...nafakaEntries].sort((left, right) =>
      compareCodePoints(left.subtypeCode, right.subtypeCode),
    ),
    registryId: REGISTRY_ID,
    registryStatus: 'RATIFIED',
    registryVersion: 2,
    runtimeStatus: 'DORMANT',
    serializationAlgorithm: SERIALIZATION_ALGORITHM,
  };
}

function buildRegistryManifest(v1Manifest, registry) {
  return {
    checksumAlgorithm: 'SHA-256',
    entryCount: registry.entries.length,
    generatedFromCanonicalPayload: V2_REGISTRY_FILE,
    predecessor: {
      registryChecksum: v1Manifest.registryChecksum,
      registryId: v1Manifest.registryId,
      registryVersion: v1Manifest.registryVersion,
    },
    registryChecksum: sha256(Buffer.from(canonicalize(registry), 'utf8')),
    registryId: REGISTRY_ID,
    registryVersion: 2,
    runtimeStatus: 'DORMANT',
    serializationAlgorithm: SERIALIZATION_ALGORITHM,
  };
}

function sourceReferences(code) {
  const metadata = BASIS_METADATA[code];
  return metadata.urls.map((url, index) => ({
    authority: index === 0 ? 'Türkiye Büyük Millet Meclisi' : 'Anayasa Mahkemesi',
    provisionScope:
      url.endsWith('/BB/2016/3140') && code === 'TMK_175_176'
        ? ['TMK 176']
        : url.endsWith('/BB/2016/3140') && code === 'TMK_182_2'
          ? ['TMK 182']
          : url.endsWith('/BB/2016/3140') && code === 'TMK_327_330'
            ? ['TMK 330']
            : metadata.provisions,
    url,
  }));
}

function entriesForBasis(pack, code) {
  return pack.entries.filter((entry) =>
    entry.legalBasisBindings.allowedLegalBasisCodes.includes(code),
  );
}

function buildLegalBasisEntry(pack, registryManifest, code) {
  const entries = entriesForBasis(pack, code);
  if (entries.length === 0) fail(`Decision Pack has no subtype for ${code}`);
  const liabilityScopes = sorted(entries.map((entry) => entry.liabilityCompatibility.scope));
  const meanings = entries.map((entry) => entry.legalMeaning);
  return {
    allowedComponentCategories: ['PRINCIPAL'],
    effectiveFrom: EFFECTIVE_AT,
    interestEligibility: {
      automaticInterest: false,
      formationProjection: 'UNKNOWN',
      rule: 'SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED',
    },
    legalAuthorityReferences: sourceReferences(code),
    legalBasisCode: code,
    legalBasisVersion: '1',
    legalContent: {
      exclusions: [
        'ENFORCEMENT_EXPENSE',
        'INTEREST',
        'LITIGATION_COST',
        'STATUTORY_OR_CONTRACTUAL_FEE',
      ],
      legalRole: 'CLAIM_FORMATION_AUTHORITY',
      permittedUse: meanings,
      title: BASIS_METADATA[code].title,
    },
    liabilityCompatibility: {
      allowedLiabilityTypes: sorted(
        entries.flatMap((entry) => entry.liabilityCompatibility.allowedLiabilityTypes),
      ),
      implicitAllDebtors: 'PROHIBITED',
      scopes: liabilityScopes,
    },
    sourceEvidenceCompatibility: {
      allowedSourceTypes: sorted(entries.flatMap((entry) => entry.requiredSourceTypes)),
      combinationRule: 'ALL_ENTRY_REQUIREMENTS_AND_EXACT_SOURCE',
      requiredEvidenceTypes: sorted(entries.flatMap((entry) => entry.requiredEvidenceTypes)),
    },
    subtypeRegistryBinding: {
      allowedSubtypeCodes: sorted(entries.map((entry) => entry.subtypeCode)),
      registryChecksum: registryManifest.registryChecksum,
      registryId: REGISTRY_ID,
      registryVersion: '2',
    },
    supersedes: [],
  };
}

function buildRelease(pack, registryManifest) {
  return {
    contentAuthority: {
      decisionPackId: pack.decisionPackId,
      decisionPackSha256: DECISION_PACK_CHECKSUM,
      decisionPackVersion: String(pack.decisionPackVersion),
    },
    effectiveAt: EFFECTIVE_AT,
    legalBases: LEGAL_BASIS_CODES.map((code) =>
      buildLegalBasisEntry(pack, registryManifest, code),
    ),
    previousRelease: null,
    releaseId: RELEASE_ID,
    releaseVersion: '1',
    schemaVersion: RELEASE_SCHEMA,
    supersedesReleaseIds: [],
  };
}

function buildReleaseManifest(pack, release) {
  const payloadChecksum = sha256(Buffer.from(canonicalize(release), 'utf8'));
  return {
    contentRatification: {
      decisionPackSha256: DECISION_PACK_CHECKSUM,
      finalRatifier: {
        identity: pack.ratification.finalRatifier.identity,
        ratifierCode: pack.ratification.finalRatifier.ratifierCode,
        signatureStatus: 'PENDING_NOT_EXECUTED',
      },
      legalReviewer: {
        identity: pack.ratification.legalReviewer.identity,
        ratifierCode: pack.ratification.legalReviewer.ratifierCode,
        signatureStatus: 'PENDING_NOT_EXECUTED',
      },
      status: 'OWNER_LEGAL_AUTHORITY_RATIFIED',
    },
    entryChecksums: release.legalBases.map((entry) => ({
      checksum: sha256(Buffer.from(canonicalize(entry), 'utf8')),
      legalBasisCode: entry.legalBasisCode,
      legalBasisVersion: entry.legalBasisVersion,
    })),
    lifecycleEvidenceRefs: [],
    manifestSchemaVersion: 'RECEIVABLE_LEGAL_BASIS_RELEASE_MANIFEST_V1',
    payloadChecksum,
    previousRelease: null,
    productionSigner: {
      signatureStatus: 'PENDING_NOT_EXECUTED',
      signerId: pack.ratification.productionSigner.signerId,
    },
    releaseId: release.releaseId,
    releaseVersion: release.releaseVersion,
    runtimeStatus: 'DORMANT_DEFAULT_OFF',
    signatureStatus: 'PENDING_NOT_EXECUTED',
    signatures: [],
    supersedesReleaseIds: [],
  };
}

function buildExpectedArtifacts() {
  assertV1ByteExact();
  const pack = readDecisionPack();
  const v1 = readJson(V1_REGISTRY_FILE);
  const v1Manifest = readJson(V1_MANIFEST_FILE);
  const registry = buildRegistryV2(v1, pack);
  const registryManifest = buildRegistryManifest(v1Manifest, registry);
  const release = buildRelease(pack, registryManifest);
  const releaseManifest = buildReleaseManifest(pack, release);
  return { pack, registry, registryManifest, release, releaseManifest, v1 };
}

function assertExactFile(fileName, expected) {
  const actual = fs.readFileSync(path.join(GOVERNANCE_ROOT, fileName), 'utf8');
  const wanted = pretty(expected);
  if (actual !== wanted) fail(`${fileName} differs from deterministic materialization`);
}

function validateRepository() {
  const artifacts = buildExpectedArtifacts();
  assertExactFile(V2_REGISTRY_FILE, artifacts.registry);
  assertExactFile(V2_MANIFEST_FILE, artifacts.registryManifest);
  assertExactFile(RELEASE_FILE, artifacts.release);
  assertExactFile(RELEASE_MANIFEST_FILE, artifacts.releaseManifest);

  const oldCodes = new Set(artifacts.v1.entries.map((entry) => entry.subtypeCode));
  const preserved = artifacts.registry.entries.filter((entry) => oldCodes.has(entry.subtypeCode));
  if (JSON.stringify(preserved) !== JSON.stringify(artifacts.v1.entries)) {
    fail('v1 entries are not byte-semantic exact in the v2 snapshot');
  }
  const newCodes = artifacts.registry.entries
    .filter((entry) => !oldCodes.has(entry.subtypeCode))
    .map((entry) => entry.subtypeCode);
  if (JSON.stringify(newCodes) !== JSON.stringify(NAFAKA_SUBTYPE_CODES)) {
    fail('v2 nafaka subtype set differs');
  }
  if (
    artifacts.release.legalBases.some(
      (entry) =>
        entry.allowedComponentCategories.length !== 1 ||
        entry.allowedComponentCategories[0] !== 'PRINCIPAL' ||
        entry.interestEligibility.automaticInterest !== false ||
        entry.liabilityCompatibility.implicitAllDebtors !== 'PROHIBITED',
    )
  ) {
    fail('release contains a non-principal, automatic-interest or implicit-liability entry');
  }
  if (
    artifacts.releaseManifest.signatureStatus !== 'PENDING_NOT_EXECUTED' ||
    artifacts.releaseManifest.runtimeStatus !== 'DORMANT_DEFAULT_OFF' ||
    artifacts.releaseManifest.signatures.length !== 0
  ) {
    fail('unsigned dormant boundary differs');
  }
  return Object.freeze({
    entryCount: artifacts.release.legalBases.length,
    registryChecksum: artifacts.registryManifest.registryChecksum,
    registryEntryCount: artifacts.registry.entries.length,
    releaseChecksum: artifacts.releaseManifest.payloadChecksum,
  });
}

function runSelfTest() {
  const artifacts = buildExpectedArtifacts();
  const tamperedRelease = structuredClone(artifacts.release);
  tamperedRelease.legalBases[0].allowedComponentCategories = ['ACCRUED_INTEREST'];
  if (buildReleaseManifest(artifacts.pack, tamperedRelease).payloadChecksum === artifacts.releaseManifest.payloadChecksum) {
    fail('self-test failed to detect category tamper');
  }
  const tamperedRegistry = structuredClone(artifacts.registry);
  tamperedRegistry.entries[0].subtypeVersion += 1;
  if (sha256(Buffer.from(canonicalize(tamperedRegistry), 'utf8')) === artifacts.registryManifest.registryChecksum) {
    fail('self-test failed to detect registry tamper');
  }
}

if (require.main === module) {
  try {
    const result = validateRepository();
    if (process.argv.includes('--self-test')) runSelfTest();
    process.stdout.write(
      `NAFAKA_LEGAL_BASIS_RELEASE_VALID releaseId=${RELEASE_ID} entryCount=${result.entryCount} releaseChecksum=${result.releaseChecksum} registryVersion=2 registryEntryCount=${result.registryEntryCount} registryChecksum=${result.registryChecksum}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  buildExpectedArtifacts,
  canonicalize,
  validateRepository,
});
