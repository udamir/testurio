# @testurio/cli

CLI for generating type-safe Zod schemas and service interfaces from OpenAPI specs and `.proto` files.

```bash
npm install @testurio/cli --save-dev
```

## Commands

### `testurio generate [inputs...] [options]`

Generate TypeScript types and Zod schemas from API specifications.

| Argument / Option | Description |
|-------------------|-------------|
| `[inputs...]` | Input files or directories |
| `-c, --config <path>` | Path to config file |
| `-o, --output <path>` | Output file or directory |
| `--quiet` | Suppress non-error output |
| `--verbose` | Enable debug output |

**Examples:**

```bash
testurio generate openapi.yaml
testurio generate api.yaml user.proto chat.proto
testurio generate ./specs/
testurio generate api.yaml -o ./generated/api.schema.ts
```

### `testurio init`

Create a starter `testurio.config.ts`.

## Configuration

### defineConfig

```typescript
import { defineConfig } from '@testurio/cli';

export default defineConfig({
  generate: {
    sources: [
      {
        input: './api/openapi.yaml',
        output: './generated/api.schema.ts',
      },
      {
        input: './proto/user.proto',
        options: { services: ['UserService'] },
      },
    ],
  },
});
```

### OpenAPI Source Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string` | — | Path to OpenAPI spec |
| `output` | `string` | `{input}.schema.ts` | Output file path |
| `options.zod.strict.response` | `boolean` | — | Strict response schemas |
| `options.zod.strict.body` | `boolean` | — | Strict body schemas |
| `options.zod.coerce.query` | `boolean` | — | Coerce query parameters |
| `options.zod.coerce.params` | `boolean` | — | Coerce path parameters |
| `options.operationsMap` | `boolean` | `true` | Generate operations map |

### gRPC Source Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `input` | `string \| string[]` | — | Path(s) to `.proto` file(s) |
| `output` | `string` | `{input}.schema.ts` | Output file path |
| `options.services` | `string[]` | all | Filter services |
| `options.streaming` | `boolean` | `true` | Generate streaming types |
| `options.includeDirs` | `string[]` | — | Proto include directories |

## Auto-Detection

| Extension | Source Type |
|-----------|-------------|
| `.yaml`, `.yml`, `.json` | OpenAPI |
| `.proto` | gRPC |

## Generated Output

Each `.schema.ts` file includes:

1. **Zod schemas** — Runtime validation schemas for each operation
2. **Protocol schema bridge** — `{serviceName}Schema` object compatible with `SyncSchemaInput` / `AsyncSchemaInput`
3. **TypeScript interfaces** — For explicit generic usage

### Schema-First (Recommended)

```typescript
import { petStoreSchema } from './petstore.schema';
const protocol = new HttpProtocol({ schema: petStoreSchema });
```

### Legacy (Explicit Generic)

```typescript
import type { PetStore } from './petstore.schema';
const protocol = new HttpProtocol<PetStore>();
```

## Error Output

`testurio generate` validates every OpenAPI spec with `@apidevtools/swagger-parser` before passing it to Orval. Invalid specs are reported with JSON-pointer paths to every offending node — all in one message, so you can fix every issue in a single pass.

**Schema validation error:**

```
error: Invalid OpenAPI spec.
  Input: ./api/openapi.yaml

  Found 3 error(s):
  1. /info: must have required property 'version'
  2. /paths/~1pets/get/responses/200: must have required property 'description'
  3. /paths/~1pets/post/requestBody: must have required property 'content'

  Fix these and re-run.
```

**YAML/JSON parse error:**

```
error: Failed to parse YAML at ./api/openapi.yaml:12:5
  Implicit map keys need to be on a single line at line 12, column 5
```

**Orval failure (rare — for specs that validate but trip an Orval limitation):**

```
error: Orval failed to generate Zod schemas from OpenAPI spec.
  Input: ./api/openapi.yaml
  Cannot read properties of undefined (reading 'discriminator')

  This usually indicates a schema shape Orval cannot handle. Run `testurio generate --verbose` for the full stack.
```

## Programmatic API

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
