import type net from 'node:net'
import type tls from 'node:tls'
import crypto from 'node:crypto'
import type { ISocket } from './types';
import { processIncomingBuffer, frameMessage, type FramingConfig } from './framing';

export interface TcpSocketConfig {
  lengthFieldLength: 0 | 1 | 2 | 4 | 8;
  maxLength: number;
  encoding: 'utf-8' | 'binary';
  delimiter: string;
}

export class TcpSocket implements ISocket {
  readonly id: string
  private socket: net.Socket | tls.TLSSocket
  private config: TcpSocketConfig
  private readBuffer: Buffer = Buffer.alloc(0)
  private _connected = true
  private onMessage?: (msg: Uint8Array | string) => void
  private onClose?: () => void
  private onError?: (err: Error) => void

  constructor(
    socket: net.Socket | tls.TLSSocket,
    config: TcpSocketConfig,
    callbacks: {
      onMessage: (socket: ISocket, msg: Uint8Array | string) => void
      onClose: (socket: ISocket) => void
      onError: (err: Error, socket: ISocket) => void
    }
  ) {
    this.id = crypto.randomUUID()
    this.socket = socket
    this.config = config

    this.onMessage = (msg) => callbacks.onMessage(this, msg)
    this.onClose = () => callbacks.onClose(this)
    this.onError = (err) => callbacks.onError(err, this)

    socket.on('data', (chunk: Buffer) => {
      this.readBuffer = Buffer.concat([this.readBuffer, chunk])
      this.processIncoming()
    })

    socket.on('close', () => {
      this._connected = false
      this.onClose?.()
    })

    socket.on('error', (err: Error) => {
      this.onError?.(err)
    })
  }

  get remoteAddress(): string {
    return this.socket.remoteAddress ?? ''
  }

  get remotePort(): number {
    return this.socket.remotePort ?? 0
  }

  get connected(): boolean {
    return this._connected
  }

  private processIncoming() {
    const framingConfig: FramingConfig = {
      lengthFieldLength: this.config.lengthFieldLength,
      encoding: this.config.encoding,
      delimiter: this.config.delimiter,
    }
    const result = processIncomingBuffer(this.readBuffer, framingConfig)
    this.readBuffer = result.remainingBuffer
    for (const msg of result.messages) {
      this.onMessage?.(msg)
    }
  }

  private writeAll(buf: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._connected) return reject(new Error('socket not connected'))
      this.socket.write(buf, (err?: Error | null) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this._connected) throw new Error('socket not connected')
    const framed = frameMessage(data, this.config.lengthFieldLength)
    await this.writeAll(framed)
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this._connected) throw new Error('socket not connected')
    await this.writeAll(Buffer.from(data))
  }

  close(): void {
    this._connected = false
    this.socket.destroy()
  }
}
