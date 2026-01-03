/**
 * TCP Framing Utilities Tests
 */

import { describe, expect, it } from "vitest";
import {
  readLength,
  writeLength,
  processIncomingBuffer,
  frameMessage,
  type FramingConfig,
} from "@testurio/protocol-tcp";

describe("TCP Framing Utilities", () => {
  describe("readLength", () => {
    it("should read 1-byte length", () => {
      const buf = Buffer.from([0x0a]);
      expect(readLength(buf, 1)).toBe(10);
    });

    it("should read 2-byte length (big-endian)", () => {
      const buf = Buffer.from([0x01, 0x00]);
      expect(readLength(buf, 2)).toBe(256);
    });

    it("should read 4-byte length (big-endian)", () => {
      const buf = Buffer.from([0x00, 0x01, 0x00, 0x00]);
      expect(readLength(buf, 4)).toBe(65536);
    });

    it("should read 8-byte length (big-endian)", () => {
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(0, 0);
      buf.writeUInt32BE(1000, 4);
      expect(readLength(buf, 8)).toBe(1000);
    });
  });

  describe("writeLength", () => {
    it("should write 1-byte length", () => {
      const buf = writeLength(10, 1);
      expect(buf.length).toBe(1);
      expect(buf.readUInt8(0)).toBe(10);
    });

    it("should write 2-byte length (big-endian)", () => {
      const buf = writeLength(256, 2);
      expect(buf.length).toBe(2);
      expect(buf.readUInt16BE(0)).toBe(256);
    });

    it("should write 4-byte length (big-endian)", () => {
      const buf = writeLength(65536, 4);
      expect(buf.length).toBe(4);
      expect(buf.readUInt32BE(0)).toBe(65536);
    });

    it("should write 8-byte length (big-endian)", () => {
      const buf = writeLength(1000, 8);
      expect(buf.length).toBe(8);
      expect(buf.readUInt32BE(0)).toBe(0);
      expect(buf.readUInt32BE(4)).toBe(1000);
    });
  });

  describe("frameMessage", () => {
    it("should return raw data when lengthFieldLength is 0", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const framed = frameMessage(data, 0);
      expect(framed).toEqual(Buffer.from([1, 2, 3, 4]));
    });

    it("should add 1-byte length prefix", () => {
      const data = new Uint8Array([1, 2, 3]);
      const framed = frameMessage(data, 1);
      expect(framed.length).toBe(4);
      expect(framed[0]).toBe(3); // length
      expect(framed.slice(1)).toEqual(Buffer.from([1, 2, 3]));
    });

    it("should add 4-byte length prefix", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const framed = frameMessage(data, 4);
      expect(framed.length).toBe(9);
      expect(framed.readUInt32BE(0)).toBe(5); // length
      expect(framed.slice(4)).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });
  });

  describe("processIncomingBuffer", () => {
    describe("length-prefixed framing", () => {
      const config: FramingConfig = {
        lengthFieldLength: 4,
        encoding: "binary",
        delimiter: "",
      };

      it("should extract complete message", () => {
        const payload = Buffer.from("hello");
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        const buffer = Buffer.concat([header, payload]);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(1);
        expect(result.messages[0]).toEqual(new Uint8Array(payload));
        expect(result.remainingBuffer.length).toBe(0);
      });

      it("should extract multiple complete messages", () => {
        const msg1 = Buffer.from("hello");
        const msg2 = Buffer.from("world");
        const header1 = Buffer.alloc(4);
        const header2 = Buffer.alloc(4);
        header1.writeUInt32BE(msg1.length, 0);
        header2.writeUInt32BE(msg2.length, 0);
        const buffer = Buffer.concat([header1, msg1, header2, msg2]);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(2);
        expect(result.messages[0]).toEqual(new Uint8Array(msg1));
        expect(result.messages[1]).toEqual(new Uint8Array(msg2));
        expect(result.remainingBuffer.length).toBe(0);
      });

      it("should handle incomplete message (partial header)", () => {
        const buffer = Buffer.from([0x00, 0x00]); // Only 2 bytes of 4-byte header

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(0);
        expect(result.remainingBuffer).toEqual(buffer);
      });

      it("should handle incomplete message (partial payload)", () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(10, 0); // Expecting 10 bytes
        const partialPayload = Buffer.from("hello"); // Only 5 bytes
        const buffer = Buffer.concat([header, partialPayload]);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(0);
        expect(result.remainingBuffer).toEqual(buffer);
      });

      it("should extract complete message and keep remainder", () => {
        const msg1 = Buffer.from("hello");
        const header1 = Buffer.alloc(4);
        header1.writeUInt32BE(msg1.length, 0);
        const partialHeader = Buffer.from([0x00, 0x00]);
        const buffer = Buffer.concat([header1, msg1, partialHeader]);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(1);
        expect(result.messages[0]).toEqual(new Uint8Array(msg1));
        expect(result.remainingBuffer).toEqual(partialHeader);
      });
    });

    describe("delimiter-based framing", () => {
      const config: FramingConfig = {
        lengthFieldLength: 0,
        encoding: "utf-8",
        delimiter: "\n",
      };

      it("should extract complete message", () => {
        const buffer = Buffer.from("hello\n");

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(1);
        expect(result.messages[0]).toBe("hello");
        expect(result.remainingBuffer.length).toBe(0);
      });

      it("should extract multiple complete messages", () => {
        const buffer = Buffer.from("hello\nworld\n");

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(2);
        expect(result.messages[0]).toBe("hello");
        expect(result.messages[1]).toBe("world");
        expect(result.remainingBuffer.length).toBe(0);
      });

      it("should handle incomplete message (no delimiter)", () => {
        const buffer = Buffer.from("hello");

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(0);
        expect(result.remainingBuffer).toEqual(buffer);
      });

      it("should extract complete message and keep remainder", () => {
        const buffer = Buffer.from("hello\nwor");

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(1);
        expect(result.messages[0]).toBe("hello");
        expect(result.remainingBuffer).toEqual(Buffer.from("wor"));
      });

      it("should handle multi-character delimiter", () => {
        const multiDelimConfig: FramingConfig = {
          lengthFieldLength: 0,
          encoding: "utf-8",
          delimiter: "\r\n",
        };
        const buffer = Buffer.from("hello\r\nworld\r\n");

        const result = processIncomingBuffer(buffer, multiDelimConfig);
        expect(result.messages.length).toBe(2);
        expect(result.messages[0]).toBe("hello");
        expect(result.messages[1]).toBe("world");
      });
    });

    describe("fallback (no framing)", () => {
      const config: FramingConfig = {
        lengthFieldLength: 0,
        encoding: "binary",
        delimiter: "",
      };

      it("should emit entire buffer as single message", () => {
        const buffer = Buffer.from([1, 2, 3, 4, 5]);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(1);
        expect(result.messages[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        expect(result.remainingBuffer.length).toBe(0);
      });

      it("should handle empty buffer", () => {
        const buffer = Buffer.alloc(0);

        const result = processIncomingBuffer(buffer, config);
        expect(result.messages.length).toBe(0);
        expect(result.remainingBuffer.length).toBe(0);
      });
    });
  });
});
