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
| `includePayloads` | `"parameters" \| "attachments" \| "both"` | — | Include per-step request/response payloads as JSON attachments (see below). `"parameters"` is a deprecated alias for `"attachments"`. |
| `maxPayloadSize` | `number` | — | **Deprecated.** No longer applied to payloads — attachments are written at full size. |

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

  includePayloads: 'attachments',
})
```

### Per-Step Request/Response Payloads (`includePayloads`)

When `includePayloads` is set, the Allure reporter writes each step's recorded request and response payloads as `application/json` attachments. The Allure 3.x HTML report's built-in JSON viewer prettifies, syntax-highlights, and folds them on click. **Payloads come from each component's `step.metadata`** — populated by the framework during `executeStep` — so this works regardless of whether `TestScenario({ recording: true })` is enabled.

| Mode | Effect |
|------|--------|
| `"attachments"` | Writes `step-N-request.json` / `step-N-response.json` attachment files (full content). **Canonical value.** |
| `"both"` | Alias for `"attachments"`, kept for backward compatibility. |
| `"parameters"` | **Deprecated** alias for `"attachments"` — previously rendered payloads as flat parameter rows, which the Allure UI collapses to a single-line string with no syntax highlighting. A one-time warning is emitted at reporter construction when this value is used. |
| (omitted) | No payload data in the report. |

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

Steps without a payload (e.g. `assert`, `wait`, `disconnect`) produce no attachments — only the standard `component` parameter.

> **Note:** `Interaction` recording (`TestScenario({ recording: true })`) is a separate facility that populates `TestResult.interactions`. The reporter's `includePayloads` does **not** depend on it.

### Per-Step Duration

Every step in the Allure report carries `start` and `stop` timestamps, so the UI shows a per-step duration badge and renders an accurate timeline view. The values come from the framework's existing `StepExecutionResult.startTime` / `endTime` clocks — no extra configuration is required.

### Per-Step Assertions

Every `.assert(predicate)` call across the framework — on `Client.onResponse`, `Server.onRequest`, `AsyncClient.onEvent`, `AsyncServer.onMessage`, `Subscriber.onMessage`, `DataSource.exec`, plus matchers in `base/expect` — now records its result onto the owning step. The Allure report renders each recorded assertion as a **nested sub-step** beneath the step that registered it, with its own status (PASSED / FAILED), the assertion description as the name, and the failure message in `statusDetails.message` on failure.

This makes a chain of multiple `.assert()` calls on the same hook readable: a single failing matcher no longer hides the passes that came before it. Example:

```typescript
api
  .onResponse('getUsers')
  .assert('code is 200', (res) => res.code === 200)
  .assert('body has at least one user', (res) => res.body.length > 0)
  .assert('first user has id', (res) => typeof res.body[0]?.id === 'number');
```

In the Allure report, the parent `Step N: onResponse - …` step shows three nested sub-steps with their per-assertion descriptions and statuses.

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
