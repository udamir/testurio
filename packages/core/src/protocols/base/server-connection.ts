/**
 * Server Connection Implementation
 * 
 * Wraps a raw socket with handler registration and matching.
 * Used by AsyncServer to handle incoming client connections (as "incoming").
 */

import type { IServerConnection, Message } from "./base.types";
import { generateConnectionId } from "./connection.utils";

/**
 * Delegate interface for protocol-specific operations
 */
export interface ServerConnectionDelegate {
	/** Send event through the underlying socket */
	sendEvent(eventType: string, payload: unknown, traceId?: string): Promise<void>;
	/** Close the underlying socket */
	close(): Promise<void>;
	/** Check if socket is connected */
	isConnected(): boolean;
}

/**
 * Server connection wrapper implementation
 */
export class ServerConnectionImpl implements IServerConnection {
	readonly id: string;

	private _isConnected = true;
	private messageHandler?: (message: Message) => void | Promise<void>;
	private closeHandlers: (() => void)[] = [];
	private errorHandlers: ((error: Error) => void)[] = [];
	private delegate: ServerConnectionDelegate;

	constructor(delegate: ServerConnectionDelegate, id?: string) {
		this.id = id ?? generateConnectionId("server");
		this.delegate = delegate;
	}

	get isConnected(): boolean {
		return this._isConnected && this.delegate.isConnected();
	}

	onMessage<T = unknown>(
		handler: (message: Message<T>) => void | Promise<void>,
	): void {
		this.messageHandler = handler as (message: Message) => void | Promise<void>;
	}

	async sendEvent<T = unknown>(
		eventType: string,
		payload: T,
		traceId?: string,
	): Promise<void> {
		if (!this.isConnected) {
			throw new Error("Connection is closed");
		}
		await this.delegate.sendEvent(eventType, payload, traceId);
	}

	async close(): Promise<void> {
		if (!this._isConnected) {
			return;
		}
		this._isConnected = false;
		await this.delegate.close();
	}

	onClose(handler: () => void): void {
		this.closeHandlers.push(handler);
	}

	onError(handler: (error: Error) => void): void {
		this.errorHandlers.push(handler);
	}

	// =========================================================================
	// Internal methods (called by protocol)
	// =========================================================================

	/**
	 * Dispatch incoming message to the handler
	 * Called by protocol when a message is received from the client
	 */
	_dispatchMessage(message: Message): void {
		if (this.messageHandler) {
			Promise.resolve(this.messageHandler(message)).catch((error) => {
				this._notifyError(error instanceof Error ? error : new Error(String(error)));
			});
		}
	}

	/**
	 * Notify all close handlers
	 * Called by protocol when the connection is closed
	 */
	_notifyClose(): void {
		this._isConnected = false;
		for (const handler of this.closeHandlers) {
			try {
				handler();
			} catch {
				// Ignore errors in close handlers
			}
		}
	}

	/**
	 * Notify all error handlers
	 * Called by protocol when an error occurs
	 */
	_notifyError(error: Error): void {
		for (const handler of this.errorHandlers) {
			try {
				handler(error);
			} catch {
				// Ignore errors in error handlers
			}
		}
	}
}
