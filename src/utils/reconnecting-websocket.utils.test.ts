import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { ReconnectingWebSocket } from "./reconnecting-websocket.utils";

describe("ReconnectingWebSocket", () => {
  let created: any[];
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let timeouts: Map<number, () => void>;
  let timerId: number;
  let flushTimers: () => void;

  class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    // ensure instance properties match code expectations
    readyState: number = FakeWebSocket.CONNECTING;
    sentData: any[] = [];
    constructor(_url: string, _protocols?: string | string[]) {
      super();
      created.push(this);
      this.readyState = FakeWebSocket.CONNECTING;
    }
    send(data: any) {
      this.sentData.push(data);
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.dispatchEvent(new CloseEvent("close"));
    }
  }

  // attach constants on prototype for compatibility
  Object.assign(FakeWebSocket.prototype, {
    OPEN: FakeWebSocket.OPEN,
    CONNECTING: FakeWebSocket.CONNECTING,
    CLOSED: FakeWebSocket.CLOSED,
  });

  beforeEach(() => {
    created = [];
    // stub timers with manual queue
    timeouts = new Map();
    timerId = 1;
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((fn: (...args: any[]) => void) => {
      const id = timerId++;
      timeouts.set(id, fn as () => void);
      return id as any;
    }) as unknown as typeof setTimeout;

    globalThis.clearTimeout = ((id?: any) => {
      timeouts.delete(id);
    }) as unknown as typeof clearTimeout;

    flushTimers = () => {
      const fns = Array.from(timeouts.values());
      timeouts.clear();
      for (const fn of fns) fn();
    };
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  it("should dispatch open event", async () => {
    const ws = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
    });
    const openPromise = new Promise((resolve) =>
      ws.addEventListener("open", resolve),
    );
    // simulate open
    const instance = created[0];
    instance.readyState = FakeWebSocket.OPEN;
    instance.dispatchEvent(new Event("open"));
    // flush the scheduled dispatch in onOpen
    flushTimers();
    await openPromise;
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("should send data when open", () => {
    const ws = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
    });
    const instance = created[0];
    instance.readyState = FakeWebSocket.OPEN;
    ws.send("hello");
    expect(instance.sentData).toEqual(["hello"]);
  });

  it("should reconnect on close", () => {
    new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
      retryDelay: 1000,
      maxRetryDelay: 2000,
      backoffFactor: 2,
      connectionTimeout: 1000,
    });
    expect(created.length).toBe(1);
    const instance = created[0];
    instance.readyState = FakeWebSocket.OPEN;
    // simulate close
    instance.dispatchEvent(new CloseEvent("close"));
    // flush the scheduled reconnect
    flushTimers();
    expect(created.length).toBe(2);
  });

  it("should not reconnect after forced close", () => {
    const ws = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
      retryDelay: 1000,
    });
    const instance = created[0];
    ws.close();
    instance.dispatchEvent(new CloseEvent("close"));
    // flush any timers (should be none)
    flushTimers();
    expect(created.length).toBe(1);
  });

  it("should dispatch message", () => {
    const wsObj = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
    });
    const msgs: any[] = [];
    wsObj.addEventListener("message", (ev: MessageEvent) => msgs.push(ev.data));

    const instance = created[0];
    // simulate message and error on underlying socket
    instance.dispatchEvent(new MessageEvent("message", { data: "hello-msg" }));
    // flush async dispatch
    flushTimers();

    expect(msgs).toEqual(["hello-msg"]);
  });

  it("should reconnect on connection timeout", () => {
    // use 0 timeout for immediate abort
    new ReconnectingWebSocket("ws://timeout", {
      WebSocketConstructor: FakeWebSocket as any,
      connectionTimeout: 0,
      retryDelay: 100,
      maxRetryDelay: 200,
      backoffFactor: 2,
    });
    expect(created.length).toBe(1);
    // trigger timeout abort
    flushTimers();
    // trigger reconnect
    flushTimers();
    expect(created.length).toBe(2);
  });

  it("should dispatch close event on connection timeout", () => {
    const wsObj = new ReconnectingWebSocket("ws://timeout", {
      WebSocketConstructor: FakeWebSocket as any,
      connectionTimeout: 0,
    });
    const closes: any[] = [];
    wsObj.addEventListener("close", (ev: CloseEvent) => closes.push(ev));
    // trigger abort and onClose dispatch
    flushTimers(); // abort and schedule reconnect + dispatch close
    flushTimers(); // dispatch the close event
    expect(closes.length).toBe(1);
  });

  it("should return CLOSED readyState after forced close", () => {
    const wsObj = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
    });
    const instance = created[0];
    instance.readyState = FakeWebSocket.OPEN;
    wsObj.close();
    expect(wsObj.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("should remove event listener", async () => {
    const ws = new ReconnectingWebSocket("ws://test", {
      WebSocketConstructor: FakeWebSocket as any,
    });
    let calls = 0;

    function onOpen(this: ReconnectingWebSocket) {
      calls++;
    }

    ws.addEventListener("open", onOpen);
    const instance = created[0];
    instance.readyState = FakeWebSocket.OPEN;
    instance.dispatchEvent(new Event("open"));
    flushTimers();
    expect(calls).toBe(1);
    ws.removeEventListener("open", onOpen);
    instance.dispatchEvent(new Event("open"));
    flushTimers();
    expect(calls).toBe(1);
  });
});
