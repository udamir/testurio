/**
 * AsyncServer Component - Async server for mock/proxy modes (WebSocket, TCP, gRPC streams).
 *
 * Modes:
 * - Mock: No targetAddress - generates responses via handlers
 * - Proxy: With targetAddress - forwards to target, can intercept/transform
 *
 * Message handling modes:
 * - onMessage (non-strict): Works regardless of timing
 * - waitMessage (strict): Error if message arrives before step starts
 *
 * Key features:
 * - Connection tracking via _connections Map
 * - Proxy connection pairs with ready Promise for backend connection
 * - Same connectionId propagated through proxy chain
 * - Default proxy behavior: forward as-is when no hook
 */

import type {
	Address,
	IAsyncClientAdapter,
	IAsyncProtocol,
	IAsyncServerAdapter,
	Message,
	TlsConfig,
} from "../../protocols/base";
import type { ITestCaseContext } from "../base/base.types";
import type { Step, Handler } from "../base/step.types";
import type { Hook } from "../base/hook.types";
import { ServiceComponent } from "../base/service.component";
import { DropMessageError, sleep } from "../base/base.utils";
import { AsyncServerStepBuilder } from "./async-server.step-builder";
import type { ServerHandlerContext } from "./async-server.types";
import { createDeferred, type Deferred } from "../../utils";

interface IncomingMessage {
	type: string;
	payload: unknown;
}

/**
 * Connection pair for proxy mode.
 * Links client connection to backend connection.
 */
interface ConnectionPair {
	client: IAsyncClientAdapter;
	backend: IAsyncClientAdapter | undefined;
	ready: Deferred<void>;
}

export interface AsyncServerOptions<P extends IAsyncProtocol = IAsyncProtocol> {
	protocol: P;
	listenAddress: Address;
	targetAddress?: Address;
	tls?: TlsConfig;
}

export class AsyncServer<P extends IAsyncProtocol = IAsyncProtocol> extends ServiceComponent<
	P,
	AsyncServerStepBuilder<P>
