import { Core } from "@/Core.js";
import { EmittedEvent } from "@/types.js";
import { Bonjour } from "bonjour-service";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    networkInterfaces: vi.fn(),
    platform: vi.fn(() => "linux"),
    homedir: vi.fn(() => "/home/test"),
  };
});

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return {
    ...actual,
    join: vi.fn(),
  };
});

const mdnsInstanceMock = {
  on: vi.fn(),
  query: vi.fn(),
  destroy: vi.fn(),
  emit: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock("multicast-dns", () => {
  return {
    default: vi.fn(() => mdnsInstanceMock),
  };
});

const bonjourInstanceMock = {
  publish: vi.fn(),
  unpublishAll: vi.fn(),
  destroy: vi.fn(),
};

vi.mock("bonjour-service", () => {
  return {
    // ignore annoying soarqube warning about class with constructor only
    Bonjour: class { // NOSONAR
      constructor() {
        return bonjourInstanceMock; // NOSONAR
      }

    },
  };
});

describe("Core", () => {
  let core: Core;
  let loggerMock: any;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();

    loggerMock = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    eventEmitter = new EventEmitter();
    vi.spyOn(eventEmitter, "emit");
    vi.spyOn(eventEmitter, "removeAllListeners");
    vi.spyOn(eventEmitter, "on");

    core = new Core(
      ["example"],
      undefined,
      { debug: true },
      loggerMock,
      mdnsInstanceMock as any,
      eventEmitter,
      new Bonjour(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be initialized with defaults", () => {
    const defaultCore = new Core();
    expect(defaultCore).toBeDefined();
    expect((defaultCore as any).hostnames).toEqual([]);
  });

  it("should accept custom logger", () => {
    const customLogger = { ...loggerMock };
    const c = new Core([], undefined, undefined, customLogger);
    (c as any).info("test");
    expect(customLogger.info).toHaveBeenCalledWith("test");
  });

  it("should enable debug logging when option is set", () => {
    const debugCore = new Core([], undefined, { debug: true }, loggerMock);
    (debugCore as any).debug("test debug");
    expect(loggerMock.debug).toHaveBeenCalledWith("test debug");
  });

  it("should NOT log debug when option is false", () => {
    const noDebugCore = new Core([], undefined, { debug: false }, loggerMock);
    (noDebugCore as any).debug("test debug");
    expect(loggerMock.debug).not.toHaveBeenCalled();
  });

  it("should throw an error when no hostnames provided", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const emptyCore = new Core([], undefined, undefined, loggerMock);
    expect(() => (emptyCore as any).__getHosts()).toThrowError(/Provide hostnames/);
  });

  it("should parse hostnames from file", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`host1\nhost2`);
    const fileCore = new Core(null, "/path/hosts", undefined, loggerMock, mdnsInstanceMock as any, eventEmitter);

    fileCore.listen();

    expect(fs.readFileSync).toHaveBeenCalledWith("/path/hosts", { encoding: "utf-8" });
    expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["host1", "host2"]);
  });

  it("should fallback to OS default path and recurse (Linux)", () => {
    vi.mocked(os.platform).mockReturnValue("linux");
    vi.mocked(os.homedir).mockReturnValue("/home/test");
    vi.mocked(join).mockImplementation((...paths: string[]) => paths.join("/"));
    vi.mocked(fs.existsSync).mockImplementation((path) => path === "/home/test/.mdns-hosts");
    vi.mocked(fs.readFileSync).mockReturnValue("linux-host");

    const autoCore = new Core([], undefined, undefined, loggerMock, mdnsInstanceMock as any, eventEmitter);
    autoCore.listen();

    expect(fs.existsSync).toHaveBeenCalledWith("/home/test/.mdns-hosts");
    expect(loggerMock.info).toHaveBeenCalledWith("Looking for hostnames...", ["linux-host"]);
  });

  it("should fallback to OS default path (Windows)", () => {
    vi.mocked(os.platform).mockReturnValue("win32");
    vi.mocked(os.homedir).mockReturnValue(`C:\\Users\\Test`);
    vi.mocked(join).mockImplementation((...paths: string[]) => paths.join("\\"));
    vi.mocked(fs.existsSync).mockImplementation((path) => path === `C:\\Users\\Test\\.mdns-hosts`);
    vi.mocked(fs.readFileSync).mockReturnValue("win-host");

    const autoCore = new Core([], undefined, undefined, loggerMock, mdnsInstanceMock as any, eventEmitter);
    autoCore.listen();

    expect(fs.existsSync).toHaveBeenCalledWith(`C:\\Users\\Test\\.mdns-hosts`);
  });

  it("should set error state if __initListener fails", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const errCore = new Core([], undefined, { debug: true }, loggerMock, mdnsInstanceMock as any, eventEmitter);

    // Handle the pending error event to prevent unhandled exception
    eventEmitter.on(EmittedEvent.ERROR, () => {
      // noop
    });

    errCore.listen();

    // Wait for nextTick to let error emit
    await new Promise(process.nextTick);

    expect((errCore as any).error).toBe(true);
    expect(loggerMock.debug).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should warn if hosts file is effectively empty", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("   # comments only");
    const fileCore = new Core(null, "/path", undefined, loggerMock, mdnsInstanceMock as any, eventEmitter);
    fileCore.listen();
    expect(loggerMock.warn).toHaveBeenCalledWith("Hosts are empty");
  });

  it("should detect valid IPv4", () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [{ address: "192.168.1.10", family: "IPv4", internal: false, netmask: "", mac: "", cidr: "" }],
    });
    core.publish("test");
    expect(bonjourInstanceMock.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        txt: expect.objectContaining({ ipv4: '"192.168.1.10"' }),
      }),
    );
  });

  it("should ignore internal, IPv6, and 169.x", () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "", mac: "", cidr: "" }],
      eth6: [{ address: "fe80::1", family: "IPv6", internal: false, netmask: "", mac: "", cidr: "", scopeid: 0 }],
      ethBad: [{ address: "169.254.1.1", family: "IPv4", internal: false, netmask: "", mac: "", cidr: "" }],
      ethEmpty: undefined as any,
    });
    core.publish("test");
    expect(bonjourInstanceMock.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        txt: expect.objectContaining({ ipv4: '""' }),
      }),
    );
  });

  it("should handle loop continue when interface is undefined", () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({
      ethNull: null as any,
    });
    core.publish("test");
    expect(bonjourInstanceMock.publish).toHaveBeenCalled();
  });

  it("should not publish if disabled", () => {
    core.setDisablePublisher(true);
    core.publish("test");
    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining("Publisher is disabled"));
    expect(bonjourInstanceMock.publish).not.toHaveBeenCalled();
  });

  it("should call unpublishAll", () => {
    core.unpublishAll();
    expect(bonjourInstanceMock.unpublishAll).toHaveBeenCalled();
  });

  it("should catch error during unpublishAll", () => {
    bonjourInstanceMock.unpublishAll.mockImplementationOnce(() => {
      throw new Error("Unpublish Fail");
    });
    core.unpublishAll();
    expect(loggerMock.debug).toHaveBeenCalledWith("unpublishAll error", expect.any(Error));
  });

  it("should not listen if disabled", () => {
    core.setDisableListener(true);
    core.listen();
    expect(loggerMock.info).toHaveBeenCalledWith("Listener is disabled");
    expect(mdnsInstanceMock.on).not.toHaveBeenCalled();
  });

  it("should emit error if initialization failed", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const errCore = new Core([], undefined, undefined, loggerMock, mdnsInstanceMock as any, eventEmitter);

    const listener = errCore.listen();
    listener.on(EmittedEvent.ERROR, () => {
      // noop
    });

    await new Promise(process.nextTick);
    expect(eventEmitter.emit).toHaveBeenCalledWith(EmittedEvent.ERROR, expect.any(Error));
  });

  it("should handle valid response", () => {
    core.listen();
    const callback = mdnsInstanceMock.on.mock.calls[0][1];
    const mockResponse = {
      answers: [
        {
          name: "example.local",
          type: "TXT",
          data: [Buffer.from("key=val")],
        },
      ],
    };

    callback(mockResponse);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EmittedEvent.RESPONSE,
      expect.arrayContaining([expect.objectContaining({ name: "example.local" })]),
    );
  });

  it("should ignore mismatching hosts and malformed packets", () => {
    core.listen();
    const callback = mdnsInstanceMock.on.mock.calls[0][1];

    callback({});
    callback({ answers: [{ name: "wrong.local", type: "TXT", data: [] }] });
    callback({ answers: [{ name: "example.local", type: "TXT", data: null }] });
    callback({ answers: [{ name: "example.local", type: "TXT", data: "bad" }] });

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(EmittedEvent.RESPONSE, expect.anything());
  });

  it("should parse buffer data with quotes logic", () => {
    const parse = (core as any).handleBufferData.bind(core);

    expect(parse(Buffer.from('key="value"'))).toEqual({ key: "value" });
    expect(parse(Buffer.from("key=value"))).toEqual({ key: "value" });
    expect(parse(Buffer.from(`key="val \\"inner\\""`))).toEqual({ key: 'val "inner"' });
    expect(parse(Buffer.from(`key="""`))).toEqual({ key: "" });
    expect(parse(Buffer.from(""))).toEqual({});
  });

  it("should stop listeners", () => {
    core.stop();
    expect(mdnsInstanceMock.removeAllListeners).toHaveBeenCalled();
    expect(eventEmitter.removeAllListeners).toHaveBeenCalled();
  });

  it("should catch error during stop", () => {
    mdnsInstanceMock.removeAllListeners.mockImplementationOnce(() => {
      throw new Error("Stop Fail");
    });
    core.stop();
    expect(loggerMock.debug).toHaveBeenCalledWith("stop error", expect.any(Error));
  });

  it("should handle missing instances in stop", () => {
    const bareCore = new Core();
    (bareCore as any).mdnsInstance = undefined;
    (bareCore as any).myEvent = undefined;
    expect(() => bareCore.stop()).not.toThrow();
  });
});
