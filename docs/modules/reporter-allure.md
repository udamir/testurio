# Allure Reporter (`@testurio/reporter-allure`)

**Location:** `packages/reporter-allure/`

Integrates Testurio with Allure TestOps for rich test reporting with steps, metadata, and attachments.

## Usage

```typescript
import { AllureReporter } from '@testurio/reporter-allure';

const scenario = new TestScenario({
  name: 'API Tests',
  components: [server, client],
});

scenario.addReporter(new AllureReporter({
  outputDir: './allure-results',
}));
```

## Features

- Generates Allure-compatible result files
- Maps Testurio steps to Allure steps
- Supports test metadata (epic, feature, story, severity, tags)
- Step-level timing and status
- Error details with stack traces

## Test Metadata

```typescript
const tc = testCase('create user', (test) => { /* ... */ })
  .epic('User Management')
  .feature('User Creation')
  .severity('critical')
  .tags('api', 'smoke');
```

## Reporter Interface

Implements the `TestReporter` interface:

```typescript
interface TestReporter {
  readonly name: string;
  onStart?(result: { name?: string; startTime: number }): void;
  onTestCaseStart?(testCase: { name: string }): void;
  onStepComplete?(step: TestStepResult): void;
  onTestCaseComplete?(result: TestCaseResult): void;
  onComplete(result: TestResult): void;
  onError?(error: Error): void;
}
```

## Dependencies

- `allure-js-commons` - Allure result generation
