import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    watch: false,
    fileParallelism: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      'testurio': resolve(__dirname, './packages/core/src'),
      '@testurio/protocol-grpc': resolve(__dirname, './packages/protocol-grpc/src'),
      '@testurio/protocol-ws': resolve(__dirname, './packages/protocol-ws/src'),
      '@testurio/protocol-tcp': resolve(__dirname, './packages/protocol-tcp/src'),
      '@testurio/reporter-allure': resolve(__dirname, './packages/reporter-allure/src'),
      '@testurio/adapter-redis': resolve(__dirname, './packages/adapter-redis/src'),
      '@testurio/adapter-kafka': resolve(__dirname, './packages/adapter-kafka/src'),
    },
  },
});
