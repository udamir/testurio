# @testurio/cli

CLI for [Testurio](https://github.com/udamir/testurio) - generate type-safe Zod schemas and service interfaces from OpenAPI specs and `.proto` files.

## Installation

```bash
npm install @testurio/cli --save-dev
# or
pnpm add @testurio/cli --save-dev
```

## Quick Start

```bash
# Create a starter testurio.config.ts
testurio init

# Generate schemas from config
testurio generate

# Or pass files directly (type auto-detected from extension)
testurio generate api.yaml service.proto

# Directory input (scans for supported files)
testurio generate ./api/

# With output directory
testurio generate api.yaml service.proto -o ./generated/
```

## Commands

### `generate`

Generate TypeScript types and Zod schemas from API specifications.

```
testurio generate [inputs...] [options]
```

| Argument / Option     | Description                                                                          |
| --------------------- | ------------------------------------------------------------------------------------ |
| `[inputs...]`         | Input files or directories (`.yaml`, `.yml`, `.json` for OpenAPI; `.proto` for gRPC) |
| `-c, --config <path>` | Path to config file                                                                  |
| `-o, --output <path>` | Output file or directory (default: `{input}.types.ts`)                               |
| `--quiet`             | Suppress non-error output                                                            |
| `--verbose`           | Enable debug output                                                                  |

When `inputs` are provided, the CLI runs in **inline mode** — no config file needed. When omitted, it loads the config file.

**Examples:**

```bash
# Single file
testurio generate openapi.yaml

# Multiple files
testurio generate api.yaml user.proto chat.proto

# Directory (all supported files)
testurio generate ./specs/

# Custom output
testurio generate api.yaml -o ./generated/api.types.ts

# Multiple files with output directory
testurio generate api.yaml service.proto -o ./generated/
```

### `init`

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

| Option                        | Type      | Default            | Description                                     |
| ----------------------------- | --------- | ------------------ | ----------------------------------------------- |
| `input`                       | `string`  | —                  | Path to OpenAPI spec (`.yaml`, `.yml`, `.json`) |
| `output`                      | `string`  | `{input}.types.ts` | Output file path                                |
| `options.zod.strict.response` | `boolean` | —                  | Enable strict mode for response schemas         |
| `options.zod.strict.body`     | `boolean` | —                  | Enable strict mode for body schemas             |
| `options.zod.coerce.query`    | `boolean` | —                  | Enable coercion for query parameters            |
| `options.zod.coerce.params`   | `boolean` | —                  | Enable coercion for path parameters             |
| `options.operationsMap`       | `boolean` | `true`             | Generate operations map                         |
| `options.errorSchemaName`     | `string`  | —                  | Name for error response schema                  |

### gRPC Source Options

| Option                        | Type                 | Default              | Description                              |
| ----------------------------- | -------------------- | -------------------- | ---------------------------------------- |
| `input`                       | `string \| string[]` | —                    | Path(s) to `.proto` file(s)              |
| `output`                      | `string`             | `{input}.types.ts`   | Output file path                         |
| `options.services`            | `string[]`           | all                  | Filter to specific service names         |
| `options.streaming`           | `boolean`            | `true`               | Generate streaming types                 |
| `options.includeDirs`         | `string[]`           | —                    | Additional proto include directories     |
| `options.metadata.optionName` | `string`             | `"required_headers"` | Custom method option for metadata typing |

## Auto-Detection

Source type is determined automatically from file extension — no `type` field needed in config:

| Extension                | Source Type |
| ------------------------ | ----------- |
| `.yaml`, `.yml`, `.json` | OpenAPI     |
| `.proto`                 | gRPC        |

## Generated Output

The generator produces TypeScript files with Zod schemas and service interfaces compatible with Testurio protocols:

```typescript
// Generated from OpenAPI → use with HttpProtocol<PetStoreApi>()
export interface PetStoreApi {
  listPets: {
    request: { method: 'GET'; path: '/pets' };
    response: { code: 200; body: z.infer<typeof listPetsResponse>[] };
  };
}

// Generated from .proto → use with GrpcUnaryProtocol<UserService>()
export interface UserService {
  GetUser: {
    request: z.infer<typeof getUserRequestSchema>;
    response: z.infer<typeof getUserResponseSchema>;
    metadata: z.infer<typeof getUserMetadataSchema>;
  };
}
```

## Programmatic API

The package exports its core utilities for programmatic usage:

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

## License

MIT
