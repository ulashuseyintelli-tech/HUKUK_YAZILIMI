#!/usr/bin/env node
'use strict';

/**
 * RCV-LB-R2-CEK (K3 AUTO-GENERATE FORMATION, owner GO 2026-09-28) — karşılıksız çek hukuki dayanak sürümü ve alt tür
 * sicil parçası için kanonik checksum doğrulayıcısı.
 *
 * İçerik TASLAKTIR (`DRAFT_PENDING_OWNER_LEGAL_RATIFICATION`): owner/hukukçu onayı olmadan üretim yetkisi değildir.
 * Bu doğrulayıcı yalnız bütünlüğü (kanonik serileştirme + SHA-256) ve iç tutarlılığı pinler; hukuki doğruluğu
 * doğrulamaz. Kanonikleştirme R1 doğrulayıcısıyla AYNIDIR (tek kaynak).
 *
 * Kullanım:
 *   node validate-receivable-cek-legal-basis-release-r2.cjs            # doğrula + özet
 *   node validate-receivable-cek-legal-basis-release-r2.cjs --write    # yer tutucu/checksum'ları yeniden üret
 *   node validate-receivable-cek-legal-basis-release-r2.cjs --self-test
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalize } = require('./validate-receivable-nafaka-legal-basis-release.cjs');

const GOVERNANCE_ROOT = path.resolve(__dirname, '../../docs/governance');
const REGISTRY_FILE = 'receivable-legal-subtype-registry-cek-r2-draft.json';
const RELEASE_FILE = 'receivable-legal-basis-release-r2-cek-draft.json';
const MANIFEST_FILE = 'receivable-legal-basis-release-r2-cek-draft.manifest.json';
const DECISION_PACK_FILE = 'receivable-cek-legal-basis-r2-decision-pack-draft.md';

const REGISTRY_ID = 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
const RELEASE_ID = 'RCV-LB-R2-CEK';
const EXPECTED_SUBTYPES = ['CHECK_PENALTY', 'CHECK_PRINCIPAL'];
const EXPECTED_BASES = ['TTK_CEK_BEDELI', 'TTK_CEK_TAZMINATI'];
const RATIFICATION_STATUSES = ['DRAFT_PENDING_OWNER_LEGAL_RATIFICATION', 'OWNER_LEGAL_AUTHORITY_RATIFIED'];
const SHA256_HEX = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`RCV-LB-R2-CEK: ${message}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalChecksum(value) {
  return sha256(Buffer.from(canonicalize(value), 'utf8'));
}

/** Karar paketi satır sonundan bağımsız hash'lenir (CRLF/LF farkı checksum'ı değiştirmez). */
function decisionPackChecksum(root = GOVERNANCE_ROOT) {
  const text = fs.readFileSync(path.join(root, DECISION_PACK_FILE), 'utf8').replace(/\r\n/g, '\n');
  return sha256(Buffer.from(text, 'utf8'));
}

function readJson(fileName, root = GOVERNANCE_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, fileName), 'utf8'));
}

function readArtifacts(root = GOVERNANCE_ROOT) {
  return {
    registry: readJson(REGISTRY_FILE, root),
    release: readJson(RELEASE_FILE, root),
    manifest: readJson(MANIFEST_FILE, root),
    decisionPackSha256: decisionPackChecksum(root),
  };
}

function sortedCodes(list, key) {
  return list.map((entry) => entry[key]).sort();
}

/**
 * Tüm iç tutarlılık ve checksum kurallarını doğrular; ihlalde fırlatır. Döner: hesaplanan checksum'lar.
 */
