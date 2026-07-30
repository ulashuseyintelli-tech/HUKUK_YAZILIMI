#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const EFFECTIVE_FROM_MAIN_SHA = 'c046819b968d16f20cf2834ba805beb22e4aa488';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
const GOVERNANCE_ROOT = path.join(PROJECT_ROOT, 'docs', 'governance');
const POLICY_PATH = path.join(
  GOVERNANCE_ROOT,
  'governance-writer-coordination-protected-paths.json',
);
const REGISTER_PATH = path.join(
  GOVERNANCE_ROOT,
  'governance-writer-coordination-register.md',
);
const REQUESTS_ROOT = path.join(GOVERNANCE_ROOT, 'coordination-requests');
const RESULTS_ROOT = path.join(GOVERNANCE_ROOT, 'coordination-results');
const GRANT_REPO_PATH =
  'project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md';
const GIT_DEFAULT_PROCESS_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES = 8 * 1024 * 1024;
const GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const GIT_DIAGNOSTIC_EXCERPT_MAX_CHARS = 4096;

const REQUEST_KEYS = [
  'schemaVersion',
  'requestId',
  'requestFingerprint',
  'requestedBy',
  'createdAt',
  'baseMainSha',
  'semanticAuthorityRef',
  'executionGrantRef',
  'operation',
  'declaredTargetAllowlist',
];
const AUTHORITY_REF_KEYS = ['kind', 'path', 'recordId', 'evidenceSha'];
const AUTHORITY_KINDS = new Set(['SEMANTIC_AUTHORITY', 'EXECUTION_GRANT']);
const AUTHORITY_RECORD_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;
const OPERATION_KEYS = [
  'type',
  'changeClass',
  'targetFile',
  'recordIdentity',
  'anchor',
  'expectedOldValue',
  'newValue',
  'evidenceSha',
  'expectedResultSha256',
];
const RESULT_KEYS = [
  'schemaVersion',
  'resultId',
  'requestId',
  'requestFingerprint',
  'status',
  'executionPrNumber',
  'executionMergeSha',
  'effectiveMainSha',
  'completedAt',
  'validationEvidence',
];
const EVIDENCE_KEYS = ['name', 'status', 'evidenceSha'];
const RESULT_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'BLOCKED', 'REJECTED']);
const LEVEL_2_OPERATIONS = new Set([
  'EXACT_APPEND_AT_DECLARED_ANCHOR',
  'EXACT_LITERAL_REPLACEMENT',
  'EXACT_REFERENCE_REWRITE',
  'DETERMINISTIC_REGISTER_REGENERATION',
]);

const BOOTSTRAP_MODIFY = new Set([
  '.github/workflows/ci.yml',
  'AGENTS.md',
  'project/docs/governance/GOVERNANCE-INDEX.md',
  'project/docs/governance/decision-log.md',
]);
const BOOTSTRAP_ADD = new Set([
  'project/docs/governance/governance-writer-coordination-contract.md',
  'project/docs/governance/governance-writer-coordination-cutover-record.md',
  'project/docs/governance/governance-writer-coordination-protected-paths.json',
  'project/docs/governance/governance-writer-coordination-register.md',
  'project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md',
  'project/docs/governance/coordination-requests/README.md',
  'project/docs/governance/coordination-requests/_template/request.md',
  'project/docs/governance/coordination-results/README.md',
  'project/docs/governance/coordination-results/_template/result.md',
  'project/scripts/governance-coordination.cjs',
  'project/scripts/governance-coordination.test.cjs',
]);
const BOOTSTRAP_ALL = new Set([...BOOTSTRAP_MODIFY, ...BOOTSTRAP_ADD]);
const AUTHORITY_LOCATOR_REPAIR_I01 = Object.freeze({
  mode: 'AUTHORITY_LOCATOR_REPAIR_I01',
  baseSha: 'feadf408e9b6d02738d43a0ae78e38f75e594996',
  headRef: 'codex/gov-coord-v1-authority-locator-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/docs/governance/decision-log.md',
    GRANT_REPO_PATH,
  ]),
  semanticAuthority: Object.freeze({
    kind: 'SEMANTIC_AUTHORITY',
    path: 'project/docs/governance/decision-log.md',
    recordId: 'CLIENT-P2-U03-TRACK-B-D01-GOV',
  }),
  executionGrant: Object.freeze({
    kind: 'EXECUTION_GRANT',
    path: GRANT_REPO_PATH,
    recordId: 'GOV-COORD-V1-CODEX-LOCAL',
  }),
});
const AUTHORITY_LOCATOR_REPAIR_I01_PATHS = new Set(
  AUTHORITY_LOCATOR_REPAIR_I01.changedPaths,
);
const REGISTER_TEST_FIXTURE_REPAIR_I01 = Object.freeze({
  mode: 'REGISTER_TEST_FIXTURE_REPAIR_I01',
  baseSha: 'a02498dfd50e349b2cb1eddfbde0561ece30fba6',
  headRef: 'codex/gov-coord-v1-register-test-fixture-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
  ]),
});
const REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS = new Set(
  REGISTER_TEST_FIXTURE_REPAIR_I01.changedPaths,
);
const EXECUTION_BASE_ANCESTRY_REPAIR_I01 = Object.freeze({
  mode: 'EXECUTION_BASE_ANCESTRY_REPAIR_I01',
  baseSha: 'c714769b10a60152b14c61b7fd75e76386fedfb9',
  headRef: 'codex/gov-coord-v1-execution-base-ancestry-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS = new Set(
  EXECUTION_BASE_ANCESTRY_REPAIR_I01.changedPaths,
);
const NONCOORD_PR_CLASSIFIER_REPAIR_R01 = Object.freeze({
  mode: 'NONCOORD_PR_CLASSIFIER_REPAIR_R01',
  baseSha: 'ba26f6adb98e3c1a7687f025e6d7dcd470e3fb6b',
  headRef: 'codex/gov-coord-noncoord-classifier-repair-r01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS = new Set(
  NONCOORD_PR_CLASSIFIER_REPAIR_R01.changedPaths,
);
const ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02 = Object.freeze({
  mode: 'ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02',
  baseSha: '344259a80ce790c9c09455b978ff124ced54bf63',
  headRef: 'codex/dx-006-analyze-first-conditional-execution-r02',
  changedPaths: Object.freeze([
    Object.freeze({ status: 'M', path: 'AGENTS.md' }),
    Object.freeze({ status: 'M', path: 'CLAUDE.md' }),
    Object.freeze({ status: 'M', path: '.claude/CLAUDE.md' }),
    Object.freeze({
      status: 'M',
      path: 'project/PROJECT_MEMORY_PACK/03_OPERATING_MODEL.md',
    }),
    Object.freeze({
      status: 'M',
      path: 'project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md',
    }),
    Object.freeze({
      status: 'A',
      path: 'project/docs/governance/coordination-execution-grants/DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02.md',
    }),
    Object.freeze({ status: 'M', path: 'project/docs/governance/decision-log.md' }),
    Object.freeze({
      status: 'M',
      path: 'project/docs/governance/governance-writer-coordination-contract.md',
    }),
    Object.freeze({ status: 'M', path: 'project/docs/governance/process-rules.md' }),
    Object.freeze({ status: 'M', path: 'project/scripts/governance-coordination.cjs' }),
    Object.freeze({ status: 'M', path: 'project/scripts/governance-coordination.test.cjs' }),
  ]),
  semanticAuthority: Object.freeze({
    kind: 'SEMANTIC_AUTHORITY',
    path: 'project/docs/governance/decision-log.md',
    recordId: 'DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02',
  }),
  executionGrant: Object.freeze({
    kind: 'EXECUTION_GRANT',
    path: 'project/docs/governance/coordination-execution-grants/DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02.md',
    recordId: 'DX-006-ANALYZE-FIRST-CONDITIONAL-EXECUTION-R02-GRANT',
  }),
});
const GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01 = Object.freeze({
  taskId: 'GITHUB-PLATFORM-BASELINE-GH02-CONTROL-PLANE-BINDING-R01',
  bindingPr: Object.freeze({
    mode: 'GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01',
    baseSha: 'ad7e00a85be748dcfc5a8b5049e13d3744a3e15e',
    headRef: 'codex/github-platform-gh02-control-plane-binding-r01',
    changedPaths: Object.freeze([
      'project/scripts/governance-coordination.cjs',
      'project/scripts/governance-coordination.test.cjs',
      'project/docs/governance/governance-writer-coordination-contract.md',
    ]),
  }),
  workflowPr: Object.freeze({
    mode: 'GITHUB_PLATFORM_GH02_WORKFLOW_HARDENING_R01',
    pullRequestNumber: 1622,
    originalBaseSha: '1b682a9a0474d9c94b6a98fc8251ca92fea48766',
    canonicalMergeSha: 'ea84c9f5b71716588ac06933ee30b3b72dc52395',
    expectedTargetBlobSha: '5644cf69ce5d43a5a63fd1d796cf4cdfc8dccf00',
    headRef: 'codex/github-platform-gh02-workflow-hardening-r01',
    targetPath: '.github/workflows/ci.yml',
    changedPaths: Object.freeze([
      Object.freeze({ status: 'M', path: '.github/workflows/ci.yml' }),
    ]),
  }),
});
const GITHUB_PLATFORM_GH02_BINDING_PATHS = new Set(
  GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01.bindingPr.changedPaths,
);
const RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 = Object.freeze({
  taskId: 'GOV-COORD-RCV-COL-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
  contractPath:
    'project/docs/governance/governance-writer-coordination-contract.md',
  bindingPr: Object.freeze({
    mode: 'RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
    baseSha: '7ba8d8e69fcd236bb1ca902eabc9cff0837fea04',
    headRef: 'codex/gov-coord-rcv-col-bootstrap-control-plane-binding-r01',
    changedPaths: Object.freeze([
      Object.freeze({ status: 'M', path: 'project/scripts/governance-coordination.cjs' }),
      Object.freeze({
        status: 'M',
        path: 'project/scripts/governance-coordination.test.cjs',
      }),
      Object.freeze({
        status: 'M',
        path: 'project/docs/governance/governance-writer-coordination-contract.md',
      }),
    ]),
  }),
  targetPr: Object.freeze({
    taskId: 'RCV-COL-FULL-REMEDIATION-BOOTSTRAP-R01',
    mode: 'RCV_COL_FULL_REMEDIATION_BOOTSTRAP_R01',
    pullRequestNumber: 1721,
    originalBaseSha: '1018c6b521e9159b3b5e9e1b82ed307fec6ff79f',
    headRef: 'codex/rcv-col-full-remediation-bootstrap-r01',
    changedPaths: Object.freeze([
      Object.freeze({
        status: 'M',
        path: 'project/docs/governance/decision-log.md',
      }),
      Object.freeze({
        status: 'A',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01.md',
      }),
    ]),
    semanticAuthority: Object.freeze({
      kind: 'SEMANTIC_AUTHORITY',
      path: 'project/docs/governance/decision-log.md',
      recordId: 'RCV-COL-FULL-REMEDIATION-RATIFICATION-R01',
    }),
    executionGrant: Object.freeze({
      kind: 'EXECUTION_GRANT',
      path:
        'project/docs/governance/coordination-execution-grants/RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01.md',
      recordId: 'RCV-COL-FULL-REMEDIATION-EXECUTION-GRANT-R01',
    }),
  }),
});
const RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-HCR-08-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode: 'RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: '7854504b25ef1c988606b1885d1562ef44ce54aa',
      headRef:
        'codex/rcv-claim-form-hcr-08-authority-bootstrap-control-plane-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-HCR-08-AUTHORITY-BOOTSTRAP-R01',
      mode: 'RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_R01',
      pullRequestNumber: 1728,
      originalBaseSha: '14d0f2931ac464321278e05f81ffc5053a8a7719',
      headRef: 'codex/rcv-claim-form-hcr-08-authority-bootstrap-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01.md',
        recordId: 'RCV-CLAIM-FORM-HCR-08-FINAL-CLOSURE-AUDIT-R01-GRANT',
      }),
    }),
  });
const RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-P02-S08-D02-PB01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode: 'RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: '1801748aab2f2197ffc5882b46d182613b1e92b1',
      headRef:
        'codex/rcv-claim-form-pb01-authority-bootstrap-control-plane-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-AUTHORITY-BOOTSTRAP-R01',
      mode: 'RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_R01',
      pullRequestNumber: 1797,
      originalBaseSha: 'a62e078a33803774ef5595343092ab2ad36d48a9',
      headRef:
        'codex/rcv-claim-form-p02-s08-d02-pb01-authority-bootstrap-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01-GRANT',
      }),
    }),
  });
const RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-D02-KC01-AWS-KMS-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode:
        'RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: 'a23e074589236bd451e797fd0f6a2b7e24c66fb9',
      headRef:
        'codex/rcv-claim-form-d02-kc01-aws-kms-authority-bootstrap-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-D02-KC01-AWS-KMS-AUTHORITY-BOOTSTRAP-R01',
      mode: 'RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_R01',
      pullRequestNumber: 1859,
      originalBaseSha: '74d1950deb632380a7ca6574a009e85c206c7f14',
      headRef:
        'codex/rcv-claim-form-d02-kc01-aws-kms-authority-bootstrap-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01-GRANT',
      }),
    }),
  });
const RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-D02-TR01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode:
        'RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: '75790c059acb69a558ba2f835179dcedbbef2a45',
      headRef:
        'codex/rcv-claim-form-d02-tr01-authority-bootstrap-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-D02-TR01-AUTHORITY-BOOTSTRAP-R01',
      mode: 'RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_R01',
      pullRequestNumber: 1903,
      originalBaseSha: 'd284befcc37dc3ba499440b71dfb506589916503',
      headRef:
        'codex/rcv-claim-form-d02-tr01-authority-bootstrap-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-TR01-CLOSURE-R01-GRANT',
      }),
    }),
  });
const RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode:
        'RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: 'ebb82762a6ecf24c214b6b6a5d2fede8caa4c206',
      headRef:
        'codex/rcv-claim-form-kc01-tr01-ownership-authority-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId:
        'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-AUTHORITY-BOOTSTRAP-R01',
      mode:
        'RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_R01',
      pullRequestNumber: 1914,
      originalBaseSha: 'abd06a6b221faba42671104df0302114d4ec9ba5',
      headRef:
        'codex/rcv-claim-form-kc01-tr01-ownership-authority-bootstrap-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT',
      }),
    }),
  });
const RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode:
        'RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01',
      baseSha: '68badf34cdf63dbfe3f860efb97f61fbe05a6f71',
      headRef:
        'codex/rcv-claim-form-kc01-tr01-ownership-control-plane-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId:
        'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01',
      mode:
        'RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_R01',
      pullRequestNumber: 1925,
      originalBaseSha: '11f0657af70d4b292ebd609f45398574cd99ec8f',
      headRef:
        'codex/rcv-claim-form-kc01-tr01-ownership-reconciliation-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/GOVERNANCE-INDEX.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/canonicalization-register.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/product-backlog.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-TR01-OWNERSHIP-RECONCILIATION-R01-GRANT',
      }),
      implementation: Object.freeze({
        kc01SquashSha: '74d1950deb632380a7ca6574a009e85c206c7f14',
        tr01SquashSha: '3472052b2efb08d5e3fbcda7ce0654b012225689',
        sequenceAuthoritySha: '76fb4c3440586453f2380a866aeda58322c778bf',
        nextTaskId:
          'RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01',
      }),
    }),
  });
const GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01 =
  Object.freeze({
    protocolModeId:
      'GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01',
    programId: 'GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01',
    targetTaskId: 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01',
    workspaceModule: 'SHARED_CONTROL_PLANE',
    ownerName: 'Av. Ulaş Hüseyin Telli',
    ownerRole: 'Repository Owner / Semantic Authority',
    issuedAt: '2026-07-29',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      taskId:
        'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-BOOTSTRAP-CONTROL-PLANE-BINDING-R01',
      mode:
        'GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01',
      baseSha: '35e215cde413dd3de42093f967c01b4929f37fed',
      headRef:
        'codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId:
        'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-AUTHORITY-MATERIALIZATION-R01',
      mode:
        'GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_AUTHORITY_MATERIALIZATION_R01',
      headRef:
        'codex/governance-closeout-live-ledger-gap-r01-authority-bootstrap',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/decision-log.md',
        }),
        Object.freeze({
          status: 'A',
          path:
            'project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-SA01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md',
        recordId: 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01',
      }),
    }),
  });
const GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01 =
  Object.freeze({
    taskId:
      'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-VALIDATOR-BASE-BINDING-RECONCILIATION-R01',
    mode:
      'GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_BASE_BINDING_RECONCILIATION_R01',
    baseSha: '989dac5b18ee895a1e621586c84adb3cabeb4c02',
    headRef: 'codex/governance-closeout-stage2-validator-base-binding-r01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    reconciliationPath:
      'project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/stage2-base-reconciliation-authority.json',
    recordType: 'ROOT_BOOTSTRAP_STAGE2_BASE_RECONCILIATION',
    recordId:
      'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-STAGE2-BASE-RECONCILIATION-R01',
    documentRole: 'CANONICAL_TASK_BOUND_RECONCILIATION_AUTHORITY',
    sourceReconciliation: Object.freeze({
      pullRequest: 1915,
      mergeSha: '0f78a5ea49b0c3be91172de4939ae8bd95a25f17',
      path:
        'project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/reconciliation-result.json',
      blobSha: '3dd425493777b47f939a83eb9a8776004aa1b35c',
    }),
    allowedDriftClassifications: Object.freeze([
      'PRESERVED_EXACTLY',
      'PRESERVED_SEMANTICALLY_EQUIVALENT',
      'EXTENDED_BACKWARD_COMPATIBLY',
      'SUPERSEDED_BY_CANONICAL_SUCCESSOR',
    ]),
    changedPaths: Object.freeze([
      Object.freeze({
        status: 'M',
        path: 'project/scripts/governance-coordination.cjs',
      }),
      Object.freeze({
        status: 'M',
        path: 'project/scripts/governance-coordination.test.cjs',
      }),
      Object.freeze({
        status: 'M',
        path: 'project/docs/governance/governance-writer-coordination-contract.md',
      }),
      Object.freeze({
        status: 'A',
        path:
          'project/docs/governance/governance-closeout-live-ledger-gap-r01-stage1-drift-reconciliation/stage2-base-reconciliation-authority.json',
      }),
    ]),
  });
const RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-P02-S08-D02-KC01-FORMAL-CLOSURE-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode:
        'RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01',
      baseSha: '42fb9dcd0d8d33a4992973d091c77e5798d5cab7',
      headRef:
        'codex/rcv-claim-form-d02-kc01-formal-closure-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01-FORMAL-CLOSURE-R01',
      mode: 'RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_R01',
      pullRequestNumber: 1867,
      originalBaseSha: 'a43918b6d58417a951337328d4fc4b0b72675746',
      headRef:
        'codex/rcv-claim-form-d02-kc01-formal-closure-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/GOVERNANCE-INDEX.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/canonicalization-register.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/product-backlog.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-KC01-CLOSURE-R01-GRANT',
      }),
      implementation: Object.freeze({
        pullRequestNumber: 1856,
        squashSha: '74d1950deb632380a7ca6574a009e85c206c7f14',
        provider: 'AWS_KMS',
        publicManifestChecksum:
          '1e80168ebc52e6601f9231834ddde81a339e69a2337a0630bd9daa993f0519ec',
        nextTaskId: 'RCV-CLAIM-FORM-P02-S08-D02-TR01',
      }),
    }),
  });
const RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01 =
  Object.freeze({
    taskId:
      'RCV-CLAIM-FORM-P02-S08-D02-PB01-FORMAL-CLOSURE-CONTROL-PLANE-BINDING-R01',
    contractPath:
      'project/docs/governance/governance-writer-coordination-contract.md',
    bindingPr: Object.freeze({
      mode: 'RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01',
      baseSha: '0335c4cff8879a3246bddd33ad439c7567be7bf9',
      headRef:
        'codex/rcv-claim-form-pb01-formal-closure-control-plane-binding-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.cjs',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/scripts/governance-coordination.test.cjs',
        }),
        Object.freeze({
          status: 'M',
          path:
            'project/docs/governance/governance-writer-coordination-contract.md',
        }),
      ]),
    }),
    targetPr: Object.freeze({
      taskId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-FORMAL-CLOSURE-R01',
      mode: 'RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_R01',
      pullRequestNumber: 1807,
      originalBaseSha: '11010e1d771929eec13e76d080c4243fc31db6c2',
      headRef:
        'codex/rcv-claim-form-p02-s08-d02-pb01-formal-closure-r01',
      changedPaths: Object.freeze([
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/GOVERNANCE-INDEX.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/canonicalization-register.md',
        }),
        Object.freeze({
          status: 'M',
          path: 'project/docs/governance/product-backlog.md',
        }),
      ]),
      semanticAuthority: Object.freeze({
        kind: 'SEMANTIC_AUTHORITY',
        path: 'project/docs/governance/decision-log.md',
        recordId: 'RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01',
      }),
      executionGrant: Object.freeze({
        kind: 'EXECUTION_GRANT',
        path:
          'project/docs/governance/coordination-execution-grants/RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01.md',
        recordId:
          'RCV-CLAIM-FORM-P02-S08-D02-PB01-CLOSURE-R01-GRANT',
      }),
      implementation: Object.freeze({
        pullRequestNumber: 1794,
        squashSha: 'a62e078a33803774ef5595343092ab2ad36d48a9',
        contractId: 'RCV-CLAIM-LEGAL-BASIS-PROJECTION-BINDING@1',
        nextTaskId: 'RCV-CLAIM-FORM-P02-S08-D02-KC01',
      }),
    }),
  });
const RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01 = Object.freeze({
  taskId: 'GOV-COORD-RCV-COL-LARGE-AUTHORITY-READ-REPAIR-R01',
  mode: 'GOV_COORD_RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01',
  baseSha: 'd4ffd3ef277554d3c45e6471bf96f14af4b3fcd1',
  headRef: 'codex/gov-coord-rcv-col-large-authority-read-repair-r01',
  contractPath:
    'project/docs/governance/governance-writer-coordination-contract.md',
  changedPaths: Object.freeze([
    Object.freeze({ status: 'M', path: 'project/scripts/governance-coordination.cjs' }),
    Object.freeze({
      status: 'M',
      path: 'project/scripts/governance-coordination.test.cjs',
    }),
    Object.freeze({
      status: 'M',
      path: 'project/docs/governance/governance-writer-coordination-contract.md',
    }),
  ]),
});
const OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01 = Object.freeze({
  taskId: 'OWNER-WIP-MULTI-SOURCE-DISPOSITION-AND-PATH-OWNERSHIP-R01',
  mode: 'OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01',
  baseSha: '36208cdbab07a712a79756151b065270b88c64ae',
  headRef: 'codex/owner-wip-path-ownership-r01',
  contractPath:
    'project/docs/governance/governance-writer-coordination-contract.md',
  changedPaths: Object.freeze([
    Object.freeze({ status: 'M', path: 'project/scripts/governance-coordination.cjs' }),
    Object.freeze({
      status: 'M',
      path: 'project/scripts/governance-coordination.test.cjs',
    }),
    Object.freeze({
      status: 'M',
      path: 'project/docs/governance/governance-writer-coordination-contract.md',
    }),
    Object.freeze({
      status: 'M',
      path:
        'project/docs/governance/governance-writer-coordination-protected-paths.json',
    }),
    Object.freeze({
      status: 'M',
      path:
        'project/docs/governance/governance-writer-coordination-cutover-record.md',
    }),
  ]),
});
const GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02 = Object.freeze({
  taskId: 'GITHUB-PLATFORM-BASELINE-GH02-CONTROL-PLANE-RECOVERY-R02',
  mode: 'GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02',
  baseSha: '627c76e4549196153da0cf2401ed706047ca38c9',
  headRef: 'codex/github-platform-gh02-control-plane-recovery-r02',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
  ]),
});
const GITHUB_PLATFORM_GH02_RECOVERY_PATHS = new Set(
  GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.changedPaths,
);
const GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01 = Object.freeze({
  taskId: 'GITHUB-PLATFORM-BASELINE-GH03-CONTROL-PLANE-BINDING-R01',
  mode: 'GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01',
  baseSha: '8a917fb3d3136ac48faf405f021d13ca54c6c254',
  headRef: 'codex/gh03-control-plane-binding-r01',
  targetPath: '.github/workflows/ci.yml',
  // Content pin is a BLOB sha, never a commit sha. Blobs are content-addressed:
  // they survive squash-merge and branch deletion. GH-02 pinned a branch commit
  // that was later deleted and main stayed RED across five PRs.
  expectedTargetBlobSha: '2d75a88c5ef9bc466c609029985ffa700982cbe1',
  changedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const GITHUB_PLATFORM_GH03_BINDING_PATHS = new Set(
  GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.changedPaths,
);
const GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01 = Object.freeze({
  taskId: 'GITHUB-PLATFORM-BASELINE-GH05-GH06-CI-CUTOVER-R01',
  mode: 'GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01',
  baseSha: '06be6be78f3530a940194d79b1fbf57015653655',
  headRef: 'codex/gh05-gh06-ci-cutover-r01',
  targetPath: '.github/workflows/ci.yml',
  // Content pin is a BLOB sha, never a commit sha (see the GH-03 record).
  expectedTargetBlobSha: '53d5afd7d9317f96416bbe455d44b97d115d951c',
  changedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    'project/apps/api/scripts/ci-8-jest-invocation-budget-gate.sh',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const GITHUB_PLATFORM_GH05_GH06_CUTOVER_PATHS = new Set(
  GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.changedPaths,
);
const GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01 = Object.freeze({
  taskId: 'GITHUB-PLATFORM-BASELINE-GH08-GATE-JEST-SEPARATION-R01',
  mode: 'GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01',
  baseSha: '562c34d1abc955d3d70fb0b6f7e6e8851c62d0bb',
  headRef: 'codex/gh08-gate-jest-separation-r01',
  targetPath: '.github/workflows/ci.yml',
  // Content pin is a BLOB sha, never a commit sha (see the GH-03 record).
  expectedTargetBlobSha: 'b4543870e99d732a1b13c27cd657a189bc0f91b0',
  changedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    'project/apps/api/ci-manifests/pure/platform-scripts-shared.txt',
    'project/apps/api/ci-manifests/pure/uyap-icrabot-tebligat.txt',
    'project/apps/api/scripts/ci-8-jest-invocation-budget-gate.sh',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const GITHUB_PLATFORM_GH08_SEPARATION_PATHS = new Set(
  GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.changedPaths,
);
const REGISTER_REPO_PATH =
  'project/docs/governance/governance-writer-coordination-register.md';
const REQUEST_ONLY_BRANCH_PATTERN =
  /^codex\/gov-coord-(?:[a-z0-9]+-)*request-only(?:-[a-z0-9]+)*$/;
const EXECUTION_BRANCH_PATTERN =
  /^codex\/gov-exec\/(GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*)$/;
const RESULT_ONLY_BRANCH_PATTERN =
  /^codex\/gov-result\/(GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*)$/;

class CoordinationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'CoordinationError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new CoordinationError(code, message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    reject('SCHEMA_INVALID', `${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    const unknown = actual.filter((key) => !expected.includes(key));
    const missing = expected.filter((key) => !actual.includes(key));
    reject(
      'UNKNOWN_OR_MISSING_FIELD',
      `${label} unknown=[${unknown.join(',')}] missing=[${missing.join(',')}]`,
    );
  }
}

function assertNonEmptyString(value, label, template = false) {
  if (typeof value !== 'string' || value.length === 0) {
    reject('SCHEMA_INVALID', `${label} must be a non-empty string`);
  }
  if (value.includes('\u0000')) {
    reject('SCHEMA_INVALID', `${label} contains NUL`);
  }
  if (!template && value.startsWith('TEMPLATE_')) {
    reject('TEMPLATE_VALUE_FORBIDDEN', `${label} contains an unresolved template value`);
  }
}

function assertAuthorityRecordId(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!AUTHORITY_RECORD_ID_PATTERN.test(value)) {
    reject(
      'AUTHORITY_RECORD_ID_INVALID',
      `${label} must contain only uppercase ASCII letters, digits, and hyphens`,
    );
  }
}

function assertSha(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!/^[0-9a-f]{40}$/.test(value)) {
    reject('SHA_INVALID', `${label} must be a lowercase 40-character Git SHA`);
  }
}

function assertSha256(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value === 'TEMPLATE_COMPUTE_BEFORE_SUBMISSION') return;
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!/^[0-9a-f]{64}$/.test(value)) {
    reject('DIGEST_INVALID', `${label} must be a lowercase SHA-256 digest`);
  }
}

function assertTimestamp(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    reject('TIMESTAMP_INVALID', `${label} must be UTC RFC3339 at second precision`);
  }
}

function normalizeRepoPath(value, label = 'path') {
  assertNonEmptyString(value, label);
  if (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('\\\\')
  ) {
    reject('ABSOLUTE_PATH_FORBIDDEN', `${label} must be repository-relative`);
  }
  if (value.includes('\\')) {
    reject('BACKSLASH_PATH_FORBIDDEN', `${label} must use POSIX separators`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    reject('PATH_TRAVERSAL_FORBIDDEN', `${label} contains an unsafe segment`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../')) {
    reject('PATH_TRAVERSAL_FORBIDDEN', `${label} is not canonical`);
  }
  return normalized;
}

function matchesPattern(repoPath, pattern) {
  if (pattern.includes('<requestId>')) {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('<requestId>', '[A-Za-z0-9._-]+');
    return new RegExp(`^${escaped}$`).test(repoPath);
  }
  if (pattern.endsWith('/**')) {
    return repoPath.startsWith(pattern.slice(0, -2));
  }
  if (pattern.endsWith('*')) {
    return repoPath.startsWith(pattern.slice(0, -1));
  }
  return repoPath === pattern;
}

function matchesAny(repoPath, patterns) {
  return patterns.some((pattern) => matchesPattern(repoPath, pattern));
}

function loadPolicy(policyPath = POLICY_PATH) {
  const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    reject('POLICY_SCHEMA_INVALID', 'protected-path policy schemaVersion must be 1');
  }
  if (parsed.effectiveFromMainSha !== EFFECTIVE_FROM_MAIN_SHA) {
    reject('POLICY_BASELINE_INVALID', 'protected-path policy effectiveFromMainSha mismatch');
  }
  deriveActiveOwnerWipExactPaths(parsed);
  return parsed;
}

function deriveActiveOwnerWipExactPaths(policy) {
  const flatPaths = policy.grandfatheredOwnerWipExactPaths;
  if (!Array.isArray(flatPaths)) {
    reject(
      'OWNER_WIP_SOURCE_REGISTRY_INVALID',
      'grandfatheredOwnerWipExactPaths must be an array',
    );
  }

  const normalizedFlatPaths = flatPaths.map((repoPath) =>
    normalizeRepoPath(repoPath, 'grandfatheredOwnerWipExactPaths'),
  );
  const sortedFlatPaths = [...new Set(normalizedFlatPaths)].sort();
  if (
    sortedFlatPaths.length !== normalizedFlatPaths.length ||
    sortedFlatPaths.some((repoPath, index) => repoPath !== normalizedFlatPaths[index])
  ) {
    reject(
      'OWNER_WIP_SOURCE_REGISTRY_INVALID',
      'grandfatheredOwnerWipExactPaths must be unique and sorted',
    );
  }

  if (policy.grandfatheredOwnerWipSources === undefined) {
    return sortedFlatPaths;
  }
  if (!Array.isArray(policy.grandfatheredOwnerWipSources)) {
    reject(
      'OWNER_WIP_SOURCE_REGISTRY_INVALID',
      'grandfatheredOwnerWipSources must be an array',
    );
  }

  const sourceIds = new Set();
  const activePaths = new Set();
  for (const source of policy.grandfatheredOwnerWipSources) {
    for (const key of [
      'sourceId',
      'sourceType',
      'sourceLocation',
      'baseSha',
      'owner',
      'semanticPurpose',
      'disposition',
      'archiveReference',
    ]) {
      if (typeof source[key] !== 'string' || source[key].trim() === '') {
        reject('OWNER_WIP_SOURCE_REGISTRY_INVALID', `${key} must be nonblank`);
      }
    }
    if (sourceIds.has(source.sourceId)) {
      reject(
        'OWNER_WIP_SOURCE_REGISTRY_INVALID',
        `duplicate sourceId ${source.sourceId}`,
      );
    }
    sourceIds.add(source.sourceId);
    if (typeof source.activeProtection !== 'boolean' || !Array.isArray(source.exactPaths)) {
      reject(
        'OWNER_WIP_SOURCE_REGISTRY_INVALID',
        `${source.sourceId} requires activeProtection and exactPaths`,
      );
    }

    const sourcePaths = new Set();
    let previousPath = '';
    let hasActivePath = false;
    for (const entry of source.exactPaths) {
      for (const key of [
        'exactPath',
        'blobSha256',
        'workingTreeState',
        'ownership',
        'semanticPurpose',
        'disposition',
      ]) {
        if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
          reject(
            'OWNER_WIP_SOURCE_REGISTRY_INVALID',
            `${source.sourceId}.${key} must be nonblank`,
          );
        }
      }
      const exactPath = normalizeRepoPath(
        entry.exactPath,
        `${source.sourceId}.exactPath`,
      );
      if (!/^[0-9a-f]{64}$/.test(entry.blobSha256)) {
        reject(
          'OWNER_WIP_SOURCE_REGISTRY_INVALID',
          `${source.sourceId}.${exactPath} blobSha256 must be lowercase SHA-256`,
        );
      }
      if (typeof entry.activeProtection !== 'boolean') {
        reject(
          'OWNER_WIP_SOURCE_REGISTRY_INVALID',
          `${source.sourceId}.${exactPath} activeProtection must be boolean`,
        );
      }
      if (sourcePaths.has(exactPath) || (previousPath && previousPath > exactPath)) {
        reject(
          'OWNER_WIP_SOURCE_REGISTRY_INVALID',
          `${source.sourceId}.exactPaths must be unique and sorted`,
        );
      }
      sourcePaths.add(exactPath);
      previousPath = exactPath;
      if (entry.activeProtection) {
        hasActivePath = true;
        activePaths.add(exactPath);
      }
    }
    if (source.activeProtection !== hasActivePath) {
      reject(
        'OWNER_WIP_SOURCE_REGISTRY_INVALID',
        `${source.sourceId}.activeProtection must equal any active exact path`,
      );
    }
  }

  const derivedActivePaths = [...activePaths].sort();
  if (
    derivedActivePaths.length !== sortedFlatPaths.length ||
    derivedActivePaths.some((repoPath, index) => repoPath !== sortedFlatPaths[index])
  ) {
    reject(
      'OWNER_WIP_SOURCE_REGISTRY_INVALID',
      'flat exact paths must equal the deterministic union of active source paths',
    );
  }
  return derivedActivePaths;
}

function isRequestInstancePath(repoPath) {
  return /^project\/docs\/governance\/coordination-requests\/[A-Za-z0-9._-]+\/request\.md$/.test(
    repoPath,
  );
}

function isResultInstancePath(repoPath) {
  return /^project\/docs\/governance\/coordination-results\/[A-Za-z0-9._-]+\/result\.md$/.test(
    repoPath,
  );
}

function isCoordinationControlPlane(repoPath, policy) {
  return matchesAny(repoPath, policy.coordinationControlPlane);
}

function validateTargetPolicy(targetFile, operationType, policy = loadPolicy()) {
  const normalized = normalizeRepoPath(targetFile, 'operation.targetFile');
  const activeOwnerWipExactPaths = deriveActiveOwnerWipExactPaths(policy);

  if (policy.deniedTargetPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    reject('PRODUCTION_TARGET_FORBIDDEN', `${normalized} is outside governance scope`);
  }
  if (
    activeOwnerWipExactPaths.includes(normalized) ||
    policy.grandfatheredOwnerWipPrefixes.some((prefix) => normalized.startsWith(prefix))
  ) {
    reject('OWNER_WIP_TARGET_FORBIDDEN', `${normalized} overlaps grandfathered owner WIP`);
  }
  if (isRequestInstancePath(normalized) || isResultInstancePath(normalized)) {
    reject('QUEUE_TARGET_FORBIDDEN', `${normalized} is governed by request/result PR mode`);
  }

  const registerRegeneration =
    operationType === 'DETERMINISTIC_REGISTER_REGENERATION' &&
    normalized === REGISTER_REPO_PATH;
  if (isCoordinationControlPlane(normalized, policy) && !registerRegeneration) {
    reject('CONTROL_PLANE_TARGET_FORBIDDEN', `${normalized} requires owner policy authority`);
  }
  if (!matchesAny(normalized, policy.canonicalSemanticGovernance) && !registerRegeneration) {
    reject('PROTECTED_PATH_ESCAPE', `${normalized} is not a protected governance path`);
  }
  return normalized;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function computeRequestFingerprint(request) {
  const copy = JSON.parse(JSON.stringify(request));
  delete copy.requestFingerprint;
  return sha256(canonicalize(copy));
}

function validateAuthorityRef(ref, expectedKind, label, template) {
  assertExactKeys(ref, AUTHORITY_REF_KEYS, label);
  if (ref.kind !== expectedKind) {
    reject('AUTHORITY_KIND_INVALID', `${label}.kind must be ${expectedKind}`);
  }
  ref.path = normalizeRepoPath(ref.path, `${label}.path`);
  assertAuthorityRecordId(ref.recordId, `${label}.recordId`, template);
  assertSha(ref.evidenceSha, `${label}.evidenceSha`, template);
}

function validateRequestObject(request, options = {}) {
  const { template = false, policy = loadPolicy() } = options;
  assertExactKeys(request, REQUEST_KEYS, 'request');
  if (request.schemaVersion !== SCHEMA_VERSION) {
    reject('SCHEMA_INVALID', 'request.schemaVersion must be 1');
  }
  assertNonEmptyString(request.requestId, 'request.requestId', template);
  if (!template && !/^GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*$/.test(request.requestId)) {
    reject('REQUEST_ID_INVALID', 'requestId must match GOV-REQ-YYYYMMDD-ID');
  }
  assertSha256(request.requestFingerprint, 'request.requestFingerprint', template);
  assertNonEmptyString(request.requestedBy, 'request.requestedBy', template);
  assertTimestamp(request.createdAt, 'request.createdAt', template);
  assertSha(request.baseMainSha, 'request.baseMainSha', template);

  validateAuthorityRef(
    request.semanticAuthorityRef,
    'SEMANTIC_AUTHORITY',
    'semanticAuthorityRef',
    template,
  );
  validateAuthorityRef(
    request.executionGrantRef,
    'EXECUTION_GRANT',
    'executionGrantRef',
    template,
  );
  if (
    request.semanticAuthorityRef.path === request.executionGrantRef.path &&
    request.semanticAuthorityRef.recordId === request.executionGrantRef.recordId
  ) {
    reject(
      'AUTHORITY_REFERENCE_COLLISION',
      'semanticAuthorityRef and executionGrantRef cannot resolve to the same authority record',
    );
  }
  if (
    !matchesAny(
      request.semanticAuthorityRef.path,
      policy.canonicalSemanticGovernance,
    ) ||
    isCoordinationControlPlane(request.semanticAuthorityRef.path, policy) ||
    isRequestInstancePath(request.semanticAuthorityRef.path) ||
    isResultInstancePath(request.semanticAuthorityRef.path)
  ) {
    reject(
      'SEMANTIC_AUTHORITY_PATH_INVALID',
      'semanticAuthorityRef must resolve inside canonical semantic governance',
    );
  }
  if (
    request.executionGrantRef.path !== GRANT_REPO_PATH ||
    request.executionGrantRef.recordId !== 'GOV-COORD-V1-CODEX-LOCAL'
  ) {
    reject('EXECUTION_GRANT_INVALID', 'executionGrantRef must point to the V1 CODEX_LOCAL grant');
  }

  assertExactKeys(request.operation, OPERATION_KEYS, 'operation');
  if (!LEVEL_2_OPERATIONS.has(request.operation.type)) {
    reject('OPERATION_NOT_ALLOWED', `${request.operation.type} is not a Level 2 operation`);
  }
  if (request.operation.changeClass !== 'LEVEL_2_MECHANICAL') {
    reject('FREE_FORM_EDIT_FORBIDDEN', 'operation.changeClass must be LEVEL_2_MECHANICAL');
  }
  request.operation.targetFile = validateTargetPolicy(
    request.operation.targetFile,
    request.operation.type,
    policy,
  );
  assertNonEmptyString(request.operation.recordIdentity, 'operation.recordIdentity', template);
  assertNonEmptyString(request.operation.anchor, 'operation.anchor', template);
  assertNonEmptyString(request.operation.expectedOldValue, 'operation.expectedOldValue', template);
  assertNonEmptyString(request.operation.newValue, 'operation.newValue', template);
  assertSha(request.operation.evidenceSha, 'operation.evidenceSha', template);
  assertSha256(
    request.operation.expectedResultSha256,
    'operation.expectedResultSha256',
    template,
  );

  if (!Array.isArray(request.declaredTargetAllowlist)) {
    reject('SCHEMA_INVALID', 'declaredTargetAllowlist must be an array');
  }
  if (request.declaredTargetAllowlist.length !== 1) {
    reject('TARGET_ALLOWLIST_INVALID', 'V1 request must declare exactly one target');
  }
  request.declaredTargetAllowlist = request.declaredTargetAllowlist.map((target, index) =>
    normalizeRepoPath(target, `declaredTargetAllowlist[${index}]`),
  );
  if (request.declaredTargetAllowlist[0] !== request.operation.targetFile) {
    reject('TARGET_ALLOWLIST_INVALID', 'declared target must equal operation.targetFile');
  }

  if (!template) {
    const expectedFingerprint = computeRequestFingerprint(request);
    if (request.requestFingerprint !== expectedFingerprint) {
      reject('REQUEST_FINGERPRINT_MISMATCH', 'requestFingerprint does not match canonical request');
    }
  }
  return request;
}

function validateResultObject(result, options = {}) {
  const { template = false } = options;
  assertExactKeys(result, RESULT_KEYS, 'result');
  if (result.schemaVersion !== SCHEMA_VERSION) {
    reject('SCHEMA_INVALID', 'result.schemaVersion must be 1');
  }
  assertNonEmptyString(result.resultId, 'result.resultId', template);
  assertNonEmptyString(result.requestId, 'result.requestId', template);
  if (!template && !/^GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*$/.test(result.requestId)) {
    reject('REQUEST_ID_INVALID', 'result.requestId must identify a valid request');
  }
  assertSha256(result.requestFingerprint, 'result.requestFingerprint', template);
  if (!RESULT_STATUSES.has(result.status)) {
    reject('RESULT_STATUS_INVALID', `unknown result status ${result.status}`);
  }
  if (!Number.isInteger(result.executionPrNumber) || result.executionPrNumber < (template ? 0 : 1)) {
    reject('SCHEMA_INVALID', 'executionPrNumber must be a positive integer');
  }
  assertSha(result.executionMergeSha, 'result.executionMergeSha', template);
  assertSha(result.effectiveMainSha, 'result.effectiveMainSha', template);
  assertTimestamp(result.completedAt, 'result.completedAt', template);
  if (!Array.isArray(result.validationEvidence) || result.validationEvidence.length === 0) {
    reject('SCHEMA_INVALID', 'validationEvidence must be a non-empty array');
  }
  for (const [index, evidence] of result.validationEvidence.entries()) {
    assertExactKeys(evidence, EVIDENCE_KEYS, `validationEvidence[${index}]`);
    assertNonEmptyString(evidence.name, `validationEvidence[${index}].name`, template);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(evidence.status)) {
      reject('EVIDENCE_STATUS_INVALID', `invalid evidence status at index ${index}`);
    }
    assertSha(evidence.evidenceSha, `validationEvidence[${index}].evidenceSha`, template);
  }
  if (
    !template &&
    result.status === 'SUCCEEDED' &&
    result.validationEvidence.some((evidence) => evidence.status !== 'PASS')
  ) {
    reject('RESULT_EVIDENCE_CONTRADICTION', 'SUCCEEDED result requires all evidence to PASS');
  }
  return result;
}

