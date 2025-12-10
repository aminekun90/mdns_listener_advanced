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
  // Capture handlers to trigger them manually
  let socketHandlers: { [key: string]: (msg: Buffer, rinfo?: any) => void } = {};

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};

    // Capture socket event handlers when .on is called
    (socketMock.on as Mock).mockImplementation((event, handler) => {
      socketHandlers[event] = handler;
      return socketMock;
    });

    // Default socket bind success simulation
    (socketMock.bind as Mock).mockImplementation((port, cb) => {
      if (cb) cb();
    });

    // Default socket send success simulation
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

  it("should initialize and create a UDP socket", () => {
    expect(dgram.createSocket).toHaveBeenCalledWith({ type: "udp4", reuseAddr: true });
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

    expect(fs.readFileSync).toHaveBeenCalledWith("/custom/path", { encoding: "utf-8" });
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

  it("should throw error if no hosts found anywhere", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const emptyCore = new Core([], null, undefined, loggerMock);
    const eventSpy = vi.fn();

    const emitter = emptyCore.listen();
    emitter.on(EmittedEvent.ERROR, eventSpy);
    // Safety net for string-based 'error'
    emitter.on("error", () => {});

    await new Promise(process.nextTick);

    expect(eventSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringMatching(/not provided/));
  });

  it("should bind socket and add membership on listen", () => {
    core.listen();
    expect(socketMock.bind).toHaveBeenCalledWith(5353, expect.any(Function));
    expect(socketMock.addMembership).toHaveBeenCalledWith("224.0.0.251");
    expect(socketMock.setMulticastLoopback).toHaveBeenCalledWith(true);
  });

  it("should emit error if socket binding fails", () => {
    (socketMock.bind as Mock).mockImplementationOnce(() => {
      throw new Error("Bind failed");
    });

    core.listen();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to bind"),
      expect.any(Error),
    );
  });

  it("should parse a valid mDNS Response packet and emit event", () => {
    const emitter = core.listen();
    const eventSpy = vi.fn();
    emitter.on(EmittedEvent.RESPONSE, eventSpy);

    const targetHost = "example-device.local";
    // NOTE: This packet places TXT records in the 'Additional' section.
    // Core.ts must iterate over (anCount + nsCount + arCount) to find it.
    const packet = DNSBuffer.createResponse(targetHost, "192.168.1.50", { "my-key": "my-value" });

    const onMessage = socketHandlers["message"];
    expect(onMessage).toBeDefined();

    onMessage(packet);

    expect(eventSpy).toHaveBeenCalledTimes(1);

    const emittedData = eventSpy.mock.calls[0][0];
    expect(emittedData).toHaveLength(1);

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

  it("should handle Malformed/Garbage packets gracefully", () => {
    core.listen();
    const onMessage = socketHandlers["message"];
    const garbage = Buffer.from([0x00, 0x01, 0xff]);

    expect(() => onMessage(garbage)).not.toThrow();
    // Assuming logger.warn for malformed packets based on latest Core.ts
    expect(loggerMock.warn).toHaveBeenCalledWith("Failed to parse message", expect.anything());
  });

  it("should publish a hostname (send packet)", () => {
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

    core.publish("my-service");

    expect(socketMock.send).toHaveBeenCalledTimes(1);

    const [buffer, offset, length, port, ip] = (socketMock.send as Mock).mock.calls[0];

    expect(offset).toBe(0);
    expect(length).toBe(125);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(port).toBe(5353);
    expect(ip).toBe("224.0.0.251");
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

  it("should close socket and remove listeners on stop", () => {
    const emitter = core.listen();
    const spyRemove = vi.spyOn(emitter, "removeAllListeners");

    core.stop();

    expect(socketMock.close).toHaveBeenCalled();
    expect(spyRemove).toHaveBeenCalled();
  });
});
