'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const minioTitles = [
  'should succeed on first write',
  'should fail with 412 on second write to same key',
  'should allow write after delete',
  'should capture correct metadata in headVerification',
  'should allow only one concurrent write to succeed',
  'should preserve metadata on write-once',
  'should preserve tags on write-once',
];
const renderTitle = 'gerçek poppler ile 1-sayfalık PDF render eder (env-gated)';

function verify(kind, result) {
  assert.ok(['minio', 'poppler'].includes(kind), 'Unknown integration');
  assert.equal(result.success, true, 'Jest must succeed');
  const suffix = kind === 'minio'
    ? '/modules/calc-preview/diagnostics/object-store/__tests__/object-store.write-once.integration.spec.ts'
    : '/modules/ocr/__tests__/poppler-page-renderer.spec.ts';
  const suites = result.testResults.filter(s => s.name.replaceAll('\\', '/').endsWith(suffix));
  assert.equal(suites.length, 1, 'Exact integration suite must run once');
  const suite = suites[0];
  assert.equal(suite.status, 'passed', 'Integration suite must pass');
  const assertions = suite.assertionResults;
  assert.equal(assertions.length, kind === 'minio' ? 7 : 13, 'Integration assertion count changed');
  for (const test of assertions) assert.equal(test.status, 'passed', `Not executed/PASS: ${test.fullName}`);
  const required = kind === 'minio' ? minioTitles : [renderTitle];
  for (const title of required) {
    assert.equal(assertions.filter(t => t.title === title).length, 1, `Missing/duplicate real test: ${title}`);
  }
  return assertions.map(t => `REAL-INTEGRATION PASS ${t.fullName}`);
}

if (require.main === module) {
  try {
    for (const line of verify(process.argv[2], JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))) console.log(line);
  } catch (error) {
    console.error(`REAL-INTEGRATION FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { verify, minioTitles, renderTitle };
