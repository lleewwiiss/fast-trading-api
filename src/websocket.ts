// ReconnectingWebSocket.ts
// A wrapper around the native WebSocket with automatic reconnect and connection timeout.

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

// Map WebSocket event types to their event objects
interface WebSocketEventMap {
  open: Event;
  message: MessageEvent;
  error: Event;
  close: CloseEvent;
}

export class ReconnectingWebSocket extends EventTarget {
  // Typed overloads for addEventListener
  public addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: ReconnectingWebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener as EventListener, options);
  }

  // Typed overloads for removeEventListener
  public removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: ReconnectingWebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions | boolean,
  ): void;
  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener as EventListener, options);
  }

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
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private abortController?: AbortController;

  private forcedClose = false;
  private retryCount = 0;

  /**
   * Create a new ReconnectingWebSocket.
   * @param url WebSocket URL
   * @param options Configuration options
   */
  constructor(url: string, options: ReconnectOptions = {}) {
    super();
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

  /** Send data through the WebSocket if open */
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

  /** Close the WebSocket and disable further reconnects */
  public close(code?: number, reason?: string): void {
    this.forcedClose = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(code, reason);
    }
  }

  /** The current readyState of the underlying socket */
  public get readyState(): number {
    return this.ws
      ? this.ws.readyState
      : this.WebSocketConstructor.prototype.CLOSED;
  }

  /** Internal: establish a new WebSocket connection */
  private connect(): void {
    this.clearTimers();
    this.abortController = new AbortController();

    this.ws = new this.WebSocketConstructor(this.url, this.protocols);

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

    // Bind event handlers with cloned data so downstream `postMessage` works

    // OPEN
    this.ws.addEventListener("open", () => {
      const ev = new Event("open");
      this.onOpen(ev);
    });

    // MESSAGE
    this.ws.addEventListener("message", (event: MessageEvent) => {
      const msg = new MessageEvent("message", {
        data: event.data,
        origin: event.origin,
        lastEventId: event.lastEventId,
        ports: [...event.ports],
        source: event.source,
      });
      setTimeout(() => this.dispatchEvent(msg), 0);
    });

    // ERROR
    this.ws.addEventListener("error", () => {
      const err = new ErrorEvent("error", {
        message: "WebSocket connection error",
      });
      setTimeout(() => this.dispatchEvent(err), 0);
    });

    // CLOSE
    this.ws.addEventListener("close", (event: CloseEvent) => {
      const closeEv = new CloseEvent("close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.onClose(closeEv);
    });
  }

  /** Internal: handle successful connection */
  private onOpen(event: Event): void {
    this.clearTimers();
    this.retryCount = 0;
    setTimeout(() => this.dispatchEvent(event), 0);
  }

  /** Internal: handle socket close and schedule reconnect */
  private onClose(event: CloseEvent): void {
    this.clearTimers();
    setTimeout(() => this.dispatchEvent(event), 0);

    if (!this.forcedClose) {
      this.scheduleReconnect();
    }
  }

  /** Internal: clear timers and controllers */
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

  /** Internal: calculate backoff and retry */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.options.retryDelay *
        Math.pow(this.options.backoffFactor, this.retryCount),
      this.options.maxRetryDelay,
    );
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
