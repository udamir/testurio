/**
 * Protocol Adapters
 *
 * Core package includes only HTTP adapter (zero dependencies).
 * For other adapters, install:
 * - @testurio/adapter-grpc
 * - @testurio/adapter-ws
 * - @testurio/adapter-tcp
 */

import { HttpAdapter } from "./http-adapter";

// Types
export * from "./types";

// Base adapter
export * from "./base-adapter";
export * from "./http-adapter";

export const builtInAdapters = [["http", HttpAdapter]] as const;
