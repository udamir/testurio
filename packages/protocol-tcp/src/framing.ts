import type { DataEncoding } from "./types";

export interface FramingConfig {
	lengthFieldLength: 0 | 1 | 2 | 4 | 8;
	encoding: DataEncoding;
	delimiter: string;
}

export interface FramingResult {
	messages: (Uint8Array | string)[];
	remainingBuffer: Buffer;
}

/**
 * Read length from buffer based on field length
 */
export function readLength(buffer: Buffer, lengthFieldLength: 1 | 2 | 4 | 8): number {
	if (lengthFieldLength === 1) return buffer.readUInt8(0);
	if (lengthFieldLength === 2) return buffer.readUInt16BE(0);
	if (lengthFieldLength === 4) return buffer.readUInt32BE(0);
	// lengthFieldLength === 8
	const hi = buffer.readUInt32BE(0);
	const lo = buffer.readUInt32BE(4);
	return hi * 2 ** 32 + lo;
}

/**
 * Write length to buffer based on field length
 */
export function writeLength(length: number, lengthFieldLength: 1 | 2 | 4 | 8): Buffer {
	const header = Buffer.alloc(lengthFieldLength);
	if (lengthFieldLength === 1) header.writeUInt8(length, 0);
	else if (lengthFieldLength === 2) header.writeUInt16BE(length, 0);
	else if (lengthFieldLength === 4) header.writeUInt32BE(length, 0);
	else {
		const hi = Math.floor(length / 2 ** 32);
		const lo = length >>> 0;
		header.writeUInt32BE(hi, 0);
		header.writeUInt32BE(lo, 4);
	}
	return header;
}

/**
 * Process incoming buffer and extract complete messages.
 * Returns extracted messages and remaining buffer.
 */
export function processIncomingBuffer(buffer: Buffer, config: FramingConfig): FramingResult {
	const { lengthFieldLength, encoding, delimiter } = config;
	const messages: (Uint8Array | string)[] = [];
	let readBuffer = buffer;

	// Length-prefixed framing
	if (lengthFieldLength > 0) {
		while (readBuffer.length >= lengthFieldLength) {
			const msgLen = readLength(readBuffer, lengthFieldLength as 1 | 2 | 4 | 8);
			if (readBuffer.length < lengthFieldLength + msgLen) break;
			const payload = readBuffer.slice(lengthFieldLength, lengthFieldLength + msgLen);
			readBuffer = readBuffer.slice(lengthFieldLength + msgLen);
			messages.push(encodePayload(payload, encoding));
		}
		return { messages, remainingBuffer: readBuffer };
	}

	// Delimiter-based framing
	if (delimiter && encoding === "utf-8") {
		const delim = Buffer.from(delimiter);
		while (true) {
			const idx = readBuffer.indexOf(delim);
			if (idx < 0) break;
			const payload = readBuffer.slice(0, idx);
			readBuffer = readBuffer.slice(idx + delim.length);
			messages.push(payload.toString("utf8"));
		}
		return { messages, remainingBuffer: readBuffer };
	}

	// Fallback: emit entire buffer as single message
	if (readBuffer.length) {
		messages.push(encodePayload(readBuffer, encoding));
		readBuffer = Buffer.alloc(0);
	}

	return { messages, remainingBuffer: readBuffer };
}

/**
 * Frame a message for sending (add length prefix if configured)
 */
export function frameMessage(data: Uint8Array, lengthFieldLength: 0 | 1 | 2 | 4 | 8): Buffer {
	const payload = Buffer.from(data);
	if (lengthFieldLength > 0) {
		const header = writeLength(payload.length, lengthFieldLength as 1 | 2 | 4 | 8);
		return Buffer.concat([header, payload]);
	}
	return payload;
}

/**
 * Encode payload based on encoding type
 */
function encodePayload(buf: Buffer, encoding: DataEncoding): Uint8Array | string {
	if (encoding === "utf-8") return buf.toString("utf8");
	return new Uint8Array(buf);
}
