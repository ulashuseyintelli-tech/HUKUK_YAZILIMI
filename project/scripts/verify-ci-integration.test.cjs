'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verify, minioTitles, renderTitle } = require('./verify-ci-integration.cjs');
const fixture = kind => ({
  success: true,
  testResults: [{
    name: kind === 'minio'
      ? '/repo/src/modules/calc-preview/diagnostics/object-store/__tests__/object-store.write-once.integration.spec.ts'
      : 'D:\\repo\\src\\modules\\ocr\\__tests__\\poppler-page-renderer.spec.ts',
    status: 'passed',
    assertionResults: (kind === 'minio' ? minioTitles : [...Array.from({length:12}, (_,i)=>`unit ${i}`), renderTitle])
      .map(title => ({title, fullName:`suite ${title}`, status:'passed'})),
  }],
});
for (const kind of ['minio', 'poppler']) {
  test(`${kind}: emits each real assertion after PASS`, () => {
    assert.equal(verify(kind, fixture(kind)).length, kind === 'minio' ? 7 : 13);
  });
  for (const status of ['pending', 'todo', 'failed', 'skipped']) {
    test(`${kind}: rejects ${status} assertion even with green aggregate`, () => {
      const r=fixture(kind); r.testResults[0].assertionResults.at(-1).status=status;
      assert.throws(()=>verify(kind,r), /Not executed/);
    });
  }
  test(`${kind}: rejects absent suite`, () => {
    const r=fixture(kind); r.testResults=[]; assert.throws(()=>verify(kind,r), /must run once/);
  });
  test(`${kind}: rejects duplicate suite`, () => {
    const r=fixture(kind); r.testResults.push(r.testResults[0]); assert.throws(()=>verify(kind,r), /must run once/);
  });
  test(`${kind}: rejects renamed required assertion with same count`, () => {
    const r=fixture(kind); r.testResults[0].assertionResults.at(-1).title='unrelated';
    assert.throws(()=>verify(kind,r), /Missing\/duplicate real test/);
  });
  test(`${kind}: rejects failed aggregate`, () => {
    const r=fixture(kind); r.success=false; assert.throws(()=>verify(kind,r), /Jest must succeed/);
  });
  test(`${kind}: rejects failed suite`, () => {
    const r=fixture(kind); r.testResults[0].status='failed'; assert.throws(()=>verify(kind,r), /suite must pass/);
  });
  test(`${kind}: rejects missing assertion`, () => {
    const r=fixture(kind); r.testResults[0].assertionResults.pop(); assert.throws(()=>verify(kind,r), /count changed/);
  });
}
