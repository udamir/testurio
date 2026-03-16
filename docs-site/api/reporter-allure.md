# @testurio/reporter-allure

Allure TestOps reporter for Testurio. Converts test results to Allure-compatible format for interactive HTML reports.

```bash
npm install @testurio/reporter-allure --save-dev
```

## AllureReporter

```typescript
import { AllureReporter } from '@testurio/reporter-allure';

const scenario = new TestScenario({
  name: 'API Tests',
  components: [server, client],
  reporters: [
    new AllureReporter({
      resultsDir: 'allure-results',
    }),
  ],
});
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resultsDir` | `string` | `"allure-results"` | Output directory for results |
| `environmentInfo` | `Record<string, string>` | — | Environment info in report |
| `labels` | `Label[]` | — | Default labels for all tests |
| `tmsUrlPattern` | `string` | — | TMS link pattern (use `{id}`) |
| `issueUrlPattern` | `string` | — | Issue link pattern (use `{id}`) |
| `defaultEpic` | `string` | — | Default epic for all tests |
| `defaultFeature` | `string` | — | Default feature for all tests |
| `includePayloads` | `"parameters" \| "attachments" \| "both"` | — | Include payloads in steps |
| `maxPayloadSize` | `number` | `1000` | Max payload size for parameters |

### Test Metadata

```typescript
const tc = testCase('Get user', (test) => { /* ... */ })
  .id('TC-001')
  .epic('User Management')
  .feature('User API')
  .story('Get User')
  .severity('critical')
  .tags('api', 'smoke', 'regression')
  .issue('BUG-123')
  .description('Verifies user retrieval by ID');
```

### Generating Reports

```bash
# Install Allure CLI
npm install -g allure-commandline

# Generate HTML report
allure generate allure-results -o allure-report

# Open in browser
allure open allure-report

# Or generate + open in one step
allure serve allure-results
```

### Output Files

| File | Description |
|------|-------------|
| `{uuid}-result.json` | Individual test result |
| `{uuid}-container.json` | Container grouping test cases |
| `environment.properties` | Environment information |
| `{uuid}-attachment.{ext}` | Payload attachments |

## IReporter Interface

Implement this interface to create custom reporters:

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
