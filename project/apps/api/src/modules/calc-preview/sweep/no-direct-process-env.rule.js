/**
 * Phase 5.7 - ESLint Rule: No Direct process.env Access
 * 
 * process.env doğrudan kullanımı YASAK.
 * Tüm env flag'ler env-flags.ts üzerinden okunmalı.
 * 
 * @see sweep/env-flags.ts - TEK KAYNAK
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct process.env access - use env-flags.ts instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noDirectEnv: 'Direct process.env access is forbidden. Use getEnvConfig() from sweep/env-flags.ts instead.',
    },
    schema: [],
  },

  create(context) {
    return {
      MemberExpression(node) {
        // Check for process.env.SOMETHING
        if (
          node.object.type === 'MemberExpression' &&
          node.object.object.type === 'Identifier' &&
          node.object.object.name === 'process' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'env'
        ) {
          context.report({
            node,
            messageId: 'noDirectEnv',
          });
        }

        // Check for process.env
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'process' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'env'
        ) {
          context.report({
            node,
            messageId: 'noDirectEnv',
          });
        }
      },
    };
  },
};
