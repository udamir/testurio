/**
 * WebSocket Adapter Types
 *
 * Type definitions for WebSocket adapters.
 */

import type { AdapterTypeMarker } from "testurio";

// =============================================================================
// WebSocket Protocol Definitions
// =============================================================================

/**
 * WebSocket Protocol definition - maps message types to payloads
 */
export type WsProtocolDefinition = Record<string, unknown>;

// =============================================================================
// WebSocket Adapter Type Markers
// =============================================================================

/**
 * WebSocket Adapter type marker
 * @template P - Protocol definition (message type -> payload)
 */
export interface WsAdapterTypes<
	P extends WsProtocolDefinition = WsProtocolDefinition,
> extends AdapterTypeMarker {
	readonly request: never;
	readonly response: never;
	readonly options: never;
	/** Protocol definition for type-safe messages */
	readonly protocol: P;
}
