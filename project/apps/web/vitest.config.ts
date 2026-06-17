import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // React 17+ otomatik JSX runtime (Next'in react-jsx'i ile aynı) — JSX'li component
  // testlerinde "React is not defined" hatasını önler; React import gerekmez.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