function extractStructuredJson(markdown, kind) {
  const upper = kind.toUpperCase();
  const begin = `<!-- GOV_COORD_${upper}_JSON_BEGIN -->`;
  const end = `<!-- GOV_COORD_${upper}_JSON_END -->`;
  if (markdown.split(begin).length !== 2 || markdown.split(end).length !== 2) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} must contain exactly one sentinel pair`);
  }
  const start = markdown.indexOf(begin) + begin.length;
  const finish = markdown.indexOf(end, start);
  if (finish < start) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} sentinel order is invalid`);
  }
  const block = markdown.slice(start, finish).trim();
  const match = /^```json\r?\n([\s\S]*?)\r?\n```$/.exec(block);
  if (!match) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} must contain exactly one fenced JSON object`);
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (!isPlainObject(parsed)) reject('SCHEMA_INVALID', `${kind} JSON must be an object`);
    return parsed;
  } catch (error) {
    if (error instanceof CoordinationError) throw error;
    reject('JSON_INVALID', `${kind} JSON parse failed: ${error.message}`);
  }
}

function parseRequestMarkdown(markdown, options = {}) {
  return validateRequestObject(extractStructuredJson(markdown, 'request'), options);
}

function parseRequestFile(filePath, options = {}) {
  return parseRequestMarkdown(fs.readFileSync(filePath, 'utf8'), options);
}

function parseResultMarkdown(markdown, options = {}) {
  return validateResultObject(extractStructuredJson(markdown, 'result'), options);
}

function parseResultFile(filePath, options = {}) {
  return parseResultMarkdown(fs.readFileSync(filePath, 'utf8'), options);
}

function countOccurrences(content, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = content.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function applyMechanicalOperation(content, operation) {
  const recordMatches = countOccurrences(content, operation.recordIdentity);
  if (recordMatches !== 1) {
    reject('RECORD_IDENTITY_MATCH_INVALID', `recordIdentity matched ${recordMatches} times`);
  }
  const anchorMatches = countOccurrences(content, operation.anchor);
  if (anchorMatches !== 1) {
    reject('ANCHOR_MATCH_INVALID', `anchor matched ${anchorMatches} times`);
  }
  const oldMatches = countOccurrences(content, operation.expectedOldValue);
  if (oldMatches !== 1) {
    reject('EXPECTED_OLD_VALUE_MATCH_INVALID', `expectedOldValue matched ${oldMatches} times`);
  }

  let result;
  switch (operation.type) {
    case 'EXACT_APPEND_AT_DECLARED_ANCHOR':
      if (operation.expectedOldValue !== operation.anchor) {
        reject(
          'APPEND_PRECONDITION_INVALID',
          'append operation expectedOldValue must equal the declared anchor',
        );
      }
      result = content.replace(operation.anchor, `${operation.anchor}${operation.newValue}`);
      break;
    case 'EXACT_LITERAL_REPLACEMENT':
    case 'EXACT_REFERENCE_REWRITE':
      result = content.replace(operation.expectedOldValue, operation.newValue);
      break;
    case 'DETERMINISTIC_REGISTER_REGENERATION':
      result = operation.newValue;
      break;
    default:
      reject('OPERATION_NOT_ALLOWED', operation.type);
  }
  const actualDigest = sha256(result);
  if (actualDigest !== operation.expectedResultSha256) {
    reject(
      'EXPECTED_RESULT_DIGEST_MISMATCH',
      `expected ${operation.expectedResultSha256}, produced ${actualDigest}`,
    );
  }
  return result;
}

function assertNotSymlink(isSymbolicLink, label) {
  if (isSymbolicLink) {
    reject('SYMLINK_TARGET_FORBIDDEN', `${label} resolves through a symlink`);
  }
}

function assertNoSymlinkPath(repoRoot, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  let current = repoRoot;
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      assertNotSymlink(fs.lstatSync(current).isSymbolicLink(), normalized);
    }
  }
}

function boundedGitDiagnostic(
  value,
  maxChars = GIT_DIAGNOSTIC_EXCERPT_MAX_CHARS,
) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  const suffix = '...[diagnostic truncated]';
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function gitOutputMetrics(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    characters: text.length,
  };
}

function sanitizeGitSubcommand(args) {
  return String(args[0] || 'command')
    .replace(/[^A-Za-z0-9-]/g, '?')
    .slice(0, 64);
}

function runGit(args, cwd = REPO_ROOT, options = {}) {
  const maxBufferBytes =
    options.maxBufferBytes ?? GIT_DEFAULT_PROCESS_MAX_BUFFER_BYTES;
  if (
    !Number.isSafeInteger(maxBufferBytes) ||
    maxBufferBytes <= 0 ||
    maxBufferBytes > GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES
  ) {
    reject(
      'GIT_CAPTURE_LIMIT_INVALID',
      `git maxBufferBytes must be a positive safe integer not greater than ${GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES}`,
    );
  }
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    maxBuffer: maxBufferBytes,
    windowsHide: true,
  });

  if (result.error?.code === 'ENOBUFS') {
    const stdout = gitOutputMetrics(result.stdout);
    const stderr = gitOutputMetrics(result.stderr);
    reject(
      'GIT_OUTPUT_LIMIT_EXCEEDED',
      `git ${sanitizeGitSubcommand(args)} output exceeded bounded limit ${maxBufferBytes} bytes (stdoutBytes=${stdout.bytes}, stdoutCharacters=${stdout.characters}, stderrBytes=${stderr.bytes}, stderrCharacters=${stderr.characters})`,
    );
  }
  if (result.error) {
    const errorCode = boundedGitDiagnostic(result.error.code || 'UNKNOWN', 64);
    reject('GIT_VALIDATION_FAILED', `git process failed (${errorCode})`);
  }
  if (result.signal) {
    const signal = boundedGitDiagnostic(result.signal, 64);
    reject(
      'GIT_VALIDATION_FAILED',
      `git ${sanitizeGitSubcommand(args)} terminated by signal ${signal}`,
    );
  }
  if (result.status !== 0 && !options.allowFailure) {
    const diagnostic = boundedGitDiagnostic(result.stderr || result.stdout);
    reject(
      'GIT_VALIDATION_FAILED',
      `git ${args[0] || 'command'} failed${diagnostic ? `: ${diagnostic}` : ''}`,
    );
  }
  return result;
}

function gitIsAncestor(ancestor, descendant, cwd = REPO_ROOT) {
  const result = runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd, {
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  reject('GIT_VALIDATION_FAILED', `cannot determine ancestry ${ancestor} -> ${descendant}`);
}

function parseGitBlobSize(value) {
  const text = String(value || '').trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) {
    reject('GIT_BLOB_SIZE_INVALID', 'git blob size must be a base-10 integer');
  }
  const size = Number(text);
  if (!Number.isSafeInteger(size) || size < 0) {
    reject('GIT_BLOB_SIZE_INVALID', 'git blob size must be a non-negative safe integer');
  }
  return size;
}

function assertCanonicalGitBlobSize(size, blobSpec) {
  if (size > GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES) {
    reject(
      'GIT_BLOB_SIZE_LIMIT_EXCEEDED',
      `${blobSpec} is ${size} bytes; maximum canonical text blob size is ${GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES} bytes`,
    );
  }
}

function gitShow(ref, repoPath, cwd = REPO_ROOT) {
  const blobSpec = `${ref}:${repoPath}`;
  const size = parseGitBlobSize(runGit(['cat-file', '-s', blobSpec], cwd).stdout);
  assertCanonicalGitBlobSize(size, blobSpec);
  const stdout = runGit(['show', blobSpec], cwd, {
    maxBufferBytes: GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES,
  }).stdout;
  const observedBytes = Buffer.byteLength(stdout, 'utf8');
  if (observedBytes !== size) {
    reject(
      'GIT_BLOB_READ_SIZE_MISMATCH',
      `${blobSpec} expected ${size} bytes but read ${observedBytes} bytes`,
    );
  }
  return stdout;
}

function requireGitCommit(ref, code, cwd = REPO_ROOT) {
  const result = runGit(['cat-file', '-e', `${ref}^{commit}`], cwd, {
    allowFailure: true,
  });
  if (result.status !== 0) reject(code, `required canonical commit is unavailable: ${ref}`);
}

function gitBlobSha(ref, repoPath, code, cwd = REPO_ROOT) {
  const result = runGit(['rev-parse', `${ref}:${repoPath}`], cwd, { allowFailure: true });
  if (result.status !== 0) reject(code, `cannot resolve canonical blob ${ref}:${repoPath}`);
  return result.stdout.trim();
}

function gitTreeEntry(ref, repoPath, cwd = REPO_ROOT) {
  return runGit(['ls-tree', ref, '--', repoPath], cwd).stdout.trim();
}

function assertGitFileNotSymlink(ref, repoPath, cwd = REPO_ROOT) {
  const line = gitTreeEntry(ref, repoPath, cwd);
  if (!line) reject('TARGET_NOT_FOUND', `${repoPath} does not exist at ${ref}`);
  const mode = line.split(/\s+/)[0];
  assertNotSymlink(mode === '120000', `${ref}:${repoPath}`);
}

function buildAuthorityMarker(authorityRef) {
  if (!AUTHORITY_KINDS.has(authorityRef.kind)) {
    reject(
      'AUTHORITY_KIND_INVALID',
      `authorityRef.kind must be one of ${[...AUTHORITY_KINDS].join(', ')}`,
    );
  }
  assertAuthorityRecordId(authorityRef.recordId, 'authorityRef.recordId');
  return `<!-- GOV-COORD-AUTHORITY kind=${authorityRef.kind} recordId=${authorityRef.recordId} -->`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function authorityMarkerLocatesSemanticRow(line, marker, recordId) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return false;
  const afterMarker = line.slice(markerIndex + marker.length);
  const headingPattern = new RegExp(
    `^[\\t ]*\\*\\*${escapeRegExp(recordId)}(?=[\\t ]|—|–|:|\\*\\*)`,
  );
  return headingPattern.test(afterMarker);
}

function validateAuthorityRecordAtRef(ref, authorityRef, cwd = REPO_ROOT) {
  const content = gitShow(ref, authorityRef.path, cwd);
  const marker = buildAuthorityMarker(authorityRef);
  const matches = countOccurrences(content, marker);
  if (matches === 0) {
    reject(
      'AUTHORITY_RECORD_MARKER_MISSING',
      `${authorityRef.path}#${authorityRef.recordId} has no exact authority marker at ${ref}`,
    );
  }
  if (matches > 1) {
    reject(
      'AUTHORITY_RECORD_MARKER_DUPLICATE',
      `${authorityRef.path}#${authorityRef.recordId} has ${matches} exact authority markers at ${ref}`,
    );
  }
  if (!gitIsAncestor(authorityRef.evidenceSha, ref, cwd)) {
    reject('AUTHORITY_EVIDENCE_NOT_IN_MAIN', `${authorityRef.evidenceSha} is not ancestor of ${ref}`);
  }
}

function assertRequestBaseAncestor(requestBaseRef, executionBaseRef, cwd = REPO_ROOT) {
  const result = runGit(
    ['merge-base', '--is-ancestor', requestBaseRef, executionBaseRef],
    cwd,
    { allowFailure: true },
  );
  if (result.status !== 0) {
    reject(
      'REQUEST_BASE_NOT_ANCESTOR',
      `${requestBaseRef} is not an ancestor of execution base ${executionBaseRef}`,
    );
  }
  return true;
}

function validateRequestAgainstGit(request, baseRef, headRef = null, cwd = REPO_ROOT) {
  assertRequestBaseAncestor(request.baseMainSha, baseRef, cwd);
  if (!gitIsAncestor(EFFECTIVE_FROM_MAIN_SHA, request.baseMainSha, cwd)) {
    reject(
      'EFFECTIVE_FROM_ANCESTRY_FAILED',
      `${EFFECTIVE_FROM_MAIN_SHA} is not ancestor of request base`,
    );
  }
  if (!gitIsAncestor(EFFECTIVE_FROM_MAIN_SHA, baseRef, cwd)) {
    reject('EFFECTIVE_FROM_ANCESTRY_FAILED', `${EFFECTIVE_FROM_MAIN_SHA} is not ancestor of base`);
  }
  if (!gitIsAncestor(request.operation.evidenceSha, baseRef, cwd)) {
    reject('OPERATION_EVIDENCE_NOT_IN_MAIN', 'operation evidence SHA is not in base main ancestry');
  }
  validateAuthorityRecordAtRef(baseRef, request.semanticAuthorityRef, cwd);
  validateAuthorityRecordAtRef(baseRef, request.executionGrantRef, cwd);
  assertGitFileNotSymlink(baseRef, request.operation.targetFile, cwd);

  const baseContent = gitShow(baseRef, request.operation.targetFile, cwd);
  const expectedContent = applyMechanicalOperation(baseContent, request.operation);
  if (headRef) {
    assertGitFileNotSymlink(headRef, request.operation.targetFile, cwd);
    const headContent = gitShow(headRef, request.operation.targetFile, cwd);
    if (headContent !== expectedContent) {
      reject('EXACT_RESULTING_DIFF_MISMATCH', 'execution head does not equal mechanical result');
    }
  }
  return expectedContent;
}

