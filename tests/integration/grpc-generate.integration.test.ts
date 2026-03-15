import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GrpcGenerator } from '@testurio/cli/generators/grpc/generator';
import { createLogger } from '@testurio/cli/utils/logger';
import { parseProtoFile } from '@testurio/cli/generators/grpc/proto-parser';
import type { GrpcSource } from '@testurio/cli/config/schema';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const PROTO_DIR = path.resolve(__dirname, '../proto');
const TEMP_DIR = path.resolve(__dirname, '../.temp-grpc-test');

describe('gRPC Generator', () => {
  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (existsSync(TEMP_DIR)) {
      await rm(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe('proto-parser', () => {
    it('parses services from test-service.proto', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      expect(result.services).toHaveLength(2);
      expect(result.services.map((s) => s.name)).toContain('TestService');
      expect(result.services.map((s) => s.name)).toContain('StreamTestService');
    });

    it('extracts unary methods with fully qualified types', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const testService = result.services.find((s) => s.name === 'TestService')!;
      const getUser = testService.methods.find((m) => m.name === 'GetUser')!;
      expect(getUser.requestType).toBe('test.v1.GetUserRequest');
      expect(getUser.responseType).toBe('test.v1.GetUserResponse');
      expect(getUser.requestStreaming).toBe(false);
      expect(getUser.responseStreaming).toBe(false);
    });

    it('extracts streaming methods', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const testService = result.services.find((s) => s.name === 'TestService')!;
      const stream = testService.methods.find((m) => m.name === 'Stream')!;
      expect(stream.requestStreaming).toBe(true);
      expect(stream.responseStreaming).toBe(true);
    });

    it('extracts custom method options (required_metadata)', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const testService = result.services.find((s) => s.name === 'TestService')!;
      const getSecretData = testService.methods.find((m) => m.name === 'GetSecretData')!;
      expect(getSecretData.requiredHeaders).toContain('authorization');
    });

    it('extracts message types with fully qualified keys', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      expect(result.messages.has('test.v1.GetUserRequest')).toBe(true);
      expect(result.messages.has('test.v1.GetUserResponse')).toBe(true);

      const getUserReq = result.messages.get('test.v1.GetUserRequest')!;
      // keepCase: true preserves snake_case from proto
      expect(getUserReq.fields.find((f) => f.name === 'user_id')).toBeDefined();
    });

    it('extracts enum types', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      expect(result.enums.has('test.v1.OrderStatus')).toBe(true);
      const orderStatus = result.enums.get('test.v1.OrderStatus')!;
      expect(orderStatus.values).toContain('ORDER_STATUS_PENDING');
    });

    it('extracts real oneof groups (excludes synthetic optional oneofs)', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const streamReq = result.messages.get('test.v1.StreamRequest')!;
      expect(streamReq.oneofs).toHaveLength(1);
      expect(streamReq.oneofs[0].name).toBe('payload');
      expect(streamReq.oneofs[0].fields).toContain('ping');
      expect(streamReq.oneofs[0].fields).toContain('subscribe');
      expect(streamReq.oneofs[0].fields).toContain('data');
    });

    it('marks explicit optional fields correctly', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const updateReq = result.messages.get('test.v1.UpdateUserRequest')!;
      const nameField = updateReq.fields.find((f) => f.name === 'name')!;
      expect(nameField.optional).toBe(true);

      // Regular proto3 field should NOT be optional
      const userIdField = updateReq.fields.find((f) => f.name === 'user_id')!;
      expect(userIdField.optional).toBe(false);
    });

    it('extracts map fields', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const configResp = result.messages.get('test.v1.GetConfigResponse')!;
      const configField = configResp.fields.find((f) => f.name === 'config')!;
      expect(configField.map).toBe(true);
    });

    it('extracts repeated fields', async () => {
      const result = await parseProtoFile(
        path.join(PROTO_DIR, 'test-service.proto'),
        'required_metadata',
      );

      const createOrder = result.messages.get('test.v1.CreateOrderRequest')!;
      const itemsField = createOrder.fields.find((f) => f.name === 'items')!;
      expect(itemsField.repeated).toBe(true);
    });
  });

  describe('full generation - unary service', () => {
    it('generates from test-service.proto with unary methods', async () => {
      const outputPath = path.join(TEMP_DIR, 'test-service.ts');
      const generator = new GrpcGenerator();
      const logger = createLogger({ quiet: true });

      const source: GrpcSource = {
        type: 'grpc',
        input: path.join(PROTO_DIR, 'test-service.proto'),
        output: outputPath,
        options: {
          services: ['TestService'],
          metadata: { optionName: 'required_metadata' },
        },
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      expect(files).toHaveLength(1);
      const content = files[0].content;

      // Check imports
      expect(content).toContain("import { z } from 'zod'");

      // Check enum schemas
      expect(content).toContain('orderStatusSchema');
      expect(content).toContain("'ORDER_STATUS_PENDING'");

      // Check message schemas (snake_case field names preserved)
      expect(content).toContain('getUserRequestSchema');
      expect(content).toContain('getUserResponseSchema');
      expect(content).toContain('user_id: z.number().int()');

      // Check nested messages
      expect(content).toContain('orderItemSchema');
      expect(content).toContain('shippingAddressSchema');

      // Check explicit optional fields
      expect(content).toContain('.optional()');

      // Check map fields
      expect(content).toContain('z.record(');

      // Check repeated fields
      expect(content).toContain('z.array(');

      // Check metadata schemas
      expect(content).toContain('getSecretDataMetadataSchema');
      expect(content).toContain("'authorization': z.string()");

      // Check service interface
      expect(content).toContain('export interface TestService');
      expect(content).toContain('GetUser:');
      expect(content).toContain('z.infer<typeof getUserRequestSchema>');

      // Check metadata field in interface
      expect(content).toContain('metadata: z.infer<typeof getSecretDataMetadataSchema>');
    });
  });

  describe('full generation - streaming service', () => {
    it('generates streaming types with oneof variants', async () => {
      const outputPath = path.join(TEMP_DIR, 'stream-service.ts');
      const generator = new GrpcGenerator();
      const logger = createLogger({ quiet: true });

      const source: GrpcSource = {
        type: 'grpc',
        input: path.join(PROTO_DIR, 'test-service.proto'),
        output: outputPath,
        options: {
          services: ['StreamTestService'],
        },
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      expect(files).toHaveLength(1);
      const content = files[0].content;

      // Check streaming envelope+variant schemas
      expect(content).toContain('pingClientMessageSchema');
      expect(content).toContain('subscribeClientMessageSchema');
      expect(content).toContain('dataClientMessageSchema');
      expect(content).toContain('pongServerMessageSchema');
      expect(content).toContain('subscribeServerMessageSchema');
      expect(content).toContain('dataServerMessageSchema');
      expect(content).toContain('errorServerMessageSchema');

      // Check envelope fields (snake_case preserved)
      expect(content).toContain('request_id: z.string()');

      // Check stream service interface
      expect(content).toContain('DeliveryMessage:');
      expect(content).toContain('clientMessages:');
      expect(content).toContain('serverMessages:');
      expect(content).toContain('z.infer<typeof pingClientMessageSchema>');
      expect(content).toContain('z.infer<typeof pongServerMessageSchema>');
    });

    it('generates simple streaming types without oneof', async () => {
      const outputPath = path.join(TEMP_DIR, 'chat-service.ts');
      const generator = new GrpcGenerator();
      const logger = createLogger({ quiet: true });

      const source: GrpcSource = {
        type: 'grpc',
        input: path.join(FIXTURES_DIR, 'chat-service.proto'),
        output: outputPath,
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      expect(files).toHaveLength(1);
      const content = files[0].content;

      // Check schemas
      expect(content).toContain('chatMessageSchema');
      expect(content).toContain('chatEventSchema');

      // Check interface structure
      expect(content).toContain('Chat:');
      expect(content).toContain('clientMessages:');
      expect(content).toContain('serverMessages:');
    });
  });

  describe('service filtering', () => {
    it('generates only specified services', async () => {
      const outputPath = path.join(TEMP_DIR, 'filtered-service.ts');
      const generator = new GrpcGenerator();
      const logger = createLogger({ quiet: true });

      const source: GrpcSource = {
        type: 'grpc',
        input: path.join(PROTO_DIR, 'test-service.proto'),
        output: outputPath,
        options: {
          services: ['StreamTestService'],
        },
      };

      const files = await generator.generate({
        source,
        rootDir: process.cwd(),
        logger,
      });

      const content = files[0].content;
      expect(content).not.toContain('export interface TestService');
      expect(content).toContain('StreamTestService');
    });
  });
});
