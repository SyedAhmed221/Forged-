import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000 },
  resolve: {
    alias: {
      '@tikquick/shared': new URL(
        './packages/shared/src/index.ts',
        import.meta.url,
      ).pathname.replace(/^\/([A-Z]:)/, '$1'),
    },
  },
});
