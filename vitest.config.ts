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
      '@testurio/protocol-grpc': resolve(__dirname, './packages/protocol-grpc/src'),
      '@testurio/protocol-ws': resolve(__dirname, './packages/protocol-ws/src'),
      '@testurio/protocol-tcp': resolve(__dirname, './packages/protocol-tcp/src'),
      '@testurio/reporter-allure': resolve(__dirname, './packages/reporter-allure/src'),
      // Legacy alias for gradual migration
      '@': resolve(__dirname, './src'),
    },
  },
});
