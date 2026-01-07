/**
 * MongoDB Adapter Types
 *
 * Configuration and types for the MongoDB adapter.
 */

import type { MongoClientOptions } from "mongodb";

/**
 * MongoDB adapter configuration
 */
export interface MongoAdapterConfig {
  /** MongoDB connection URI (e.g., "mongodb://localhost:27017") */
  uri?: string;
  /** MongoDB host (default: "localhost") - used if uri is not provided */
  host?: string;
  /** MongoDB port (default: 27017) - used if uri is not provided */
  port?: number;
  /** Database name to connect to */
  database?: string;
  /** Authentication username */
  username?: string;
  /** Authentication password */
  password?: string;
  /** Authentication source database (default: "admin") */
  authSource?: string;
  /** Replica set name */
  replicaSet?: string;
  /** Maximum connection pool size (default: 10) */
  maxPoolSize?: number;
  /** Minimum connection pool size (default: 0) */
  minPoolSize?: number;
  /** Connection timeout in milliseconds (default: 30000) */
  connectTimeoutMS?: number;
  /** Socket timeout in milliseconds */
  socketTimeoutMS?: number;
  /** Server selection timeout in milliseconds (default: 30000) */
  serverSelectionTimeoutMS?: number;
  /** Heartbeat frequency in milliseconds (default: 10000) */
  heartbeatFrequencyMS?: number;
  /** Enable TLS/SSL connection */
  tls?: boolean;
  /** Application name for connection identification */
  appName?: string;
  /** Additional MongoDB client options */
  options?: MongoClientOptions;
}
