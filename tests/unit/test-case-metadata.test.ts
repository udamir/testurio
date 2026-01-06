/**
 * TestCase Metadata Tests
 *
 * Tests for TestCase metadata fluent API and metadata object parameter.
 */

import type { TestCaseMetadata } from "testurio";
import { testCase } from "testurio";
import { describe, expect, it } from "vitest";

describe("TestCase Metadata", () => {
	describe("Fluent API", () => {
		it("should set id via fluent API", () => {
			const tc = testCase("Test", () => {}).id("TC-001");
			expect(tc.getMetadata().id).toBe("TC-001");
		});

		it("should set epic via fluent API", () => {
			const tc = testCase("Test", () => {}).epic("User Management");
			expect(tc.getMetadata().epic).toBe("User Management");
		});

		it("should set feature via fluent API", () => {
			const tc = testCase("Test", () => {}).feature("User API");
			expect(tc.getMetadata().feature).toBe("User API");
		});

		it("should set story via fluent API", () => {
			const tc = testCase("Test", () => {}).story("Get User");
			expect(tc.getMetadata().story).toBe("Get User");
		});

		it("should set severity via fluent API", () => {
			const tc = testCase("Test", () => {}).severity("critical");
			expect(tc.getMetadata().severity).toBe("critical");
		});

		it("should add tags via fluent API", () => {
			const tc = testCase("Test", () => {}).tags("api", "smoke");
			expect(tc.getMetadata().tags).toEqual(["api", "smoke"]);
		});

		it("should add single tag via fluent API", () => {
			const tc = testCase("Test", () => {}).tag("regression");
			expect(tc.getMetadata().tags).toEqual(["regression"]);
		});

		it("should accumulate tags", () => {
			const tc = testCase("Test", () => {})
				.tags("api", "smoke")
				.tag("regression");
			expect(tc.getMetadata().tags).toEqual(["api", "smoke", "regression"]);
		});

		it("should add issue via fluent API", () => {
			const tc = testCase("Test", () => {}).issue("BUG-123");
			expect(tc.getMetadata().issues).toEqual(["BUG-123"]);
		});

		it("should accumulate issues", () => {
			const tc = testCase("Test", () => {})
				.issue("BUG-123")
				.issue("BUG-456");
			expect(tc.getMetadata().issues).toEqual(["BUG-123", "BUG-456"]);
		});

		it("should set description via fluent API", () => {
			const tc = testCase("Test", () => {}).description("Test description");
			expect(tc.getMetadata().description).toBe("Test description");
		});

		it("should add label via fluent API", () => {
			const tc = testCase("Test", () => {}).label("team", "backend");
			expect(tc.getMetadata().labels).toEqual({ team: "backend" });
		});

		it("should accumulate labels", () => {
			const tc = testCase("Test", () => {})
				.label("team", "backend")
				.label("sprint", "2024-01");
			expect(tc.getMetadata().labels).toEqual({
				team: "backend",
				sprint: "2024-01",
			});
		});

		it("should chain multiple fluent methods", () => {
			const tc = testCase("Test", () => {})
				.id("TC-001")
				.epic("User Management")
				.feature("User API")
				.story("Get User")
				.severity("critical")
				.tags("api", "smoke")
				.issue("BUG-123")
				.description("Test description")
				.label("team", "backend");

			const metadata = tc.getMetadata();
			expect(metadata.id).toBe("TC-001");
			expect(metadata.epic).toBe("User Management");
			expect(metadata.feature).toBe("User API");
			expect(metadata.story).toBe("Get User");
			expect(metadata.severity).toBe("critical");
			expect(metadata.tags).toEqual(["api", "smoke"]);
			expect(metadata.issues).toEqual(["BUG-123"]);
			expect(metadata.description).toBe("Test description");
			expect(metadata.labels).toEqual({ team: "backend" });
		});
	});

	describe("Metadata Object Parameter", () => {
		it("should accept metadata object in constructor", () => {
			const metadata: TestCaseMetadata = {
				id: "TC-001",
				epic: "User Management",
				feature: "User API",
				story: "Get User",
				severity: "critical",
				tags: ["api", "smoke"],
				issues: ["BUG-123"],
				description: "Test description",
				labels: { team: "backend" },
			};

			const tc = testCase("Test", () => {}, metadata);
			expect(tc.getMetadata()).toEqual(metadata);
		});

		it("should allow fluent API to override metadata object", () => {
			const metadata: TestCaseMetadata = {
				epic: "Original Epic",
				severity: "normal",
			};

			const tc = testCase("Test", () => {}, metadata)
				.epic("New Epic")
				.severity("critical");

			expect(tc.getMetadata().epic).toBe("New Epic");
			expect(tc.getMetadata().severity).toBe("critical");
		});

		it("should accumulate tags from both sources", () => {
			const metadata: TestCaseMetadata = {
				tags: ["api"],
			};

			const tc = testCase("Test", () => {}, metadata).tags("smoke", "regression");

			expect(tc.getMetadata().tags).toEqual(["api", "smoke", "regression"]);
		});

		it("should accumulate issues from both sources", () => {
			const metadata: TestCaseMetadata = {
				issues: ["BUG-001"],
			};

			const tc = testCase("Test", () => {}, metadata).issue("BUG-002");

			expect(tc.getMetadata().issues).toEqual(["BUG-001", "BUG-002"]);
		});

		it("should merge labels from both sources", () => {
			const metadata: TestCaseMetadata = {
				labels: { team: "backend" },
			};

			const tc = testCase("Test", () => {}, metadata).label("sprint", "2024-01");

			expect(tc.getMetadata().labels).toEqual({
				team: "backend",
				sprint: "2024-01",
			});
		});
	});

	describe("getMetadata", () => {
		it("should return empty object for test case without metadata", () => {
			const tc = testCase("Test", () => {});
			expect(tc.getMetadata()).toEqual({});
		});

		it("should return a copy of metadata", () => {
			const tc = testCase("Test", () => {}).epic("Epic");
			const metadata1 = tc.getMetadata();
			const metadata2 = tc.getMetadata();

			expect(metadata1).toEqual(metadata2);
			expect(metadata1).not.toBe(metadata2); // Different object references
		});
	});

	describe("TestCaseResult metadata", () => {
		it("should include metadata in test case result", async () => {
			// Create a mock builder
			const mockBuilder = {
				setPhase: () => {},
				getSteps: () => [],
			};

			const tc = testCase("Test", () => {})
				.epic("User Management")
				.severity("critical");

			const result = await tc.execute(mockBuilder as never);

			expect(result.testCaseMetadata).toEqual({
				epic: "User Management",
				severity: "critical",
			});
		});
	});
});
