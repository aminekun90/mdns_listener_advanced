import { Core } from "@/Core.js";
import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import { EmittedEvent } from "@/types.js";
import * as dgram from "node:dgram";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// --- Mocks ---

// 1. Mock Node Filesystem
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// 2. Mock Node OS
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    networkInterfaces: vi.fn(),
    homedir: vi.fn(() => "/home/testuser"),
  };
});

// 3. Robust dgram mock
const socketMock = {
  on: vi.fn(),
  bind: vi.fn(),
  send: vi.fn(),
  addMembership: vi.fn(),
  setMulticastLoopback: vi.fn(),
  close: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn(),
  ref: vi.fn(),
  unref: vi.fn(),
  address: vi.fn(() => ({ address: "0.0.0.0", port: 5353 })),
};

vi.mock("node:dgram", () => {
  const createSocket = vi.fn(() => socketMock);
  return {
    default: { createSocket },
    createSocket,
  };
});

// 4. Mock Crypto
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
}));

describe("Core", () => {
  let core: Core;
  let loggerMock: any;
  let socketHandlers: { [key: string]: (msg: Buffer, rinfo?: any) => void } = {};

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};

    // Capture socket event handlers
    (socketMock.on as Mock).mockImplementation((event, handler) => {
      socketHandlers[event] = handler;
      return socketMock;
    });

    // Default socket bind success
    (socketMock.bind as Mock).mockImplementation((port, cb) => {
      if (cb) cb();
    });

    // Default socket send success
    (socketMock.send as Mock).mockImplementation((msg, off, len, port, addr, cb) => {
      if (cb) cb(null);
    });

    loggerMock = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    core = new Core(["example-device"], undefined, { debug: true }, loggerMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization & Config", () => {
    it("should initialize and create a UDP socket", () => {
      expect(dgram.createSocket).toHaveBeenCalledWith({
        type: "udp4",
        reuseAddr: true,
      });
      expect(socketMock.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(socketMock.on).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("should enable debug logging when option is set", () => {
      (core as any).debug("test message");
      expect(loggerMock.debug).toHaveBeenCalledWith("test message");
    });

    it("should load hosts from explicit string array", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      core.listen();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Looking for hostnames...",
        expect.arrayContaining(["example-device"]),
      );
    });

    it("should load hosts from file path", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("host-from-file");

      const fileCore = new Core(null, "/custom/path", undefined, loggerMock);
      fileCore.listen();

      expect(fs.readFileSync).toHaveBeenCalledWith("/custom/path", {
        encoding: "utf-8",
      });
      expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["host-from-file"]);
    });

    it("should fallback to OS homedir if no hosts provided", async () => {
      const expectedPath = path.join("/home/testuser", ".mdns-hosts");

      vi.mocked(fs.existsSync).mockImplementation((p) => p === expectedPath);
      vi.mocked(fs.readFileSync).mockReturnValue("home-host");

      const autoCore = new Core([], null, undefined, loggerMock);

      // Prevent unhandled error crash
      const emitter = autoCore.listen();
      emitter.on("error", () => {});

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["home-host"]);
    });

    // UPDATED TEST: Now expects logs instead of a crash/error event
    it("should log warning and debug if no hosts found (graceful fail)", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const emptyCore = new Core([], null, undefined, loggerMock);

      emptyCore.listen();

      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringMatching(/not provided/));
      // It should also debug log that hosts are empty
      expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining("Hosts are empty"));
    });

    // NEW TEST: Verifies process.nextTick error emission
    it("should emit ERROR event asynchronously via nextTick if initialization crashes", async () => {
      // Simulate a crash in __initListener (e.g., readFileSync throws)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("FS Permission Denied");
      });

      const crashingCore = new Core(null, "/protected/file", undefined, loggerMock);
      const emitter = crashingCore.listen();

      const spyError = vi.fn();
      emitter.on(EmittedEvent.ERROR, spyError);

      // Wait for next tick to allow process.nextTick to fire
      await new Promise(process.nextTick);

      expect(spyError).toHaveBeenCalledWith(expect.any(Error));
      expect(spyError.mock.calls[0][0].message).toContain("Problem in MDNS listener");
    });
  });

  describe("Socket Lifecycle", () => {
    it("should bind socket and add membership on listen", () => {
      core.listen();
      expect(socketMock.bind).toHaveBeenCalledWith(5353, expect.any(Function));
      expect(socketMock.addMembership).toHaveBeenCalledWith("224.0.0.251");
      expect(socketMock.setMulticastLoopback).toHaveBeenCalledWith(true);
    });

    it("should log error if socket binding fails", () => {
      (socketMock.bind as Mock).mockImplementationOnce(() => {
        throw new Error("Bind failed");
      });

      core.listen();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to bind"),
        expect.any(Error),
      );
    });

    it("should NOT re-bind if already listening (Idempotency)", () => {
      core.listen();
      expect(socketMock.bind).toHaveBeenCalledTimes(1);

      core.listen();
      expect(socketMock.bind).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should handle ERR_SOCKET_ALREADY_BOUND gracefully", () => {
      // Simulate race condition error
      (socketMock.bind as Mock).mockImplementationOnce(() => {
        const err: any = new Error("Already bound");
        err.code = "ERR_SOCKET_ALREADY_BOUND";
        throw err;
      });

      core.listen();
      // Should not log error, just continue
      expect(loggerMock.error).not.toHaveBeenCalled();
      // Should set listening to true
      expect((core as any).isListening).toBe(true);
    });

    it("should allow dynamic hostnames via listen(ref)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      core.listen("dynamic-host-1\ndynamic-host-2");
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Looking for hostnames...",
        expect.arrayContaining(["dynamic-host-1", "dynamic-host-2"]),
      );
    });
  });

  describe("Parsing & Responses", () => {
    it("should parse a valid mDNS Response packet and emit event", () => {
      const emitter = core.listen();
      const eventSpy = vi.fn();
      emitter.on(EmittedEvent.RESPONSE, eventSpy);

      const targetHost = "example-device.local";
      const packet = DNSBuffer.createResponse(targetHost, "192.168.1.50", {
        "my-key": "my-value",
      });

      const onMessage = socketHandlers["message"];
      expect(onMessage).toBeDefined();

      onMessage(packet);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const emittedData = eventSpy.mock.calls[0][0];
      expect(emittedData[0]).toMatchObject({
        name: "example-device.local",
        type: "TXT",
        data: { "my-key": "my-value" },
      });
    });

    it("should ignore packets that do not match the hostname list", () => {
      const emitter = core.listen();
      const eventSpy = vi.fn();
      emitter.on(EmittedEvent.RESPONSE, eventSpy);
      const packet = DNSBuffer.createResponse("other-device.local", "1.1.1.1", {});
      socketHandlers["message"](packet);
      expect(eventSpy).not.toHaveBeenCalled();
    });

    it("should handle Malformed packets gracefully", () => {
      core.listen();
      const onMessage = socketHandlers["message"];
      const garbage = Buffer.from([0x00, 0x01, 0xff]);

      expect(() => onMessage(garbage)).not.toThrow();
      expect(loggerMock.warn).toHaveBeenCalledWith("Failed to parse message", expect.anything());
    });
  });

  describe("Publishing (Heartbeat)", () => {
    beforeEach(() => {
      vi.mocked(os.networkInterfaces).mockReturnValue({
        eth0: [
          {
            address: "192.168.1.100",
            family: "IPv4",
            internal: false,
            mac: "",
            netmask: "",
            cidr: "",
          },
        ],
      });
      vi.useFakeTimers(); // Enable fake timers
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should publish immediately once", () => {
      core.publish("my-service", {}, 0); // 0 interval = one shot

      expect(socketMock.send).toHaveBeenCalledTimes(1);
      const [buffer, offset, length, port, ip] = (socketMock.send as Mock).mock.calls[0];
      expect(buffer).toBeInstanceOf(Buffer);
      expect(offset).toBe(0);
      expect(port).toBe(5353);
      expect(ip).toBe("224.0.0.251");
      expect(length).toBeGreaterThan(0);
    });

    it("should publish repeatedly with interval", () => {
      core.publish("my-heartbeat", {}, 1000); // 1s interval

      // Immediate call
      expect(socketMock.send).toHaveBeenCalledTimes(1);

      // Advance 1s
      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(2);

      // Advance another 1s
      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(3);
    });

    it("should not publish if disabled", () => {
      core.setDisablePublisher(true);
      core.publish("test");
      expect(socketMock.send).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith("Publisher is disabled.");
    });

    it("should abort publish if no local IP found", () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({});
      core.publish("test");
      expect(socketMock.send).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith("Could not find local IP during publish");
    });

    it("should clear timer on stop()", () => {
      core.publish("my-heartbeat", {}, 1000);
      expect(socketMock.send).toHaveBeenCalledTimes(1);

      core.stop(); // Should clear interval

      vi.advanceTimersByTime(2000);
      expect(socketMock.send).toHaveBeenCalledTimes(1); // Still 1, no new calls
    });
  });

  describe("Discovery (Scan)", () => {
    it("should send a PTR query packet when scan is called", () => {
      core.listen();
      core.scan("_googlecast._tcp.local");

      expect(socketMock.send).toHaveBeenCalled();

      const calls = (socketMock.send as Mock).mock.calls;
      const lastCall: any = calls[calls.length - 1];
      const [buffer, , , port, ip] = lastCall;

      expect(port).toBe(5353);
      expect(ip).toBe("224.0.0.251");
      expect(buffer).toBeInstanceOf(Buffer);
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining("Scanning network for"));
    });

    it("should not scan if listener is disabled", () => {
      core.setDisableListener(true);
      core.scan();
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Cannot scan"));
    });
  });

  describe("Cleanup", () => {
    it("should close socket and remove listeners on stop", () => {
      const emitter = core.listen();
      const spyRemove = vi.spyOn(emitter, "removeAllListeners");

      core.stop();

      expect(socketMock.close).toHaveBeenCalled();
      expect(spyRemove).toHaveBeenCalled();
      expect((core as any).isListening).toBe(false);
    });
  });
});