function validateArtifacts(artifacts) {
  const { registry, release, manifest, decisionPackSha256 } = artifacts;
  const registryChecksum = canonicalChecksum(registry);

  if (
    registry.registryId !== REGISTRY_ID ||
    registry.registryVersion !== 3 ||
    !RATIFICATION_STATUSES.includes(registry.registryStatus) ||
    registry.runtimeStatus !== 'DORMANT' ||
    registry.serializationAlgorithm !== 'RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1' ||
    JSON.stringify(sortedCodes(registry.entries, 'subtypeCode')) !== JSON.stringify(EXPECTED_SUBTYPES)
  ) {
    fail('subtype registry identity/scope is invalid');
  }
  if (
    release.releaseId !== RELEASE_ID ||
    release.releaseVersion !== '1' ||
    release.schemaVersion !== 'RECEIVABLE_LEGAL_BASIS_RELEASE_CEK_DRAFT_V1' ||
    release.previousRelease !== null ||
    !Array.isArray(release.supersedesReleaseIds) ||
    release.supersedesReleaseIds.length !== 0 ||
    JSON.stringify(sortedCodes(release.legalBases, 'legalBasisCode')) !== JSON.stringify(EXPECTED_BASES)
  ) {
    fail('release identity/scope is invalid');
  }
  if (release.contentAuthority.decisionPackSha256 !== decisionPackSha256) {
    fail('release does not bind the decision pack checksum');
  }
  for (const basis of release.legalBases) {
    if (
      basis.subtypeRegistryBinding.registryId !== REGISTRY_ID ||
      basis.subtypeRegistryBinding.registryVersion !== '3' ||
      basis.subtypeRegistryBinding.registryChecksum !== registryChecksum
    ) {
      fail(`legal basis ${basis.legalBasisCode} does not bind the registry checksum`);
    }
  }

  const releaseChecksum = canonicalChecksum(release);
  const entryChecksums = release.legalBases
    .map((basis) => ({
      checksum: canonicalChecksum(basis),
      legalBasisCode: basis.legalBasisCode,
      legalBasisVersion: basis.legalBasisVersion,
    }))
    .sort((a, b) => (a.legalBasisCode < b.legalBasisCode ? -1 : 1));

  if (
    manifest.manifestSchemaVersion !== 'RECEIVABLE_LEGAL_BASIS_RELEASE_MANIFEST_V1' ||
    manifest.releaseId !== release.releaseId ||
    manifest.releaseVersion !== release.releaseVersion ||
    manifest.runtimeStatus !== 'DORMANT_DEFAULT_OFF' ||
    manifest.signatureStatus !== 'PENDING_NOT_EXECUTED' ||
    !Array.isArray(manifest.signatures) ||
    manifest.signatures.length !== 0 ||
    !RATIFICATION_STATUSES.includes(manifest.contentRatification.status) ||
    manifest.contentRatification.status !== registry.registryStatus ||
    manifest.contentRatification.decisionPackSha256 !== decisionPackSha256 ||
    manifest.payloadChecksum !== releaseChecksum ||
    manifest.registryChecksum !== registryChecksum ||
    JSON.stringify(manifest.entryChecksums) !== JSON.stringify(entryChecksums)
  ) {
    fail('manifest does not match the canonical release/registry checksums');
  }
  for (const value of [registryChecksum, releaseChecksum, decisionPackSha256]) {
    if (!SHA256_HEX.test(value)) fail('checksum is not SHA-256 hex');
  }
  return Object.freeze({
    registryChecksum,
    releaseChecksum,
    decisionPackSha256,
    entryChecksums,
    ratificationStatus: manifest.contentRatification.status,
  });
}

function validateRepository(root = GOVERNANCE_ROOT) {
  return validateArtifacts(readArtifacts(root));
}

/** Yer tutucuları ve checksum'ları deterministik biçimde yeniden üretir (taslak düzenlemesi / ratifikasyon sonrası). */
function writeRepository(root = GOVERNANCE_ROOT) {
  const registry = readJson(REGISTRY_FILE, root);
  const release = readJson(RELEASE_FILE, root);
  const manifestPath = path.join(root, MANIFEST_FILE);
  const previousManifest = fs.existsSync(manifestPath) ? readJson(MANIFEST_FILE, root) : null;
  const packSha = decisionPackChecksum(root);
  const registryChecksum = canonicalChecksum(registry);
  release.contentAuthority.decisionPackSha256 = packSha;
  for (const basis of release.legalBases) basis.subtypeRegistryBinding.registryChecksum = registryChecksum;
  fs.writeFileSync(path.join(root, RELEASE_FILE), `${JSON.stringify(release, null, 2)}\n`, 'utf8');
  const releaseChecksum = canonicalChecksum(release);
  const status = previousManifest?.contentRatification?.status ?? registry.registryStatus;
  const manifest = {
    contentRatification: { decisionPackSha256: packSha, status },
    entryChecksums: release.legalBases
      .map((basis) => ({
        checksum: canonicalChecksum(basis),
        legalBasisCode: basis.legalBasisCode,
        legalBasisVersion: basis.legalBasisVersion,
      }))
      .sort((a, b) => (a.legalBasisCode < b.legalBasisCode ? -1 : 1)),
    manifestSchemaVersion: 'RECEIVABLE_LEGAL_BASIS_RELEASE_MANIFEST_V1',
    payloadChecksum: releaseChecksum,
    registryChecksum,
    releaseId: release.releaseId,
    releaseVersion: release.releaseVersion,
    runtimeStatus: 'DORMANT_DEFAULT_OFF',
    signatureStatus: 'PENDING_NOT_EXECUTED',
    signatures: [],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return validateRepository(root);
}

function runSelfTest() {
  const artifacts = readArtifacts();
  validateArtifacts(artifacts);
  const tampered = JSON.parse(JSON.stringify(artifacts));
  tampered.release.legalBases[1].calculation.percentOfPrincipalBasisPoints = 2000;
  let rejected = false;
  try {
    validateArtifacts(tampered);
  } catch {
    rejected = true;
  }
  if (!rejected) fail('self-test: tampered release was not rejected');
}

if (require.main === module) {
  try {
    const result = process.argv.includes('--write') ? writeRepository() : validateRepository();
    if (process.argv.includes('--self-test')) runSelfTest();
    process.stdout.write(
      `RCV-LB-R2-CEK OK status=${result.ratificationStatus} registry=${result.registryChecksum} release=${result.releaseChecksum} entries=${result.entryChecksums.length}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  DECISION_PACK_FILE,
  MANIFEST_FILE,
  REGISTRY_FILE,
  RELEASE_FILE,
  canonicalChecksum,
  decisionPackChecksum,
  readArtifacts,
  validateArtifacts,
  validateRepository,
  writeRepository,
});
