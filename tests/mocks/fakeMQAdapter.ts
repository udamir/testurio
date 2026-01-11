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
	PublishOptions,
	QueueMessage,
} from "../../packages/core/src/components/mq.base";

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
	private topics: Map<string, QueueMessage[]> = new Map();
	private subscribers: Map<string, Set<(message: QueueMessage) => void>> = new Map();

	publish(topic: string, message: QueueMessage): void {
		// Store message
		if (!this.topics.has(topic)) {
			this.topics.set(topic, []);
		}
		this.topics.get(topic)?.push(message);

		// Notify subscribers
		const handlers = this.subscribers.get(topic);
		if (handlers) {
			for (const handler of handlers) {
				handler(message);
			}
		}
	}

	subscribe(topic: string, handler: (message: QueueMessage) => void): () => void {
		if (!this.subscribers.has(topic)) {
			this.subscribers.set(topic, new Set());
		}
		this.subscribers.get(topic)?.add(handler);

		return () => {
			this.subscribers.get(topic)?.delete(handler);
		};
	}

	getMessages(topic: string): QueueMessage[] {
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
class FakeMQPublisherAdapter implements IMQPublisherAdapter {
	private _isConnected = true;

	constructor(
		private readonly broker: InMemoryBroker,
		private readonly options: FakeMQAdapterOptions = {}
	) {}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async publish<T>(topic: string, payload: T, options?: PublishOptions): Promise<void> {
		if (this.options.operationDelay) {
			await new Promise((resolve) => setTimeout(resolve, this.options.operationDelay));
		}

		if (this.options.failOnPublish) {
			throw new Error("Publish failed");
		}

		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		const message: QueueMessage<T> = {
			topic,
			payload,
			key: options?.key,
			headers: options?.headers,
			timestamp: Date.now(),
		};

		this.broker.publish(topic, message as QueueMessage);
	}

	async publishBatch<T>(
		topic: string,
		messages: Array<{ payload: T; key?: string; headers?: Record<string, string> }>
	): Promise<void> {
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
class FakeMQSubscriberAdapter implements IMQSubscriberAdapter {
	readonly id: string;
	private _isConnected = true;
	private messageHandler?: (message: QueueMessage) => void;
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

		const unsubscribe = this.broker.subscribe(topic, (message) => {
			if (this.messageHandler && this._isConnected) {
				this.messageHandler(message);
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

	onMessage(handler: (message: QueueMessage) => void): void {
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
export class FakeMQAdapter implements IMQAdapter {
	readonly type = "fake";
	readonly broker: InMemoryBroker;
	private subscriberAdapters: FakeMQSubscriberAdapter[] = [];

	constructor(
		broker?: InMemoryBroker,
		private readonly options: FakeMQAdapterOptions = {}
	) {
		this.broker = broker ?? new InMemoryBroker();
	}

	async createPublisher(): Promise<IMQPublisherAdapter> {
		if (this.options.failOnConnect) {
			throw new Error("Connection failed");
		}

		if (this.options.operationDelay) {
			await new Promise((resolve) => setTimeout(resolve, this.options.operationDelay));
		}

		return new FakeMQPublisherAdapter(this.broker, this.options);
	}

	async createSubscriber(): Promise<IMQSubscriberAdapter> {
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
