/**
 * ESLint Rule: no-frontend-calculation
 * 
 * Frontend'de para hesaplaması yapan kodu engeller.
 * Tek Kaynak Prensibi'ni zorlar.
 * 
 * @see docs/single-source-of-truth-architecture.md
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow frontend money calculations - use backend API instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noLocalCalculation: 
        'Frontend\'de para hesaplaması yasak. Backend API kullanın: {{suggestion}}',
      noHardcodedRates:
        'Hardcoded faiz oranları yasak. Backend interest-engine kullanın.',
      noMockCalculation:
        'Mock hesaplama production\'da yasak. assertNoMockInProduction() kullanın.',
    },
    schema: [],
  },

  create(context) {
    // Yasak fonksiyon isimleri
    const FORBIDDEN_FUNCTIONS = [
      'hesaplaFaiz',
      'hesaplaVekalet',
      'hesaplaSegmentliFaiz',
      'hesaplaTicariFaiz',
      'hesaplaYasalFaiz',
      'calculateInterest',
      'calculateFee',
      'calculateAttorneyFee',
    ];

    // Yasak değişken isimleri
    const FORBIDDEN_VARIABLES = [
      'TCMB_AVANS_ORANLARI',
      'YASAL_FAIZ_ORANLARI',
      'TCMB_ORAN',
      'interestRates',
    ];

    // İzin verilen dosyalar (test, stub)
    const ALLOWED_FILES = [
      '__tests__',
      '.test.',
      '.spec.',
      'feature-flags.ts',
    ];

    function isAllowedFile(filename) {
      return ALLOWED_FILES.some(pattern => filename.includes(pattern));
    }

    function hasAssertNoMock(node) {
      // Fonksiyon içinde assertNoMockInProduction çağrısı var mı?
      const sourceCode = context.getSourceCode();
      const text = sourceCode.getText(node);
      return text.includes('assertNoMockInProduction');
    }

    return {
      // Fonksiyon çağrılarını kontrol et
      CallExpression(node) {
        const filename = context.getFilename();
        if (isAllowedFile(filename)) return;

        if (node.callee.type === 'Identifier') {
          const funcName = node.callee.name;
          
          if (FORBIDDEN_FUNCTIONS.includes(funcName)) {
            // assertNoMockInProduction içeriyorsa izin ver (stub)
            const parent = node.parent;
            if (parent && parent.type === 'FunctionDeclaration' && hasAssertNoMock(parent)) {
              return;
            }

            context.report({
              node,
              messageId: 'noLocalCalculation',
              data: {
                suggestion: funcName.includes('Faiz') || funcName.includes('Interest')
                  ? 'interestEngineApi.preview()'
                  : 'feeEngineApi.preview()',
              },
            });
          }
        }
      },

      // Değişken tanımlarını kontrol et
      VariableDeclarator(node) {
        const filename = context.getFilename();
        if (isAllowedFile(filename)) return;

        if (node.id.type === 'Identifier') {
          const varName = node.id.name;
          
          if (FORBIDDEN_VARIABLES.includes(varName)) {
            // Boş array ise izin ver (stub)
            if (
              node.init &&
              node.init.type === 'ArrayExpression' &&
              node.init.elements.length === 0
            ) {
              return;
            }

            context.report({
              node,
              messageId: 'noHardcodedRates',
            });
          }
        }
      },

      // Binary expression'ları kontrol et (tutar * oran gibi)
      BinaryExpression(node) {
        const filename = context.getFilename();
        if (isAllowedFile(filename)) return;

        // Çarpma işlemi
        if (node.operator === '*') {
          const sourceCode = context.getSourceCode();
          const text = sourceCode.getText(node);
          
          // Para hesaplaması pattern'leri
          const dangerousPatterns = [
            /principal\s*\*\s*\d/,
            /tutar\s*\*\s*\d/,
            /amount\s*\*\s*dailyRate/,
            /\*\s*0\.\d+\s*\*\s*days/,
          ];

          for (const pattern of dangerousPatterns) {
            if (pattern.test(text)) {
              context.report({
                node,
                messageId: 'noLocalCalculation',
                data: {
                  suggestion: 'interestEngineApi.preview() veya feeEngineApi.preview()',
                },
              });
              break;
            }
          }
        }
      },
    };
  },
};
