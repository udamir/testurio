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
