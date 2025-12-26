/**
 * Recording Types
 *
 * Types for recording message flows during test execution.
 */

/**
 * Interaction status
 */
export type InteractionStatus = "pending" | "completed" | "failed" | "timeout";

/**
 * Interaction record for recording message flows
 */
export interface Interaction {
	id: string;
	serviceName: string;
	messageType: string;
	protocol: string;
	direction: "downstream" | "upstream";
	traceId?: string;
	requestTimestamp: number;
	responseTimestamp?: number;
	requestPayload?: unknown;
	responsePayload?: unknown;
	status: InteractionStatus;
	duration?: number;
	error?: string;
}

/**
 * Filter for querying interactions
 */
export interface InteractionFilter {
	serviceName?: string;
	messageType?: string;
	traceId?: string;
	direction?: "downstream" | "upstream";
	status?: InteractionStatus;
	protocol?: string;
	startTime?: number;
	endTime?: number;
	filter?: (interaction: Interaction) => boolean;
}