function validateCanonicalRequestAtExecutionBase(
  requestId,
  baseRef,
  headRef,
  cwd = REPO_ROOT,
) {
  const requestPath =
    `project/docs/governance/coordination-requests/${requestId}/request.md`;
  const baseEntry = gitTreeEntry(baseRef, requestPath, cwd);
  if (!baseEntry) {
    reject(
      'CANONICAL_REQUEST_MISSING_AT_PR_BASE',
      `${requestPath} does not exist at ${baseRef}`,
    );
  }
  const baseMode = baseEntry.split(/\s+/)[0];
  assertNotSymlink(baseMode === '120000', `${baseRef}:${requestPath}`);

  const baseMarkdown = gitShow(baseRef, requestPath, cwd);
  const request = parseRequestMarkdown(baseMarkdown);
  if (request.requestId !== requestId) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestPath} contains requestId ${request.requestId}`,
    );
  }

  const headEntry = gitTreeEntry(headRef, requestPath, cwd);
  if (!headEntry || gitShow(headRef, requestPath, cwd) !== baseMarkdown) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestPath} is not byte-identical between execution base and head`,
    );
  }
  const headMode = headEntry.split(/\s+/)[0];
  assertNotSymlink(headMode === '120000', `${headRef}:${requestPath}`);

  const resultPath =
    `project/docs/governance/coordination-results/${requestId}/result.md`;
  if (gitTreeEntry(baseRef, resultPath, cwd)) {
    reject('RESULT_ALREADY_EXISTS', `${resultPath} exists at ${baseRef}`);
  }

  const instances = loadRepositoryInstancesAtGitRef(baseRef, cwd);
  const canonicalRequest = instances.requests.find(
    ({ value }) => value.requestId === requestId,
  );
  if (
    !canonicalRequest ||
    canonicalize(canonicalRequest.value) !== canonicalize(request)
  ) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestId} does not resolve uniquely from execution base`,
    );
  }
  const expectedRegister = generateRegisterContent(instances);
  const actualRegister = gitShow(baseRef, REGISTER_REPO_PATH, cwd).replace(
    /\r\n/g,
    '\n',
  );
  if (actualRegister !== expectedRegister) {
    reject(
      'REQUEST_NOT_PENDING',
      `${requestId} is not represented by the current PENDING register at ${baseRef}`,
    );
  }
  return request;
}

function walkInstanceFiles(root, filename) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_template') continue;
    const candidate = path.join(root, entry.name, filename);
    if (fs.existsSync(candidate)) results.push(candidate);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function validateLoadedInstances(requests, results) {
  const requestIds = new Set();
  const fingerprints = new Set();
  for (const { value } of requests) {
    if (fingerprints.has(value.requestFingerprint)) {
      reject('DUPLICATE_REQUEST_FINGERPRINT', value.requestFingerprint);
    }
    if (requestIds.has(value.requestId)) {
      reject('DUPLICATE_REQUEST_ID', value.requestId);
    }
    requestIds.add(value.requestId);
    fingerprints.add(value.requestFingerprint);
  }

  const requestById = new Map(requests.map(({ value }) => [value.requestId, value]));
  const resultIds = new Set();
  for (const { value } of results) {
    if (resultIds.has(value.requestId)) {
      reject('DUPLICATE_RESULT', value.requestId);
    }
    const request = requestById.get(value.requestId);
    if (!request) reject('RESULT_WITHOUT_REQUEST', value.requestId);
    if (request.requestFingerprint !== value.requestFingerprint) {
      reject('RESULT_REQUEST_FINGERPRINT_MISMATCH', value.requestId);
    }
    resultIds.add(value.requestId);
  }
  return { requests, results };
}

function loadRepositoryInstances(options = {}) {
  const requestsRoot = options.requestsRoot || REQUESTS_ROOT;
  const resultsRoot = options.resultsRoot || RESULTS_ROOT;
  const policy = options.policy || loadPolicy();
  const requests = walkInstanceFiles(requestsRoot, 'request.md').map((file) => ({
    file,
    value: parseRequestFile(file, { policy }),
  }));
  const results = walkInstanceFiles(resultsRoot, 'result.md').map((file) => ({
    file,
    value: parseResultFile(file),
  }));
  return validateLoadedInstances(requests, results);
}

function gitListFiles(ref, repoPath, cwd = REPO_ROOT) {
  const output = runGit(
    ['ls-tree', '-r', '--name-only', ref, '--', repoPath],
    cwd,
  ).stdout.trim();
  if (!output) return [];
  return output.split(/\r?\n/).map((candidate) => normalizeRepoPath(candidate));
}

function loadRepositoryInstancesAtGitRef(ref, cwd = REPO_ROOT) {
  const requestFiles = gitListFiles(
    ref,
    'project/docs/governance/coordination-requests',
    cwd,
  ).filter(
    (file) =>
      isRequestInstancePath(file) &&
      !file.includes('/coordination-requests/_template/'),
  );
  const resultFiles = gitListFiles(
    ref,
    'project/docs/governance/coordination-results',
    cwd,
  ).filter(
    (file) =>
      isResultInstancePath(file) &&
      !file.includes('/coordination-results/_template/'),
  );
  const requests = requestFiles.map((file) => ({
    file,
    value: parseRequestMarkdown(gitShow(ref, file, cwd)),
  }));
  const results = resultFiles.map((file) => ({
    file,
    value: parseResultMarkdown(gitShow(ref, file, cwd)),
  }));
  return validateLoadedInstances(requests, results);
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function generateRegisterContent(instances = loadRepositoryInstances()) {
  const resultByRequest = new Map(
    instances.results.map(({ value }) => [value.requestId, value]),
  );
  const rows = instances.requests
    .map(({ value: request }) => {
      const result = resultByRequest.get(request.requestId);
      return [
        request.requestId,
        request.requestFingerprint,
        request.baseMainSha,
        request.operation.type,
        request.operation.targetFile,
        result ? result.status : 'PENDING',
        result ? result.executionMergeSha : '_none_',
      ];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  const lines = [
    '# Governance Writer Coordination Register',
    '',
    '<!-- GENERATED FILE: DO NOT EDIT MANUALLY -->',
    '',
    '```text',
    `Schema version         : ${SCHEMA_VERSION}`,
    `Effective-from main    : ${EFFECTIVE_FROM_MAIN_SHA}`,
    'Authority              : DERIVED / NON-AUTHORITATIVE',
    '```',
    '',
    '| Request ID | Request Fingerprint | Request Base | Operation | Target | Result | Execution Merge |',
    '|---|---|---|---|---|---|---|',
  ];
  if (rows.length === 0) {
    lines.push('| _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ |');
  } else {
    for (const row of rows) {
      lines.push(`| ${row.map(escapeTable).join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function verifyRegister(registerPath = REGISTER_PATH, instances) {
  const expected = generateRegisterContent(instances);
  const actual = fs.readFileSync(registerPath, 'utf8').replace(/\r\n/g, '\n');
  if (actual !== expected) {
    reject('GENERATED_REGISTER_STALE', `${registerPath} is not byte-stable/current`);
  }
  return true;
}

function writeRegister(registerPath = REGISTER_PATH, instances) {
  const content = generateRegisterContent(instances);
  fs.writeFileSync(registerPath, content, 'utf8');
  return content;
}

function parseGitChanges(baseRef, headRef, cwd = REPO_ROOT) {
  const output = runGit(
    ['diff', '--name-status', '--find-renames', `${baseRef}...${headRef}`],
    cwd,
  ).stdout;
  if (!output.trim()) return [];
  return output
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0];
      if (status.startsWith('R') || status.startsWith('C')) {
        return {
          status,
          oldPath: normalizeRepoPath(parts[1]),
          path: normalizeRepoPath(parts[2]),
        };
      }
      return { status, path: normalizeRepoPath(parts[1]) };
    });
}

function parseWorktreeChanges(cwd = REPO_ROOT) {
  const output = runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    cwd,
  ).stdout;
  if (!output.trim()) return [];
  return output
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const porcelainStatus = line.slice(0, 2);
      const rawPath = line.slice(3);
      if (rawPath.includes(' -> ')) {
        const [oldPath, newPath] = rawPath.split(' -> ');
        return {
          status: 'R',
          oldPath: normalizeRepoPath(oldPath.replace(/^"|"$/g, '')),
          path: normalizeRepoPath(newPath.replace(/^"|"$/g, '')),
        };
      }
      const status =
        porcelainStatus === '??'
          ? 'A'
          : porcelainStatus.includes('D')
            ? 'D'
            : porcelainStatus.includes('M')
              ? 'M'
              : porcelainStatus.includes('A')
                ? 'A'
                : porcelainStatus.trim();
      return {
        status,
        path: normalizeRepoPath(rawPath.replace(/^"|"$/g, '')),
      };
    });
}

function hasExactModifiedPathSet(changes, expectedPaths) {
  const paths = new Set(changes.map((change) => change.path));
  return (
    changes.length === expectedPaths.size &&
    paths.size === expectedPaths.size &&
    [...paths].every((candidate) => expectedPaths.has(candidate)) &&
    changes.every((change) => change.status === 'M' && !change.oldPath)
  );
}

function hasExactChangeSet(changes, expectedChanges) {
  const expectedByPath = new Map(
    expectedChanges.map((change) => [change.path, change.status]),
  );
  const actualPaths = new Set(changes.map((change) => change.path));
  return (
    changes.length === expectedByPath.size &&
    actualPaths.size === expectedByPath.size &&
    changes.every(
      (change) =>
        !change.oldPath && expectedByPath.get(change.path) === change.status,
    )
  );
}

function classifyPrChangeSet(changes, context = {}) {
  if (changes.length === 0) reject('EMPTY_PR_SCOPE', 'PR has no changes');

  for (const change of changes) {
    const paths = [change.path, change.oldPath].filter(Boolean);
    if (
      paths.some((candidate) => isRequestInstancePath(candidate)) &&
      change.status !== 'A'
    ) {
      reject('IMMUTABLE_REQUEST_MODIFIED', `${change.status} ${paths.join(' -> ')}`);
    }
    if (
      paths.some((candidate) => isResultInstancePath(candidate)) &&
      change.status !== 'A'
    ) {
      reject('IMMUTABLE_RESULT_MODIFIED', `${change.status} ${paths.join(' -> ')}`);
    }
  }

  const paths = new Set(changes.map((change) => change.path));
  if (
    context.base === REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha &&
    context.headRef === REGISTER_TEST_FIXTURE_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS)
  ) {
    return { mode: REGISTER_TEST_FIXTURE_REPAIR_I01.mode };
  }

  if (
    context.base === AUTHORITY_LOCATOR_REPAIR_I01.baseSha &&
    context.headRef === AUTHORITY_LOCATOR_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, AUTHORITY_LOCATOR_REPAIR_I01_PATHS)
  ) {
    return { mode: AUTHORITY_LOCATOR_REPAIR_I01.mode };
  }

  if (
    context.base === EXECUTION_BASE_ANCESTRY_REPAIR_I01.baseSha &&
    context.headRef === EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS)
  ) {
    return { mode: EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode };
  }

  if (
    context.base === NONCOORD_PR_CLASSIFIER_REPAIR_R01.baseSha &&
    context.headRef === NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef &&
    hasExactModifiedPathSet(changes, NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS)
  ) {
    return { mode: NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode };
  }

  if (
    context.base === ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.baseSha &&
    context.headRef === ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef &&
    hasExactChangeSet(changes, ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.changedPaths)
  ) {
    return { mode: ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.mode };
  }

  if (
    context.base === GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.baseSha &&
    context.headRef === GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.headRef &&
    hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH02_RECOVERY_PATHS)
  ) {
    return {
      mode: GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.mode,
      taskId: GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.taskId,
    };
  }

  if (
    context.base === GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.baseSha &&
    context.headRef === GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.headRef &&
    hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH03_BINDING_PATHS)
  ) {
    return {
      mode: GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.mode,
      taskId: GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.taskId,
    };
  }

  if (
    context.base === GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.baseSha &&
    context.headRef === GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.headRef &&
    hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH05_GH06_CUTOVER_PATHS)
  ) {
    return {
      mode: GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.mode,
      taskId: GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.taskId,
    };
  }

  if (
    context.base === GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.baseSha &&
    context.headRef === GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.headRef &&
    hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH08_SEPARATION_PATHS)
  ) {
    return {
      mode: GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.mode,
      taskId: GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.taskId,
    };
  }

  if (
    context.base === RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.baseSha &&
    context.headRef === RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.headRef &&
    hasExactChangeSet(changes, RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.changedPaths)
  ) {
    return {
      mode: RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.mode,
      taskId: RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.taskId,
    };
  }

  if (
    context.base === OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.baseSha &&
    context.headRef === OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.headRef &&
    hasExactChangeSet(changes, OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.changedPaths)
  ) {
    return {
      mode: OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.mode,
      taskId: OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.taskId,
    };
  }

  const gh02Binding = GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const rcvColBinding =
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const hcr08Binding =
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const pb01Binding =
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const pb01ClosureBinding =
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const kc01AuthorityBinding =
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const tr01AuthorityBinding =
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const kc01Tr01OwnershipAuthorityBinding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const kc01Tr01OwnershipReconciliationBinding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  const kc01ClosureBinding =
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const rootAuthorityBootstrap =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const rootStage2ValidatorReconciliation =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  const rootStage1 = rootAuthorityBootstrap.bindingPr;
  const rootStage2 = rootAuthorityBootstrap.targetPr;

  if (
    context.base === rootStage2ValidatorReconciliation.baseSha &&
    context.headRef === rootStage2ValidatorReconciliation.headRef &&
    hasExactChangeSet(changes, rootStage2ValidatorReconciliation.changedPaths)
  ) {
    return {
      mode: rootStage2ValidatorReconciliation.mode,
      taskId: rootStage2ValidatorReconciliation.taskId,
    };
  }
  if (context.headRef === rootStage2ValidatorReconciliation.headRef) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'Stage 2 validator reconciliation requires its owner-pinned base and exact M/M/M/A scope',
    );
  }

  if (
    context.headRef === rootStage1.headRef ||
    (rootStage1PublicationBaseIsValid(context.base, context.cwd) &&
      hasExactChangeSet(changes, rootStage1.changedPaths))
  ) {
    if (context.headRef !== rootStage1.headRef) {
      reject(
        'ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH',
        'root-authority bootstrap Stage 1 requires its exact branch',
      );
    }
    if (!rootStage1PublicationBaseIsValid(context.base, context.cwd)) {
      reject(
        'ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH',
        'root-authority bootstrap Stage 1 requires its owner-pinned base',
      );
    }
    if (!hasExactChangeSet(changes, rootStage1.changedPaths)) {
      reject(
        'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
        'root-authority bootstrap Stage 1 requires the exact M/M/M scope',
      );
    }
    return { mode: rootStage1.mode, taskId: rootStage1.taskId };
  }

  if (
    context.headRef === rootStage2.headRef ||
    hasExactChangeSet(changes, rootStage2.changedPaths)
  ) {
    if (context.headRef !== rootStage2.headRef) {
      reject(
        'ROOT_BOOTSTRAP_STAGE2_BRANCH_MISMATCH',
        'root-authority bootstrap Stage 2 requires its exact branch',
      );
    }
    if (!hasExactChangeSet(changes, rootStage2.changedPaths)) {
      reject(
        'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
        'root-authority bootstrap Stage 2 requires the exact M/A scope',
      );
    }
    return { mode: rootStage2.mode, taskId: rootStage2.taskId };
  }

  if (
    context.base === rcvColBinding.bindingPr.baseSha &&
    context.headRef === rcvColBinding.bindingPr.headRef &&
    hasExactChangeSet(changes, rcvColBinding.bindingPr.changedPaths)
  ) {
    return {
      mode: rcvColBinding.bindingPr.mode,
      taskId: rcvColBinding.taskId,
    };
  }

  if (
    context.headRef === rcvColBinding.targetPr.headRef &&
    hasExactChangeSet(changes, rcvColBinding.targetPr.changedPaths)
  ) {
    return {
      mode: rcvColBinding.targetPr.mode,
      taskId: rcvColBinding.targetPr.taskId,
    };
  }

  if (
    context.base === hcr08Binding.bindingPr.baseSha &&
    context.headRef === hcr08Binding.bindingPr.headRef &&
    hasExactChangeSet(changes, hcr08Binding.bindingPr.changedPaths)
  ) {
    return {
      mode: hcr08Binding.bindingPr.mode,
      taskId: hcr08Binding.taskId,
    };
  }

  if (
    context.headRef === hcr08Binding.targetPr.headRef &&
    hasExactChangeSet(changes, hcr08Binding.targetPr.changedPaths)
  ) {
    return {
      mode: hcr08Binding.targetPr.mode,
      taskId: hcr08Binding.targetPr.taskId,
    };
  }

  if (
    context.base === pb01Binding.bindingPr.baseSha &&
    context.headRef === pb01Binding.bindingPr.headRef &&
    hasExactChangeSet(changes, pb01Binding.bindingPr.changedPaths)
  ) {
    return {
      mode: pb01Binding.bindingPr.mode,
      taskId: pb01Binding.taskId,
    };
  }

  if (
    context.headRef === pb01Binding.targetPr.headRef &&
    hasExactChangeSet(changes, pb01Binding.targetPr.changedPaths)
  ) {
    return {
      mode: pb01Binding.targetPr.mode,
      taskId: pb01Binding.targetPr.taskId,
    };
  }

  if (
    context.base === kc01AuthorityBinding.bindingPr.baseSha &&
    context.headRef === kc01AuthorityBinding.bindingPr.headRef &&
    hasExactChangeSet(changes, kc01AuthorityBinding.bindingPr.changedPaths)
  ) {
    return {
      mode: kc01AuthorityBinding.bindingPr.mode,
      taskId: kc01AuthorityBinding.taskId,
    };
  }

  if (
    context.headRef === kc01AuthorityBinding.targetPr.headRef &&
    hasExactChangeSet(changes, kc01AuthorityBinding.targetPr.changedPaths)
  ) {
    return {
      mode: kc01AuthorityBinding.targetPr.mode,
      taskId: kc01AuthorityBinding.targetPr.taskId,
    };
  }

  if (
    context.base === tr01AuthorityBinding.bindingPr.baseSha &&
    context.headRef === tr01AuthorityBinding.bindingPr.headRef &&
    hasExactChangeSet(changes, tr01AuthorityBinding.bindingPr.changedPaths)
  ) {
    return {
      mode: tr01AuthorityBinding.bindingPr.mode,
      taskId: tr01AuthorityBinding.taskId,
    };
  }

  if (
    context.headRef === tr01AuthorityBinding.targetPr.headRef &&
    hasExactChangeSet(changes, tr01AuthorityBinding.targetPr.changedPaths)
  ) {
    return {
      mode: tr01AuthorityBinding.targetPr.mode,
      taskId: tr01AuthorityBinding.targetPr.taskId,
    };
  }

  if (
    context.base === kc01Tr01OwnershipAuthorityBinding.bindingPr.baseSha &&
    context.headRef === kc01Tr01OwnershipAuthorityBinding.bindingPr.headRef &&
    hasExactChangeSet(
      changes,
      kc01Tr01OwnershipAuthorityBinding.bindingPr.changedPaths,
    )
  ) {
    return {
      mode: kc01Tr01OwnershipAuthorityBinding.bindingPr.mode,
      taskId: kc01Tr01OwnershipAuthorityBinding.taskId,
    };
  }

  if (
    context.headRef === kc01Tr01OwnershipAuthorityBinding.targetPr.headRef &&
    hasExactChangeSet(
      changes,
      kc01Tr01OwnershipAuthorityBinding.targetPr.changedPaths,
    )
  ) {
    return {
      mode: kc01Tr01OwnershipAuthorityBinding.targetPr.mode,
      taskId: kc01Tr01OwnershipAuthorityBinding.targetPr.taskId,
    };
  }

  if (
    context.base === kc01Tr01OwnershipReconciliationBinding.bindingPr.baseSha &&
    context.headRef === kc01Tr01OwnershipReconciliationBinding.bindingPr.headRef &&
    hasExactChangeSet(
      changes,
      kc01Tr01OwnershipReconciliationBinding.bindingPr.changedPaths,
    )
  ) {
    return {
      mode: kc01Tr01OwnershipReconciliationBinding.bindingPr.mode,
      taskId: kc01Tr01OwnershipReconciliationBinding.taskId,
    };
  }

  if (
    context.headRef === kc01Tr01OwnershipReconciliationBinding.targetPr.headRef &&
    hasExactChangeSet(
      changes,
      kc01Tr01OwnershipReconciliationBinding.targetPr.changedPaths,
    )
  ) {
    return {
      mode: kc01Tr01OwnershipReconciliationBinding.targetPr.mode,
      taskId: kc01Tr01OwnershipReconciliationBinding.targetPr.taskId,
    };
  }

  if (context.headRef === kc01Tr01OwnershipReconciliationBinding.targetPr.headRef) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01/TR01 ownership reconciliation target branch requires the exact four-file scope',
    );
  }

  if (
    context.base === kc01ClosureBinding.bindingPr.baseSha &&
    context.headRef === kc01ClosureBinding.bindingPr.headRef &&
    hasExactChangeSet(changes, kc01ClosureBinding.bindingPr.changedPaths)
  ) {
    return {
      mode: kc01ClosureBinding.bindingPr.mode,
      taskId: kc01ClosureBinding.taskId,
    };
  }

  if (
    context.headRef === kc01ClosureBinding.targetPr.headRef &&
    hasExactChangeSet(changes, kc01ClosureBinding.targetPr.changedPaths)
  ) {
    return {
      mode: kc01ClosureBinding.targetPr.mode,
      taskId: kc01ClosureBinding.targetPr.taskId,
    };
  }

  if (context.headRef === kc01ClosureBinding.targetPr.headRef) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 formal-closure target branch requires the exact four-file scope',
    );
  }

  if (
    hasExactChangeSet(changes, kc01ClosureBinding.targetPr.changedPaths) &&
    context.headRef !== pb01ClosureBinding.targetPr.headRef
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 formal-closure paths require the exact target branch binding',
    );
  }

  if (
    context.base === pb01ClosureBinding.bindingPr.baseSha &&
    context.headRef === pb01ClosureBinding.bindingPr.headRef &&
    hasExactChangeSet(changes, pb01ClosureBinding.bindingPr.changedPaths)
  ) {
    return {
      mode: pb01ClosureBinding.bindingPr.mode,
      taskId: pb01ClosureBinding.taskId,
    };
  }

  if (
    context.headRef === pb01ClosureBinding.targetPr.headRef &&
    hasExactChangeSet(changes, pb01ClosureBinding.targetPr.changedPaths)
  ) {
    return {
      mode: pb01ClosureBinding.targetPr.mode,
      taskId: pb01ClosureBinding.targetPr.taskId,
    };
  }

  if (context.headRef === pb01ClosureBinding.targetPr.headRef) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 formal-closure target branch requires the exact four-file scope',
    );
  }

  if (hasExactChangeSet(changes, pb01ClosureBinding.targetPr.changedPaths)) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 formal-closure paths require the exact target branch binding',
    );
  }

  if (
    context.base === gh02Binding.bindingPr.baseSha &&
    context.headRef === gh02Binding.bindingPr.headRef &&
    hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH02_BINDING_PATHS)
  ) {
    return { mode: gh02Binding.bindingPr.mode, taskId: gh02Binding.taskId };
  }

  if (
    context.headRef === gh02Binding.workflowPr.headRef &&
    hasExactChangeSet(changes, gh02Binding.workflowPr.changedPaths)
  ) {
    return { mode: gh02Binding.workflowPr.mode, taskId: gh02Binding.taskId };
  }

  if (
    paths.size === BOOTSTRAP_ALL.size &&
    [...paths].every((candidate) => BOOTSTRAP_ALL.has(candidate)) &&
    changes.every((change) => {
      if (BOOTSTRAP_MODIFY.has(change.path)) return change.status === 'M';
      return BOOTSTRAP_ADD.has(change.path) && change.status === 'A';
    })
  ) {
    return { mode: 'BOOTSTRAP' };
  }

  if (
    [
      REGISTER_TEST_FIXTURE_REPAIR_I01.headRef,
      AUTHORITY_LOCATOR_REPAIR_I01.headRef,
      EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef,
      NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef,
      ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef,
      gh02Binding.bindingPr.headRef,
      gh02Binding.workflowPr.headRef,
      rcvColBinding.bindingPr.headRef,
      rcvColBinding.targetPr.headRef,
      RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.headRef,
      OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.headRef,
    ].includes(context.headRef) ||
    /^codex\/gov-coord-(?:v1-)?(?:authority-locator|register-test-fixture|execution-base-ancestry|noncoord-classifier)-repair-/.test(
      context.headRef || '',
    ) ||
    /^codex\/dx-006-analyze-first-conditional-execution-/.test(context.headRef || '') ||
    /^codex\/github-platform-gh02-/.test(context.headRef || '') ||
    /^codex\/(?:gov-coord-)?rcv-col-(?:full-remediation-)?bootstrap-/.test(
      context.headRef || '',
    ) ||
    /^codex\/gov-coord-rcv-col-large-authority-read-repair-/.test(
      context.headRef || '',
    ) ||
    /^codex\/owner-wip-path-ownership-/.test(
      context.headRef || '',
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'control-plane repair binding mismatch');
  }

  const newRequests = changes.filter(
    (change) => change.status === 'A' && isRequestInstancePath(change.path),
  );
  const newResults = changes.filter(
    (change) => change.status === 'A' && isResultInstancePath(change.path),
  );
  const requestBranchMatches = REQUEST_ONLY_BRANCH_PATTERN.test(context.headRef || '');
  const executionBranchMatch = EXECUTION_BRANCH_PATTERN.exec(context.headRef || '');
  const resultBranchMatch = RESULT_ONLY_BRANCH_PATTERN.exec(context.headRef || '');
  const executionBranchIntent =
    (context.headRef || '').startsWith('codex/gov-exec/') ||
    /^codex\/gov-coord-(?:[a-z0-9]+-)*execution(?:-[a-z0-9]+)*$/.test(
      context.headRef || '',
    );
  const resultBranchIntent = (context.headRef || '').startsWith('codex/gov-result/');

  if (executionBranchIntent && !executionBranchMatch) {
    reject('EXECUTION_BRANCH_INVALID', 'execution branch must bind an exact requestId');
  }
  if (resultBranchIntent && !resultBranchMatch) {
    reject('RESULT_BRANCH_INVALID', 'result branch must bind an exact requestId');
  }
  if (newRequests.length > 0 && newResults.length > 0) {
    reject(
      'COORDINATION_CLASS_AMBIGUOUS',
      'PR cannot contain both request and result instances',
    );
  }

  const registerRegenerated = changes.some(
    (change) => change.status === 'M' && change.path === REGISTER_REPO_PATH,
  );
  if (newRequests.length > 0 || requestBranchMatches) {
    if (!requestBranchMatches) {
      reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'request path requires a request-only branch');
    }
    if (changes.length !== 2 || newRequests.length !== 1 || !registerRegenerated) {
      reject('REQUEST_SCOPE_INVALID', 'request-only PR requires one new request and register');
    }
    return { mode: 'REQUEST_ONLY', instancePath: newRequests[0].path };
  }

  if (newResults.length > 0 || resultBranchMatch) {
    if (!resultBranchMatch) {
      reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'result path requires an exact result branch');
    }
    if (changes.length !== 2 || newResults.length !== 1 || !registerRegenerated) {
      reject('RESULT_SCOPE_INVALID', 'result-only PR requires one new result and register');
    }
    return {
      mode: 'RESULT_ONLY',
      instancePath: newResults[0].path,
      requestId: resultBranchMatch[1],
    };
  }

  if (
    changes.some(
      (change) =>
        isCoordinationControlPlane(change.path, loadPolicy()) ||
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === REGISTER_REPO_PATH,
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'non-bootstrap control-plane diff');
  }
  if (executionBranchMatch) {
    if (changes.some((change) => change.status !== 'M')) {
      reject('EXECUTION_SCOPE_INVALID', 'execution PR may only modify declared target files');
    }
    return { mode: 'EXECUTION', requestId: executionBranchMatch[1] };
  }
  return { mode: 'NON_COORDINATION_PR' };
}

function validateAuthorityLocatorRepairScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  if (
    base !== AUTHORITY_LOCATOR_REPAIR_I01.baseSha ||
    headRef !== AUTHORITY_LOCATOR_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, AUTHORITY_LOCATOR_REPAIR_I01_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'authority locator repair binding mismatch');
  }

  if (
    changes.some(
      (change) =>
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === 'project/docs/governance/OFFICE-MASTER-SYNTHESIS.md',
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'authority locator repair contains forbidden paths');
  }

  const semanticAuthority = {
    ...AUTHORITY_LOCATOR_REPAIR_I01.semanticAuthority,
    evidenceSha: base,
  };
  const executionGrant = {
    ...AUTHORITY_LOCATOR_REPAIR_I01.executionGrant,
    evidenceSha: base,
  };
  validateAuthorityRecordAtRef(head, semanticAuthority, cwd);
  validateAuthorityRecordAtRef(head, executionGrant, cwd);

  let rawIdFallbackRejected = false;
  try {
    validateAuthorityRecordAtRef(base, semanticAuthority, cwd);
  } catch (error) {
    if (
      error instanceof CoordinationError &&
      error.code === 'AUTHORITY_RECORD_MARKER_MISSING'
    ) {
      rawIdFallbackRejected = true;
    } else {
      throw error;
    }
  }
  if (!rawIdFallbackRejected) {
    reject(
      'AUTHORITY_REPAIR_RAW_ID_FALLBACK_PRESENT',
      'base semantic authority resolved without an exact marker',
    );
  }

  const semanticMarker = buildAuthorityMarker(semanticAuthority);
  const baseDecisionLog = gitShow(base, semanticAuthority.path, cwd);
  const headDecisionLog = gitShow(head, semanticAuthority.path, cwd);
  const markerLine = headDecisionLog
    .split(/\r?\n/)
    .find((line) => line.includes(semanticMarker));
  if (
    !markerLine ||
    !authorityMarkerLocatesSemanticRow(
      markerLine,
      semanticMarker,
      semanticAuthority.recordId,
    )
  ) {
    reject(
      'AUTHORITY_REPAIR_SEMANTIC_MARKER_INVALID',
      'semantic marker must locate the expected decision row',
    );
  }
  const normalizedDecisionLog = headDecisionLog.replace(`${semanticMarker} `, '');
  if (!normalizedDecisionLog.startsWith(baseDecisionLog)) {
    reject(
      'AUTHORITY_REPAIR_DECISION_LOG_NOT_ADDITIVE',
      'existing decision-log content must remain byte-preserved after marker normalization',
    );
  }
  const appendedDecisionLines = normalizedDecisionLog
    .slice(baseDecisionLog.length)
    .split(/\r?\n/)
    .filter(Boolean);
  if (
    appendedDecisionLines.length !== 1 ||
    !appendedDecisionLines[0].startsWith(
      '| 2026-07-25 | **GOV-COORD-V1-AUTHORITY-LOCATOR-REPAIR-I01',
    )
  ) {
    reject(
      'AUTHORITY_REPAIR_DECISION_LOG_NOT_ADDITIVE',
      'decision-log may only append the exact repair record',
    );
  }

  const grantMarker = buildAuthorityMarker(executionGrant);
  const baseGrant = gitShow(base, executionGrant.path, cwd);
  const headGrant = gitShow(head, executionGrant.path, cwd);
  if (headGrant.replace(`${grantMarker}\n\n`, '') !== baseGrant) {
    reject(
      'AUTHORITY_REPAIR_GRANT_CHANGED',
      'execution grant must remain byte-equivalent after marker removal',
    );
  }

  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    AUTHORITY_LOCATOR_REPAIR_I01.mode,
    AUTHORITY_LOCATOR_REPAIR_I01.baseSha,
    AUTHORITY_LOCATOR_REPAIR_I01.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'AUTHORITY_REPAIR_CONTRACT_INVALID',
        `contract is missing exact repair binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: AUTHORITY_LOCATOR_REPAIR_I01.mode };
}

function validateAnalyzeFirstConditionalExecutionR02Scope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  if (
    base !== ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.baseSha ||
    headRef !== ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef ||
    !hasExactChangeSet(changes, ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'analyze-first conditional execution R02 binding mismatch',
    );
  }

  if (
    changes.some(
      (change) =>
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === REGISTER_REPO_PATH,
    )
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'analyze-first conditional execution R02 contains forbidden coordination instances',
    );
  }

  const semanticAuthority = {
    ...ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.semanticAuthority,
    evidenceSha: base,
  };
  const executionGrant = {
    ...ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.executionGrant,
    evidenceSha: base,
  };
  if (semanticAuthority.recordId === executionGrant.recordId) {
    reject(
      'AUTHORITY_IDENTITY_COLLISION',
      'semantic authority and execution grant must use distinct record identities',
    );
  }
  validateAuthorityRecordAtRef(head, semanticAuthority, cwd);
  validateAuthorityRecordAtRef(head, executionGrant, cwd);

  for (const authorityRef of [semanticAuthority, executionGrant]) {
    const marker = buildAuthorityMarker(authorityRef);
    const content = gitShow(head, authorityRef.path, cwd);
    const markerLine = content.split(/\r?\n/).find((line) => line.includes(marker));
    if (
      !markerLine ||
      !authorityMarkerLocatesSemanticRow(
        markerLine,
        marker,
        authorityRef.recordId,
      )
    ) {
      reject(
        'AUTHORITY_RECORD_MARKER_INVALID',
        `${authorityRef.path} marker must locate ${authorityRef.recordId}`,
      );
    }
  }

  let rawIdFallbackRejected = false;
  try {
    validateAuthorityRecordAtRef(base, semanticAuthority, cwd);
  } catch (error) {
    if (
      error instanceof CoordinationError &&
      error.code === 'AUTHORITY_RECORD_MARKER_MISSING'
    ) {
      rawIdFallbackRejected = true;
    } else {
      throw error;
    }
  }
  if (!rawIdFallbackRejected) {
    reject(
      'AUTHORITY_RAW_ID_FALLBACK_PRESENT',
      'base resolved the R02 semantic authority without its exact marker',
    );
  }

  const baseDecisionLog = gitShow(base, semanticAuthority.path, cwd);
  const headDecisionLog = gitShow(head, semanticAuthority.path, cwd);
  if (!headDecisionLog.startsWith(baseDecisionLog)) {
    reject(
      'ANALYZE_FIRST_DECISION_LOG_NOT_APPEND_ONLY',
      'existing decision-log bytes must be preserved',
    );
  }
  const appendedDecisionLines = headDecisionLog
    .slice(baseDecisionLog.length)
    .split(/\r?\n/)
    .filter(Boolean);
  const semanticMarker = buildAuthorityMarker(semanticAuthority);
  if (
    appendedDecisionLines.length !== 1 ||
    !appendedDecisionLines[0].startsWith(
      `| 2026-07-26 | ${semanticMarker} **${semanticAuthority.recordId}`,
    )
  ) {
    reject(
      'ANALYZE_FIRST_DECISION_LOG_SCOPE_INVALID',
      'decision-log may only append the exact R02 semantic record',
    );
  }

  const grant = gitShow(head, executionGrant.path, cwd);
  for (const expectedLiteral of [
    ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.mode,
    ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.baseSha,
    ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.headRef,
    'Standing/unattended GitHub',
  ]) {
    if (!grant.includes(expectedLiteral)) {
      reject(
        'ANALYZE_FIRST_GRANT_INVALID',
        `execution grant is missing exact binding ${expectedLiteral}`,
      );
    }
  }

  const agents = gitShow(head, 'AGENTS.md', cwd);
  const v1Contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  const v2Contract = gitShow(
    head,
    'project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md',
    cwd,
  );
  for (const [label, content, literal] of [
    ['AGENTS.md', agents, 'GO-COMPLETE — ANALYZE-FIRST CONDITIONAL EXECUTION'],
    ['V1 contract', v1Contract, 'Owner-authorized conditional merge ayrımı'],
    ['V2 contract', v2Contract, 'STANDING / UNATTENDED AUTO-MERGE'],
  ]) {
    if (!content.includes(literal)) {
      reject(
        'ANALYZE_FIRST_POLICY_ALIGNMENT_INVALID',
        `${label} is missing ${literal}`,
      );
    }
  }

  return { mode: ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.mode };
}

function validateRegisterTestFixtureRepairScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  if (
    base !== REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha ||
    headRef !== REGISTER_TEST_FIXTURE_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'register test fixture repair binding mismatch',
    );
  }

  if (
    changes.some(
      (change) =>
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === REGISTER_REPO_PATH ||
        change.path === 'project/docs/governance/OFFICE-MASTER-SYNTHESIS.md',
    )
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'register test fixture repair contains forbidden paths',
    );
  }

  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    REGISTER_TEST_FIXTURE_REPAIR_I01.mode,
    REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha,
    REGISTER_TEST_FIXTURE_REPAIR_I01.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'REGISTER_TEST_FIXTURE_REPAIR_CONTRACT_INVALID',
        `contract is missing exact repair binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: REGISTER_TEST_FIXTURE_REPAIR_I01.mode };
}

function validateExecutionBaseAncestryRepairScope(options) {
  const { base, headRef, changes } = options;
  if (
    base !== EXECUTION_BASE_ANCESTRY_REPAIR_I01.baseSha ||
    headRef !== EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'execution base ancestry repair binding mismatch',
    );
  }
  return { mode: EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode };
}

function validateNoncoordPrClassifierRepairScope(options) {
  const { base, headRef, changes } = options;
  if (
    base !== NONCOORD_PR_CLASSIFIER_REPAIR_R01.baseSha ||
    headRef !== NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef ||
    !hasExactModifiedPathSet(changes, NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'non-coordination PR classifier repair binding mismatch',
    );
  }
  return { mode: NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode };
}

function validateGithubPlatformGh02BindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding = GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH02_BINDING_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-02 authority binding mismatch');
  }

  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.workflowPr.mode,
    String(binding.workflowPr.pullRequestNumber),
    binding.workflowPr.canonicalMergeSha,
    binding.workflowPr.expectedTargetBlobSha,
    binding.workflowPr.headRef,
    binding.workflowPr.targetPath,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'GH02_BINDING_CONTRACT_INVALID',
        `contract is missing exact GH-02 binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateGithubPlatformGh02RecoveryScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  const recovery = GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02;
  if (
    base !== recovery.baseSha ||
    headRef !== recovery.headRef ||
    !hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH02_RECOVERY_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-02 recovery binding mismatch');
  }
  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    recovery.taskId,
    recovery.mode,
    recovery.baseSha,
    recovery.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject('GH02_RECOVERY_CONTRACT_INVALID', `contract is missing exact recovery binding ${expectedLiteral}`);
    }
  }
  return { mode: recovery.mode, taskId: recovery.taskId };
}

function validateGithubPlatformGh08SeparationScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  const binding = GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01;
  if (
    base !== binding.baseSha ||
    headRef !== binding.headRef ||
    !hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH08_SEPARATION_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-08 gate/jest separation binding mismatch');
  }
  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    binding.taskId,
    binding.mode,
    binding.baseSha,
    binding.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject('GH08_SEPARATION_CONTRACT_INVALID', `contract is missing exact GH-08 binding ${expectedLiteral}`);
    }
  }
  const headBlob = gitBlobSha(head, binding.targetPath, 'GH08_WORKFLOW_CONTENT_DRIFT', cwd);
  if (headBlob !== binding.expectedTargetBlobSha) {
    reject(
      'GH08_WORKFLOW_CONTENT_DRIFT',
      `${binding.targetPath} differs from bound blob ${binding.expectedTargetBlobSha}`,
    );
  }
  return { mode: binding.mode, taskId: binding.taskId };
}

function validateGithubPlatformGh0506CutoverScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  const binding = GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01;
  if (
    base !== binding.baseSha ||
    headRef !== binding.headRef ||
    !hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH05_GH06_CUTOVER_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-05/GH-06 cutover binding mismatch');
  }
  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    binding.taskId,
    binding.mode,
    binding.baseSha,
    binding.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject('GH0506_CUTOVER_CONTRACT_INVALID', `contract is missing exact GH-05/GH-06 binding ${expectedLiteral}`);
    }
  }
  const headBlob = gitBlobSha(
    head,
    binding.targetPath,
    'GH0506_WORKFLOW_CONTENT_DRIFT',
    cwd,
  );
  if (headBlob !== binding.expectedTargetBlobSha) {
    reject(
      'GH0506_WORKFLOW_CONTENT_DRIFT',
      `${binding.targetPath} differs from bound blob ${binding.expectedTargetBlobSha}`,
    );
  }
  return { mode: binding.mode, taskId: binding.taskId };
}

function validateGithubPlatformGh03BindingScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  const binding = GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01;
  if (
    base !== binding.baseSha ||
    headRef !== binding.headRef ||
    !hasExactModifiedPathSet(changes, GITHUB_PLATFORM_GH03_BINDING_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-03 binding mismatch');
  }
  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    binding.taskId,
    binding.mode,
    binding.baseSha,
    binding.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject('GH03_BINDING_CONTRACT_INVALID', `contract is missing exact GH-03 binding ${expectedLiteral}`);
    }
  }
  const headBlob = gitBlobSha(
    head,
    binding.targetPath,
    'GH03_WORKFLOW_CONTENT_DRIFT',
    cwd,
  );
  if (headBlob !== binding.expectedTargetBlobSha) {
    reject(
      'GH03_WORKFLOW_CONTENT_DRIFT',
      `${binding.targetPath} differs from bound blob ${binding.expectedTargetBlobSha}`,
    );
  }
  return { mode: binding.mode, taskId: binding.taskId };
}

function validateGithubPlatformGh02WorkflowScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding = GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01;
  const workflow = binding.workflowPr;
  if (
    taskId !== binding.taskId ||
    headRef !== workflow.headRef ||
    !hasExactChangeSet(changes, workflow.changedPaths)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'GH-02 workflow binding mismatch');
  }

  requireGitCommit(
    workflow.canonicalMergeSha,
    'CONTROL_PLANE_BINDING_OBJECT_UNAVAILABLE',
    cwd,
  );
  const canonicalBlob = gitBlobSha(
    workflow.canonicalMergeSha,
    workflow.targetPath,
    'CANONICAL_BINDING_INTEGRITY_FAILED',
    cwd,
  );
  if (canonicalBlob !== workflow.expectedTargetBlobSha) {
    reject(
      'CANONICAL_BINDING_INTEGRITY_FAILED',
      `canonical ${workflow.targetPath} blob differs from ${workflow.expectedTargetBlobSha}`,
    );
  }

  if (base !== workflow.originalBaseSha) {
    const baseContract = gitShow(
      base,
      'project/docs/governance/governance-writer-coordination-contract.md',
      cwd,
    );
    for (const expectedLiteral of [binding.taskId, workflow.mode]) {
      if (!baseContract.includes(expectedLiteral)) {
        reject(
          'GH02_CANONICAL_BINDING_MISSING',
          `current PR base is missing canonical GH-02 binding ${expectedLiteral}`,
        );
      }
    }
  }

  const headBlob = gitBlobSha(
    head,
    workflow.targetPath,
    'GH02_WORKFLOW_CONTENT_DRIFT',
    cwd,
  );
  if (headBlob !== workflow.expectedTargetBlobSha) {
    reject(
      'GH02_WORKFLOW_CONTENT_DRIFT',
      `${workflow.targetPath} differs from canonical blob ${workflow.expectedTargetBlobSha}`,
    );
  }

  return { mode: workflow.mode, taskId: binding.taskId };
}

function validateRcvColFullRemediationBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'RCV-COL full-remediation control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact RCV-COL binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateHcr08AuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'HCR-08 authority-bootstrap control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact HCR-08 binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validatePb01AuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 authority-bootstrap control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact PB01 binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateKc01AuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 authority-bootstrap control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact KC01 binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateTr01AuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'TR01 authority-bootstrap control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact TR01 binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateKc01Tr01OwnershipAuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01/TR01 ownership authority-bootstrap control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact KC01/TR01 ownership binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateKc01Tr01OwnershipReconciliationBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01/TR01 ownership-reconciliation control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    ...binding.bindingPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
    binding.targetPr.implementation.kc01SquashSha,
    binding.targetPr.implementation.tr01SquashSha,
    binding.targetPr.implementation.sequenceAuthoritySha,
    binding.targetPr.implementation.nextTaskId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact KC01/TR01 ownership-reconciliation binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function rootAuthorityBootstrapContractLiterals(binding) {
  return [
    binding.protocolModeId,
    binding.programId,
    binding.targetTaskId,
    binding.workspaceModule,
    binding.ownerName,
    binding.ownerRole,
    binding.issuedAt,
    binding.bindingPr.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    ...binding.bindingPr.changedPaths.map(
      ({ status, path: repoPath }) => `${status} ${repoPath}`,
    ),
    binding.targetPr.taskId,
    binding.targetPr.mode,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(
      ({ status, path: repoPath }) => `${status} ${repoPath}`,
    ),
    binding.targetPr.semanticAuthority.kind,
    binding.targetPr.semanticAuthority.path,
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.kind,
    binding.targetPr.executionGrant.path,
    binding.targetPr.executionGrant.recordId,
    'stage2Predecessor : OWNER_GRANT_2_REQUIRED',
    'stage2Base : OWNER_GRANT_2_REQUIRED',
    'publicationBasePolicy : OWNER_PINNED_START_OR_UNCHANGED_DESCENDANT',
    'globalAuthority : PROHIBITED',
    'reusableAuthority : PROHIBITED',
    'auditAsAuthority : PROHIBITED',
    'STAGE 2 STATUS: NOT AUTHORIZED / OWNER RATIFICATION REQUIRED',
  ];
}

function validateRootBootstrapControlState(options) {
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const protocolModeId = options.protocolModeId || binding.protocolModeId;
  const programId = options.programId || binding.programId;
  const targetTaskId = options.targetTaskId || binding.targetTaskId;
  const bootstrapState = options.bootstrapState || 'ISSUED';
  const activeModeCount = options.activeModeCount ?? 1;

  if (protocolModeId !== binding.protocolModeId) {
    reject(
      'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH',
      'root-authority bootstrap protocol mode ID mismatch',
    );
  }
  if (programId !== binding.programId || targetTaskId !== binding.targetTaskId) {
    reject(
      'ROOT_BOOTSTRAP_TARGET_MISMATCH',
      'root-authority bootstrap target program/task mismatch',
    );
  }
  if (activeModeCount !== 1) {
    reject(
      'ROOT_BOOTSTRAP_DUPLICATE_ACTIVE_MODE',
      'exactly one active root-authority bootstrap attempt is required',
    );
  }
  if (bootstrapState === 'CONSUMED') {
    reject(
      'ROOT_BOOTSTRAP_MODE_CONSUMED',
      'the root-authority bootstrap mode has already been consumed',
    );
  }
  if (bootstrapState === 'REVOKED' || bootstrapState === 'EXPIRED') {
    reject(
      'ROOT_BOOTSTRAP_GRANT_INACTIVE',
      `the root-authority bootstrap grant is ${bootstrapState.toLowerCase()}`,
    );
  }
  if (bootstrapState !== 'ISSUED' && bootstrapState !== 'STAGE1_MERGED') {
    reject(
      'ROOT_BOOTSTRAP_GRANT_INACTIVE',
      `unsupported root-authority bootstrap state ${bootstrapState}`,
    );
  }
}

function validateRootAuthorityBootstrapBindingScope(options) {
  const { base, head, headRef, changes, taskId, mode, cwd = REPO_ROOT } = options;
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const stage1 = binding.bindingPr;

  validateRootBootstrapControlState(options);
  if (headRef !== stage1.headRef) {
    reject(
      'ROOT_BOOTSTRAP_STAGE1_BRANCH_MISMATCH',
      'root-authority bootstrap Stage 1 branch mismatch',
    );
  }
  if (!rootStage1PublicationBaseIsValid(base, cwd)) {
    reject(
      'ROOT_BOOTSTRAP_STAGE1_BASE_MISMATCH',
      'root-authority bootstrap Stage 1 base mismatch',
    );
  }
  if (!hasExactChangeSet(changes, stage1.changedPaths)) {
    reject(
      'ROOT_BOOTSTRAP_STAGE1_SCOPE_MISMATCH',
      'root-authority bootstrap Stage 1 path/status mismatch',
    );
  }
  if (taskId !== stage1.taskId || (mode && mode !== stage1.mode)) {
    reject(
      'ROOT_BOOTSTRAP_STAGE1_TASK_MISMATCH',
      'root-authority bootstrap Stage 1 task/mode mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of rootAuthorityBootstrapContractLiterals(binding)) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact root-authority binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: stage1.mode, taskId: stage1.taskId };
}

function validateRootStage2ValidatorReconciliationScope(options) {
  const { base, head, headRef, changes, taskId, mode, cwd = REPO_ROOT } = options;
  const reconciliation =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  if (
    taskId !== reconciliation.taskId ||
    (mode && mode !== reconciliation.mode) ||
    base !== reconciliation.baseSha ||
    headRef !== reconciliation.headRef ||
    !hasExactChangeSet(changes, reconciliation.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'Stage 2 validator reconciliation base, branch, task, mode, or M/M/M/A scope mismatch',
    );
  }
  const contract = gitShow(head, reconciliation.contractPath, cwd);
  for (const expectedLiteral of [
    reconciliation.taskId,
    reconciliation.mode,
    reconciliation.baseSha,
    reconciliation.headRef,
    reconciliation.reconciliationPath,
    reconciliation.recordType,
    reconciliation.recordId,
    reconciliation.sourceReconciliation.mergeSha,
    ...reconciliation.changedPaths.map(({ path: repoPath }) => repoPath),
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing Stage 2 validator reconciliation binding ${expectedLiteral}`,
      );
    }
  }
  validateRootStage2BaseReadiness({ base: head, cwd, writerGate: 'PASS' });
  return { mode: reconciliation.mode, taskId: reconciliation.taskId };
}

function validatePb01FormalClosureBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 formal-closure control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
    binding.targetPr.implementation.squashSha,
    binding.targetPr.implementation.contractId,
    binding.targetPr.implementation.nextTaskId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact PB01 formal-closure binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateKc01FormalClosureBindingScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.bindingPr.baseSha ||
    headRef !== binding.bindingPr.headRef ||
    !hasExactChangeSet(changes, binding.bindingPr.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 formal-closure control-plane binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    binding.bindingPr.baseSha,
    binding.bindingPr.headRef,
    binding.targetPr.taskId,
    binding.targetPr.mode,
    String(binding.targetPr.pullRequestNumber),
    binding.targetPr.originalBaseSha,
    binding.targetPr.headRef,
    ...binding.targetPr.changedPaths.map(({ path: repoPath }) => repoPath),
    binding.targetPr.semanticAuthority.recordId,
    binding.targetPr.executionGrant.recordId,
    binding.targetPr.implementation.squashSha,
    binding.targetPr.implementation.provider,
    binding.targetPr.implementation.publicManifestChecksum,
    binding.targetPr.implementation.nextTaskId,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact KC01 formal-closure binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: binding.bindingPr.mode, taskId: binding.taskId };
}

function validateRcvColLargeAuthorityReadRepairScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const repair = RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01;
  if (
    taskId !== repair.taskId ||
    base !== repair.baseSha ||
    headRef !== repair.headRef ||
    !hasExactChangeSet(changes, repair.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'RCV-COL large-authority read repair binding mismatch',
    );
  }

  const contract = gitShow(head, repair.contractPath, cwd);
  for (const expectedLiteral of [
    repair.taskId,
    repair.mode,
    repair.baseSha,
    repair.headRef,
    ...repair.changedPaths.map(({ path: repoPath }) => repoPath),
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact large-authority repair binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: repair.mode, taskId: repair.taskId };
}

function validateOwnerWipMultiSourcePathOwnershipScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding = OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01;
  if (
    taskId !== binding.taskId ||
    base !== binding.baseSha ||
    headRef !== binding.headRef ||
    !hasExactChangeSet(changes, binding.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'owner-WIP source-attribution binding mismatch',
    );
  }

  const contract = gitShow(head, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.mode,
    binding.baseSha,
    binding.headRef,
    ...binding.changedPaths.map(({ path: repoPath }) => repoPath),
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `contract is missing exact owner-WIP binding ${expectedLiteral}`,
      );
    }
  }

  const policyPath = path.join(
    cwd,
    'project',
    'docs',
    'governance',
    'governance-writer-coordination-protected-paths.json',
  );
  deriveActiveOwnerWipExactPaths(JSON.parse(fs.readFileSync(policyPath, 'utf8')));
  return { mode: binding.mode, taskId: binding.taskId };
}

function assertExactAuthorityMarker(content, authorityRef) {
  const marker = buildAuthorityMarker(authorityRef);
  const count = countOccurrences(content, marker);
  if (count > 1) {
    reject(
      'AUTHORITY_RECORD_AMBIGUOUS',
      `authority marker ${authorityRef.recordId} occurs ${count} times`,
    );
  }
  if (count !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      `authority marker ${authorityRef.recordId} must occur exactly once`,
    );
  }
  return marker;
}

function assertExactSemanticBinding(grant, semanticAuthority) {
  const expected = [
    ['kind', semanticAuthority.kind],
    ['path', semanticAuthority.path],
    ['recordId', semanticAuthority.recordId],
  ];
  for (const [field, value] of expected) {
    const pattern = new RegExp(
      `^semanticAuthorityRef\\.${field}[\\t ]*:[\\t ]*${escapeRegExp(value)}[\\t ]*$`,
      'gm',
    );
    const count = [...grant.matchAll(pattern)].length;
    if (count !== 1) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `semanticAuthorityRef.${field} must bind exactly once to ${value}`,
      );
    }
  }
  const declaredFields = [...grant.matchAll(/^semanticAuthorityRef\.[A-Za-z]+[\t ]*:/gm)];
  if (declaredFields.length !== expected.length) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'grant contains an unexpected semantic authority binding field',
    );
  }
}

function findCanonicalRcvColBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical RCV-COL binding',
    );
  }
  return candidate;
}

function findCanonicalHcr08BindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical HCR-08 binding',
    );
  }
  return candidate;
}

function findCanonicalPb01BindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical PB01 binding',
    );
  }
  return candidate;
}

function findCanonicalKc01AuthorityBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical KC01 authority binding',
    );
  }
  return candidate;
}

function findCanonicalTr01AuthorityBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical TR01 authority binding',
    );
  }
  return candidate;
}

function findCanonicalKc01Tr01OwnershipAuthorityBindingCommit(
  base,
  cwd = REPO_ROOT,
) {
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical KC01/TR01 ownership authority binding',
    );
  }
  return candidate;
}

function findCanonicalKc01Tr01OwnershipReconciliationBindingCommit(
  base,
  cwd = REPO_ROOT,
) {
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical KC01/TR01 ownership-reconciliation binding',
    );
  }
  return candidate;
}

function findCanonicalPb01FormalClosureBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical PB01 formal-closure binding',
    );
  }
  return candidate;
}

function findCanonicalKc01FormalClosureBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidate = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  if (!candidate || !gitIsAncestor(candidate, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'current target base does not descend from the canonical KC01 formal-closure binding',
    );
  }
  return candidate;
}

function findCanonicalRootAuthorityBootstrapBindingCommit(base, cwd = REPO_ROOT) {
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const result = runGit(
    [
      'log',
      '--reverse',
      '--format=%H',
      '-S',
      binding.bindingPr.taskId,
      base,
      '--',
      binding.contractPath,
    ],
    cwd,
    { allowFailure: true },
  );
  const candidates =
    result.status === 0
      ? result.stdout
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
      : [];
  if (candidates.length === 0) {
    reject(
      'ROOT_BOOTSTRAP_PREDECESSOR_MISSING',
      'canonical Stage 1 binding commit is not present at the Stage 2 base',
    );
  }
  if (candidates.length !== 1) {
    reject(
      'ROOT_BOOTSTRAP_DUPLICATE_ACTIVE_MODE',
      'the Stage 1 binding identity has more than one canonical introduction',
    );
  }
  const candidate = candidates[0];
  if (!gitIsAncestor(candidate, base, cwd)) {
    reject(
      'ROOT_BOOTSTRAP_PREDECESSOR_MISMATCH',
      'the discovered Stage 1 binding is not an ancestor of the Stage 2 base',
    );
  }
  return candidate;
}

function rootBootstrapGitBlobSha(ref, repoPath, cwd = REPO_ROOT) {
  const result = runGit(['rev-parse', `${ref}:${repoPath}`], cwd, {
    allowFailure: true,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function rootStage1PublicationBaseIsValid(base, cwd) {
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const stage1 = binding.bindingPr;
  if (base === stage1.baseSha) return true;
  if (!cwd || !/^[0-9a-f]{40}$/.test(String(base || ''))) return false;
  const ancestry = runGit(
    ['merge-base', '--is-ancestor', stage1.baseSha, base],
    cwd,
    { allowFailure: true },
  );
  if (ancestry.status !== 0) return false;
  return stage1.changedPaths.every(({ path: repoPath }) => {
    const pinnedBlob = rootBootstrapGitBlobSha(stage1.baseSha, repoPath, cwd);
    const publicationBlob = rootBootstrapGitBlobSha(base, repoPath, cwd);
    return Boolean(pinnedBlob) && pinnedBlob === publicationBlob;
  });
}

function parseRootStage2ReconciliationJson(content) {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('record must be a JSON object');
    }
    return value;
  } catch (error) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_INVALID',
      `canonical Stage 2 reconciliation JSON is invalid: ${error.message}`,
    );
  }
}

function listRootStage2ReconciliationRecords(base, cwd = REPO_ROOT) {
  const reconciliation =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  const tree = runGit(
    ['ls-tree', '-r', '--name-only', base, '--', 'project/docs/governance'],
    cwd,
    { allowFailure: true },
  );
  if (tree.status !== 0) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_INVALID',
      'canonical governance tree cannot be enumerated',
    );
  }
  const records = [];
  for (const repoPath of tree.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    if (!repoPath.endsWith('.json')) continue;
    const content = gitShow(base, repoPath, cwd);
    let candidate;
    try {
      candidate = JSON.parse(content);
    } catch {
      continue;
    }
    if (
      candidate?.recordType === reconciliation.recordType ||
      candidate?.recordId === reconciliation.recordId
    ) {
      records.push({ path: repoPath, record: candidate });
    }
  }
  return records;
}

function validateRootStage2ReconciliationRecord(options) {
  const { base, cwd = REPO_ROOT } = options;
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const reconciliation =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01;
  const recordBlob = rootBootstrapGitBlobSha(base, reconciliation.reconciliationPath, cwd);
  if (!recordBlob) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED',
      'Stage 1 protected blobs drifted and the exact canonical reconciliation record is absent',
    );
  }
  const record = parseRootStage2ReconciliationJson(
    gitShow(base, reconciliation.reconciliationPath, cwd),
  );
  const candidates = listRootStage2ReconciliationRecords(base, cwd);
  if (
    candidates.length !== 1 ||
    candidates[0].path !== reconciliation.reconciliationPath
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_CONFLICT',
      'exactly one canonical task-bound Stage 2 reconciliation record is required',
    );
  }

  for (const [field, value] of [
    ['schemaVersion', 1],
    ['recordType', reconciliation.recordType],
    ['recordId', reconciliation.recordId],
    ['documentRole', reconciliation.documentRole],
    ['materializationTaskId', reconciliation.taskId],
    ['programId', binding.programId],
    ['targetTaskId', binding.targetTaskId],
    ['bootstrapModeId', binding.protocolModeId],
    ['stage1MergeSha', '790d2a956dad05e39c8fde71cc3e19e1f2425cf3'],
    ['targetProgramTaskBinding', 'PASS'],
    ['contractCodeTestConsistency', 'PASS'],
    ['authorityRecordConflict', 'NONE'],
    ['resolverAmbiguity', 'NONE'],
    ['writerGateRequirement', 'PASS_AT_CURRENT_EXECUTION_PREFLIGHT'],
    ['readiness', 'ELIGIBLE_IF_CURRENT_EXECUTION_PREFLIGHT_PASSES'],
  ]) {
    if (record[field] !== value) {
      reject(
        'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_BINDING_MISMATCH',
        `${field} must bind exactly to ${value}`,
      );
    }
  }
  if (
    !reconciliation.allowedDriftClassifications.includes(record.driftClassification) ||
    record.securityInvariants !== 'PRESERVED' ||
    record.stage2Binding?.status !== 'PASS' ||
    record.stage2Binding?.taskId !== binding.targetPr.taskId ||
    record.stage2Binding?.headRef !== binding.targetPr.headRef ||
    !hasExactChangeSet(record.stage2Binding?.changedPaths || [], binding.targetPr.changedPaths)
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_SECURITY_REJECTED',
      'drift classification or protected Stage 2 security binding is not accepted',
    );
  }
  if (
    !Array.isArray(record.allowedDriftClassifications) ||
    record.allowedDriftClassifications.length !==
      reconciliation.allowedDriftClassifications.length ||
    !record.allowedDriftClassifications.every(
      (value, index) => value === reconciliation.allowedDriftClassifications[index],
    )
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_SECURITY_REJECTED',
      'allowed drift classifications do not match the owner-ratified closed set',
    );
  }

  const source = record.sourceReconciliation;
  if (
    source?.pullRequest !== reconciliation.sourceReconciliation.pullRequest ||
    source?.mergeSha !== reconciliation.sourceReconciliation.mergeSha ||
    source?.path !== reconciliation.sourceReconciliation.path ||
    source?.blobSha !== reconciliation.sourceReconciliation.blobSha ||
    !gitIsAncestor(source.mergeSha, base, cwd) ||
    rootBootstrapGitBlobSha(source.mergeSha, source.path, cwd) !== source.blobSha
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_PROVENANCE_INVALID',
      'canonical PR #1915 reconciliation provenance is missing, mismatched, or non-ancestor',
    );
  }
  const sourceRecord = parseRootStage2ReconciliationJson(
    gitShow(source.mergeSha, source.path, cwd),
  );
  if (
    sourceRecord.documentRole !== 'RECONCILIATION_EVIDENCE_NON_AUTHORITY' ||
    sourceRecord.programId !== binding.programId ||
    sourceRecord.stage1PredecessorSha !== record.stage1MergeSha ||
    sourceRecord.stage1DriftClassification !== record.driftClassification ||
    sourceRecord.securityInvariants !== record.securityInvariants ||
    sourceRecord.targetProgramTaskBinding !== record.targetProgramTaskBinding ||
    sourceRecord.stage2Binding !== record.stage2Binding.status ||
    sourceRecord.contractCodeTestConsistency !== record.contractCodeTestConsistency ||
    sourceRecord.authorityRecordConflict !== record.authorityRecordConflict ||
    sourceRecord.resolverAmbiguity !== record.resolverAmbiguity
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_PROVENANCE_INVALID',
      'successor record changes or contradicts the canonical PR #1915 reconciliation result',
    );
  }

  const protectedPaths = binding.bindingPr.changedPaths.map(({ path: repoPath }) => repoPath);
  const recordedProtectedPaths = Object.keys(record.protectedBlobShas || {}).sort();
  if (
    recordedProtectedPaths.length !== protectedPaths.length ||
    !protectedPaths
      .slice()
      .sort()
      .every((repoPath, index) => repoPath === recordedProtectedPaths[index])
  ) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_STALE',
      'reconciliation protected-blob set is incomplete or expanded',
    );
  }
  for (const repoPath of protectedPaths) {
    const currentBlob = rootBootstrapGitBlobSha(base, repoPath, cwd);
    if (!currentBlob || record.protectedBlobShas[repoPath] !== currentBlob) {
      reject(
        'ROOT_BOOTSTRAP_STAGE2_RECONCILIATION_STALE',
        `protected binding changed after reconciliation: ${repoPath}`,
      );
    }
  }
  return {
    status: 'ROOT_BOOTSTRAP_STAGE2_BASE_RECONCILED',
    recordId: record.recordId,
    recordPath: reconciliation.reconciliationPath,
  };
}

function validateRootStage2BaseBinding(options) {
  const { base, cwd = REPO_ROOT } = options;
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const predecessor = findCanonicalRootAuthorityBootstrapBindingCommit(base, cwd);
  const exact = binding.bindingPr.changedPaths.every(({ path: repoPath }) => {
    const predecessorBlob = rootBootstrapGitBlobSha(predecessor, repoPath, cwd);
    const baseBlob = rootBootstrapGitBlobSha(base, repoPath, cwd);
    return Boolean(predecessorBlob) && predecessorBlob === baseBlob;
  });
  if (exact) {
    return {
      status: 'ROOT_BOOTSTRAP_STAGE2_BASE_EXACT',
      predecessor,
    };
  }
  return {
    ...validateRootStage2ReconciliationRecord({ base, cwd }),
    predecessor,
  };
}

function validateRootStage2BaseReadiness(options) {
  const result = validateRootStage2BaseBinding(options);
  if (options.writerGate !== 'PASS') {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_COMPETING_WRITER',
      'current execution writer gate must be explicitly PASS',
    );
  }
  return result;
}

function assertExactRootRecordField(content, field, value, code) {
  const pattern = new RegExp(
    `^${escapeRegExp(field)}[\\t ]*:[\\t ]*${escapeRegExp(value)}[\\t ]*$`,
    'gm',
  );
  if ([...content.matchAll(pattern)].length !== 1) {
    reject(code, `${field} must occur exactly once with value ${value}`);
  }
}

function assertExactRootMarker(content, authorityRef, code) {
  const marker = buildAuthorityMarker(authorityRef);
  if (countOccurrences(content, marker) !== 1) {
    reject(code, `${authorityRef.recordId} marker must occur exactly once`);
  }
  return marker;
}

function validateRootAuthorityReferencePair(semantic, execution) {
  if (
    semantic.kind === execution.kind ||
    semantic.path === execution.path ||
    semantic.recordId === execution.recordId
  ) {
    reject(
      'AUTHORITY_REFERENCE_COLLISION',
      'semantic authority and execution grant references must be distinct',
    );
  }
  if (
    semantic.kind !== 'SEMANTIC_AUTHORITY' ||
    execution.kind !== 'EXECUTION_GRANT' ||
    semantic.path !== 'project/docs/governance/decision-log.md' ||
    execution.path !==
      'project/docs/governance/coordination-execution-grants/GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01-EG01.md'
  ) {
    reject(
      'ROOT_BOOTSTRAP_AUTHORITY_PATH_INVALID',
      'root-authority records must use their two exact canonical references',
    );
  }
}

function validateRootAuthorityMaterializationContent(
  decisionLog,
  grant,
  base,
  predecessor,
) {
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const target = binding.targetPr;
  const semantic = target.semanticAuthority;
  const execution = target.executionGrant;

  validateRootAuthorityReferencePair(semantic, execution);

  const semanticMarker = assertExactRootMarker(
    decisionLog,
    semantic,
    'ROOT_BOOTSTRAP_SA_RECORD_INVALID',
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(line, semanticMarker, semantic.recordId),
    );
  if (semanticRows.length !== 1) {
    reject(
      'ROOT_BOOTSTRAP_SA_RECORD_INVALID',
      'semantic marker must identify exactly one decision-log row',
    );
  }
  for (const [field, value] of [
    ['recordType', 'SEMANTIC_AUTHORITY'],
    ['recordId', semantic.recordId],
    ['programId', binding.programId],
    ['taskId', binding.targetTaskId],
    ['ownerName', binding.ownerName],
    ['ownerRole', binding.ownerRole],
    ['decision', 'RATIFIED'],
    ['issuedAt', binding.issuedAt],
    ['status', 'ACTIVE_AFTER_APPROVED_MERGE'],
    ['exactTaskBinding', 'REQUIRED'],
    ['exactPrBinding', 'REQUIRED'],
    ['exactHeadBinding', 'REQUIRED'],
    ['exactScopeBinding', 'REQUIRED'],
    ['requiredChecksBinding', 'REQUIRED'],
    ['singleUseConsumption', 'REQUIRED'],
    ['staleReuse', 'PROHIBITED'],
    ['manualFallback', 'EMERGENCY_ONLY'],
    ['productionActivation', 'NOT_AUTHORIZED'],
    ['standingAuthority', 'PROHIBITED'],
  ]) {
    assertExactRootRecordField(
      decisionLog,
      field,
      value,
      field === 'ownerName' || field === 'ownerRole'
        ? 'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH'
        : field === 'programId' || field === 'taskId'
          ? 'ROOT_BOOTSTRAP_TARGET_MISMATCH'
          : 'ROOT_BOOTSTRAP_SA_RECORD_INVALID',
    );
  }

  assertExactRootMarker(grant, execution, 'ROOT_BOOTSTRAP_EG_RECORD_INVALID');
  for (const [field, value] of [
    ['recordType', 'EXECUTION_GRANT'],
    ['recordId', execution.recordId],
    ['programId', binding.programId],
    ['taskId', binding.targetTaskId],
    ['ownerName', binding.ownerName],
    ['ownerRole', binding.ownerRole],
    ['executionMode', 'GO-COMPLETE'],
    ['workspaceModule', binding.workspaceModule],
    ['issuedAt', binding.issuedAt],
    ['status', 'ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK'],
    ['stage1PredecessorSha', predecessor],
    ['stage2BaseSha', base],
    ['productionActivation', 'NOT_AUTHORIZED'],
    ['ciBypass', 'PROHIBITED'],
    ['ledgerBypass', 'PROHIBITED'],
    ['standingAuthority', 'PROHIBITED'],
    ['reusableAuthority', 'PROHIBITED'],
  ]) {
    assertExactRootRecordField(
      grant,
      field,
      value,
      field === 'ownerName' || field === 'ownerRole'
        ? 'ROOT_BOOTSTRAP_OWNER_IDENTITY_MISMATCH'
        : field === 'programId' || field === 'taskId'
          ? 'ROOT_BOOTSTRAP_TARGET_MISMATCH'
          : field === 'stage1PredecessorSha'
            ? 'ROOT_BOOTSTRAP_PREDECESSOR_MISMATCH'
            : field === 'stage2BaseSha'
              ? 'ROOT_BOOTSTRAP_STAGE2_BASE_INVALIDATED'
              : 'ROOT_BOOTSTRAP_EG_RECORD_INVALID',
    );
  }

  for (const [field, value] of [
    ['semanticAuthorityRef.kind', semantic.kind],
    ['semanticAuthorityRef.path', semantic.path],
    ['semanticAuthorityRef.recordId', semantic.recordId],
  ]) {
    assertExactRootRecordField(
      grant,
      field,
      value,
      'ROOT_BOOTSTRAP_EG_RECORD_INVALID',
    );
  }
  if (
    [...grant.matchAll(/^semanticAuthorityRef\.[A-Za-z]+[\t ]*:/gm)].length !== 3
  ) {
    reject(
      'ROOT_BOOTSTRAP_EG_RECORD_INVALID',
      'execution grant contains an unexpected semantic authority binding field',
    );
  }
}

function validateRootAuthorityBootstrapMaterializationScope(options) {
  const { base, head, headRef, changes, taskId, mode, cwd = REPO_ROOT } = options;
  const binding =
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01;
  const target = binding.targetPr;

  validateRootBootstrapControlState({
    ...options,
    bootstrapState: options.bootstrapState || 'STAGE1_MERGED',
  });
  if (headRef !== target.headRef) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_BRANCH_MISMATCH',
      'root-authority bootstrap Stage 2 branch mismatch',
    );
  }
  if (!hasExactChangeSet(changes, target.changedPaths)) {
    reject(
      'ROOT_BOOTSTRAP_STAGE2_SCOPE_MISMATCH',
      'root-authority bootstrap Stage 2 path/status mismatch',
    );
  }
  if (taskId !== target.taskId || (mode && mode !== target.mode)) {
    reject(
      'ROOT_BOOTSTRAP_TARGET_MISMATCH',
      'root-authority bootstrap Stage 2 task/mode mismatch',
    );
  }

  const baseBinding = validateRootStage2BaseBinding({ base, cwd });
  const predecessor = baseBinding.predecessor;
  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of rootAuthorityBootstrapContractLiterals(binding)) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'ROOT_BOOTSTRAP_PREDECESSOR_MISMATCH',
        `Stage 2 base is missing Stage 1 binding ${expectedLiteral}`,
      );
    }
  }
  const baseDecisionLog = gitShow(base, target.semanticAuthority.path, cwd);
  if (
    baseDecisionLog.includes(target.semanticAuthority.recordId) ||
    rootBootstrapGitBlobSha(base, target.executionGrant.path, cwd)
  ) {
    reject(
      'ROOT_BOOTSTRAP_MODE_CONSUMED',
      'root-authority records already exist at the Stage 2 base',
    );
  }

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const grant = gitShow(head, target.executionGrant.path, cwd);
  validateRootAuthorityMaterializationContent(
    decisionLog,
    grant,
    base,
    predecessor,
  );

  return { mode: target.mode, taskId: target.taskId };
}

function validateRcvColFullRemediationBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'RCV-COL full-remediation bootstrap binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical RCV-COL binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalRcvColBindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validateHcr08AuthorityBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'HCR-08 authority-bootstrap target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical HCR-08 binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalHcr08BindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'HCR-08 semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validatePb01AuthorityBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 authority-bootstrap target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical PB01 binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalPb01BindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'PB01 semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validateKc01AuthorityBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 authority-bootstrap target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical KC01 binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalKc01AuthorityBindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'KC01 semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validateTr01AuthorityBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'TR01 authority-bootstrap target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical TR01 binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalTr01AuthorityBindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'TR01 semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validateKc01Tr01OwnershipAuthorityBootstrapScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01/TR01 ownership authority-bootstrap target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical KC01/TR01 ownership binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalKc01Tr01OwnershipAuthorityBindingCommit(base, cwd);

  const decisionLog = gitShow(head, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'KC01/TR01 ownership semantic authority marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(head, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);

  return { mode: target.mode, taskId: target.taskId };
}

function validateKc01Tr01OwnershipReconciliationScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01/TR01 ownership-reconciliation target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    String(target.pullRequestNumber),
    target.originalBaseSha,
    target.headRef,
    target.semanticAuthority.recordId,
    target.executionGrant.recordId,
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical KC01/TR01 ownership-reconciliation binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalKc01Tr01OwnershipReconciliationBindingCommit(base, cwd);
  for (const [label, sha] of [
    ['KC01 implementation', target.implementation.kc01SquashSha],
    ['TR01 implementation', target.implementation.tr01SquashSha],
    ['sequence authority', target.implementation.sequenceAuthoritySha],
  ]) {
    if (!gitIsAncestor(sha, base, cwd)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `${label} SHA is not an ancestor of the target base`,
      );
    }
  }

  const decisionLog = gitShow(base, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'KC01/TR01 ownership-reconciliation semantic marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(base, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);
  for (const { path: repoPath } of target.changedPaths) {
    if (countOccurrences(grant, `\`${repoPath}\``) !== 1) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `KC01/TR01 ownership-reconciliation grant must allow target path exactly once: ${repoPath}`,
      );
    }
  }

  const authorization = gitShow(
    head,
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
    cwd,
  );
  const canonicalization = gitShow(
    head,
    'project/docs/governance/canonicalization-register.md',
    cwd,
  );
  const backlog = gitShow(
    head,
    'project/docs/governance/product-backlog.md',
    cwd,
  );
  const index = gitShow(
    head,
    'project/docs/governance/GOVERNANCE-INDEX.md',
    cwd,
  );
  const sharedLiterals = [
    target.taskId,
    target.implementation.kc01SquashSha,
    target.implementation.tr01SquashSha,
    target.implementation.nextTaskId,
    'CROSS_MODULE / SHARED_CONTROL_PLANE',
    'OFFICE',
    'RECEIVABLE',
  ];
  const requiredByDocument = [
    [
      authorization,
      [
        ...sharedLiterals,
        target.implementation.sequenceAuthoritySha,
        'RUNTIME                            DORMANT',
        'SIGNING AUTHORITY                  NOT ACTIVE',
        'D02-LB01                           NOT CURRENT NEXT / NOT ELIGIBLE',
      ],
    ],
    [
      canonicalization,
      [
        ...sharedLiterals,
        'verification `ACTIVE`, runtime `DORMANT`, signing `NOT ACTIVE`',
        'RCV-CLAIM-FORM-P02-S08-D02-LB01` `NOT CURRENT NEXT / NOT ELIGIBLE',
      ],
    ],
    [
      backlog,
      [
        ...sharedLiterals,
        target.implementation.sequenceAuthoritySha,
        'SIGNING                            NOT ACTIVE',
        'D02-LB01                           NOT CURRENT NEXT / NOT ELIGIBLE',
      ],
    ],
    [
      index,
      [
        'project/docs/rcv-claim-legal-signer-*',
        'project/docs/rcv-claim-legal-public-key-trust-root-*',
        target.implementation.kc01SquashSha.slice(0, 8),
        target.implementation.tr01SquashSha.slice(0, 8),
        'CROSS_MODULE / SHARED_CONTROL_PLANE',
        'OFFICE',
        'RECEIVABLE',
      ],
    ],
  ];
  for (const [document, requiredLiterals] of requiredByDocument) {
    for (const requiredLiteral of requiredLiterals) {
      if (!document.includes(requiredLiteral)) {
        reject(
          'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
          `KC01/TR01 ownership reconciliation is missing required content: ${requiredLiteral}`,
        );
      }
    }
  }

  return { mode: target.mode, taskId: target.taskId };
}

