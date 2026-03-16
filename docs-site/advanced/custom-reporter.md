# Custom Reporter

How to create a custom reporter for Testurio. Reporters receive lifecycle events during test execution and can generate reports in any format.

## IReporter Interface

```typescript
interface IReporter {
  readonly name: string;
  onStart?(result: { name?: string; startTime: number }): void;
  onTestCaseStart?(testCase: { name: string }): void;
  onStepComplete?(step: TestStepResult): void;
  onTestCaseComplete?(result: TestCaseResult): void;
  onComplete(result: TestResult): void;
  onError?(error: Error): void;
}
```

All methods except `onComplete` and `name` are optional. Implement only the events you need.

## Lifecycle Events

| Event | When | Data |
|-------|------|------|
| `onStart` | Scenario begins | Scenario name, start time |
| `onTestCaseStart` | Test case begins | Test case name |
| `onStepComplete` | Each step finishes | Step result (name, status, duration, error) |
| `onTestCaseComplete` | Test case finishes | Full test case result with all steps |
| `onComplete` | Scenario ends | Full test result with all test cases |
| `onError` | Unhandled error | Error object |

## Basic Example: Console Reporter

```typescript
import type { IReporter, TestResult, TestCaseResult, TestStepResult } from 'testurio';

class ConsoleReporter implements IReporter {
  readonly name = 'console';

  onStart(result: { name?: string; startTime: number }): void {
    console.log(`\nRunning: ${result.name ?? 'unnamed'}`);
    console.log('─'.repeat(40));
  }

  onTestCaseStart(testCase: { name: string }): void {
    console.log(`  Test: ${testCase.name}`);
  }

  onStepComplete(step: TestStepResult): void {
    const icon = step.passed ? '  ✓' : '  ✗';
    console.log(`    ${icon} ${step.name} (${step.duration}ms)`);
  }

  onTestCaseComplete(result: TestCaseResult): void {
    const icon = result.passed ? '✓' : '✗';
    console.log(`  ${icon} ${result.name} — ${result.duration}ms`);
  }

  onComplete(result: TestResult): void {
    console.log('─'.repeat(40));
    const total = result.testCases.length;
    const passed = result.testCases.filter((tc) => tc.passed).length;
    console.log(`Result: ${passed}/${total} passed (${result.duration}ms)\n`);
  }

  onError(error: Error): void {
    console.error(`Error: ${error.message}`);
  }
}
```

## Advanced Example: JSON File Reporter

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IReporter, TestResult } from 'testurio';

class JsonReporter implements IReporter {
  readonly name = 'json';

  constructor(private outputDir: string) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  onComplete(result: TestResult): void {
    const filename = `report-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    const report = {
      name: result.name,
      passed: result.passed,
      duration: result.duration,
      timestamp: new Date().toISOString(),
      testCases: result.testCases.map((tc) => ({
        name: tc.name,
        passed: tc.passed,
        duration: tc.duration,
        steps: tc.steps.map((step) => ({
          name: step.name,
          passed: step.passed,
          duration: step.duration,
          error: step.error?.message,
        })),
      })),
    };

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  }
}
```

## Using a Custom Reporter

```typescript
import { TestScenario } from 'testurio';

const scenario = new TestScenario({
  name: 'My Tests',
  components: [server, client],
  reporters: [
    new ConsoleReporter(),
    new JsonReporter('./test-reports'),
  ],
});
```

Multiple reporters can be used simultaneously. Each receives all events.

## Packaging

Package as `@testurio/reporter-*` or `testurio-reporter-*`:

```json
{
  "peerDependencies": {
    "testurio": "^0.x"
  }
}
```
