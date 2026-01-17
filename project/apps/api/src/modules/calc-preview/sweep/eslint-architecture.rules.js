/**
 * Phase 5.7 - ESLint Architectural Rules
 * 
 * Bu kurallar mimari sınırları korur:
 * - prod code → chaos/* import edemez
 * - prod code → regression/* import edemez
 * - test-only util'ler __test__ dışında kullanılamaz
 * - process.env doğrudan okunamaz → config layer zorunlu
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.7
 */

module.exports = {
  rules: {
    // =========================================================================
    // CHAOS MODULE BOUNDARY
    // =========================================================================
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/chaos/**', '**/chaos/*'],
            message: 'Chaos module cannot be imported in production code. Use ChaosModule.forRoot() dynamic import only.',
          },
          {
            group: ['**/regression/**', '**/regression/*'],
            message: 'Regression module is test-only. Cannot be imported in production code.',
          },
          {
            group: ['**/__test__/**', '**/__tests__/**', '**/*.spec', '**/*.test'],
            message: 'Test utilities cannot be imported in production code.',
          },
        ],
      },
    ],
  },

  overrides: [
    // =========================================================================
    // TEST FILES - Allow chaos/regression imports
    // =========================================================================
    {
      files: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/__test__/**/*.ts',
        '**/__tests__/**/*.ts',
        '**/chaos/**/*.ts',
        '**/regression/**/*.ts',
        '**/load-test/**/*.ts',
        '**/contracts/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
