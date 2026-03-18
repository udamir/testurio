/**
 * AsyncServerHookBuilder validate() Direction Tests
 *
 * Verifies that validate() uses the correct lookupDirection:
 * - "clientMessage" for onMessage/waitMessage steps (messages from clients)
 * - "serverMessage" for onEvent steps (events from backend)
 */

import type { Step } from "testurio";
import { AsyncServer, TestCaseBuilder } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";
import { WebSocketProtocol } from "../../packages/protocol-ws/src";

interface TestMessages {
	clientMessages: { ping: { seq: number } };
	serverMessages: { pong: { seq: number } };
}

describe("AsyncServerHookBuilder validate() direction", () => {
	let server: AsyncServer<WebSocketProtocol<TestMessages>>;
	let builder: TestCaseBuilder;
	let registeredSteps: Step[];

	beforeEach(() => {
		server = new AsyncServer("ws-server", {
			protocol: new WebSocketProtocol<TestMessages>(),
			listenAddress: { host: "localhost", port: 19000 },
		});

		const components = new Map();
		builder = new TestCaseBuilder(components);
		registeredSteps = [];

		const originalRegisterStep = builder.registerStep.bind(builder);
		builder.registerStep = (step: Step) => {
			registeredSteps.push(step);
			return originalRegisterStep(step);
		};
	});

	it('onMessage().validate() should use "clientMessage" direction', () => {
		const stepBuilder = builder.use(server);

		stepBuilder.onMessage("ping").validate();

		expect(registeredSteps).toHaveLength(1);
		expect(registeredSteps[0].type).toBe("onMessage");

		const validateHandler = registeredSteps[0].handlers[0];
		expect(validateHandler.type).toBe("validate");
		expect(validateHandler.params).toMatchObject({
			lookupKey: "ping",
			lookupDirection: "clientMessage",
		});
	});

	it('onEvent().validate() should use "serverMessage" direction', () => {
		const stepBuilder = builder.use(server);

		stepBuilder.onEvent("pong").validate();

		expect(registeredSteps).toHaveLength(1);
		expect(registeredSteps[0].type).toBe("onEvent");

		const validateHandler = registeredSteps[0].handlers[0];
		expect(validateHandler.type).toBe("validate");
		expect(validateHandler.params).toMatchObject({
			lookupKey: "pong",
			lookupDirection: "serverMessage",
		});
	});

	it('waitMessage().validate() should use "clientMessage" direction', () => {
		const stepBuilder = builder.use(server);

		stepBuilder.waitMessage("ping").validate();

		expect(registeredSteps).toHaveLength(1);
		expect(registeredSteps[0].type).toBe("waitMessage");

		const validateHandler = registeredSteps[0].handlers[0];
		expect(validateHandler.type).toBe("validate");
		expect(validateHandler.params).toMatchObject({
			lookupKey: "ping",
			lookupDirection: "clientMessage",
		});
	});
});
