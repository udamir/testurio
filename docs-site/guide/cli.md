# CLI

The `@testurio/cli` package generates type-safe Zod schemas and Testurio-compatible service interfaces from OpenAPI specs and `.proto` files.

## Installation

```bash
npm install @testurio/cli --save-dev
```

## Quick Start

```bash
# Create a starter config file
testurio init

# Generate schemas from config
testurio generate

# Or pass files directly (type auto-detected from extension)
testurio generate api.yaml service.proto

# Directory input (scans for .yaml, .yml, .json, .proto files)
testurio generate ./api/

# With output directory
testurio generate api.yaml service.proto -o ./generated/
```

## Commands

### `testurio generate`

Generate TypeScript types and Zod schemas from API specifications.

```
testurio generate [inputs...] [options]
```

| Argument / Option | Description |
|-------------------|-------------|
| `[inputs...]` | Input files or directories |
| `-c, --config <path>` | Path to config file |
| `-o, --output <path>` | Output file or directory (default: `{input}.schema.ts`) |
| `--quiet` | Suppress non-error output |
| `--verbose` | Enable debug output |

When `inputs` are provided, the CLI runs in **inline mode** — no config file needed. When omitted, it loads the config file.

### `testurio init`

Create a starter `testurio.config.ts` in the current directory.

```bash
testurio init
```

## Configuration

Create a `testurio.config.ts` (or `.js`, `.mjs`, `.cjs`) in your project root:

```typescript
import { defineConfig } from '@testurio/cli';

export default defineConfig({
  generate: {
    sources: [
      {
        input: './api/openapi.yaml',
      },
      {
        input: './proto/user-service.proto',
        options: {
          services: ['UserService'],
        },
      },
      {
        input: './specs/',
        output: './generated/',
      },
    ],
  },
});
```

### OpenAPI Source Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string` | — | Path to OpenAPI spec (`.yaml`, `.yml`, `.json`) |
| `output` | `string` | `{input}.schema.ts` | Output file path |
| `options.zod.strict.response` | `boolean` | — | Strict mode for response schemas |
| `options.zod.strict.body` | `boolean` | — | Strict mode for body schemas |
| `options.zod.coerce.query` | `boolean` | — | Coercion for query parameters |
| `options.zod.coerce.params` | `boolean` | — | Coercion for path parameters |
| `options.operationsMap` | `boolean` | `true` | Generate operations map |

#### Operation ID Fallback

`operationId` is optional in OpenAPI 3.x. When an operation omits it, the generator synthesizes a deterministic id from `{path + method}` so the operation still appears in the generated output — no operation is silently skipped.

The algorithm:

- If the first path segment matches `v\d+` (e.g. `/v1/...`), it is kept lowercase as a prefix.
- The HTTP method is appended in lowercase.
- The remaining path segments are appended in PascalCase. Kebab/snake/dot delimiters are split, and `{param}` braces are stripped.

Examples:

| Method  | Path                                    | Synthesized operationId        |
| ------- | --------------------------------------- | ------------------------------ |
| `GET`   | `/v1/accounts/{account-id}`             | `v1getAccountsAccountId`       |
| `POST`  | `/v1/orders`                            | `v1postOrders`                 |
| `GET`   | `/v1/server/performance`                | `v1getServerPerformance`       |
| `GET`   | `/users/{userId}`                       | `getUsersUserId`               |

Explicit `operationId` values in the source spec are preserved unchanged. If a synthesized id collides with another synthesized or explicit id, the CLI fails with an error naming both endpoints — add an explicit `operationId` to one of them.

### gRPC Source Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string \| string[]` | — | Path(s) to `.proto` file(s) |
| `output` | `string` | `{input}.schema.ts` | Output file path |
| `options.services` | `string[]` | all | Filter to specific service names |
| `options.streaming` | `boolean` | `true` | Generate streaming types |
| `options.includeDirs` | `string[]` | — | Additional proto include directories |

## Auto-Detection

Source type is determined automatically from file extension:

| Extension | Source Type |
|-----------|-------------|
| `.yaml`, `.yml`, `.json` | OpenAPI |
| `.proto` | gRPC |

## Generated Output

The generator produces `.schema.ts` files containing:

1. **Zod schemas** for request/response validation
2. **Protocol schema bridge** (`{serviceName}Schema`) compatible with Testurio protocol constructors
3. **TypeScript interfaces** for legacy explicit generic usage

### Schema-First Usage (Recommended)

```typescript
import { petStoreSchema } from './petstore.schema';

// Types inferred automatically, runtime validation enabled
const protocol = new HttpProtocol({ schema: petStoreSchema });
```

### Legacy Usage (Explicit Generic)

```typescript
import type { PetStore } from './petstore.schema';

// Compile-time types only, no runtime validation
const protocol = new HttpProtocol<PetStore>();
```

## Error Output

The OpenAPI generator validates every spec before invoking Orval, surfaces every issue at once with JSON-pointer paths, and tags YAML/JSON parse failures with file path + line:column. See the [CLI API reference](../api/cli.md#error-output) for example error messages.

## Programmatic API

The package exports core utilities for programmatic usage:

```typescript
import {
  defineConfig,
  detectSourceType,
  resolveInputs,
  loadConfig,
  createCli,
  buildSourcesFromInputs,
  resolveOutputPath,
  SUPPORTED_EXTENSIONS,
  OPENAPI_EXTENSIONS,
  PROTO_EXTENSIONS,
} from '@testurio/cli';
```
