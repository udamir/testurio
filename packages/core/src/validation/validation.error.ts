/**
 * Validation Error
 *
 * Error thrown when schema validation fails.
 * Provides structured context about what failed and where.
 */

export class ValidationError extends Error {
	readonly componentName: string;
	readonly operationId: string;
	readonly direction: string;

	constructor(
		message: string,
		options: {
			componentName: string;
			operationId: string;
			direction: string;
			cause?: unknown;
		}
	) {
		super(message, { cause: options.cause });
		this.name = "ValidationError";
		this.componentName = options.componentName;
		this.operationId = options.operationId;
		this.direction = options.direction;
	}
}
