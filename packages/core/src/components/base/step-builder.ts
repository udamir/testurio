/**
 * Base Step Builder
 *
 * Abstract base class for all step builders.
 * Pure data builder - contains NO execution logic.
 * All execution logic is in the Component.
 */

import { generateId } from "../../utils";
import type { Component, ITestCaseContext } from "./base.types";
import type { Step } from "./step.types";
import type { BaseHookBuilder } from "./hook-builder";

// =============================================================================
// BaseStepBuilder
// =============================================================================

export type StepData = Omit<Step, "id" | "testCaseId" | "component">

/**
 * Base Step Builder
 *
 * Abstract base class that provides step registration functionality.
 * Subclasses implement component-specific step methods.
 *
 * Key responsibilities:
 * - Access to test phase and component
 * - Register steps with test case builder
 * - Create hook builders for steps that need handlers
 *
 * NO execution logic - all logic is in Component.
 *
 * @example
 * ```typescript
 * class MyStepBuilder extends BaseStepBuilder {
 *   myStep(data: unknown): MyHookBuilder {
 *     return this.registerStep({
 *       type: "myStep",
 *       component: this.component,
 *       params: { data },
 *       handlers: [],
 *       mode: "hook",
 *     }, MyHookBuilder);
 *   }
 * }
 * ```
 */
export abstract class BaseStepBuilder {
	/** Current test phase */
	protected readonly phase: string;

	/** Test case ID for hook isolation */
	protected readonly testCaseId?: string;

	/** Component that owns this builder */
	protected readonly component: Component;

	/** Function to register steps with test case builder */
	private readonly _registerStep: (step: Step) => void;

	constructor(context: ITestCaseContext, component: Component) {
		this.phase = context.phase;
		this.testCaseId = context.testCaseId;
		this.component = component;
		this._registerStep = context.registerStep.bind(context);
	}

	/**
	 * Component name
	 */
	get name(): string {
		return this.component.name;
	}

	/**
	 * Register a step and optionally return a hook builder
	 *
	 * Creates a Step object (pure data) and registers it.
	 * NO action function, NO execution logic.
	 *
	 * @param stepData - Step data without id (id will be generated)
	 * @param HookBuilderClass - Optional hook builder class to instantiate
	 * @returns Hook builder instance if HookBuilderClass provided, void otherwise
	 */
	protected registerStep<T extends BaseHookBuilder>(
		stepData: StepData,
		HookBuilderClass: new (step: Step) => T
	): T;
	protected registerStep(stepData: StepData): void;
	protected registerStep<T extends BaseHookBuilder>(
		stepData: StepData,
		HookBuilderClass?: new (step: Step) => T
	): T | void {
		// Create the Step object (pure data)
		const step: Step = {
			id: generateId("step_"),
			testCaseId: this.testCaseId,
			component: this.component,
			...stepData,
		};

		// Register step - pure data, no action function
		this._registerStep(step);

		if (HookBuilderClass) {
			// Pass step directly to HookBuilder - it can mutate handlers and params
			return new HookBuilderClass(step);
		}
	}
}
