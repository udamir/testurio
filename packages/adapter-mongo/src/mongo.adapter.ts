/**
 * MongoDB Adapter
 *
 * DataSource adapter for MongoDB using the official MongoDB driver.
 * Provides connection management and native client access.
 */

import { MongoClient, type Db } from "mongodb";
import type {
  DataSourceAdapter,
  DataSourceAdapterEvents,
  Unsubscribe,
} from "testurio";
import type { MongoAdapterConfig } from "./mongo.types.js";

/**
 * MongoDB Adapter Implementation
 *
 * Wraps MongoDB client with DataSourceAdapter interface.
 * Handles connection lifecycle, events, and reconnection.
 *
 * @example
 * ```typescript
 * const adapter = new MongoAdapter({
 *   uri: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * const ds = new DataSource("mongodb", { adapter });
 * await ds.start();
 *
 * await ds.exec(async (db) => {
 *   const users = await db.collection("users").find().toArray();
 *   return users;
 * });
 * ```
 */
export class MongoAdapter
  implements DataSourceAdapter<Db, MongoAdapterConfig>
{
  readonly type = "mongodb";
  readonly config: MongoAdapterConfig;

  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connected = false;
  private eventHandlers: Map<
    keyof DataSourceAdapterEvents,
    Set<(data: unknown) => void>
  > = new Map();

  constructor(config: MongoAdapterConfig) {
    this.config = config;
  }

  /**
   * Build MongoDB connection URI from config
   */
  private buildUri(): string {
    if (this.config.uri) {
      return this.config.uri;
    }

    const host = this.config.host ?? "localhost";
    const port = this.config.port ?? 27017;
    let uri = "mongodb://";

    if (this.config.username && this.config.password) {
      uri += `${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.config.password)}@`;
    }

    uri += `${host}:${port}`;

    if (this.config.database) {
      uri += `/${this.config.database}`;
    }

    const params: string[] = [];
    if (this.config.authSource) {
      params.push(`authSource=${this.config.authSource}`);
    }
    if (this.config.replicaSet) {
      params.push(`replicaSet=${this.config.replicaSet}`);
    }
    if (params.length > 0) {
      uri += `?${params.join("&")}`;
    }

    return uri;
  }

  /**
   * Initialize the adapter and connect to MongoDB
   */
  async init(): Promise<void> {
    if (this.client) {
      throw new Error("MongoAdapter: already initialized");
    }

    const uri = this.buildUri();

    const clientOptions = {
      maxPoolSize: this.config.maxPoolSize ?? 10,
      minPoolSize: this.config.minPoolSize ?? 0,
      connectTimeoutMS: this.config.connectTimeoutMS ?? 30000,
      socketTimeoutMS: this.config.socketTimeoutMS,
      serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS ?? 30000,
      heartbeatFrequencyMS: this.config.heartbeatFrequencyMS ?? 10000,
      tls: this.config.tls,
      appName: this.config.appName,
      ...this.config.options,
    };

    this.client = new MongoClient(uri, clientOptions);

    // Set up event handlers
    this.client.on("connectionPoolCreated", () => {
      // Connection pool has been created
    });

    this.client.on("connectionPoolClosed", () => {
      this.connected = false;
      this.emit("disconnected", undefined);
    });

    this.client.on("error", (error: Error) => {
      this.emit("error", error);
    });

    try {
      await this.client.connect();

      // Get the database reference
      const dbName = this.config.database ?? "test";
      this.db = this.client.db(dbName);

      // Verify connection by running a command
      await this.db.command({ ping: 1 });

      this.connected = true;
      this.emit("connected", undefined);
    } catch (error) {
      if (this.client) {
        await this.client.close().catch(() => {});
      }
      this.client = null;
      this.db = null;
      throw error;
    }
  }

  /**
   * Dispose of the adapter and close the connection
   */
  async dispose(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
    } finally {
      this.client = null;
      this.db = null;
      this.connected = false;
      this.emit("disconnected", undefined);
    }
  }

  /**
   * Get the native MongoDB Db instance
   */
  getClient(): Db {
    if (!this.db || !this.connected) {
      throw new Error("MongoAdapter: not connected. Call init() first.");
    }
    return this.db;
  }

  /**
   * Get the underlying MongoClient instance
   * Useful for operations that need direct client access
   */
  getMongoClient(): MongoClient {
    if (!this.client || !this.connected) {
      throw new Error("MongoAdapter: not connected. Call init() first.");
    }
    return this.client;
  }

  /**
   * Check if adapter is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Subscribe to adapter events
   */
  on<K extends keyof DataSourceAdapterEvents>(
    event: K,
    handler: (data: DataSourceAdapterEvents[K]) => void
  ): Unsubscribe {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as (data: unknown) => void);
    return () => {
      this.eventHandlers.get(event)?.delete(handler as (data: unknown) => void);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit<K extends keyof DataSourceAdapterEvents>(
    event: K,
    data: DataSourceAdapterEvents[K]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }
}

/**
 * Factory function to create a MongoDB adapter
 */
export function createMongoAdapter(config: MongoAdapterConfig): MongoAdapter {
  return new MongoAdapter(config);
}
