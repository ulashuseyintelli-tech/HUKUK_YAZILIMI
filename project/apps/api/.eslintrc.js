module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    
    // ==================== PARA HESABI YASAĞI ====================
    // Çekirdek dışı hesap YASAK - @see ARCHITECTURE.md
    'no-restricted-syntax': ['error',
      // Faiz formülü (x * rate * days / 365) yasak
      {
        selector: 'BinaryExpression[operator="/"][right.value=365]',
        message: '🚫 Faiz formülü (x/365) sadece interest-engine içinde olmalı. @see ARCHITECTURE.md',
      },
      {
        selector: 'BinaryExpression[operator="/"][right.value=36500]',
        message: '🚫 Faiz formülü (x/36500) sadece interest-engine içinde olmalı. @see ARCHITECTURE.md',
      },
      // toFixed() para yuvarlaması yasak
      {
        selector: 'CallExpression[callee.property.name="toFixed"]',
        message: '⚠️ Para yuvarlaması için Money.round() kullanın, toFixed() yasak. @see packages/types/money.ts',
      },
    ],
    
    // Deprecated module imports - ARCHITECTURE.md
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/modules/rule-engine', '**/modules/rule-engine/**'],
          message: '⛔ rule-engine is DEPRECATED. Use policy-engine or interest-engine instead. See ARCHITECTURE.md',
        },
        {
          group: ['**/modules/validation-gate', '**/modules/validation-gate/**'],
          message: '⚠️ validation-gate is DEPRECATED. Use policy-engine/gate-checker instead. See ARCHITECTURE.md',
        },
      ],
    }],
  },
  
  // ==================== ÇEKIRDEK MODÜL İSTİSNALARI ====================
  // interest-engine, fee-engine, allocation içinde hesap yapılabilir
  overrides: [
    {
      files: [
        '**/modules/interest-engine/**/*.ts',
        '**/modules/fee-engine/**/*.ts',
        '**/modules/interest-engine/allocation/**/*.ts',
      ],
      rules: {
        'no-restricted-syntax': 'off', // Çekirdek modüllerde hesap serbest
      },
    },
    {
      files: ['**/*.spec.ts', '**/*.test.ts'],
      rules: {
        'no-restricted-syntax': 'off', // Test dosyalarında serbest
      },
    },
  ],
};