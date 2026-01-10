/**
 * Service Component
 *
 * Base class for protocol-based components (HTTP, gRPC, WebSocket, TCP).
 * Extends BaseComponent with protocol support.
 */

import type { IBaseProtocol } from "../../protocols/base";
import { BaseComponent } from "./base.component";

/**
 * Service Component class
 *
 * Extends BaseComponent with protocol support for service-based testing.
 * Use this as the base class for:
 * - AsyncServer, AsyncClient (WebSocket, TCP, gRPC streaming)
 * - SyncClient, SyncServer (HTTP, gRPC unary)
 *
 * @typeParam P - Protocol type (extends IBaseProtocol)
 * @typeParam TStepBuilder - Step builder type returned by createStepBuilder
 */
export abstract class ServiceComponent<
	P extends IBaseProtocol = IBaseProtocol,
	TStepBuilder = unknown,
> extends BaseComponent<TStepBuilder> {
	/** Protocol instance */
	readonly protocol: P;

	constructor(name: string, protocol: P) {
		super(name);
		this.protocol = protocol;
	}
}
