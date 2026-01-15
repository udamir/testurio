/**
 * Mock MQ Adapter for Testing
 *
 * Provides in-memory message queue adapter for unit testing
 * Publisher and Subscriber components.
 * Supports dynamic topic subscription via subscribe()/unsubscribe().
 */

import type {
	IMQAdapter,
	IMQPublisherAdapter,
	IMQSubscriberAdapter,
} from "../../packages/core/src/components/mq.base";

/**
 * Fake message type for testing.
 * This represents the adapter-specific message format.
 */
export interface FakeMessage<T = unknown> {
	readonly topic: string;
	readonly payload: T;
	readonly key?: string;
	readonly headers?: Record<string, string>;
	readonly timestamp: number;
}

/**
 * Fake publish options for testing.
 */
export interface FakePublishOptions {
	key?: string;
	headers?: Record<string, string>;
}

/**
 * Fake batch message for testing.
 */
export interface FakeBatchMessage<T = unknown> {
	payload: T;
	key?: string;
	headers?: Record<string, string>;
}

/**
 * Options for creating fake MQ adapter
 */
export interface FakeMQAdapterOptions {
	/** Simulate connection failure */
	failOnConnect?: boolean;
	/** Simulate publish failure */
	failOnPublish?: boolean;
	/** Delay operations by ms */
	operationDelay?: number;
}

/**
 * In-memory message broker for testing
 */
export class InMemoryBroker {
	private topics: Map<string, FakeMessage[]> = new Map();
	private subscribers: Map<string, Set<(topic: string, message: FakeMessage) => void>> = new Map();

	publish(topic: string, message: FakeMessage): void {
		// Store message
		if (!this.topics.has(topic)) {
			this.topics.set(topic, []);
		}
		this.topics.get(topic)?.push(message);

		// Notify subscribers (pass topic separately as per new interface)
		const handlers = this.subscribers.get(topic);
		if (handlers) {
			for (const handler of handlers) {
				handler(topic, message);
			}
		}
	}

	subscribe(topic: string, handler: (topic: string, message: FakeMessage) => void): () => void {
		if (!this.subscribers.has(topic)) {
			this.subscribers.set(topic, new Set());
		}
		this.subscribers.get(topic)?.add(handler);

		return () => {
			this.subscribers.get(topic)?.delete(handler);
		};
	}

	getMessages(topic: string): FakeMessage[] {
		return this.topics.get(topic) ?? [];
	}

	clear(): void {
		this.topics.clear();
		this.subscribers.clear();
	}
}

/**
 * Mock publisher adapter
 */
class FakeMQPublisherAdapter implements IMQPublisherAdapter<FakePublishOptions, FakeBatchMessage> {
	private _isConnected = true;

	constructor(
		private readonly broker: InMemoryBroker,
		private readonly options: FakeMQAdapterOptions = {}
	) {}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async publish(topic: string, payload: unknown, options?: FakePublishOptions): Promise<void> {
		if (this.options.operationDelay) {
			await new Promise((resolve) => setTimeout(resolve, this.options.operationDelay));
		}

		if (this.options.failOnPublish) {
			throw new Error("Publish failed");
		}

		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		const message: FakeMessage = {
			topic,
			payload,
			key: options?.key,
			headers: options?.headers,
			timestamp: Date.now(),
		};

		this.broker.publish(topic, message);
	}

	async publishBatch(topic: string, messages: FakeBatchMessage[]): Promise<void> {
		for (const msg of messages) {
			await this.publish(topic, msg.payload, { key: msg.key, headers: msg.headers });
		}
	}

	async close(): Promise<void> {
		this._isConnected = false;
	}
}

/**
 * Mock subscriber adapter with dynamic topic subscription
 */
