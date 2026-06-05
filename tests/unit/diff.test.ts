/**
 * diff renderer unit tests
 */

import { describe, expect, it } from "vitest";

import { renderDiff } from "../../packages/core/src/components/base/expect/diff";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

describe("renderDiff — scalar mismatches", () => {
	it("renders number mismatch as red - / green +", () => {
		const out = renderDiff(1, 2);
		expect(out).toContain(`${RED}- 1${RESET}`);
		expect(out).toContain(`${GREEN}+ 2${RESET}`);
	});

	it("renders string mismatch", () => {
		const out = renderDiff("alice", "bob");
		expect(out).toContain(`${RED}- "alice"${RESET}`);
		expect(out).toContain(`${GREEN}+ "bob"${RESET}`);
	});

	it("renders boolean mismatch", () => {
		const out = renderDiff(true, false);
		expect(out).toContain(`${RED}- true${RESET}`);
		expect(out).toContain(`${GREEN}+ false${RESET}`);
	});
});

describe("renderDiff — object diffs", () => {
	it("marks unchanged keys as (equal) and emits +/- for changed", () => {
		const out = renderDiff({ id: 1, name: "Alice", role: "admin" }, { id: 1, name: "Alice", role: "user" });
		expect(out).toContain(`${DIM}id: (equal)${RESET}`);
		expect(out).toContain(`${DIM}name: (equal)${RESET}`);
		expect(out).toContain(`${RED}- role: "admin"${RESET}`);
		expect(out).toContain(`${GREEN}+ role: "user"${RESET}`);
	});

	it("renders added keys", () => {
		const out = renderDiff({ a: 1 }, { a: 1, b: 2 });
		expect(out).toContain(`${DIM}a: (equal)${RESET}`);
		// b: expected undefined, received 2
		expect(out).toContain(`${GREEN}+ b: 2${RESET}`);
	});

	it("renders removed keys", () => {
		const out = renderDiff({ a: 1, b: 2 }, { a: 1 });
		expect(out).toContain(`${RED}- b: 2${RESET}`);
	});

	it("walks into nested objects when both sides are structured", () => {
		const out = renderDiff({ user: { id: 1, name: "Alice" } }, { user: { id: 1, name: "Bob" } });
		expect(out).toContain("user:");
		expect(out).toContain(`${DIM}id: (equal)${RESET}`);
		expect(out).toContain(`${RED}- name: "Alice"${RESET}`);
		expect(out).toContain(`${GREEN}+ name: "Bob"${RESET}`);
	});

	it("renders nested object change at depth 3", () => {
		const out = renderDiff({ a: { b: { c: { d: "x" } } } }, { a: { b: { c: { d: "y" } } } });
		expect(out).toContain(`${RED}- d: "x"${RESET}`);
		expect(out).toContain(`${GREEN}+ d: "y"${RESET}`);
	});
});

describe("renderDiff — array diffs", () => {
	it("marks equal indices and shows changed", () => {
		const out = renderDiff([1, 2, 3], [1, 2, 4]);
		expect(out).toContain(`${DIM}[0]: (equal)${RESET}`);
		expect(out).toContain(`${DIM}[1]: (equal)${RESET}`);
		expect(out).toContain(`${RED}- [2]: 3${RESET}`);
		expect(out).toContain(`${GREEN}+ [2]: 4${RESET}`);
	});

	it("handles arrays of different length", () => {
		const out = renderDiff([1, 2], [1, 2, 3]);
		expect(out).toContain(`${GREEN}+ [2]: 3${RESET}`);
	});

	it("walks into nested objects inside arrays", () => {
		const out = renderDiff([{ id: 1 }], [{ id: 2 }]);
		expect(out).toContain(`${RED}- id: 1${RESET}`);
		expect(out).toContain(`${GREEN}+ id: 2${RESET}`);
	});
});

describe("renderDiff — mixed object + array", () => {
	it("handles object containing array", () => {
		const out = renderDiff({ items: [1, 2] }, { items: [1, 3] });
		expect(out).toContain("items:");
		expect(out).toContain(`${RED}- [1]: 2${RESET}`);
		expect(out).toContain(`${GREEN}+ [1]: 3${RESET}`);
	});
});

describe("renderDiff — depth cutoff", () => {
	it("emits dimmed ellipsis beyond depth 6", () => {
		// 8 levels of differing leaves — beyond depth 6 should render '…'.
		const e = {
			l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: "x" } } } } } } },
		};
		const a = {
			l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: "y" } } } } } } },
		};
		const out = renderDiff(e, a);
		expect(out).toContain(`${DIM}…${RESET}`);
	});
});

describe("renderDiff — type mismatches", () => {
	it("emits +/- when one side is scalar and other is structured", () => {
		const out = renderDiff({ a: 1 }, 42);
		expect(out).toContain(`${RED}-`);
		expect(out).toContain(`${GREEN}+`);
	});
});
