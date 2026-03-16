# Reporting

Testurio supports test reporters that receive events throughout the test lifecycle. The `@testurio/reporter-allure` package provides integration with [Allure TestOps](https://docs.qameta.io/allure/) for interactive HTML test reports.

## Allure Reporter

### Installation

```bash
npm install @testurio/reporter-allure --save-dev
```

### Basic Usage

```typescript
import { TestScenario } from 'testurio';
import { AllureReporter } from '@testurio/reporter-allure';

const scenario = new TestScenario({
  name: 'User API Tests',
  components: [server, client],
  reporters: [
    new AllureReporter({
      resultsDir: 'allure-results',
    }),
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resultsDir` | `string` | `"allure-results"` | Output directory for results |
| `environmentInfo` | `Record<string, string>` | — | Environment info in the report |
| `labels` | `Label[]` | — | Default labels for all tests |
| `tmsUrlPattern` | `string` | — | TMS link pattern (`{id}` placeholder) |
| `issueUrlPattern` | `string` | — | Issue link pattern (`{id}` placeholder) |
| `defaultEpic` | `string` | — | Default epic for all tests |
| `defaultFeature` | `string` | — | Default feature for all tests |
| `includePayloads` | `"parameters" \| "attachments" \| "both"` | — | Include payloads in steps |
| `maxPayloadSize` | `number` | `1000` | Max payload size for parameters mode |

### Full Configuration Example

```typescript
new AllureReporter({
  resultsDir: './reports/allure-results',

  environmentInfo: {
    'Node.js': process.version,
    'OS': process.platform,
    'Environment': 'CI',
  },

  labels: [
    { name: 'owner', value: 'team-api' },
    { name: 'layer', value: 'integration' },
  ],

  tmsUrlPattern: 'https://testrail.example.com/index.php?/cases/view/{id}',
  issueUrlPattern: 'https://jira.example.com/browse/{id}',

  defaultEpic: 'E-Commerce Platform',
  defaultFeature: 'API',

  includePayloads: 'both',
  maxPayloadSize: 500,
})
```

### Test Case Metadata

Enrich your test reports with BDD hierarchy and metadata:

```typescript
const tc = testCase('Get user by ID', (test) => {
  // ... test steps
})
  .id('TC-001')
  .epic('User Management')
  .feature('User API')
  .story('Get User')
  .severity('critical')
  .tags('api', 'smoke', 'regression')
  .issue('BUG-123')
  .description('Verifies that user can be retrieved by ID');
```

### Generating HTML Reports

After running tests, generate the HTML report using the Allure CLI:

```bash
# Install Allure CLI
npm install -g allure-commandline

# Generate HTML report
allure generate allure-results -o allure-report

# Open in browser
allure open allure-report

# Or generate and open in one step
allure serve allure-results
```

## Reporter Events

Reporters receive events throughout the test lifecycle:

| Event | When |
|-------|------|
| `onStart` | Scenario execution begins |
| `onTestCaseStart` | Test case execution begins |
| `onStepComplete` | Each step completes (pass or fail) |
| `onTestCaseComplete` | Test case finishes with result |
| `onComplete` | All test cases finished |
| `onError` | Unhandled error occurs |

## Custom Reporters

You can implement custom reporters by implementing the `IReporter` interface. See the [Custom Reporter](/advanced/custom-reporter) guide for details.
