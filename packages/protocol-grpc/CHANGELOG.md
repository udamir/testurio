# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-19

### Added

- gRPC protocol support for Testurio
- `GrpcUnaryProtocol` - Synchronous unary request/response calls
- `GrpcStreamProtocol` - Asynchronous bidirectional streaming
- Proto schema loading with `@grpc/proto-loader`
- gRPC credentials support
- Metadata handling for gRPC calls
- Type-safe gRPC service definitions
