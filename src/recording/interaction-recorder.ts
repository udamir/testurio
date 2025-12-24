/**
 * Interaction Recorder
 *
 * Records all interactions (requests/responses) during test execution.
 */

import type { Interaction, InteractionFilter, ProtocolType } from "../types";

/**
 * Generate unique interaction ID
 */
let interactionIdCounter = 0;
export function generateInteractionId(): string {
	return `interaction-${++interactionIdCounter}`;
}

/**
 * Reset interaction ID counter (for testing)
 */
export function resetInteractionIdCounter(): void {
	interactionIdCounter = 0;
}

/**
 * Interaction Recorder
 *
 * Records and manages interactions during test execution.
 */
export class InteractionRecorder {
	private interactions: Map<string, Interaction> = new Map();
	private enabled = true;

	/**
	 * Enable recording
	 */
	enable(): void {
		this.enabled = true;
	}

	/**
	 * Disable recording
	 */
	disable(): void {
		this.enabled = false;
	}

	/**
	 * Check if recording is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Start recording an interaction (request sent)
	 */
	startInteraction(params: {
		serviceName: string;
		direction: "downstream" | "upstream";
		protocol: ProtocolType;
		messageType: string;
		traceId?: string;
		requestPayload?: unknown;
	}): string {
		if (!this.enabled) {
			return "";
		}

		const id = generateInteractionId();
		const interaction: Interaction = {
			id,
			serviceName: params.serviceName,
			direction: params.direction,
			protocol: params.protocol,
			messageType: params.messageType,
			traceId: params.traceId,
			requestTimestamp: Date.now(),
			requestPayload: params.requestPayload,
			status: "pending",
		};

		this.interactions.set(id, interaction);
		return id;
	}

	/**
	 * Complete an interaction (response received)
	 */
	completeInteraction(
		id: string,
		params: {
			responsePayload?: unknown;
			status?: "completed" | "failed" | "timeout";
			error?: string;
		},
	): void {
		const interaction = this.interactions.get(id);
		if (!interaction) {
			return;
		}

		const responseTimestamp = Date.now();
		interaction.responseTimestamp = responseTimestamp;
		interaction.responsePayload = params.responsePayload;
		interaction.status = params.status || "completed";
		interaction.duration = responseTimestamp - interaction.requestTimestamp;
		interaction.error = params.error;
	}

	/**
	 * Mark an interaction as failed
	 */
	failInteraction(id: string, error: string): void {
		this.completeInteraction(id, { status: "failed", error });
	}

	/**
	 * Mark an interaction as timed out
	 */
	timeoutInteraction(id: string): void {
		this.completeInteraction(id, {
			status: "timeout",
			error: "Request timed out",
		});
	}

	/**
	 * Get all interactions
	 */
	getInteractions(): Interaction[] {
		return Array.from(this.interactions.values());
	}

	/**
	 * Get interactions matching filter
	 */
	getFilteredInteractions(filter: InteractionFilter): Interaction[] {
		return this.getInteractions().filter((interaction) => {
			if (
				filter.messageType &&
				interaction.messageType !== filter.messageType
			) {
				return false;
			}
			if (filter.direction && interaction.direction !== filter.direction) {
				return false;
			}
			if (filter.status && interaction.status !== filter.status) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Get interaction by ID
	 */
	getInteraction(id: string): Interaction | undefined {
		return this.interactions.get(id);
	}

	/**
	 * Get interactions by service name
	 */
	getInteractionsByService(serviceName: string): Interaction[] {
		return this.getInteractions().filter((i) => i.serviceName === serviceName);
	}

	/**
	 * Get interactions by trace ID
	 */
	getInteractionsByTraceId(traceId: string): Interaction[] {
		return this.getInteractions().filter((i) => i.traceId === traceId);
	}

	/**
	 * Get pending interactions
	 */
	getPendingInteractions(): Interaction[] {
		return this.getFilteredInteractions({ status: "pending" });
	}

	/**
	 * Get failed interactions
	 */
	getFailedInteractions(): Interaction[] {
		return this.getFilteredInteractions({ status: "failed" });
	}

	/**
	 * Get interaction summary
	 */
	getSummary(): {
		total: number;
		byService: Record<string, number>;
		byStatus: Record<string, number>;
		byDirection: Record<string, number>;
		averageDuration: number;
	} {
		const interactions = this.getInteractions();
		const byService: Record<string, number> = {};
		const byStatus: Record<string, number> = {};
		const byDirection: Record<string, number> = {};
		let totalDuration = 0;
		let completedCount = 0;

		for (const interaction of interactions) {
			// Count by service
			byService[interaction.serviceName] =
				(byService[interaction.serviceName] || 0) + 1;

			// Count by status
			byStatus[interaction.status] = (byStatus[interaction.status] || 0) + 1;

			// Count by direction
			byDirection[interaction.direction] =
				(byDirection[interaction.direction] || 0) + 1;

			// Sum duration for completed interactions
			if (interaction.duration !== undefined) {
				totalDuration += interaction.duration;
				completedCount++;
			}
		}

		return {
			total: interactions.length,
			byService,
			byStatus,
			byDirection,
			averageDuration: completedCount > 0 ? totalDuration / completedCount : 0,
		};
	}

	/**
	 * Clear all interactions
	 */
	clear(): void {
		this.interactions.clear();
	}

	/**
	 * Get interaction count
	 */
	get count(): number {
		return this.interactions.size;
	}
}
