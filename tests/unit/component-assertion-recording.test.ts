/**
 * Per-component Assertion Recording Tests
 *
 * Verifies that every component's `case "assert":` in `executeHandler`
 * routes through the shared `recordAssertion` helper and stamps onto
 * `step.metadata.assertions` for both passing and failing predicates.
 *
 * Tests exercise the protected `executeHandler` directly via test
 * subclasses that expose it.
 */

import {
	AsyncClient,
	AsyncServer,
	Client,
	DataSource,
	type Handler,
	HttpProtocol,
	Server,
	type Step,
	Subscriber,
} from "testurio";
import { describe, expect, it } from "vitest";
import { WebSocketProtocol } from "../../packages/protocol-ws/src";
import { createFakeAdapter } from "../mocks/fakeDSAdapter";
import { createFakeMQAdapter, createInMemoryBroker } from "../mocks/fakeMQAdapter";

interface ExecuteHandlerHost {
	executeHandler(handler: Handler, step: Step, payload: unknown, context?: unknown): Promise<unknown>;
}

function makeAssertHandler(description: string, predicate: (p: unknown) => boolean): Handler {
	return {
		type: "assert",
		description,
		params: { predicate },
	};
}

function makeStep(): Step {
	return {
		id: "step_test",
		type: "onResponse",
		component: { name: "noop" } as unknown as Step["component"],
		params: {},
		handlers: [],
		mode: "action",
	};
}

async function runPassAndFail(host: ExecuteHandlerHost): Promise<{
	passStep: Step;
	failStep: Step;
	failError: Error | undefined;
}> {
	const passStep = makeStep();
	await host.executeHandler(
		makeAssertHandler("passes when truthy", () => true),
		passStep,
		{ ok: true }
	);

	const failStep = makeStep();
	let failError: Error | undefined;
	try {
		await host.executeHandler(
			makeAssertHandler("fails when falsy", () => false),
			failStep,
			{ ok: false }
		);
	} catch (err) {
		failError = err as Error;
	}

	return { passStep, failStep, failError };
}

function expectPassAndFailRecorded(passStep: Step, failStep: Step, failError: Error | undefined): void {
	expect(passStep.metadata?.assertions).toEqual([{ passed: true, description: "passes when truthy" }]);
	expect(failStep.metadata?.assertions).toEqual([
		{ passed: false, description: "fails when falsy", error: "Assertion failed: fails when falsy" },
	]);
	expect(failError).toBeInstanceOf(Error);
	expect(failError?.message).toBe("Assertion failed: fails when falsy");
}

describe("Per-component assertion recording in executeHandler", () => {
	it("Client (sync-client) records pass and fail", async () => {
		const client = new Client("c", {
			protocol: new HttpProtocol(),
			targetAddress: { host: "localhost", port: 1 },
		});
		const { passStep, failStep, failError } = await runPassAndFail(client as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("Server (sync-server) records pass and fail", async () => {
		const server = new Server("s", {
			protocol: new HttpProtocol(),
			listenAddress: { host: "localhost", port: 1 },
		});
		const { passStep, failStep, failError } = await runPassAndFail(server as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("AsyncClient records pass and fail", async () => {
		const client = new AsyncClient("ac", {
			protocol: new WebSocketProtocol(),
			targetAddress: { host: "localhost", port: 1 },
		});
		const { passStep, failStep, failError } = await runPassAndFail(client as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("AsyncServer records pass and fail", async () => {
		const server = new AsyncServer("as", {
			protocol: new WebSocketProtocol(),
			listenAddress: { host: "localhost", port: 1 },
		});
		const { passStep, failStep, failError } = await runPassAndFail(server as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("Subscriber records pass and fail", async () => {
		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const subscriber = new Subscriber("sub", { adapter });
		const { passStep, failStep, failError } = await runPassAndFail(subscriber as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("DataSource records pass and fail", async () => {
		const adapter = createFakeAdapter();
		const ds = new DataSource("ds", { adapter });
		const { passStep, failStep, failError } = await runPassAndFail(ds as unknown as ExecuteHandlerHost);
		expectPassAndFailRecorded(passStep, failStep, failError);
	});

	it("records a fail entry when the predicate itself throws (non-assertion error)", async () => {
		const client = new Client("c", {
			protocol: new HttpProtocol(),
			targetAddress: { host: "localhost", port: 1 },
		});
		const step = makeStep();
		const thrown = new Error("predicate boom");
		let caught: Error | undefined;
		try {
			await (client as unknown as ExecuteHandlerHost).executeHandler(
				makeAssertHandler("predicate that throws", () => {
					throw thrown;
				}),
				step,
				{}
			);
		} catch (err) {
			caught = err as Error;
		}

		expect(caught).toBe(thrown);
		expect(step.metadata?.assertions).toEqual([
			{ passed: false, description: "predicate that throws", error: "predicate boom" },
		]);
	});
});
