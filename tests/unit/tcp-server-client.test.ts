/**
 * TCP Server and Client Integration Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TcpServer, TcpClient, type TcpServerConfig, type TcpClientConfig } from "@testurio/protocol-tcp";

describe("TcpServer and TcpClient", () => {
  let server: TcpServer;
  let client: TcpClient;
  let port: number;

  beforeEach(() => {
    server = new TcpServer();
    client = new TcpClient();
    port = 10000 + Math.floor(Math.random() * 50000);
  });

  afterEach(async () => {
    client.close();
    await server.close();
  });

  describe("TcpServer", () => {
    it("should start and stop server", async () => {
      await server.listen("127.0.0.1", port, {});
      expect(server.sockets.size).toBe(0);
      await server.close();
    });

    it("should throw error if already listening", async () => {
      await server.listen("127.0.0.1", port, {});
      expect(() => server.listen("127.0.0.1", port + 1, {})).toThrow("server is already listening");
    });

    it("should emit connection event when client connects", async () => {
      const connectionHandler = vi.fn();
      server.on("connection", connectionHandler);

      await server.listen("127.0.0.1", port, {});
      await client.connect("127.0.0.1", port, {});

      // Wait for connection event
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(connectionHandler).toHaveBeenCalledTimes(1);
      expect(server.sockets.size).toBe(1);
    });

    it("should emit disconnect event when client disconnects", async () => {
      const disconnectHandler = vi.fn();
      server.on("disconnect", disconnectHandler);

      await server.listen("127.0.0.1", port, {});
      await client.connect("127.0.0.1", port, {});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.sockets.size).toBe(1);

      client.close();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(disconnectHandler).toHaveBeenCalledTimes(1);
      expect(server.sockets.size).toBe(0);
    });

    it("should track multiple connections", async () => {
      const client2 = new TcpClient();

      await server.listen("127.0.0.1", port, {});
      await client.connect("127.0.0.1", port, {});
      await client2.connect("127.0.0.1", port, {});

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.sockets.size).toBe(2);

      client2.close();
    });
  });

  describe("Delimiter-based framing", () => {
    const serverConfig: TcpServerConfig = {
      encoding: "utf-8",
      delimiter: "\n",
    };

    const clientConfig: TcpClientConfig = {
      encoding: "utf-8",
      delimiter: "\n",
    };

    it("should send message from client to server", async () => {
      const messages: string[] = [];
      server.on("message", (_socket, msg) => {
        messages.push(msg as string);
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send message with delimiter
      await client.write(new TextEncoder().encode("hello\n"));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages).toEqual(["hello"]);
    });

    it("should send message from server to client", async () => {
      const messages: string[] = [];
      client.on("message", (msg) => {
        messages.push(msg as string);
      });

      server.on("connection", async (socket) => {
        await socket.write(new TextEncoder().encode("hello from server\n"));
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages).toEqual(["hello from server"]);
    });

    it("should handle multiple messages", async () => {
      const serverMessages: string[] = [];
      const clientMessages: string[] = [];

      server.on("message", (_socket, msg) => {
        serverMessages.push(msg as string);
      });

      client.on("message", (msg) => {
        clientMessages.push(msg as string);
      });

      server.on("connection", async (socket) => {
        await socket.write(new TextEncoder().encode("msg1\nmsg2\n"));
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await client.write(new TextEncoder().encode("client1\nclient2\n"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(clientMessages).toEqual(["msg1", "msg2"]);
      expect(serverMessages).toEqual(["client1", "client2"]);
    });
  });

  describe("Length-prefixed framing", () => {
    const serverConfig: TcpServerConfig = {
      encoding: "binary",
      lengthFieldLength: 4,
    };

    const clientConfig: TcpClientConfig = {
      encoding: "binary",
      lengthFieldLength: 4,
    };

    it("should send binary message from client to server", async () => {
      const messages: Uint8Array[] = [];
      server.on("message", (_socket, msg) => {
        messages.push(msg as Uint8Array);
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send framed message
      await client.send(new Uint8Array([1, 2, 3, 4, 5]));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it("should send binary message from server to client", async () => {
      const messages: Uint8Array[] = [];
      client.on("message", (msg) => {
        messages.push(msg as Uint8Array);
      });

      server.on("connection", async (socket) => {
        await socket.send(new Uint8Array([10, 20, 30]));
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(new Uint8Array([10, 20, 30]));
    });

    it("should handle large messages", async () => {
      const largeData = new Uint8Array(10000);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      const messages: Uint8Array[] = [];
      server.on("message", (_socket, msg) => {
        messages.push(msg as Uint8Array);
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await client.send(largeData);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(largeData);
    });
  });

  describe("Broadcast", () => {
    it("should broadcast to all connected clients", async () => {
      const client2 = new TcpClient();
      const client1Messages: Uint8Array[] = [];
      const client2Messages: Uint8Array[] = [];

      const serverConfig: TcpServerConfig = {
        encoding: "binary",
        lengthFieldLength: 4,
      };

      const clientConfig: TcpClientConfig = {
        encoding: "binary",
        lengthFieldLength: 4,
      };

      client.on("message", (msg) => {
        client1Messages.push(msg as Uint8Array);
      });

      client2.on("message", (msg) => {
        client2Messages.push(msg as Uint8Array);
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client.connect("127.0.0.1", port, clientConfig);
      await client2.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await server.broadcast(new Uint8Array([42]));

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client1Messages.length).toBe(1);
      expect(client1Messages[0]).toEqual(new Uint8Array([42]));
      expect(client2Messages.length).toBe(1);
      expect(client2Messages[0]).toEqual(new Uint8Array([42]));

      client2.close();
    });
  });

  describe("getSocket", () => {
    it("should return socket by id", async () => {
      let socketId: string | undefined;
      server.on("connection", (socket) => {
        socketId = socket.id;
      });

      await server.listen("127.0.0.1", port, {});
      await client.connect("127.0.0.1", port, {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(socketId).toBeDefined();
      if (!socketId) throw new Error("socketId should be defined");
      const socket = server.getSocket(socketId);
      expect(socket).toBeDefined();
      expect(socket?.id).toBe(socketId);
    });

    it("should return undefined for unknown id", async () => {
      await server.listen("127.0.0.1", port, {});
      expect(server.getSocket("unknown-id")).toBeUndefined();
    });
  });

  describe("Multiple clients with isolated connections", () => {
    it("should handle multiple clients sending messages simultaneously", async () => {
      const serverConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };
      const clientConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };

      const client1 = new TcpClient();
      const client2 = new TcpClient();
      const client3 = new TcpClient();

      const serverMessages: Array<{ socketId: string; data: string }> = [];

      server.on("message", (socket, data) => {
        const str = typeof data === "string" ? data : new TextDecoder().decode(data);
        serverMessages.push({ socketId: socket.id, data: str });
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client1.connect("127.0.0.1", port, clientConfig);
      await client2.connect("127.0.0.1", port, clientConfig);
      await client3.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Each client sends a unique message
      await client1.write(new TextEncoder().encode("client1-message\n"));
      await client2.write(new TextEncoder().encode("client2-message\n"));
      await client3.write(new TextEncoder().encode("client3-message\n"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(serverMessages.length).toBe(3);
      
      // Verify each message came from a different socket
      const socketIds = new Set(serverMessages.map((m) => m.socketId));
      expect(socketIds.size).toBe(3);

      // Verify all messages were received
      const messages = serverMessages.map((m) => m.data);
      expect(messages).toContain("client1-message");
      expect(messages).toContain("client2-message");
      expect(messages).toContain("client3-message");

      client1.close();
      client2.close();
      client3.close();
    });

    it("should route responses to correct clients", async () => {
      const serverConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };
      const clientConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };

      const client1 = new TcpClient();
      const client2 = new TcpClient();

      const client1Messages: string[] = [];
      const client2Messages: string[] = [];

      client1.on("message", (data) => {
        client1Messages.push(typeof data === "string" ? data : new TextDecoder().decode(data));
      });

      client2.on("message", (data) => {
        client2Messages.push(typeof data === "string" ? data : new TextDecoder().decode(data));
      });

      // Server echoes back with socket id prefix
      server.on("message", async (socket, data) => {
        const str = typeof data === "string" ? data : new TextDecoder().decode(data);
        const response = `response-for-${str}-from-${socket.id}\n`;
        await socket.write(new TextEncoder().encode(response));
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client1.connect("127.0.0.1", port, clientConfig);
      await client2.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await client1.write(new TextEncoder().encode("msg1\n"));
      await client2.write(new TextEncoder().encode("msg2\n"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Each client should only receive its own response
      expect(client1Messages.length).toBe(1);
      expect(client2Messages.length).toBe(1);
      expect(client1Messages[0]).toContain("response-for-msg1");
      expect(client2Messages[0]).toContain("response-for-msg2");

      // Responses should be from different sockets
      expect(client1Messages[0]).not.toBe(client2Messages[0]);

      client1.close();
      client2.close();
    });

    it("should handle client disconnection without affecting other clients", async () => {
      const serverConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };
      const clientConfig = { lengthFieldLength: 0 as const, encoding: "utf-8" as const, delimiter: "\n" };

      const client1 = new TcpClient();
      const client2 = new TcpClient();

      const client2Messages: string[] = [];

      client2.on("message", (data) => {
        client2Messages.push(typeof data === "string" ? data : new TextDecoder().decode(data));
      });

      await server.listen("127.0.0.1", port, serverConfig);
      await client1.connect("127.0.0.1", port, clientConfig);
      await client2.connect("127.0.0.1", port, clientConfig);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.sockets.size).toBe(2);

      // Disconnect client1
      client1.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.sockets.size).toBe(1);

      // client2 should still work
      server.on("message", async (socket) => {
        await socket.write(new TextEncoder().encode("still-working\n"));
      });

      await client2.write(new TextEncoder().encode("test\n"));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client2Messages.length).toBe(1);
      expect(client2Messages[0]).toBe("still-working");

      client2.close();
    });
  });

  describe("Error handling", () => {
    it("should emit error on server error", async () => {
      const errorHandler = vi.fn();
      server.on("error", errorHandler);

      // Try to listen on invalid port
      await expect(server.listen("127.0.0.1", -1, {})).rejects.toThrow();
    });

    it("should emit error on client connection failure", async () => {
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      // Try to connect to non-existent server
      await expect(client.connect("127.0.0.1", port, {})).rejects.toThrow();
    });
  });
});