> {
	private readonly _listenAddress: Address;
	private readonly _targetAddress?: Address;
	private readonly _tls?: TlsConfig;
	private _serverAdapter?: IAsyncServerAdapter;

	/** All client connections (mock and proxy modes) */
	private _connections: Map<string, IAsyncClientAdapter> = new Map();

	/** Connection pairs for proxy mode (clientConnId -> pair) */
	private _connectionPairs: Map<string, ConnectionPair> = new Map();

	/** Link ID mapping: linkId → connectionId */
	private _linkToConnection: Map<string, string> = new Map();

	/** Reverse link mapping: connectionId → linkId */
	private _connectionToLink: Map<string, string> = new Map();

	/** Disconnect handlers: linkId → handler */
	private _disconnectHandlers: Map<string, () => void> = new Map();

	/** Consumed onConnection hooks (step IDs that have already linked) */
	private _consumedConnectionHooks: Set<string> = new Set();

	constructor(name: string, options: AsyncServerOptions<P>) {
		super(name, options.protocol);
		this._listenAddress = options.listenAddress;
		this._targetAddress = options.targetAddress;
		this._tls = options.tls;
	}

	static create<P extends IAsyncProtocol>(name: string, options: AsyncServerOptions<P>): AsyncServer<P> {
		return new AsyncServer<P>(name, options);
	}

	createStepBuilder(context: ITestCaseContext): AsyncServerStepBuilder<P> {
		return new AsyncServerStepBuilder<P>(context, this);
	}

	get isProxy(): boolean {
		return this._targetAddress !== undefined;
	}

	// =========================================================================
	// Hook Registration
	// =========================================================================

	async registerHook(step: Step): Promise<Hook> {
		const withPending =
			step.type === "waitMessage" ||
			step.type === "waitConnection" ||
			step.type === "waitDisconnect";
		return super.registerHook(step, withPending);
	}

	// =========================================================================
	// Link Management
	// =========================================================================

	/**
	 * Link a connection to a string identifier.
	 * Called by link() handler execution.
	 */
	linkConnection(connectionId: string, linkId: string): void {
		this._linkToConnection.set(linkId, connectionId);
		this._connectionToLink.set(connectionId, linkId);
	}

	/**
	 * Get connectionId for a link ID.
	 */
	getConnectionId(linkId: string): string | undefined {
		return this._linkToConnection.get(linkId);
	}

	/**
	 * Get link ID for a connectionId.
	 */
	getLinkId(connectionId: string): string | undefined {
		return this._connectionToLink.get(connectionId);
	}

	/**
	 * Register a disconnect handler for a linked connection.
	 */
	registerDisconnectHandler(linkId: string, handler: () => void): void {
		this._disconnectHandlers.set(linkId, handler);
	}

	// =========================================================================
	// Step Execution
	// =========================================================================

	async executeStep(step: Step): Promise<void> {
		switch (step.type) {
			case "onMessage":
			case "onEvent":
			case "onConnection":
			case "onDisconnect":
				// Hook steps are no-op - triggered by incoming messages/events/connections
				break;
			case "waitMessage":
				return this.executeWaitMessage(step);
			case "waitConnection":
				return this.executeWaitConnection(step);
			case "waitDisconnect":
				return this.executeWaitDisconnect(step);
			case "sendEvent":
				return this.executeSendEvent(step);
			case "broadcast":
				return this.executeBroadcast(step);
			case "disconnect":
				return this.executeDisconnect(step);
			default:
				throw new Error(`Unknown step type: ${step.type} for AsyncServer ${this.name}`);
		}
	}

	private async executeWaitMessage(step: Step): Promise<void> {
		const params = step.params as {
			messageType: string;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitMessage: ${params.messageType}`);
		}

		// Strict ordering check for waitMessage
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Message arrived before waitMessage started. ` +
					`Step: ${step.id}, messageType: ${params.messageType}. ` +
					`Use onMessage() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for handleIncomingMessage to resolve (after executing handlers)
			await this.awaitHook(hook, timeout);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	private async executeWaitConnection(step: Step): Promise<void> {
		const params = step.params as {
			linkId: string;
			matcher?: (protocolContext: unknown) => boolean;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitConnection: ${params.linkId}`);
		}

		// Strict ordering check for waitConnection
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Connection arrived before waitConnection started. ` +
					`Step: ${step.id}, linkId: ${params.linkId}. ` +
					`Use onConnection() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for handleNewConnection to resolve (after linking)
			await this.awaitHook(hook, timeout);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	private async executeWaitDisconnect(step: Step): Promise<void> {
		const params = step.params as {
			linkId: string;
			timeout?: number;
		};
		const timeout = params.timeout ?? 5000;

		const hook = this.findHookByStepId(step.id);
		if (!hook) {
			throw new Error(`No hook found for waitDisconnect: ${params.linkId}`);
		}

		// Strict ordering check for waitDisconnect
		if (hook.resolved) {
			throw new Error(
				`Strict ordering violation: Disconnect happened before waitDisconnect started. ` +
					`Step: ${step.id}, linkId: ${params.linkId}. ` +
					`Use onDisconnect() if ordering doesn't matter.`
			);
		}

		try {
			// Wait for disconnect handler to resolve
			await this.awaitHook(hook, timeout);

			// Execute handlers (e.g., assert)
			await this.executeHandlers(step, undefined);
		} finally {
			if (!hook.persistent) {
				this.removeHook(hook.id);
			}
		}
	}

	private async executeSendEvent(step: Step): Promise<void> {
		const params = step.params as {
			linkId: string;
			eventType: string;
			payload: unknown;
		};

		const message: Message = {
			type: params.eventType,
			payload: params.payload,
		};

		// Resolve linkId to connectionId
		const connectionId = this.getConnectionId(params.linkId);
		if (!connectionId) {
			throw new Error(`Link ID "${params.linkId}" is not linked to any connection`);
		}

		const connection = this._connections.get(connectionId);
		if (!connection) {
			throw new Error(`Connection for link ID "${params.linkId}" not found`);
		}
		await connection.send(message);
	}

	private async executeBroadcast(step: Step): Promise<void> {
		const params = step.params as {
			eventType: string;
			payload: unknown;
		};

		const message: Message = {
			type: params.eventType,
			payload: params.payload,
		};

		// Send to all connections
		const sendPromises: Promise<void>[] = [];
		for (const connection of this._connections.values()) {
			sendPromises.push(connection.send(message));
		}
		await Promise.all(sendPromises);
	}

	private async executeDisconnect(step: Step): Promise<void> {
		const params = step.params as { linkId: string };

		const connectionId = this.getConnectionId(params.linkId);
		if (!connectionId) {
			throw new Error(`Link ID "${params.linkId}" is not linked to any connection`);
		}

		const connection = this._connections.get(connectionId);
		if (connection) {
			// Close triggers onClose handler which handles cleanup and disconnect callbacks
			await connection.close();
		}
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	/**
	 * Handle incoming message from client.
	 * Called by connection.onMessage callback.
	 */
	private async handleIncomingMessage(message: Message, connection: IAsyncClientAdapter): Promise<void> {
		const incomingMessage: IncomingMessage = {
			type: message.type,
			payload: message.payload,
		};

		// Use connection-aware hook matching to support connectionId filtering
		const hook = this.findMatchingHookWithConnection(incomingMessage, connection.id);

		// Default proxy behavior: forward as-is when no hook
		if (!hook && this.isProxy) {
			await this.forwardMessageToBackend(message, connection.id);
			return;
		}

		if (!hook) {
			// No hook and not proxy - ignore
			return;
		}

		const step = hook.step;
		if (!step) {
			return;
		}

		const isWaitStep = step.type === "waitMessage";
		const context: ServerHandlerContext = { connectionId: connection.id };

		try {
			const result = await this.executeServerHandlers(step, incomingMessage, context);

			// If linkId param is set, link the connection
			const params = step.params as { linkId?: string } | undefined;
			if (params?.linkId) {
				this.linkConnection(connection.id, params.linkId);
			}

			// Notify wait step that handling is complete
			if (isWaitStep) {
				this.resolveHook(hook, undefined);
			}

			// If result is null (dropped), don't forward
			if (result === null) {
				return;
			}

			// In proxy mode, forward to backend if proxy() handler was used
			if (this.isProxy && this.hasProxyHandler(step)) {
				await this.forwardMessageToBackend(
					{ type: result.type, payload: result.payload },
					connection.id
				);
			}
		} catch (error) {
			// Notify wait step of error
			if (isWaitStep) {
				this.rejectHook(hook, error instanceof Error ? error : new Error(String(error)));
			}

			if (error instanceof DropMessageError) {
				return;
			}
			if (error instanceof Error) {
				this.trackUnhandledError(error);
			}
			throw error;
		}
	}

	/**
	 * Handle event from backend (proxy mode).
	 * Called by backend connection.onMessage callback.
	 */
	private async handleBackendEvent(message: Message, clientConnectionId: string): Promise<void> {
		const eventMessage: IncomingMessage = {
			type: message.type,
			payload: message.payload,
		};

		// Use connection-aware hook matching to support connectionId filtering
		const hook = this.findMatchingHookWithConnection(eventMessage, clientConnectionId);

		// Get the client connection
		const pair = this._connectionPairs.get(clientConnectionId);
		if (!pair) {
			return;
		}

		// Default proxy behavior: forward as-is when no hook
		if (!hook) {
			await pair.client.send(message);
			return;
		}

		const step = hook.step;
		if (!step) {
			await pair.client.send(message);
			return;
		}

		const context: ServerHandlerContext = { connectionId: clientConnectionId };

		try {
			const result = await this.executeServerHandlers(step, eventMessage, context);

			// If result is null (dropped), don't forward
			if (result === null) {
				return;
			}

			// Forward transformed event to client
			await pair.client.send({ type: result.type, payload: result.payload });
		} catch (error) {
			if (error instanceof DropMessageError) {
				return;
			}
			if (error instanceof Error) {
				this.trackUnhandledError(error);
			}
			throw error;
		}
	}

	/**
	 * Forward message to backend (proxy mode).
	 * Waits for backend connection to be ready before forwarding.
	 */
	private async forwardMessageToBackend(message: Message, clientConnectionId: string): Promise<void> {
		const pair = this._connectionPairs.get(clientConnectionId);
		if (!pair) {
			throw new Error(`No connection pair found for ${clientConnectionId}`);
		}

		// Wait for backend connection to be ready
		await pair.ready.promise;

		// Forward message (backend is guaranteed to be set after ready resolves)
		if (!pair.backend) {
			throw new Error(`Backend connection not available for ${clientConnectionId}`);
		}
		await pair.backend.send(message);
	}

	/**
	 * Check if step has a proxy() handler.
	 */
	private hasProxyHandler(step: Step): boolean {
		return step.handlers.some((h) => h.type === "proxy");
	}

	/**
	 * Execute handlers for server step.
	 * Returns transformed message or null if dropped.
	 */
	private async executeServerHandlers(
		step: Step,
		message: IncomingMessage,
		context: ServerHandlerContext
	): Promise<IncomingMessage | null> {
		let payload = message.payload;
		let resultType = message.type;

		for (const handler of step.handlers) {
			const result = await this.executeHandler(handler, payload, context);

			if (result === null) {
				return null;
			}

			if (result !== undefined) {
				payload = result;
			}
		}

		return { type: resultType, payload };
	}

	// =========================================================================
	// Hook Matching
	// =========================================================================

	/**
	 * Find matching hook with linkId filtering.
	 * If a hook specifies linkId, only messages from that linked connection will match.
	 */
	private findMatchingHookWithConnection(message: unknown, connectionId: string): ReturnType<typeof this.findMatchingHook> {
		for (const hook of this.hooks) {
			// Check linkId filter if specified in step params
			const params = hook.step?.params as { linkId?: string } | undefined;
			if (params?.linkId) {
				// Get the connectionId for this linkId
				const linkedConnId = this.getConnectionId(params.linkId);

				if (linkedConnId !== connectionId) {
					// Skip this hook - linkId doesn't match this connection
					continue;
				}
			}

			try {
				if (hook.isMatch(message)) {
					return hook;
				}
			} catch {
				// Matcher error = no match
			}
		}
		return null;
	}

	/**
	 * Find hooks of a specific type (for connection hooks).
	 */
	private findHooksByType(stepType: string): ReturnType<typeof this.findMatchingHook>[] {
		const matches: ReturnType<typeof this.findMatchingHook>[] = [];
		for (const hook of this.hooks) {
			if (hook.step?.type === stepType) {
				matches.push(hook);
			}
		}
		return matches;
	}

	/**
	 * Execute connection hook handlers.
	 * Used for onConnection and onDisconnect hooks.
	 *
	 * @param stepType - "onConnection" or "onDisconnect"
	 * @param connectionId - Internal connection ID (for linking)
	 * @param protocolContext - Protocol-specific context (passed to matchers/handlers)
	 */
	private async executeConnectionHooks(stepType: string, connectionId: string, protocolContext: unknown): Promise<void> {
		const hooks = this.findHooksByType(stepType);

		for (const hook of hooks) {
			if (!hook?.step) continue;

			const stepId = hook.step.id;

			// For onConnection hooks, skip if already consumed (order-based linking)
			if (stepType === "onConnection" && this._consumedConnectionHooks.has(stepId)) {
				continue;
			}

			// Check matcher if specified (receives only protocol context)
			const params = hook.step.params as { matcher?: (ctx: unknown) => boolean; linkId?: string } | undefined;
			if (params?.matcher) {
				try {
					if (!params.matcher(protocolContext)) {
						continue; // Matcher didn't match, skip this hook
					}
				} catch {
					continue; // Matcher error = no match
				}
			}

			// If linkId param is set (for onConnection), link the connection and mark as consumed
			if (params?.linkId && stepType === "onConnection") {
				this.linkConnection(connectionId, params.linkId);
				this._consumedConnectionHooks.add(stepId);
				return; // Only one onConnection hook per connection
			}
		}
	}

	/**
	 * Handle waitConnection steps when a new connection arrives.
	 * Finds matching waitConnection steps and resolves their pending promises.
	 */
	private handleWaitConnectionSteps(connectionId: string, protocolContext: unknown): void {
		const hooks = this.findHooksByType("waitConnection");

		for (const hook of hooks) {
			if (!hook?.step) continue;

			const stepId = hook.step.id;

			// Skip if already consumed (only one connection per waitConnection)
			if (this._consumedConnectionHooks.has(stepId)) {
				continue;
			}

			// Skip if already resolved
			if (hook.resolved) {
				continue;
			}

			// Check matcher if specified
			const params = hook.step.params as {
				linkId: string;
				matcher?: (ctx: unknown) => boolean;
			};

			if (params.matcher) {
				try {
					if (!params.matcher(protocolContext)) {
						continue; // Matcher didn't match, skip this hook
					}
				} catch {
					continue; // Matcher error = no match
				}
			}

			// Link the connection
			this.linkConnection(connectionId, params.linkId);
			this._consumedConnectionHooks.add(stepId);

			// Resolve the hook (strict ordering check happens in executeWaitConnection)
			this.resolveHook(hook, undefined);
			return; // Only one waitConnection per connection
		}
	}

	/**
	 * Handle waitDisconnect steps when a linked connection disconnects.
	 * Finds matching waitDisconnect steps and resolves their pending promises.
	 */
	private handleWaitDisconnectSteps(linkId: string): void {
		const hooks = this.findHooksByType("waitDisconnect");

		for (const hook of hooks) {
			if (!hook?.step) continue;

			const params = hook.step.params as { linkId: string };

			// Check if this waitDisconnect is for this linkId
			if (params.linkId !== linkId) {
				continue;
			}

			// Skip if already resolved
			if (hook.resolved) {
				continue;
			}

			// Resolve the hook (strict ordering check happens in executeWaitDisconnect)
			this.resolveHook(hook, undefined);
			return; // Only one waitDisconnect per linkId
		}
	}

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		if (step.type !== "onMessage" && step.type !== "waitMessage" && step.type !== "onEvent") {
			return () => false;
		}

		const params = step.params as {
			messageType?: string;
			eventType?: string;
			matcher?: (payload: unknown) => boolean;
		};
		const targetType = params.messageType ?? params.eventType ?? "";

		return (message: unknown): boolean => {
			const msg = message as IncomingMessage;
			// First check type match
			if (msg.type !== targetType) {
				return false;
			}
			// Then check matcher if provided
			if (params.matcher) {
				try {
					return params.matcher(msg.payload);
				} catch {
					return false;
				}
			}
			return true;
		};
	}

	// =========================================================================
	// Handler Execution
	// =========================================================================

	protected async executeHandler<TContext = unknown>(
		handler: Handler,
		payload: unknown,
		context?: TContext
	): Promise<unknown> {
		const params = handler.params as Record<string, unknown>;
		const serverContext = context as ServerHandlerContext | undefined;

		switch (handler.type) {
			case "assert": {
				const predicate = params.predicate as (p: unknown) => boolean | Promise<boolean>;
				const result = await predicate(payload);
				if (!result) {
					const errorMsg = handler.description
						? `Assertion failed: ${handler.description}`
						: "Assertion failed";
					throw new Error(errorMsg);
				}
				return undefined;
			}

			case "transform": {
				const transformFn = params.handler as (p: unknown) => unknown | Promise<unknown>;
				return await transformFn(payload);
			}

			case "delay": {
				const ms = params.ms as number | (() => number);
				const delayMs = typeof ms === "function" ? ms() : ms;
				await sleep(delayMs);
				return undefined;
			}

			case "drop":
				throw new DropMessageError();

			case "proxy": {
				const transformFn = params.handler as ((p: unknown) => unknown | Promise<unknown>) | undefined;
				if (transformFn) {
					return await transformFn(payload);
				}
				return undefined;
			}

			case "mockEvent": {
				// Send event to the triggering connection (not broadcast)
				const eventType = params.eventType as string;
				const eventHandler = params.handler as (p: unknown) => unknown | Promise<unknown>;
				const eventPayload = await eventHandler(payload);

				if (serverContext?.connectionId) {
					const connection = this._connections.get(serverContext.connectionId);
					if (connection) {
						await connection.send({
							type: eventType,
							payload: eventPayload,
						});
					}
				}

				return undefined;
			}

			case "link": {
				// Link the connection to a string identifier
				const linkId = params.linkId as string;
				if (serverContext?.connectionId) {
					this.linkConnection(serverContext.connectionId, linkId);
				}
				return undefined;
			}

			default:
				return undefined;
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this._serverAdapter = await this.protocol.createServer({
			listenAddress: this._listenAddress,
			tls: this._tls,
		});

		// Set up connection handler
		this._serverAdapter.onConnection((clientConnection) => {
			this.handleNewConnection(clientConnection);
		});
	}

	/**
	 * Handle new client connection.
	 * In proxy mode, also establishes backend connection.
	 */
	private handleNewConnection(clientConnection: IAsyncClientAdapter): void {
		const connectionId = clientConnection.id;

		// Store client connection
		this._connections.set(connectionId, clientConnection);

		// Protocol context comes directly from adapter (not wrapped)
		const protocolContext = clientConnection.context;

		// Execute onConnection hooks with protocol context
		this.executeConnectionHooks("onConnection", connectionId, protocolContext).catch((error) => {
			this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
		});

		// Check for waitConnection steps and resolve matching ones
		this.handleWaitConnectionSteps(connectionId, protocolContext);

		// Set up message handler
		clientConnection.onMessage((message) => {
			this.handleIncomingMessage(message, clientConnection).catch((error) => {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			});
		});

		// Set up close handler
		clientConnection.onClose(() => {
			// Execute onDisconnect hooks before cleanup
			this.executeConnectionHooks("onDisconnect", connectionId, protocolContext).catch((error) => {
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			});

			// Call registered disconnect handler if this connection is linked
			const linkId = this.getLinkId(connectionId);
			if (linkId) {
				// Check for waitDisconnect steps and resolve matching ones
				this.handleWaitDisconnectSteps(linkId);

				const handler = this._disconnectHandlers.get(linkId);
				if (handler) {
					try {
						handler();
					} catch (error) {
						this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
					}
					this._disconnectHandlers.delete(linkId);
				}
				// Clean up link mappings
				this._linkToConnection.delete(linkId);
				this._connectionToLink.delete(connectionId);
			}

			this._connections.delete(connectionId);

			// In proxy mode, close backend connection
			const pair = this._connectionPairs.get(connectionId);
			if (pair) {
				pair.backend?.close().catch(() => {});
				this._connectionPairs.delete(connectionId);
			}
		});

		// Set up error handler
		clientConnection.onError((error) => {
			this.trackUnhandledError(error);
		});

		// In proxy mode, establish backend connection
		if (this.isProxy && this._targetAddress) {
			this.establishBackendConnection(clientConnection);
		}
	}

	/**
	 * Establish backend connection for proxy mode.
	 * Uses the same connectionId as the client connection.
	 */
	private establishBackendConnection(clientConnection: IAsyncClientAdapter): void {
		const connectionId = clientConnection.id;
		const ready = createDeferred<void>();

		// Create connection pair with pending ready state
		const pair: ConnectionPair = {
			client: clientConnection,
			backend: undefined,
			ready,
		};
		this._connectionPairs.set(connectionId, pair);

		// Start backend connection (async)
		this.protocol
			.createClient({
				targetAddress: this._targetAddress!,
				tls: this._tls,
				connectionId: connectionId, // Use same ID for consistent chain
			})
			.then((backendConnection) => {
				pair.backend = backendConnection;

				// Set up backend message handler
				backendConnection.onMessage((message) => {
					this.handleBackendEvent(message, connectionId).catch((error) => {
						this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
					});
				});

				// Set up backend close handler
				backendConnection.onClose(() => {
					// Backend closed - close client connection
					clientConnection.close().catch(() => {});
					this._connections.delete(connectionId);
					this._connectionPairs.delete(connectionId);
				});

				// Set up backend error handler
				backendConnection.onError((error) => {
					this.trackUnhandledError(error);
				});

				// Mark backend as ready
				ready.resolve();
			})
			.catch((error) => {
				// Backend connection failed
				ready.reject(error);
				clientConnection.close().catch(() => {});
				this._connections.delete(connectionId);
				this._connectionPairs.delete(connectionId);
				this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			});
	}

	protected async doStop(): Promise<void> {
		// Close all client connections (triggers onClose which closes backend connections)
		for (const connection of this._connections.values()) {
			await connection.close().catch(() => {});
		}

		// Allow time for async disconnect events to propagate before clearing state
		await sleep(10);

		this._connections.clear();
		this._connectionPairs.clear();
		this._linkToConnection.clear();
		this._connectionToLink.clear();
		this._disconnectHandlers.clear();
		this._consumedConnectionHooks.clear();

		if (this._serverAdapter) {
			await this._serverAdapter.stop();
			this._serverAdapter = undefined;
		}

		this.clearHooks();
	}
}
