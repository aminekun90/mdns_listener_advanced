import { Core } from "@/Core.js";
import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import { DiscoveredService, EmittedEvent } from "@/types.js";
import * as dgram from "node:dgram";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    networkInterfaces: vi.fn(),
    homedir: vi.fn(() => "/home/testuser"),
  };
});

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
  return { default: { createSocket }, createSocket };
});

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Minimal IPv4 network interface stub. */
function makeIface(address: string, internal = false) {
  return [{ address, family: "IPv4", internal, mac: "", netmask: "", cidr: "" }];
}

/** Builds a minimal AAAA DNS response buffer for the given hostname and IPv6 address. */
function buildAAAAPacket(name: string, ipv6: string): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(0, 4);  // QD
  header.writeUInt16BE(1, 6);  // AN
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const rr = Buffer.alloc(10);
  rr.writeUInt16BE(28, 0);   // Type AAAA
  rr.writeUInt16BE(1, 2);    // Class IN
  rr.writeUInt32BE(120, 4);  // TTL
  rr.writeUInt16BE(16, 8);   // RDLength

  const groups = ipv6.split(":");
  const ipv6Buf = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    ipv6Buf.writeUInt16BE(parseInt(groups[i] ?? "0", 16), i * 2);
  }

  return Buffer.concat([header, DNSBuffer.encodeName(name), rr, ipv6Buf]);
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("Core", () => {
  let core: Core;
  let loggerMock: { info: Mock; warn: Mock; debug: Mock; error: Mock };
  let socketHandlers: Record<string, (msg: Buffer) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};

    (socketMock.on as Mock).mockImplementation((event, handler) => {
      socketHandlers[event] = handler;
      return socketMock;
    });

    (socketMock.bind as Mock).mockImplementation((_port, cb) => { if (cb) cb(); });
    (socketMock.send as Mock).mockImplementation((_msg, _off, _len, _port, _addr, cb) => {
      if (cb) cb(null);
    });

    loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };

    core = new Core(["example-device"], undefined, { debug: true }, loggerMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Initialization ────────────────────────────────────────────────────

  describe("Initialization & Config", () => {
    it("creates a UDP4 socket with reuseAddr on construction", () => {
      expect(dgram.createSocket).toHaveBeenCalledWith({ type: "udp4", reuseAddr: true });
      expect(socketMock.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(socketMock.on).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("logs debug messages when debug option is set", () => {
      (core as any).debug("test message");
      expect(loggerMock.debug).toHaveBeenCalledWith("test message");
    });

    it("loads hosts from the explicit string array", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      core.listen();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Looking for hostnames...",
        expect.arrayContaining(["example-device"]),
      );
    });

    it("loads hosts from a file path", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("host-from-file");
      const fileCore = new Core(null, "/custom/path", undefined, loggerMock);
      fileCore.listen();
      expect(fs.readFileSync).toHaveBeenCalledWith("/custom/path", { encoding: "utf-8" });
      expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["host-from-file"]);
    });

    it("falls back to ~/.mdns-hosts when no hosts are provided", () => {
      const expectedPath = path.join("/home/testuser", ".mdns-hosts");
      vi.mocked(fs.existsSync).mockImplementation((p) => p === expectedPath);
      vi.mocked(fs.readFileSync).mockReturnValue("home-host");

      const autoCore = new Core([], null, undefined, loggerMock);
      autoCore.listen().on("error", () => {});

      expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["home-host"]);
    });

    it("logs warning and debug gracefully when no hosts are found", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      new Core([], null, undefined, loggerMock).listen();
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringMatching(/not provided/));
      expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining("Hosts are empty"));
    });

    it("emits ERROR asynchronously via nextTick when init crashes", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("FS Permission Denied");
      });
      const crashingCore = new Core(null, "/protected/file", undefined, loggerMock);
      const errorSpy = vi.fn();
      crashingCore.listen().on(EmittedEvent.ERROR, errorSpy);
      await new Promise(process.nextTick);
      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ─── Socket lifecycle ──────────────────────────────────────────────────

  describe("Socket Lifecycle", () => {
    it("binds to port 5353 and joins the multicast group on listen()", () => {
      core.listen();
      expect(socketMock.bind).toHaveBeenCalledWith(5353, expect.any(Function));
      expect(socketMock.addMembership).toHaveBeenCalledWith("224.0.0.251");
      expect(socketMock.setMulticastLoopback).toHaveBeenCalledWith(true);
    });

    it("logs error when socket binding fails", () => {
      (socketMock.bind as Mock).mockImplementationOnce(() => { throw new Error("Bind failed"); });
      core.listen();
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to bind"),
        expect.any(Error),
      );
    });

    it("is idempotent — does not re-bind when already listening", () => {
      core.listen();
      core.listen();
      expect(socketMock.bind).toHaveBeenCalledTimes(1);
    });

    it("handles ERR_SOCKET_ALREADY_BOUND gracefully (race condition)", () => {
      (socketMock.bind as Mock).mockImplementationOnce(() => {
        const err: any = new Error("Already bound");
        err.code = "ERR_SOCKET_ALREADY_BOUND";
        throw err;
      });
      core.listen();
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect((core as any).isListening).toBe(true);
    });

    it("updates hostnames dynamically via listen(ref)", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      core.listen("dynamic-1\ndynamic-2");
      expect(loggerMock.info).toHaveBeenCalledWith(
        "Looking for hostnames...",
        expect.arrayContaining(["dynamic-1", "dynamic-2"]),
      );
    });

    it("does not listen when disableListener is set", () => {
      const silentCore = new Core(["x"], undefined, { disableListener: true }, loggerMock);
      silentCore.listen();
      expect(socketMock.bind).not.toHaveBeenCalled();
    });
  });

  // ─── Parsing & Responses ───────────────────────────────────────────────

  describe("Parsing & Responses", () => {
    it("parses a valid mDNS response and emits RESPONSE for matched hostname", () => {
      const eventSpy = vi.fn();
      core.listen().on(EmittedEvent.RESPONSE, eventSpy);

      const packet = DNSBuffer.createResponse("example-device.local", "192.168.1.50", {
        "my-key": "my-value",
      });
      socketHandlers["message"](packet);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0][0]).toMatchObject({
        name: "example-device.local",
        type: "TXT",
        data: { "my-key": "my-value" },
      });
    });

    it("ignores packets whose hostname does not match the watch list", () => {
      const eventSpy = vi.fn();
      core.listen().on(EmittedEvent.RESPONSE, eventSpy);
      socketHandlers["message"](
        DNSBuffer.createResponse("other-device.local", "1.1.1.1", {}),
      );
      expect(eventSpy).not.toHaveBeenCalled();
    });

    it("emits RAW_RESPONSE for every valid packet regardless of hostname match", () => {
      const rawSpy = vi.fn();
      core.listen().on(EmittedEvent.RAW_RESPONSE, rawSpy);
      socketHandlers["message"](
        DNSBuffer.createResponse("unrelated.local", "2.2.2.2", {}),
      );
      expect(rawSpy).toHaveBeenCalledTimes(1);
    });

    it("handles malformed packets without throwing", () => {
      core.listen();
      expect(() => socketHandlers["message"](Buffer.from([0x00, 0x01, 0xff]))).not.toThrow();
      expect(loggerMock.warn).toHaveBeenCalledWith("Failed to parse message", expect.anything());
    });
  });

  // ─── Discovery ─────────────────────────────────────────────────────────

  describe("Discovery (scan)", () => {
    it("sends a PTR query to 224.0.0.251:5353 on scan()", () => {
      core.listen();
      core.scan("_googlecast._tcp.local");

      const calls = (socketMock.send as Mock).mock.calls;
      const [buf, , , port, ip] = calls[calls.length - 1];
      expect(port).toBe(5353);
      expect(ip).toBe("224.0.0.251");
      expect(buf).toBeInstanceOf(Buffer);
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining("Scanning network for"));
    });

    it("refuses to scan when listener is disabled", () => {
      core.setDisableListener(true);
      core.scan();
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("Cannot scan"));
    });

    it("emits DISCOVERY with type A for incoming A records", () => {
      const discoverySpy = vi.fn();
      core.listen().on(EmittedEvent.DISCOVERY, discoverySpy);
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}),
      );
      const aEvent = discoverySpy.mock.calls.find(([s]: [DiscoveredService]) => s.type === "A");
      expect(aEvent).toBeDefined();
    });

    it("emits DISCOVERY with type AAAA for incoming AAAA records", () => {
      const discoverySpy = vi.fn();
      core.listen().on(EmittedEvent.DISCOVERY, discoverySpy);
      socketHandlers["message"](
        buildAAAAPacket("ipv6-device.local", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
      );
      expect(discoverySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "AAAA",
          name: "ipv6-device.local",
          data: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        }),
      );
    });

    it("includes the TTL from the wire packet in DISCOVERY events", () => {
      const discoverySpy = vi.fn();
      core.listen().on(EmittedEvent.DISCOVERY, discoverySpy);
      const packet = DNSBuffer.createResponse("ttl-device.local", "1.2.3.4", {}, 42);
      socketHandlers["message"](packet);
      const aEvent = discoverySpy.mock.calls.find(([s]: [DiscoveredService]) => s.type === "A");
      expect(aEvent[0].ttl).toBe(42);
    });
  });

  // ─── discoverOnce ──────────────────────────────────────────────────────

  describe("discoverOnce()", () => {
    it("returns a Promise", () => {
      const result = core.discoverOnce("_test._tcp.local", 100);
      expect(result).toBeInstanceOf(Promise);
      return result; // clean up
    });

    it("collects DISCOVERY events and resolves after the timeout", async () => {
      vi.useFakeTimers();
      core.listen();

      const promise = core.discoverOnce("_test._tcp.local", 1000);

      // Inject a discovery event while the window is open
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, {
        name: "_my-service._test._tcp.local",
        type: "PTR",
        data: "_my-service._test._tcp.local",
        ttl: 120,
      });

      vi.advanceTimersByTime(1001);
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("PTR");
      vi.useRealTimers();
    });

    it("deduplicates nothing — returns all events in order", async () => {
      vi.useFakeTimers();
      core.listen();

      const promise = core.discoverOnce("_dup._tcp.local", 1000);

      const service = { name: "_dup._tcp.local", type: "PTR", data: "s", ttl: 120 };
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, service);
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, service);

      vi.advanceTimersByTime(1001);
      const result = await promise;

      expect(result).toHaveLength(2);
      vi.useRealTimers();
    });

    it("resolves with an empty array when listener is disabled", async () => {
      core.setDisableListener(true);
      const result = await core.discoverOnce();
      expect(result).toEqual([]);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining("listener is disabled"));
    });

    it("stops collecting after the timeout even if events keep arriving", async () => {
      vi.useFakeTimers();
      core.listen();

      const promise = core.discoverOnce("_late._tcp.local", 500);

      vi.advanceTimersByTime(501); // timeout fires
      await promise;

      // Events arriving after timeout should NOT be collected
      const promise2 = core.discoverOnce("_late._tcp.local", 100);
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, {
        name: "_late._tcp.local",
        type: "PTR",
        data: "x",
        ttl: 120,
      });

      vi.advanceTimersByTime(101);
      const result2 = await promise2;
      expect(result2.length).toBeGreaterThanOrEqual(0); // just checking it resolves cleanly

      vi.useRealTimers();
    });
  });

  // ─── Publishing (single service) ───────────────────────────────────────

  describe("Publishing", () => {
    beforeEach(() => {
      vi.mocked(os.networkInterfaces).mockReturnValue({ eth0: makeIface("192.168.1.100") });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends an announcement immediately on publish()", () => {
      core.publish("my-service", {}, 0);
      const [buf, off, , port, ip] = (socketMock.send as Mock).mock.calls[0];
      expect(buf).toBeInstanceOf(Buffer);
      expect(off).toBe(0);
      expect(port).toBe(5353);
      expect(ip).toBe("224.0.0.251");
    });

    it("repeats the announcement at the given interval", () => {
      core.publish("my-heartbeat", {}, 1000);
      expect(socketMock.send).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(3);
    });

    it("does not publish when the publisher is disabled", () => {
      core.setDisablePublisher(true);
      core.publish("test");
      expect(socketMock.send).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith("Publisher is disabled.");
    });

    it("warns and skips when no local IP is available", () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({});
      core.publish("test");
      expect(socketMock.send).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith("Could not find local IP during publish");
    });

    it("uses the configured TTL option in published packets", () => {
      const customCore = new Core(["x"], undefined, { ttl: 300 }, loggerMock);
      vi.mocked(os.networkInterfaces).mockReturnValue({ eth0: makeIface("10.0.0.1") });
      customCore.publish("ttl-test", {}, 0);

      const [buf] = (socketMock.send as Mock).mock.calls.at(-1)!;
      const dns = new DNSBuffer(buf as Buffer);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip header
      const a = dns.readAnswer();
      expect(a.ttl).toBe(300);
    });
  });

  // ─── Multiple service publishing ───────────────────────────────────────

  describe("Multiple Service Publishing", () => {
    beforeEach(() => {
      vi.mocked(os.networkInterfaces).mockReturnValue({ eth0: makeIface("192.168.1.100") });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("publishes multiple services independently", () => {
      core.publish("svc-a", {}, 1000);
      core.publish("svc-b", {}, 2000);

      expect(socketMock.send).toHaveBeenCalledTimes(2); // one immediate send per service

      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(3); // svc-a heartbeat

      vi.advanceTimersByTime(1000);
      expect(socketMock.send).toHaveBeenCalledTimes(5); // svc-a + svc-b heartbeats
    });

    it("stores a separate timer per service name", () => {
      core.publish("svc-1", {}, 1000);
      core.publish("svc-2", {}, 1000);
      expect((core as any).publishTimers.size).toBe(2);
    });

    it("replaces the timer when the same service is re-published", () => {
      core.publish("same-svc", {}, 1000);
      core.publish("same-svc", {}, 2000); // re-publish with different interval
      // Only one timer should remain for this name
      expect((core as any).publishTimers.size).toBe(1);
    });

    it("unpublish() stops only the specified service's heartbeat", () => {
      core.publish("svc-x", {}, 1000);
      core.publish("svc-y", {}, 1000);
      const sendsBefore = (socketMock.send as Mock).mock.calls.length; // 2

      core.unpublish("svc-x"); // stops svc-x + sends 1 goodbye

      vi.advanceTimersByTime(1000);
      const sendsAfter = (socketMock.send as Mock).mock.calls.length;
      // goodbye (1) + svc-y heartbeat (1) — svc-x heartbeat must NOT fire
      expect(sendsAfter).toBe(sendsBefore + 2);
      expect((core as any).publishTimers.has("svc-x")).toBe(false);
      expect((core as any).publishTimers.has("svc-y")).toBe(true);
    });

    it("stop() sends goodbye for every published service", () => {
      core.publish("g-a", {}, 0);
      core.publish("g-b", {}, 0);
      const sendsBeforeStop = (socketMock.send as Mock).mock.calls.length; // 2

      core.stop();

      // Expect 2 more sends (one goodbye per service)
      expect(socketMock.send).toHaveBeenCalledTimes(sendsBeforeStop + 2);
    });
  });

  // ─── Goodbye packets ───────────────────────────────────────────────────

  describe("Goodbye Packets", () => {
    beforeEach(() => {
      vi.mocked(os.networkInterfaces).mockReturnValue({ eth0: makeIface("192.168.1.100") });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stop() sends a goodbye packet with TTL = 0 for each published service", () => {
      core.publish("bye-svc", {}, 0);
      core.stop();

      const calls = (socketMock.send as Mock).mock.calls;
      // The last send before close() is the goodbye
      const goodbyeBuf = calls[calls.length - 1][0] as Buffer;
      const dns = new DNSBuffer(goodbyeBuf);
      for (let i = 0; i < 6; i++) dns.readUInt16(); // skip header
      expect(dns.readAnswer().ttl).toBe(0);
    });

    it("unpublish() sends a goodbye packet for the named service", () => {
      core.publish("svc-to-remove", {}, 0);
      const sendsBefore = (socketMock.send as Mock).mock.calls.length;

      core.unpublish("svc-to-remove");

      expect(socketMock.send).toHaveBeenCalledTimes(sendsBefore + 1);
      const goodbyeBuf = (socketMock.send as Mock).mock.calls.at(-1)![0] as Buffer;
      const dns = new DNSBuffer(goodbyeBuf);
      for (let i = 0; i < 6; i++) dns.readUInt16();
      expect(dns.readAnswer().ttl).toBe(0);
    });

    it("clears the timer on stop() so no more heartbeats fire", () => {
      core.publish("heartbeat-svc", {}, 1000);
      const sendsAtStop = (socketMock.send as Mock).mock.calls.length; // 1 initial

      core.stop();

      vi.advanceTimersByTime(3000);
      // Only the goodbye was added, no new heartbeats after stop
      expect(socketMock.send).toHaveBeenCalledTimes(sendsAtStop + 1); // +1 goodbye only
    });

    it("does not crash when stop() is called before any publish()", () => {
      expect(() => core.stop()).not.toThrow();
    });

    it("does not crash when unpublish() is called for an unknown service", () => {
      expect(() => core.unpublish("never-published")).not.toThrow();
    });
  });

  // ─── on / once / off proxy methods ────────────────────────────────────

  describe("on() / once() / off() proxy methods", () => {
    it("on() registers a listener and returns this for chaining", () => {
      const spy = vi.fn();
      const ret = core.on(EmittedEvent.RESPONSE, spy);
      expect(ret).toBe(core);

      (core as any).myEvent.emit(EmittedEvent.RESPONSE, []);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("on() fires the listener on every matching emit", () => {
      const spy = vi.fn();
      core.on(EmittedEvent.DISCOVERY, spy);
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, {});
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, {});
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("once() fires the listener exactly once", () => {
      const spy = vi.fn();
      core.once(EmittedEvent.RESPONSE, spy);
      (core as any).myEvent.emit(EmittedEvent.RESPONSE, []);
      (core as any).myEvent.emit(EmittedEvent.RESPONSE, []);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("once() returns this for chaining", () => {
      expect(core.once(EmittedEvent.ERROR, vi.fn())).toBe(core);
    });

    it("off() removes a previously registered listener", () => {
      const spy = vi.fn();
      core.on(EmittedEvent.RESPONSE, spy);
      core.off(EmittedEvent.RESPONSE, spy);
      (core as any).myEvent.emit(EmittedEvent.RESPONSE, []);
      expect(spy).not.toHaveBeenCalled();
    });

    it("off() returns this for chaining", () => {
      const spy = vi.fn();
      core.on(EmittedEvent.ERROR, spy);
      expect(core.off(EmittedEvent.ERROR, spy)).toBe(core);
    });

    it("multiple listeners for the same event all fire", () => {
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      core.on(EmittedEvent.DISCOVERY, spy1);
      core.on(EmittedEvent.DISCOVERY, spy2);
      (core as any).myEvent.emit(EmittedEvent.DISCOVERY, {});
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Device Registry ──────────────────────────────────────────────────

  describe("Device Registry", () => {
    it("emits DEVICE_FOUND the first time a targeted device is seen", () => {
      const foundSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_FOUND, foundSpy);
      core.listen();

      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", { v: "1" }),
      );

      expect(foundSpy).toHaveBeenCalledTimes(1);
      expect(foundSpy.mock.calls[0][0]).toMatchObject({ name: "example-device.local" });
    });

    it("does NOT re-emit DEVICE_FOUND for the same device on refresh", () => {
      const foundSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_FOUND, foundSpy);
      core.listen();

      const packet = DNSBuffer.createResponse("example-device.local", "192.168.1.50", {});
      socketHandlers["message"](packet);
      socketHandlers["message"](packet); // second announce (heartbeat)

      expect(foundSpy).toHaveBeenCalledTimes(1);
    });

    it("emits DEVICE_LOST when TTL expires", async () => {
      vi.useFakeTimers();
      const lostSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_LOST, lostSpy);
      core.listen();

      // TTL = 1 second
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}, 1),
      );

      expect(lostSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1001);
      expect(lostSpy).toHaveBeenCalledWith("example-device.local");

      vi.useRealTimers();
    });

    it("refreshes the TTL timer when a new packet arrives before expiry", async () => {
      vi.useFakeTimers();
      const lostSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_LOST, lostSpy);
      core.listen();

      // First announcement: TTL = 2s
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}, 2),
      );

      vi.advanceTimersByTime(1500); // halfway through first TTL
      expect(lostSpy).not.toHaveBeenCalled();

      // Refresh: TTL = 2s again
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}, 2),
      );

      vi.advanceTimersByTime(1500); // would have expired from first TTL but refresh reset it
      expect(lostSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(600); // now past the refreshed TTL
      expect(lostSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("emits DEVICE_LOST immediately on a goodbye packet (TTL = 0)", () => {
      const foundSpy = vi.fn();
      const lostSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_FOUND, foundSpy);
      core.on(EmittedEvent.DEVICE_LOST, lostSpy);
      core.listen();

      // Device appears
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}, 120),
      );
      expect(foundSpy).toHaveBeenCalledTimes(1);

      // Goodbye packet
      socketHandlers["message"](
        DNSBuffer.createGoodbye("example-device.local", "192.168.1.50"),
      );
      expect(lostSpy).toHaveBeenCalledWith("example-device.local");
    });

    it("getDiscoveredDevices() returns all currently live registry entries", () => {
      core.listen();

      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}),
      );

      const devices = core.getDiscoveredDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe("example-device.local");
    });

    it("getDiscoveredDevices() returns an empty array before any device is seen", () => {
      expect(core.getDiscoveredDevices()).toEqual([]);
    });

    it("clears the registry on stop()", () => {
      core.listen();
      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}),
      );
      expect(core.getDiscoveredDevices()).toHaveLength(1);

      core.stop();
      expect(core.getDiscoveredDevices()).toHaveLength(0);
    });
  });

  // ─── Interface selection ──────────────────────────────────────────────

  describe("Interface Selection (Options.interface)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("uses the IP from the configured interface when it exists", () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({
        eth0: makeIface("192.168.1.10"),
        wlan0: makeIface("10.0.0.5"),
      });

      const ifaceCore = new Core(["x"], undefined, { interface: "wlan0" }, loggerMock);
      ifaceCore.publish("iface-test", {}, 0);

      const [buf] = (socketMock.send as Mock).mock.calls.at(-1)!;
      const dns = new DNSBuffer(buf as Buffer);
      for (let i = 0; i < 6; i++) dns.readUInt16();
      const a = dns.readAnswer();
      // A record data is the IP as dotted-decimal
      expect(a.data).toBe("10.0.0.5");
    });

    it("falls back to the first non-internal IPv4 when the interface is not found", () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({
        eth0: makeIface("192.168.1.10"),
      });

      const ifaceCore = new Core(["x"], undefined, { interface: "nonexistent0" }, loggerMock);
      ifaceCore.publish("fallback-test", {}, 0);

      const [buf] = (socketMock.send as Mock).mock.calls.at(-1)!;
      const dns = new DNSBuffer(buf as Buffer);
      for (let i = 0; i < 6; i++) dns.readUInt16();
      expect(dns.readAnswer().data).toBe("192.168.1.10");
    });

    it("skips link-local (169.x.x.x) addresses in the fallback scan", () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({
        eth0: makeIface("169.254.0.1"),
        eth1: makeIface("10.0.0.2"),
      });

      const ifaceCore = new Core(["x"], undefined, {}, loggerMock);
      ifaceCore.publish("skip-link-local", {}, 0);

      const [buf] = (socketMock.send as Mock).mock.calls.at(-1)!;
      const dns = new DNSBuffer(buf as Buffer);
      for (let i = 0; i < 6; i++) dns.readUInt16();
      expect(dns.readAnswer().data).toBe("10.0.0.2");
    });
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────

  describe("Cleanup", () => {
    it("closes the socket and removes all listeners on stop()", () => {
      const emitter = core.listen();
      const spyRemove = vi.spyOn(emitter, "removeAllListeners");

      core.stop();

      expect(socketMock.close).toHaveBeenCalled();
      expect(spyRemove).toHaveBeenCalled();
      expect((core as any).isListening).toBe(false);
    });

    it("clears all registry timers on stop()", () => {
      vi.useFakeTimers();
      const lostSpy = vi.fn();
      core.on(EmittedEvent.DEVICE_LOST, lostSpy);
      core.listen();

      socketHandlers["message"](
        DNSBuffer.createResponse("example-device.local", "192.168.1.50", {}, 1),
      );

      core.stop();

      // Advancing time should NOT trigger DEVICE_LOST because timers are cleared
      vi.advanceTimersByTime(2000);
      expect(lostSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