function validatePb01FormalClosureScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'PB01 formal-closure target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
    String(target.pullRequestNumber),
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical PB01 formal-closure binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalPb01FormalClosureBindingCommit(base, cwd);
  if (!gitIsAncestor(target.implementation.squashSha, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'PB01 implementation squash is not an ancestor of the target base',
    );
  }

  const decisionLog = gitShow(base, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'PB01 formal-closure semantic marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(base, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);
  for (const { path: repoPath } of target.changedPaths) {
    if (countOccurrences(grant, `\`${repoPath}\``) !== 1) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `PB01 execution grant must allow target path exactly once: ${repoPath}`,
      );
    }
  }

  const authorization = gitShow(
    head,
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
    cwd,
  );
  const canonicalization = gitShow(
    head,
    'project/docs/governance/canonicalization-register.md',
    cwd,
  );
  const backlog = gitShow(
    head,
    'project/docs/governance/product-backlog.md',
    cwd,
  );
  const index = gitShow(
    head,
    'project/docs/governance/GOVERNANCE-INDEX.md',
    cwd,
  );
  const requiredByDocument = [
    [
      authorization,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-PB01 : CLOSED / CANONICAL / PASS',
        target.implementation.squashSha,
        target.implementation.contractId,
        `Next eligible task          : ${target.implementation.nextTaskId}`,
        'Claim Formation PB01 gate   : CONSUMED / COMPLETE',
      ],
    ],
    [
      canonicalization,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-PB01 — exact Legal Basis projection binding formal closure',
        target.implementation.squashSha,
        target.implementation.contractId,
        `${target.implementation.nextTaskId} — OWNER GO REQUIRED / NOT STARTED`,
      ],
    ],
    [
      backlog,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-PB01 — Exact Legal Basis Projection Binding Contract',
        target.implementation.squashSha,
        target.implementation.contractId,
        target.implementation.nextTaskId,
      ],
    ],
    [
      index,
      [
        'project/docs/rcv-claim-legal-basis-projection-binding-v1.md',
        target.implementation.squashSha.slice(0, 8),
        target.implementation.contractId,
        'next D02-KC01 owner-gated',
      ],
    ],
  ];
  for (const [document, requiredLiterals] of requiredByDocument) {
    for (const requiredLiteral of requiredLiterals) {
      if (!document.includes(requiredLiteral)) {
        reject(
          'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
          `PB01 formal closure is missing required content: ${requiredLiteral}`,
        );
      }
    }
  }

  return { mode: target.mode, taskId: target.taskId };
}

function validateKc01FormalClosureScope(options) {
  const { base, head, headRef, changes, taskId, cwd = REPO_ROOT } = options;
  const binding =
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01;
  const target = binding.targetPr;
  if (
    taskId !== target.taskId ||
    headRef !== target.headRef ||
    !hasExactChangeSet(changes, target.changedPaths)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'KC01 formal-closure target binding mismatch',
    );
  }

  const baseContract = gitShow(base, binding.contractPath, cwd);
  for (const expectedLiteral of [
    binding.taskId,
    binding.bindingPr.mode,
    target.taskId,
    target.mode,
    target.originalBaseSha,
    String(target.pullRequestNumber),
  ]) {
    if (!baseContract.includes(expectedLiteral)) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `current target base is missing canonical KC01 formal-closure binding ${expectedLiteral}`,
      );
    }
  }
  findCanonicalKc01FormalClosureBindingCommit(base, cwd);
  if (!gitIsAncestor(target.implementation.squashSha, base, cwd)) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'KC01 implementation squash is not an ancestor of the target base',
    );
  }

  const decisionLog = gitShow(base, target.semanticAuthority.path, cwd);
  const semanticMarker = assertExactAuthorityMarker(
    decisionLog,
    target.semanticAuthority,
  );
  const semanticRows = decisionLog
    .split(/\r?\n/)
    .filter((line) =>
      authorityMarkerLocatesSemanticRow(
        line,
        semanticMarker,
        target.semanticAuthority.recordId,
      ),
    );
  if (semanticRows.length !== 1) {
    reject(
      'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
      'KC01 formal-closure semantic marker must identify its exact decision-log row',
    );
  }

  const grant = gitShow(base, target.executionGrant.path, cwd);
  assertExactAuthorityMarker(grant, target.executionGrant);
  assertExactSemanticBinding(grant, target.semanticAuthority);
  for (const { path: repoPath } of target.changedPaths) {
    if (countOccurrences(grant, `\`${repoPath}\``) !== 1) {
      reject(
        'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
        `KC01 execution grant must allow target path exactly once: ${repoPath}`,
      );
    }
  }

  const authorization = gitShow(
    head,
    'project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md',
    cwd,
  );
  const canonicalization = gitShow(
    head,
    'project/docs/governance/canonicalization-register.md',
    cwd,
  );
  const backlog = gitShow(
    head,
    'project/docs/governance/product-backlog.md',
    cwd,
  );
  const index = gitShow(
    head,
    'project/docs/governance/GOVERNANCE-INDEX.md',
    cwd,
  );
  const requiredByDocument = [
    [
      authorization,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-KC01 : CLOSED / CANONICAL / PASS',
        target.implementation.squashSha,
        target.implementation.publicManifestChecksum,
        `Next eligible task          : ${target.implementation.nextTaskId}`,
        'KC01 trust-root onboarding  : PENDING / NOT ACTIVE',
      ],
    ],
    [
      canonicalization,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-KC01 — AWS KMS legal signer key ceremony formal closure',
        target.implementation.squashSha,
        target.implementation.publicManifestChecksum,
        `${target.implementation.nextTaskId} — OWNER GO REQUIRED / NOT STARTED`,
      ],
    ],
    [
      backlog,
      [
        'RCV-CLAIM-FORM-P02-S08-D02-KC01 — AWS KMS Legal Signer Key Ceremony',
        target.implementation.squashSha,
        target.implementation.publicManifestChecksum,
        target.implementation.nextTaskId,
      ],
    ],
    [
      index,
      [
        'project/docs/rcv-claim-legal-signer-*',
        target.implementation.squashSha.slice(0, 8),
        'trust root PENDING_ONBOARDING',
        'next D02-TR01 owner-gated',
      ],
    ],
  ];
  for (const [document, requiredLiterals] of requiredByDocument) {
    for (const requiredLiteral of requiredLiterals) {
      if (!document.includes(requiredLiteral)) {
        reject(
          'CONTROL_PLANE_BINDING_CONTENT_MISMATCH',
          `KC01 formal closure is missing required content: ${requiredLiteral}`,
        );
      }
    }
  }

  return { mode: target.mode, taskId: target.taskId };
}

