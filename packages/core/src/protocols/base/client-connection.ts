/**
 * Client Connection Implementation
 * 
 * Wraps a raw socket with handler registration and matching.
 * Used by AsyncClient to communicate with servers.
 * Used by AsyncServer (proxy mode) as "outgoing" connection to backend.
 */

import type { IClientConnection, Message } from "./base.types";
import { generateConnectionId } from "./connection.utils";

/**
 * Delegate interface for protocol-specific operations
 */
export interface ClientConnectionDelegate {
	/** Send message through the underlying socket */
	sendMessage(messageType: string, payload: unknown, traceId?: string): Promise<void>;
	/** Close the underlying socket */
	close(): Promise<void>;
	/** Check if socket is connected */
	isConnected(): boolean;
}

/**
 * Client connection wrapper implementation
 */
export class ClientConnectionImpl implements IClientConnection {
	readonly id: string;

	private _isConnected = true;
	private eventHandler?: (event: Message) => void | Promise<void>;
	private closeHandlers: (() => void)[] = [];
	private errorHandlers: ((error: Error) => void)[] = [];
	private delegate: ClientConnectionDelegate;

	constructor(delegate: ClientConnectionDelegate, id?: string) {
		this.id = id ?? generateConnectionId("client");
		this.delegate = delegate;
	}

	get isConnected(): boolean {
		return this._isConnected && this.delegate.isConnected();
	}

	async sendMessage<T = unknown>(
		messageType: string,
		payload: T,
		traceId?: string,
	): Promise<void> {
		if (!this.isConnected) {
			throw new Error("Connection is closed");
		}
		await this.delegate.sendMessage(messageType, payload, traceId);
	}

	onEvent<T = unknown>(
		handler: (event: Message<T>) => void | Promise<void>,
	): void {
		this.eventHandler = handler as (event: Message) => void | Promise<void>;
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
	 * Dispatch incoming event to the handler
	 * Called by protocol when an event is received from the server
	 */
	_dispatchEvent(message: Message): void {
		if (this.eventHandler) {
			Promise.resolve(this.eventHandler(message)).catch((error) => {
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

		// Notify close handlers
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
