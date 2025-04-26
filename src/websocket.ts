// ReconnectingWebSocket.ts
// A wrapper around the native WebSocket with automatic reconnect and connection timeout.
// Now emits plain‐object “events” so that downstream postMessage() never trips over a non‐cloneable host object.

export interface ReconnectOptions {
  /** Time in milliseconds before first reconnect attempt */
  retryDelay?: number;
  /** Maximum time in milliseconds between reconnect attempts */
  maxRetryDelay?: number;
  /** Timeout in milliseconds for establishing a connection */
  connectionTimeout?: number;
  /** Multiplicative backoff factor */
  backoffFactor?: number;
  /** Optional subprotocols */
  protocols?: string | string[];
  /** Optional WebSocket constructor (defaults to global WebSocket) */
  WebSocketConstructor?: {
    new (url: string, protocols?: string | string[]): WebSocket;
    readonly prototype: WebSocket;
  };
}

type Listener = (payload: any) => void;

export class ReconnectingWebSocket {
  private url: string;
  private protocols?: string | string[];
  private WebSocketConstructor: {
    new (url: string, protocols?: string | string[]): WebSocket;
    readonly prototype: WebSocket;
  };
  private options: Required<
    Omit<ReconnectOptions, "protocols" | "WebSocketConstructor">
  >;

  private ws?: WebSocket;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private abortController?: AbortController;

  private forcedClose = false;
  private retryCount = 0;

  // simple in-memory listener registry
  private listeners: Record<string, Listener[]> = {};

  constructor(url: string, options: ReconnectOptions = {}) {
    this.url = url;
    this.protocols = options.protocols;
    this.WebSocketConstructor =
      options.WebSocketConstructor ?? (globalThis as any).WebSocket;
    this.options = {
      retryDelay: options.retryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30000,
      connectionTimeout: options.connectionTimeout ?? 5000,
      backoffFactor: options.backoffFactor ?? 2,
    };

    this.connect();
  }

  /** Exactly like native: throws if socket isn’t open. */
  public send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (
      this.ws &&
      this.ws.readyState === this.WebSocketConstructor.prototype.OPEN
    ) {
      this.ws.send(data as any);
    } else {
      throw new Error(
        "WebSocket is not open: readyState=" +
          (this.ws ? this.ws.readyState : "NO_SOCKET"),
      );
    }
  }

  /** Close and prevent any further reconnects */
  public close(code?: number, reason?: string): void {
    this.forcedClose = true;
    this.clearTimers();
    if (this.ws) this.ws.close(code, reason);
  }

  /** Mirror of WebSocket.readyState */
  public get readyState(): number {
    return this.ws
      ? this.ws.readyState
      : this.WebSocketConstructor.prototype.CLOSED;
  }

  /**
   * Subscribe exactly like native:
   *
   *   socket.addEventListener('message', e => { console.log(e.data) });
   *   socket.addEventListener('error', e => { console.error(e.message) });
   */
  public addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: Listener,
  ): void {
    (this.listeners[type] ||= []).push(listener);
  }

  public removeEventListener(
    type: "open" | "message" | "error" | "close",
    listener: Listener,
  ): void {
    const arr = this.listeners[type];
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }

  /** Internally emit a *plain object* to each listener of `type` */
  private emit(type: string, payload: any): void {
    const arr = this.listeners[type];
    if (!arr) return;
    for (const fn of arr) {
      setTimeout(() => fn.call(this, payload), 0);
    }
  }

  /** (Re)establish the underlying socket */
  private connect(): void {
    this.clearTimers();
    this.abortController = new AbortController();
    this.ws = new this.WebSocketConstructor(this.url, this.protocols);

    // tear down if it takes too long
    this.connectTimer = setTimeout(() => {
      this.abortController?.abort();
    }, this.options.connectionTimeout);

    this.abortController.signal.addEventListener("abort", () => {
      if (
        this.ws &&
        this.ws.readyState === this.WebSocketConstructor.prototype.CONNECTING
      ) {
        this.ws.close();
      }
    });

    // OPEN → reset backoff, notify subscribers
    this.ws.addEventListener("open", () => {
      this.clearTimers();
      this.retryCount = 0;
      this.emit("open", {}); // no extra data
    });

    // MESSAGE → forward only the `data`-style payload
    this.ws.addEventListener("message", (event: MessageEvent) => {
      this.emit("message", {
        data: event.data,
        origin: event.origin,
        lastEventId: event.lastEventId,
        ports: event.ports,
        source: event.source,
      });
    });

    // ERROR → only a simple `{ message }` object
    this.ws.addEventListener("error", (event: Event) => {
      const msg =
        event instanceof ErrorEvent
          ? event.message
          : "WebSocket connection error";
      this.emit("error", { message: msg });
    });

    // CLOSE → code, reason, wasClean; *then* schedule a reconnect if we didn’t `.close()` manually
    this.ws.addEventListener("close", (event: CloseEvent) => {
      this.emit("close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      if (!this.forcedClose) {
        this.scheduleReconnect();
      }
    });
  }

  /** Kill any pending timers/controllers */
  private clearTimers(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.abortController = undefined;
  }

  /** Backoff + retry */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.options.retryDelay *
        Math.pow(this.options.backoffFactor, this.retryCount),
      this.options.maxRetryDelay,
    );
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
