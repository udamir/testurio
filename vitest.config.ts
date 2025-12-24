import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      'testurio': resolve(__dirname, './packages/core/src'),
      '@testurio/adapter-grpc': resolve(__dirname, './packages/adapter-grpc/src'),
      '@testurio/adapter-ws': resolve(__dirname, './packages/adapter-ws/src'),
      '@testurio/adapter-tcp': resolve(__dirname, './packages/adapter-tcp/src'),
      '@testurio/reporter-allure': resolve(__dirname, './packages/reporter-allure/src'),
      // Legacy alias for gradual migration
      '@': resolve(__dirname, './src'),
    },
  },
});