class FakeMQSubscriberAdapter implements IMQSubscriberAdapter<FakeMessage> {
	readonly id: string;
	private _isConnected = true;
	private messageHandler?: (topic: string, message: FakeMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;
	private unsubscribes: Map<string, () => void> = new Map();
	private subscribedTopics: Set<string> = new Set();

	constructor(private readonly broker: InMemoryBroker) {
		this.id = `fake-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async subscribe(topic: string): Promise<void> {
		if (this.subscribedTopics.has(topic)) {
			return; // Already subscribed
		}

		const unsubscribe = this.broker.subscribe(topic, (t, message) => {
			if (this.messageHandler && this._isConnected) {
				this.messageHandler(t, message);
			}
		});

		this.unsubscribes.set(topic, unsubscribe);
		this.subscribedTopics.add(topic);
	}

	async unsubscribe(topic: string): Promise<void> {
		const unsubscribe = this.unsubscribes.get(topic);
		if (unsubscribe) {
			unsubscribe();
			this.unsubscribes.delete(topic);
			this.subscribedTopics.delete(topic);
		}
	}

	getSubscribedTopics(): string[] {
		return Array.from(this.subscribedTopics);
	}

	onMessage(handler: (topic: string, message: FakeMessage) => void): void {
		this.messageHandler = handler;
	}

	onError(handler: (error: Error) => void): void {
		this.errorHandler = handler;
	}

	onDisconnect(handler: () => void): void {
		this.disconnectHandler = handler;
	}

	async close(): Promise<void> {
		for (const unsub of this.unsubscribes.values()) {
			unsub();
		}
		this.unsubscribes.clear();
		this.subscribedTopics.clear();
		this._isConnected = false;
		this.disconnectHandler?.();
	}

	// Test helper: simulate error
	simulateError(error: Error): void {
		this.errorHandler?.(error);
	}

	// Test helper: simulate disconnect
	simulateDisconnect(): void {
		this._isConnected = false;
		this.disconnectHandler?.();
	}
}

/**
 * Mock MQ adapter for testing
 */
export class FakeMQAdapter implements IMQAdapter<FakeMessage, FakePublishOptions, FakeBatchMessage> {
	readonly type = "fake";
	readonly broker: InMemoryBroker;
	private subscriberAdapters: FakeMQSubscriberAdapter[] = [];

	constructor(
		broker?: InMemoryBroker,
		private readonly options: FakeMQAdapterOptions = {}
	) {
		this.broker = broker ?? new InMemoryBroker();
	}

	async createPublisher(): Promise<IMQPublisherAdapter<FakePublishOptions, FakeBatchMessage>> {
		if (this.options.failOnConnect) {
			throw new Error("Connection failed");
		}

		if (this.options.operationDelay) {
			await new Promise((resolve) => setTimeout(resolve, this.options.operationDelay));
		}

		return new FakeMQPublisherAdapter(this.broker, this.options);
	}

	async createSubscriber(): Promise<IMQSubscriberAdapter<FakeMessage>> {
		if (this.options.failOnConnect) {
			throw new Error("Connection failed");
		}

		if (this.options.operationDelay) {
			await new Promise((resolve) => setTimeout(resolve, this.options.operationDelay));
		}

		const adapter = new FakeMQSubscriberAdapter(this.broker);
		this.subscriberAdapters.push(adapter);
		return adapter;
	}

	async dispose(): Promise<void> {
		for (const sub of this.subscriberAdapters) {
			await sub.close();
		}
		this.subscriberAdapters = [];
	}

	// Test helper: get subscriber adapters for simulating events
	getSubscriberAdapters(): FakeMQSubscriberAdapter[] {
		return this.subscriberAdapters;
	}
}

/**
 * Create a fake MQ adapter for testing
 */
export function createFakeMQAdapter(broker?: InMemoryBroker, options?: FakeMQAdapterOptions): FakeMQAdapter {
	return new FakeMQAdapter(broker, options);
}

/**
 * Create an in-memory broker for testing
 */
export function createInMemoryBroker(): InMemoryBroker {
	return new InMemoryBroker();
}
