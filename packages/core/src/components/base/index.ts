/**
 * Base Component System
 *
 * Exports core component functionality for the three-phase execution model:
 * - Phase 1: Hook Registration
 * - Phase 2: Step Execution
 * - Phase 3: Cleanup
 *
 * Component hierarchy:
 * - BaseComponent: Pure hooks + lifecycle (no protocol)
 * - ServiceComponent<P>: Extends BaseComponent with protocol
 *
 * Builder hierarchy:
 * - BaseStepBuilder: Step registration, no execution logic
 * - BaseHookBuilder: Handler registration, no execution logic
 */

// Base classes
export * from "./base.component";
// Base types
export * from "./base.types";
// Utilities
export * from "./base.utils";
export * from "./hook.types";
export * from "./hook-builder";
export * from "./service.component";
// Core types
export * from "./step.types";
export * from "./step-builder";
