type EventType = "open" | "message" | "close";
type Listener = (payload: any) => void;

interface ReconnectOptions {
  retryDelay?: number;
  maxRetryDelay?: number;
  connectionTimeout?: number;
  backoffFactor?: number;
  WebSocketConstructor?: typeof WebSocket;
}

export class ReconnectingWebSocket {
  private options: Required<ReconnectOptions & { url: string }>;

  private ws?: WebSocket;
  private abortController?: AbortController;

  private connectTimeout?: ReturnType<typeof setTimeout>;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;

  private retryCount = 0;
  private forcedClose = false;

  private listeners: Record<EventType, Listener[]> = {
    open: [],
    message: [],
    close: [],
  };

  public get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  constructor(url: string, options: ReconnectOptions = {}) {
    this.options = {
      url,
      retryDelay: options.retryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30_000,
      connectionTimeout: options.connectionTimeout ?? 10_000,
      backoffFactor: options.backoffFactor ?? 2,
      WebSocketConstructor: options.WebSocketConstructor ?? WebSocket,
    };

    this.connect();
  }

  private connect() {
    this.abortController = new AbortController();
    this.abortController.signal.addEventListener("abort", () => {
      if (this.ws?.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    });

    this.ws = new this.options.WebSocketConstructor(this.options.url);

    this.connectTimeout = setTimeout(() => {
      this.abortController?.abort();
    }, this.options.connectionTimeout);

    this.ws.addEventListener("open", (event) => {
      this.clearTimers();
      this.retryCount = 0;
      this.emit("open", event);
    });

    this.ws.addEventListener("message", (event: MessageEvent) => {
      this.emit("message", event);
    });

    this.ws.addEventListener("close", (event: CloseEvent) => {
      this.emit("close", { code: event.code, reason: event.reason });

      if (!this.forcedClose) {
        this.scheduleReconnect();
      }
    });
  }

  private emit(event: EventType, payload: any) {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }

  private scheduleReconnect() {
    const { retryDelay, backoffFactor, maxRetryDelay } = this.options;

    const delay = Math.min(
      retryDelay * Math.pow(backoffFactor, this.retryCount),
      maxRetryDelay,
    );

    this.retryCount += 1;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private clearTimers() {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.abortController) {
      this.abortController = undefined;
    }
  }

  public addEventListener(event: EventType, listener: Listener) {
    this.listeners[event].push(listener);
  }

  public removeEventListener(event: EventType, listener: Listener) {
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
  }

  public send(...args: Parameters<WebSocket["send"]>) {
    this.ws?.send(...args);
  }

  public close(...args: Parameters<WebSocket["close"]>) {
    this.forcedClose = true;
    this.clearTimers();

    if (this.ws) {
      this.ws.close(...args);
      this.ws = undefined;
    }
  }
}
