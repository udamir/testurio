/**
 * TCP Adapter Types
 *
 * Type definitions for TCP adapters.
 */

import type { AdapterTypeMarker } from "testurio";

// =============================================================================
// TCP Protocol Definitions
// =============================================================================

/**
 * TCP/Async Protocol definition - maps message types to payloads
 */
export type TcpProtocolDefinition = Record<string, unknown>;

// =============================================================================
// TCP Adapter Type Markers
// =============================================================================

/**
 * TCP Adapter type marker
 * @template P - Protocol definition (message type -> payload)
 */
export interface TcpAdapterTypes<
	P extends TcpProtocolDefinition = TcpProtocolDefinition,
> extends AdapterTypeMarker {
	readonly request: never;
	readonly response: never;
	readonly options: never;
	/** Protocol definition for type-safe messages */
	readonly protocol: P;
}
