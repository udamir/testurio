/**
 * DataSource Testing Utilities
 *
 * Provides FakeAdapter and InMemoryClient for testing DataSource
 * without real database connections.
 */

import type { DataSourceAdapter, DataSourceAdapterEvents, Unsubscribe } from "testurio";

// =============================================================================
// In-Memory Client
// =============================================================================

/**
 * Simple in-memory client for testing
 * Provides basic key-value and query operations
 */
export interface InMemoryClient {
	/** Internal data storage */
	data: Map<string, unknown>;

	/** Get a value by key */
	get(key: string): unknown | null;

	/** Set a value by key */
	set(key: string, value: unknown): void;

	/** Delete a value by key */
	del(key: string): boolean;

	/** Simple query mock - returns empty rows by default */
	query(sql: string, params?: unknown[]): { rows: unknown[]; rowCount: number };
}

/**
 * Create an in-memory client for testing
 */
export function createInMemoryClient(): InMemoryClient {
	const data = new Map<string, unknown>();

	return {
		data,

		get(key: string): unknown | null {
			return data.get(key) ?? null;
		},

		set(key: string, value: unknown): void {
			data.set(key, value);
		},

		del(key: string): boolean {
			return data.delete(key);
		},

		query(_sql: string, _params?: unknown[]): { rows: unknown[]; rowCount: number } {
			// Default implementation returns empty result
			// Tests can override by providing custom client
			return { rows: [], rowCount: 0 };
		},
	};
}

// =============================================================================
// Fake Adapter
// =============================================================================

/**
 * Fake adapter configuration
 */
export interface FakeAdapterConfig {
	/** Optional initial connection state */
	initialConnected?: boolean;
	/** Optional delay for init/dispose operations (for testing async behavior) */
	operationDelay?: number;
	/** Whether init should fail */
	failOnInit?: boolean;
	/** Whether dispose should fail */
	failOnDispose?: boolean;
	/** Callback called during init */
	onInit?: () => void;
	/** Callback called during dispose */
	onDispose?: () => void;
}

/**
 * Create a fake adapter for testing
 *
 * @param client - Optional custom client (defaults to InMemoryClient)
 * @param config - Optional configuration
 * @returns DataSourceAdapter instance
 *
 * @example
 * // Default in-memory client
 * const adapter = createFakeAdapter();
 * const ds = new DataSource("test", { adapter });
 *
 * @example
 * // With pre-populated data
 * const client = createInMemoryClient();
 * client.set("user:1", { name: "John" });
 * const adapter = createFakeAdapter(client);
 *
 * @example
 * // Custom client for specific test needs
 * const customClient = {
 *   query: async (sql: string) => ({ rows: [{ id: 1 }], rowCount: 1 }),
 * };
 * const adapter = createFakeAdapter(customClient);
 */
export function createFakeAdapter<TClient = InMemoryClient>(
	client?: TClient,
	config?: FakeAdapterConfig
): DataSourceAdapter<TClient, FakeAdapterConfig> {
	const fakeClient = (client ?? createInMemoryClient()) as TClient;
	const adapterConfig = config ?? {};
	let connected = adapterConfig.initialConnected ?? false;
	const eventHandlers = new Map<keyof DataSourceAdapterEvents, Set<(data: unknown) => void>>();

	const emit = <K extends keyof DataSourceAdapterEvents>(event: K, data: DataSourceAdapterEvents[K]): void => {
		const handlers = eventHandlers.get(event);
		if (handlers) {
			for (const handler of handlers) {
				handler(data);
			}
		}
	};

	return {
		type: "fake",
		config: adapterConfig,

		async init(): Promise<void> {
			if (adapterConfig.operationDelay) {
				await new Promise((resolve) => setTimeout(resolve, adapterConfig.operationDelay));
			}

			if (adapterConfig.failOnInit) {
				const error = new Error("FakeAdapter: init failed (configured to fail)");
				emit("error", error);
				throw error;
			}

			connected = true;
			adapterConfig.onInit?.();
			emit("connected", undefined);
		},

		async dispose(): Promise<void> {
			if (adapterConfig.operationDelay) {
				await new Promise((resolve) => setTimeout(resolve, adapterConfig.operationDelay));
			}

			if (adapterConfig.failOnDispose) {
				const error = new Error("FakeAdapter: dispose failed (configured to fail)");
				emit("error", error);
				throw error;
			}

			connected = false;
			adapterConfig.onDispose?.();
			emit("disconnected", undefined);
		},

		getClient(): TClient {
			if (!connected) {
				throw new Error("FakeAdapter: not connected. Call init() first.");
			}
			return fakeClient;
		},

		isConnected(): boolean {
			return connected;
		},

		on<K extends keyof DataSourceAdapterEvents>(
			event: K,
			handler: (data: DataSourceAdapterEvents[K]) => void
		): Unsubscribe {
			if (!eventHandlers.has(event)) {
				eventHandlers.set(event, new Set());
			}
			eventHandlers.get(event)?.add(handler as (data: unknown) => void);

			return () => {
				eventHandlers.get(event)?.delete(handler as (data: unknown) => void);
			};
		},
	};
}
