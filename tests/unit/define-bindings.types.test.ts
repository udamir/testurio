/**
 * Type-only test for `defineBindings<TopicMap, Registry>()` (task 034 R5, C-12).
 *
 * Verifies compile-time constraints:
 *   (a) string-match entries with `Registry[type]` assignable to
 *       `TopicMap[match]` compile cleanly.
 *   (b) string-match entries with mismatched `Registry[type]` fail to
 *       compile (`// @ts-expect-error`).
 *   (c) RegExp / predicate entries accept any `keyof Registry & string`.
 *   (d) typo'd `type` (not a key of Registry) fails to compile.
 *
 * The test passes iff the file type-checks under strict mode. The single
 * runtime case keeps vitest happy (a file with no test bodies would be
 * reported as "no tests in file").
 */

import { defineBindings } from "@testurio/codec-protobuf";
import { describe, it } from "vitest";

interface OrderEvent {
	orderId: string;
	amount: number;
}
interface UserEvent {
	userId: string;
	action: string;
}

interface MyTopics {
	"orders.v1": OrderEvent;
	"users.v1": UserEvent;
}

type Registry = {
	"pkg.OrderEvent": OrderEvent;
	"pkg.UserEvent": UserEvent;
};

describe("defineBindings (type-only)", () => {
	it("compiles when string-match entries align with Registry[type] ≡ TopicMap[match]", () => {
		const bindings = defineBindings<MyTopics, Registry>()([
			{ match: "orders.v1", type: "pkg.OrderEvent" },
			{ match: "users.v1", type: "pkg.UserEvent" },
		]);
		// Runtime: pass-through array of length 2.
		if (bindings.length !== 2) throw new Error("expected 2 entries");
	});

	it("compiles for RegExp / predicate entries with any `keyof Registry & string` type", () => {
		const bindings = defineBindings<MyTopics, Registry>()([
			{ match: /^orders\..+$/, type: "pkg.OrderEvent" },
			{ match: (k) => k.startsWith("users."), type: "pkg.UserEvent" },
		]);
		if (bindings.length !== 2) throw new Error("expected 2 entries");
	});

	it("rejects mismatched string-match entries at compile time", () => {
		const bindings = defineBindings<MyTopics, Registry>()([
			// @ts-expect-error — Registry["pkg.UserEvent"] is UserEvent, not assignable to TopicMap["orders.v1"] (OrderEvent).
			{ match: "orders.v1", type: "pkg.UserEvent" },
		]);
		if (bindings.length !== 1) throw new Error("expected 1 entry");
	});

	it("rejects typo'd FQN at compile time", () => {
		const bindings = defineBindings<MyTopics, Registry>()([
			// @ts-expect-error — "pkg.NotAType" is not a key of Registry.
			{ match: /^orders\./, type: "pkg.NotAType" },
		]);
		if (bindings.length !== 1) throw new Error("expected 1 entry");
	});
});
