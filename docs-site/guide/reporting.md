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
| `includePayloads` | `"parameters" \| "attachments" \| "both"` | — | Include per-step request/response payloads (see below) |
| `maxPayloadSize` | `number` | `1000` | Max characters for parameters mode (attachments are full size) |

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

### Per-Step Request/Response Payloads (`includePayloads`)

When `includePayloads` is set, the Allure reporter renders each step's recorded request and response payloads as parameter rows, JSON file attachments, or both. **Payloads come from each component's `step.metadata`** — populated by the framework during `executeStep` — so this works regardless of whether `TestScenario({ recording: true })` is enabled.

| Mode | Effect |
|------|--------|
| `"parameters"` | Adds `request` / `response` parameter rows (truncated to `maxPayloadSize`) |
| `"attachments"` | Writes `step-N-request.json` / `step-N-response.json` attachment files (full content) |
| `"both"` | Emits both parameter rows and attachments |
| (omitted) | No payload data in the report — original behavior |

#### What each component stamps

| Component | Step type | Metadata keys |
|-----------|-----------|---------------|
| `Client` | `request` | `request` (resolved request body) |
| `Client` | `onResponse` / `waitResponse` | `response` (awaited response) |
| `Server` | `onRequest` / `waitRequest` | `request` (incoming) + `response` (mock or proxied result) |
| `AsyncClient` | `connect` | `payload` (when `connectParams` provided) |
| `AsyncClient` | `sendMessage` | `message` (resolved send payload) |
| `AsyncClient` | `onEvent` / `waitEvent` | `message` (incoming event payload) |
| `AsyncServer` | `onMessage` / `waitMessage` | `message` (incoming client message) |
| `AsyncServer` | `sendEvent` / `broadcast` | `message` (outgoing payload) |
| `Publisher` | `publish` / `publishBatch` | `message` (resolved payload / batch array) |
| `Subscriber` | `onMessage` / `waitMessage` | `message` (incoming MQ message) |
| `DataSource` | `exec` | `request` (description or `callback.toString()`) + `response` (callback result) |

Steps without a payload (e.g. `assert`, `wait`, `disconnect`) produce no payload rows or attachments — only the standard `component` parameter.

> **Note:** `Interaction` recording (`TestScenario({ recording: true })`) is a separate facility that populates `TestResult.interactions`. The reporter's `includePayloads` does **not** depend on it.

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
