/**
 * Basic HTTP Example
 *
 * Demonstrates testing a simple HTTP API with testurio.
 */

// When using as npm package: import { ... } from 'testurio';
// For local development:
import { TestScenario, testCase, MockConfig, ClientConfig, Http } from '../src';

// Define types for your API
interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

// Create the test scenario
const scenario = new TestScenario({
  name: 'User API Test',
  components: [
    new MockConfig({
      name: 'backend',
      listenAddress: { host: 'localhost', port: 3000 },
      protocol: new Http(),
    }),
    new ClientConfig({
      name: 'api',
      targetAddress: { host: 'localhost', port: 3000 },
      protocol: new Http(),
    }),
  ],
});

// Test: GET user by ID
const getUserTest = testCase('Get user by ID', (test) => {
  const api = test.client('api');
  const backend = test.mock('backend');

  // Step 1: Client sends GET request
  api.request('getUser', { method: 'GET', path: '/users/1' });

  // Step 2: Mock returns user data
  backend.onRequest('getUser', { method: 'GET', path: '/users/1' })
    .mockResponse(() => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { id: 1, name: 'Alice', email: 'alice@example.com' },
    }));

  // Step 3: Verify response
  api.onResponse<User>('getUser').assert((user) => {
    return user.id === 1 && user.name === 'Alice';
  });
});

// Test: POST create user
const createUserTest = testCase('Create new user', (test) => {
  const api = test.client('api');
  const backend = test.mock('backend');

  // Step 1: Client sends POST request
  api.request<CreateUserRequest>('createUser', {
    method: 'POST',
    path: '/users',
    body: { name: 'Bob', email: 'bob@example.com' },
    headers: { 'Content-Type': 'application/json' },
  });

  // Step 2: Mock handles creation
  backend.onRequest<CreateUserRequest>('createUser', { method: 'POST', path: '/users' })
    .mockResponse((req) => ({
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: { id: 2, name: req.payload?.name, email: req.payload?.email },
    }));

  // Step 3: Verify response
  api.onResponse<User>('createUser').assert((user) => {
    return user.id === 2 && user.name === 'Bob';
  });
});

// Run tests
async function main() {
  console.log('Running HTTP tests...\n');

  const result1 = await scenario.run(getUserTest);
  console.log(`Get user: ${result1.passed ? '✓ PASSED' : '✗ FAILED'}`);

  const result2 = await scenario.run(createUserTest);
  console.log(`Create user: ${result2.passed ? '✓ PASSED' : '✗ FAILED'}`);
}

main().catch(console.error);
