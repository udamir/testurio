# @testurio/reporter-allure

Allure reporter for [Testurio](https://github.com/udamir/testurio) - converts test results to Allure-compatible format for interactive HTML reports.

## Installation

```bash
npm install @testurio/reporter-allure
# or
pnpm add @testurio/reporter-allure
```

## Usage

### Basic Usage

```typescript
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';
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

await scenario.run(getUserTest);
```

### With Metadata (BDD Hierarchy)

```typescript
const getUserTest = testCase('Get user by ID', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  // step 1 
  api.request('getUser', { method: 'GET', path: '/users/1' });

  // step 2
  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  // step 3
  api.onResponse('getUser').assert((res) => res.body.name === 'Alice');
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

### Full Configuration

```typescript
const scenario = new TestScenario({
  name: 'Full API Test Suite',
  components: [server, client],
  reporters: [
    new AllureReporter({
      // Output location
      resultsDir: './reports/allure-results',

      // Environment info (shown in report)
      environmentInfo: {
        'Node.js': process.version,
        'OS': process.platform,
        'Environment': 'CI',
        'Build': process.env.BUILD_NUMBER || 'local',
      },

      // Default labels for all tests
      labels: [
        { name: 'owner', value: 'team-api' },
        { name: 'layer', value: 'integration' },
      ],

      // Link patterns
      tmsUrlPattern: 'https://testrail.example.com/index.php?/cases/view/{id}',
      issueUrlPattern: 'https://jira.example.com/browse/{id}',

      // Default BDD hierarchy
      defaultEpic: 'E-Commerce Platform',
      defaultFeature: 'API',

      // Payload capture — JSON attachments rendered by the Allure JSON viewer
      includePayloads: 'attachments',
    }),
  ],
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resultsDir` | `string` | `"allure-results"` | Output directory for Allure results |
| `environmentInfo` | `Record<string, string>` | - | Environment info written to `environment.properties` |
| `labels` | `Label[]` | - | Default labels applied to all test cases |
| `tmsUrlPattern` | `string` | - | URL pattern for TMS links (use `{id}` placeholder) |
| `issueUrlPattern` | `string` | - | URL pattern for issue links (use `{id}` placeholder) |
| `defaultEpic` | `string` | - | Default epic for all tests |
| `defaultFeature` | `string` | - | Default feature for all tests |
| `includePayloads` | `"parameters"` \| `"attachments"` \| `"both"` | - | Include per-step request/response payloads as JSON attachments. `"parameters"` is a **deprecated** alias for `"attachments"`. |
| `maxPayloadSize` | `number` | - | **Deprecated** — no longer applied to payloads. |

### Payload Capture (`includePayloads`)

Each component stamps its request/response payloads on `step.metadata` during execution. The reporter writes one `application/json` attachment per stamped key; the Allure 3.x JSON viewer prettifies, syntax-highlights, and folds it on click.

| Mode | Effect |
|------|--------|
| `"attachments"` | Writes `step-N-request.json` / `step-N-response.json` attachment files (full content). **Canonical value.** |
| `"both"` | Alias for `"attachments"`, kept for backward compatibility. |
| `"parameters"` | **Deprecated** alias for `"attachments"` — previously rendered payloads as flat parameter rows (which the Allure UI collapses to a single-line string with no syntax highlighting). A one-time warning is emitted at reporter construction when this value is used. |
| (omitted) | No payload data — only the `component` parameter. |

Works regardless of `TestScenario({ recording: true })`. Stamped keys per component:

- **`Client`** — `request` on `request` step, `response` on `onResponse` / `waitResponse`
- **`Server`** — `request` + `response` on `onRequest` / `waitRequest` (response from mock handler or proxied call)
- **`AsyncClient`** — `message` on `sendMessage`, `onEvent`, `waitEvent`; `payload` on `connect` (when params provided)
- **`AsyncServer`** — `message` on `onMessage`, `waitMessage`, `sendEvent`, `broadcast`
- **`Publisher`** — `message` on `publish` / `publishBatch`
- **`Subscriber`** — `message` on `onMessage` / `waitMessage`
- **`DataSource`** — `request` (description or `callback.toString()`) + `response` (callback return value) on `exec`

### Per-Step Duration

Every step in the report carries `start` and `stop` timestamps, so the Allure UI shows a duration badge per step and renders an accurate timeline. No configuration required.

### Per-Step Assertions

Every `.assert(predicate)` call across the framework now records pass and fail results onto the owning step. The report renders each as a nested sub-step under the parent with its own status, the assertion description as the name, and the failure message in `statusDetails.message` on failure — so a chain of multiple `.assert()` calls on the same hook is visible per-assertion, not collapsed into a single pass/fail.

## Generating Reports

After running tests, generate the HTML report using the Allure CLI:

```bash
# Install Allure CLI (if not already installed)
npm install -g allure-commandline

# Generate HTML report from results
allure generate allure-results -o allure-report

# Open report in browser
allure open allure-report

# Or serve directly (generates and opens in one step)
allure serve allure-results
```

## Protocol Agnostic

The reporter works identically across all Testurio protocols:

- HTTP
- WebSocket
- TCP
- gRPC
- DataSource (Redis, PostgreSQL, etc.)

## Output Files

The reporter generates the following files in the results directory:

- `{uuid}-result.json` - Individual test result for each test case
- `{uuid}-container.json` - Container grouping test cases from a scenario
- `environment.properties` - Environment information (when configured)
- `step-{N}-{key}.json` - Per-step payload attachments (when `includePayloads` is `"attachments"` or `"both"`), where `{key}` is `request` / `response` / `message` / etc. depending on the component
- `{uuid}-attachment.{ext}` - Other attachment files

## License

MIT