function repoPathToAbsolute(repoPath, repoRoot = REPO_ROOT) {
  return path.join(repoRoot, ...normalizeRepoPath(repoPath).split('/'));
}

function validatePrScope(options) {
  const { base, head, headRef = '', cwd = REPO_ROOT } = options;
  assertSha(base, 'base');
  assertSha(head, 'head');
  const changes = parseGitChanges(base, head, cwd);
  const classification = classifyPrChangeSet(changes, { base, headRef, cwd });

  if (classification.mode === 'NON_COORDINATION_PR') {
    return classification;
  }

  if (
    classification.mode ===
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr.mode
  ) {
    return validateRcvColFullRemediationBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr
      .mode
  ) {
    return validateHcr08AuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr
      .mode
  ) {
    return validatePb01AuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.bindingPr.mode
  ) {
    return validatePb01FormalClosureBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
      .bindingPr.mode
  ) {
    return validateKc01AuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.bindingPr
      .mode
  ) {
    return validateTr01AuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
      .bindingPr.mode
  ) {
    return validateKc01Tr01OwnershipAuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01
      .bindingPr.mode
  ) {
    return validateKc01Tr01OwnershipReconciliationBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.bindingPr
      .mode
  ) {
    return validateKc01FormalClosureBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01.bindingPr
      .mode
  ) {
    return validateRootAuthorityBootstrapBindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      mode: classification.mode,
      cwd,
    });
  }

  if (
    classification.mode ===
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01.mode
  ) {
    return validateRootStage2ValidatorReconciliationScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      mode: classification.mode,
      cwd,
    });
  }

  if (classification.mode === RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01.mode) {
    return validateRcvColLargeAuthorityReadRepairScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (classification.mode === OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01.mode) {
    return validateOwnerWipMultiSourcePathOwnershipScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr.mode
  ) {
    return validateRcvColFullRemediationBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }


  if (
    classification.mode ===
    RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr
      .mode
  ) {
    return validateHcr08AuthorityBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr
      .mode
  ) {
    return validatePb01AuthorityBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.targetPr.mode
  ) {
    return validatePb01FormalClosureScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
      .targetPr.mode
  ) {
    return validateKc01AuthorityBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01.targetPr
      .mode
  ) {
    return validateTr01AuthorityBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }


  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01
      .targetPr.mode
  ) {
    return validateKc01Tr01OwnershipAuthorityBootstrapScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01
      .targetPr.mode
  ) {
    return validateKc01Tr01OwnershipReconciliationScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }


  if (
    classification.mode ===
    RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01.targetPr
      .mode
  ) {
    return validateKc01FormalClosureScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01.targetPr
      .mode
  ) {
    return validateRootAuthorityBootstrapMaterializationScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      mode: classification.mode,
      cwd,
    });
  }

  if (classification.mode === ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02.mode) {
    return validateAnalyzeFirstConditionalExecutionR02Scope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02.mode) {
    return validateGithubPlatformGh02RecoveryScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01.mode) {
    return validateGithubPlatformGh03BindingScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01.mode) {
    return validateGithubPlatformGh0506CutoverScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01.mode) {
    return validateGithubPlatformGh08SeparationScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === REGISTER_TEST_FIXTURE_REPAIR_I01.mode) {
    return validateRegisterTestFixtureRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === AUTHORITY_LOCATOR_REPAIR_I01.mode) {
    return validateAuthorityLocatorRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode) {
    return validateExecutionBaseAncestryRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode) {
    return validateNoncoordPrClassifierRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (
    classification.mode ===
    GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01.bindingPr.mode
  ) {
    return validateGithubPlatformGh02BindingScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (
    classification.mode ===
    GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01.workflowPr.mode
  ) {
    return validateGithubPlatformGh02WorkflowScope({
      base,
      head,
      headRef,
      changes,
      taskId: classification.taskId,
      cwd,
    });
  }

  if (classification.mode === 'BOOTSTRAP') {
    if (base !== EFFECTIVE_FROM_MAIN_SHA) {
      reject('BOOTSTRAP_BASE_INVALID', `bootstrap base must be ${EFFECTIVE_FROM_MAIN_SHA}`);
    }
    return classification;
  }

  if (classification.mode === 'REQUEST_ONLY') {
    assertGitFileNotSymlink(head, classification.instancePath, cwd);
    const request = parseRequestFile(repoPathToAbsolute(classification.instancePath, cwd));
    const folderRequestId = classification.instancePath.split('/').at(-2);
    if (folderRequestId !== request.requestId) {
      reject('REQUEST_PATH_ID_MISMATCH', `${folderRequestId} != ${request.requestId}`);
    }
    validateRequestAgainstGit(request, base, null, cwd);
    verifyRegister(path.join(cwd, REGISTER_REPO_PATH));
    return classification;
  }

  if (classification.mode === 'RESULT_ONLY') {
    assertGitFileNotSymlink(head, classification.instancePath, cwd);
    const result = parseResultFile(repoPathToAbsolute(classification.instancePath, cwd));
    const folderRequestId = classification.instancePath.split('/').at(-2);
    if (folderRequestId !== classification.requestId) {
      reject(
        'RESULT_BRANCH_REQUEST_MISMATCH',
        `${classification.requestId} != ${folderRequestId}`,
      );
    }
    if (folderRequestId !== result.requestId) {
      reject('RESULT_PATH_ID_MISMATCH', `${folderRequestId} != ${result.requestId}`);
    }
    const requestPath = path.join(
      cwd,
      'project',
      'docs',
      'governance',
      'coordination-requests',
      result.requestId,
      'request.md',
    );
    const request = parseRequestFile(requestPath);
    if (request.requestFingerprint !== result.requestFingerprint) {
      reject('RESULT_REQUEST_FINGERPRINT_MISMATCH', result.requestId);
    }
    if (result.effectiveMainSha !== base) {
      reject('RESULT_BASE_MISMATCH', `${result.effectiveMainSha} != ${base}`);
    }
    if (!gitIsAncestor(result.executionMergeSha, base, cwd)) {
      reject('EXECUTION_MERGE_NOT_IN_MAIN', result.executionMergeSha);
    }
    verifyRegister(path.join(cwd, REGISTER_REPO_PATH));
    return classification;
  }

  const requestId = classification.requestId;
  const request = validateCanonicalRequestAtExecutionBase(
    requestId,
    base,
    head,
    cwd,
  );
  const changedPaths = changes.map((change) => change.path).sort();
  const allowedPaths = [...request.declaredTargetAllowlist].sort();
  if (
    changedPaths.length !== allowedPaths.length ||
    changedPaths.some((candidate, index) => candidate !== allowedPaths[index])
  ) {
    reject(
      'EXECUTION_TARGET_SCOPE_INVALID',
      `changed=[${changedPaths}] allowed=[${allowedPaths}]`,
    );
  }
  validateRequestAgainstGit(request, base, head, cwd);
  return classification;
}

function validateRepository() {
  const instances = loadRepositoryInstances();
  const head = runGit(['rev-parse', 'HEAD'], REPO_ROOT).stdout.trim();
  for (const { value: result } of instances.results) {
    if (!gitIsAncestor(result.executionMergeSha, head, REPO_ROOT)) {
      reject('EXECUTION_MERGE_NOT_IN_MAIN', result.executionMergeSha);
    }
    if (!gitIsAncestor(result.effectiveMainSha, head, REPO_ROOT)) {
      reject('RESULT_BASE_NOT_IN_MAIN', result.effectiveMainSha);
    }
  }
  verifyRegister(REGISTER_PATH, instances);
  return instances;
}

function validateBootstrapWorktree(cwd = REPO_ROOT) {
  const branch = runGit(['branch', '--show-current'], cwd).stdout.trim();
  const head = runGit(['rev-parse', 'HEAD'], cwd).stdout.trim();
  if (branch !== 'codex/gov-coord-v1-bootstrap-i01') {
    reject('BOOTSTRAP_BRANCH_INVALID', branch);
  }
  if (head !== EFFECTIVE_FROM_MAIN_SHA) {
    reject('BOOTSTRAP_BASE_INVALID', head);
  }
  const classification = classifyPrChangeSet(parseWorktreeChanges(cwd));
  if (classification.mode !== 'BOOTSTRAP') {
    reject('BOOTSTRAP_SCOPE_INVALID', classification.mode);
  }
  return classification;
}

function makeSelfTestRequest(policy = loadPolicy()) {
  const baseContent = 'record: GOV-SELF-TEST\nanchor: OLD\n';
  const operation = {
    type: 'EXACT_LITERAL_REPLACEMENT',
    changeClass: 'LEVEL_2_MECHANICAL',
    targetFile: 'project/docs/governance/GOVERNANCE-INDEX.md',
    recordIdentity: 'record: GOV-SELF-TEST',
    anchor: 'anchor: OLD',
    expectedOldValue: 'OLD',
    newValue: 'NEW',
    evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    expectedResultSha256: sha256('record: GOV-SELF-TEST\nanchor: NEW\n'),
  };
  const request = {
    schemaVersion: 1,
    requestId: 'GOV-REQ-20260724-SELF-TEST',
    requestFingerprint: '',
    requestedBy: 'CODEX_LOCAL',
    createdAt: '2026-07-24T00:00:00Z',
    baseMainSha: EFFECTIVE_FROM_MAIN_SHA,
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      path: 'project/docs/governance/decision-log.md',
      recordId: 'GOV-SELF-TEST-SEMANTIC',
      evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    },
    executionGrantRef: {
      kind: 'EXECUTION_GRANT',
      path: GRANT_REPO_PATH,
      recordId: 'GOV-COORD-V1-CODEX-LOCAL',
      evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    },
    operation,
    declaredTargetAllowlist: [operation.targetFile],
  };
  request.requestFingerprint = computeRequestFingerprint(request);
  validateRequestObject(request, { policy });
  return { request, baseContent };
}

function runSelfTest() {
  const policy = loadPolicy();
  const { request, baseContent } = makeSelfTestRequest(policy);
  const result = applyMechanicalOperation(baseContent, request.operation);
  if (result !== 'record: GOV-SELF-TEST\nanchor: NEW\n') {
    reject('SELF_TEST_FAILED', 'mechanical replacement failed');
  }
  const generatedA = generateRegisterContent({ requests: [], results: [] });
  const generatedB = generateRegisterContent({ requests: [], results: [] });
  if (generatedA !== generatedB) reject('SELF_TEST_FAILED', 'register is not byte-stable');

  const forbidden = JSON.parse(JSON.stringify(request));
  forbidden.operation.targetFile = '../outside.md';
  forbidden.declaredTargetAllowlist = ['../outside.md'];
  forbidden.requestFingerprint = computeRequestFingerprint(forbidden);
  let rejected = false;
  try {
    validateRequestObject(forbidden, { policy });
  } catch (error) {
    rejected = error instanceof CoordinationError;
  }
  if (!rejected) reject('SELF_TEST_FAILED', 'path traversal fixture was not rejected');
  return true;
}

function parseCliArgs(args) {
  const options = { positional: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[index + 1];
      if (!value || value.startsWith('--')) reject('CLI_INVALID', `missing value for ${arg}`);
      options[key] = value;
      index += 1;
    } else {
      options.positional.push(arg);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseCliArgs(rest);
  switch (command) {
    case 'self-test':
      runSelfTest();
      console.log('GOV_COORD_SELF_TEST_PASS');
      break;
    case 'validate-template': {
      const [kind, file] = args.positional;
      if (kind === 'request') parseRequestFile(path.resolve(file), { template: true });
      else if (kind === 'result') parseResultFile(path.resolve(file), { template: true });
      else reject('CLI_INVALID', 'validate-template requires request|result and a file');
      console.log(`GOV_COORD_TEMPLATE_VALID:${kind}`);
      break;
    }
    case 'validate-request':
      parseRequestFile(path.resolve(args.positional[0]));
      console.log('GOV_COORD_REQUEST_VALID');
      break;
    case 'validate-result':
      parseResultFile(path.resolve(args.positional[0]));
      console.log('GOV_COORD_RESULT_VALID');
      break;
    case 'generate-register':
      writeRegister();
      console.log('GOV_COORD_REGISTER_GENERATED');
      break;
    case 'verify-register':
      verifyRegister();
      console.log('GOV_COORD_REGISTER_CURRENT');
      break;
    case 'validate-repository':
      validateRepository();
      console.log('GOV_COORD_REPOSITORY_VALID');
      break;
    case 'validate-pr-scope':
      {
        const classification = validatePrScope({
          base: args.base,
          head: args.head,
          headRef: args['head-ref'] || '',
        });
        console.log(
          classification.mode === 'NON_COORDINATION_PR'
            ? 'GOV_COORD_NON_COORDINATION_PR'
            : 'GOV_COORD_PR_SCOPE_VALID',
        );
      }
      break;
    case 'validate-root-stage2-base': {
      const result = validateRootStage2BaseReadiness({
        base: args.base,
        writerGate: args['writer-gate'],
      });
      console.log(result.status);
      break;
    }
    case 'validate-bootstrap-worktree':
      validateBootstrapWorktree();
      console.log('GOV_COORD_BOOTSTRAP_WORKTREE_VALID');
      break;
    default:
      reject(
        'CLI_INVALID',
        'command must be self-test, validate-template, validate-request, validate-result, generate-register, verify-register, validate-repository, validate-pr-scope, validate-root-stage2-base or validate-bootstrap-worktree',
      );
  }
}

module.exports = {
  ANALYZE_FIRST_CONDITIONAL_EXECUTION_R02,
  AUTHORITY_LOCATOR_REPAIR_I01,
  BOOTSTRAP_ADD,
  BOOTSTRAP_ALL,
  BOOTSTRAP_MODIFY,
  CoordinationError,
  EFFECTIVE_FROM_MAIN_SHA,
  EXECUTION_BASE_ANCESTRY_REPAIR_I01,
  GITHUB_PLATFORM_GH02_CONTROL_PLANE_BINDING_R01,
  GITHUB_PLATFORM_GH02_CONTROL_PLANE_RECOVERY_R02,
  GITHUB_PLATFORM_GH03_CONTROL_PLANE_BINDING_R01,
  GITHUB_PLATFORM_GH05_GH06_CI_CUTOVER_R01,
  GITHUB_PLATFORM_GH08_GATE_JEST_SEPARATION_R01,
  GIT_DEFAULT_PROCESS_MAX_BUFFER_BYTES,
  GIT_CANONICAL_TEXT_BLOB_LIMIT_BYTES,
  GIT_CANONICAL_TEXT_BLOB_PROCESS_MAX_BUFFER_BYTES,
  GIT_DIAGNOSTIC_EXCERPT_MAX_CHARS,
  GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_ROOT_AUTHORITY_BOOTSTRAP_R01,
  GOVERNANCE_CLOSEOUT_LIVE_LEDGER_GAP_R01_STAGE2_VALIDATOR_RECONCILIATION_R01,
  RCV_CLAIM_FORM_HCR_08_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_D02_KC01_AWS_KMS_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_D02_KC01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_D02_KC01_TR01_OWNERSHIP_RECONCILIATION_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_D02_TR01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_PB01_AUTHORITY_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_CLAIM_FORM_PB01_FORMAL_CLOSURE_CONTROL_PLANE_BINDING_R01,
  RCV_COL_FULL_REMEDIATION_BOOTSTRAP_CONTROL_PLANE_BINDING_R01,
  RCV_COL_LARGE_AUTHORITY_READ_REPAIR_R01,
  GRANT_REPO_PATH,
  LEVEL_2_OPERATIONS,
  NONCOORD_PR_CLASSIFIER_REPAIR_R01,
  OWNER_WIP_MULTI_SOURCE_PATH_OWNERSHIP_R01,
  REGISTER_REPO_PATH,
  REGISTER_TEST_FIXTURE_REPAIR_I01,
  applyMechanicalOperation,
  assertNotSymlink,
  authorityMarkerLocatesSemanticRow,
  buildAuthorityMarker,
  canonicalize,
  classifyPrChangeSet,
  computeRequestFingerprint,
  countOccurrences,
  deriveActiveOwnerWipExactPaths,
  extractStructuredJson,
  generateRegisterContent,
  loadRepositoryInstances,
  loadRepositoryInstancesAtGitRef,
  makeSelfTestRequest,
  normalizeRepoPath,
  parseRequestFile,
  parseRequestMarkdown,
  parseResultFile,
  parseResultMarkdown,
  assertCanonicalGitBlobSize,
  boundedGitDiagnostic,
  parseGitBlobSize,
  runGit,
  gitShow,
  runSelfTest,
  sha256,
  validateRequestObject,
  validateBootstrapWorktree,
  validateAuthorityRecordAtRef,
  validateCanonicalRequestAtExecutionBase,
  validateGithubPlatformGh02WorkflowScope,
  validateGithubPlatformGh03BindingScope,
  validateGithubPlatformGh0506CutoverScope,
  validateGithubPlatformGh08SeparationScope,
  validateHcr08AuthorityBootstrapBindingScope,
  validateHcr08AuthorityBootstrapScope,
  validateKc01AuthorityBootstrapBindingScope,
  validateKc01AuthorityBootstrapScope,
  validateKc01FormalClosureBindingScope,
  validateKc01FormalClosureScope,
  validateKc01Tr01OwnershipAuthorityBootstrapBindingScope,
  validateKc01Tr01OwnershipAuthorityBootstrapScope,
  validateKc01Tr01OwnershipReconciliationBindingScope,
  validateKc01Tr01OwnershipReconciliationScope,
  validateTr01AuthorityBootstrapBindingScope,
  validateTr01AuthorityBootstrapScope,
  validatePb01AuthorityBootstrapBindingScope,
  validatePb01AuthorityBootstrapScope,
  validatePb01FormalClosureBindingScope,
  validatePb01FormalClosureScope,
  validateRootAuthorityBootstrapBindingScope,
  validateRootAuthorityBootstrapMaterializationScope,
  validateRootAuthorityReferencePair,
  validateRootStage2BaseBinding,
  validateRootStage2BaseReadiness,
  validateRootStage2ReconciliationRecord,
  validateRootStage2ValidatorReconciliationScope,
  validateRcvColFullRemediationBindingScope,
  validateRcvColFullRemediationBootstrapScope,
  validateRcvColLargeAuthorityReadRepairScope,
  validateOwnerWipMultiSourcePathOwnershipScope,
  validatePrScope,
  validateRequestAgainstGit,
  assertRequestBaseAncestor,
  validateResultObject,
  validateTargetPolicy,
  verifyRegister,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    if (error instanceof CoordinationError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
}
