# Architectural Layers

Testurio is organized into six layers with strict boundaries. Each layer has a single responsibility and communicates only with adjacent layers.

```
Execution  →  Builders  →  Hooks  →  Components  →  Protocols  →  Adapters
```

| Layer      | Document                       | Summary                                                 |
| ---------- | ------------------------------ | ------------------------------------------------------- |
| Execution  | [execution.md](execution.md)   | Test orchestration, component lifecycle, step execution |
| Builders   | [builders.md](builders.md)     | Fluent API that translates DSL into Step objects        |
| Hooks      | [hooks.md](hooks.md)           | Message interception, transformation, mocking           |
| Components | [components.md](components.md) | High-level abstractions owning adapters                 |
| Protocols  | [protocols.md](protocols.md)   | Stateless adapter factories                             |
| Adapters   | [adapters.md](adapters.md)     | Protocol-specific I/O operations                        |
