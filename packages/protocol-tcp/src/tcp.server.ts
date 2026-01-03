import net from 'node:net'
import tls from 'node:tls'
import type { ISocket } from './types';
import { TcpSocket } from './tcp.socket';

type SocketHandler = (socket: ISocket) => void
type ServerMessageHandler = (socket: ISocket, msg: Uint8Array | string) => void
type ServerErrorHandler = (err: Error, socket?: ISocket) => void
type ServerCloseHandler = () => void
type DisconnectHandler = (socket: ISocket) => void

type ServerHandlerType = 'connection' | 'message' | 'error' | 'close' | 'disconnect'

type ServerEventHandlers<T extends ServerHandlerType> = T extends 'connection' ? SocketHandler :
	T extends 'message' ? ServerMessageHandler :
	T extends 'error' ? ServerErrorHandler :
	T extends 'close' ? ServerCloseHandler :
	T extends 'disconnect' ? DisconnectHandler : never

export interface TcpServerConfig {
  timeout?: number;
  lengthFieldLength?: 0 | 1 | 2 | 4 | 8;
  maxLength?: number;
  encoding?: 'utf-8' | 'binary';
  delimiter?: string;
  tls?: boolean;
  cert?: string | Buffer;
  key?: string | Buffer;
  ca?: string | Buffer | Array<string | Buffer>;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

export class TcpServer {
  private server: net.Server | tls.Server | null = null
  private config: Required<TcpServerConfig> | null = null
  private _sockets: Map<string, ISocket> = new Map()
  private listening = false

  private onConnection?: SocketHandler
  private onMessage?: ServerMessageHandler
  private onError?: ServerErrorHandler
  private onClose?: ServerCloseHandler
  private onDisconnect?: DisconnectHandler

  get sockets(): ReadonlyMap<string, ISocket> {
    return this._sockets
  }

  on<T extends ServerHandlerType>(event: T, handler: ServerEventHandlers<T>): void {
    switch (event) {
      case 'connection': this.onConnection = handler as SocketHandler; break
      case 'message': this.onMessage = handler as ServerMessageHandler; break
      case 'error': this.onError = handler as ServerErrorHandler; break
      case 'close': this.onClose = handler as ServerCloseHandler; break
      case 'disconnect': this.onDisconnect = handler as DisconnectHandler; break
    }
  }

  listen(host: string, port: number, cfg: TcpServerConfig = {}): Promise<void> {
    if (this.listening) throw new Error('server is already listening')

    this.config = {
      timeout: cfg.timeout ?? 0,
      lengthFieldLength: cfg.lengthFieldLength ?? 0,
      maxLength: cfg.maxLength ?? 0,
      encoding: cfg.encoding ?? 'binary',
      delimiter: cfg.delimiter ?? '',
      tls: cfg.tls ?? false,
      cert: cfg.cert ?? '',
      key: cfg.key ?? '',
      ca: cfg.ca ?? '',
      requestCert: cfg.requestCert ?? false,
      rejectUnauthorized: cfg.rejectUnauthorized ?? false,
    }

    const config = this.config

    const connectionHandler = (socket: net.Socket | tls.TLSSocket) => {
      const tcpSocket = new TcpSocket(socket, {
        lengthFieldLength: config.lengthFieldLength,
        maxLength: config.maxLength,
        encoding: config.encoding,
        delimiter: config.delimiter,
      }, {
        onMessage: (sock, msg) => this.onMessage?.(sock, msg),
        onClose: (sock) => {
          this._sockets.delete(sock.id)
          this.onDisconnect?.(sock)
        },
        onError: (err, sock) => this.onError?.(err, sock),
      })
      this._sockets.set(tcpSocket.id, tcpSocket)
      this.onConnection?.(tcpSocket)
    }

    return new Promise((resolve, reject) => {
      if (config.tls) {
        this.server = tls.createServer({
          cert: config.cert,
          key: config.key,
          ca: config.ca,
          requestCert: config.requestCert,
          rejectUnauthorized: config.rejectUnauthorized,
        }, connectionHandler)
      } else {
        this.server = net.createServer(connectionHandler)
      }

      this.server.on('error', (err: Error) => {
        if (!this.listening) {
          reject(err)
        } else {
          this.onError?.(err)
        }
      })

      this.server.on('close', () => {
        this.listening = false
        this.onClose?.()
      })

      this.server.listen(port, host, () => {
        this.listening = true
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    const server = this.server
    if (!server) return

    for (const socket of this._sockets.values()) {
      socket.close()
    }
    this._sockets.clear()

    return new Promise((resolve) => {
      server.close(() => {
        this.listening = false
        this.server = null
        resolve()
      })
    })
  }

  async broadcast(data: Uint8Array): Promise<void> {
    const promises: Promise<void>[] = []
    for (const socket of this._sockets.values()) {
      promises.push(socket.send(data))
    }
    await Promise.all(promises)
  }

  getSocket(id: string): ISocket | undefined {
    return this._sockets.get(id)
  }
}
