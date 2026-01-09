# @testurio/allure-reporter

Allure reporter for [Testurio](https://github.com/udamir/testurio) - TestOps integration.

## Installation

```bash
npm install @testurio/allure-reporter
```

## Usage

```typescript
import { TestScenario, testCase } from 'testurio';
import { AllureReporter } from '@testurio/allure-reporter';

const scenario = new TestScenario({
  name: 'API Tests',
  components: [/* ... */],
});

const reporter = new AllureReporter({
  outputDir: './allure-results',
});

scenario.addReporter(reporter);

const result = await scenario.run(testCase);
```

## Generating Reports

After running tests, generate the HTML report:

```bash
npx allure generate ./allure-results -o ./allure-report
npx allure open ./allure-report
```

## License

MIT
