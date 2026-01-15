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

// Core types
export * from "./step.types";
export * from "./hook.types";

// Base types
export *from "./base.types";

// Base classes
export * from "./base.component";
export * from "./service.component";
export * from "./step-builder";
export * from "./hook-builder";

// Utilities
export * from "./base.utils";
