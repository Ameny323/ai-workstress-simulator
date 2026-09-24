// Minimal fake WebSocket for tests -- records every instance created (so a
// test can assert "no duplicate connections"), and lets a test manually
// drive open/message/close/error exactly like a real socket would,
// without touching the network.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset() {
    FakeWebSocket.instances = [];
  }

  url: string;
  readyState = 0; // WebSocket.CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    // A real socket fires onclose asynchronously even for a self-initiated
    // close; tests that need to observe this call simulateClose() themselves
    // to keep control over timing, so this intentionally does NOT auto-fire.
  }
}
