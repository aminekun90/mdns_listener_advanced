import { Core } from "@/Core.js";
import { EmittedEvent, NPM_URL } from "@/types.js";
import { Bonjour, Service } from "bonjour-service";
import mDNS from "multicast-dns";
import { EventEmitter } from "stream";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ======= Mock modules =======
vi.mock("multicast-dns", () => {
  return {
    default: vi.fn(() => ({
      on: vi.fn(),
      query: vi.fn(),
      destroy: vi.fn(),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
    })),
  };
});

vi.mock("stream", () => {
  return {
    EventEmitter: vi.fn(() => ({
      on: vi.fn(),
      query: vi.fn(),
      destroy: vi.fn(),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
    })),
  };
});

const bonjourMock = {
  publish: vi.fn(),
  unpublishAll: vi.fn(),
  destroy: vi.fn(),
};
vi.mock("bonjour-service", () => {
  return {
    Bonjour: vi.fn(() => bonjourMock),
  };
});

// ======= Tests =======
describe("Core", () => {
  let mdns: mDNS.MulticastDNS;
  let myEvent: EventEmitter;
  let bonjour: any;
  let logger: any;
  let hostnames: string[];
  let core: Core;

  beforeAll(() => {
    myEvent = new EventEmitter();
    mdns = mDNS();
    bonjour = new Bonjour(); // from mock
    logger = {
      state: { isEnabled: false },
      info: vi.fn(),
      debug: vi.fn(),
    };
    hostnames = ["example"];
    core = new Core(hostnames, undefined, undefined, logger, mdns, myEvent, bonjour);
  });

  afterEach(() => {
    vi.resetAllMocks();
    core["error"] = false;
    core.setDisableListener(false);
    core.setDisablePublisher(false);
  });

  it("should be initialized", () => {
    expect(() => new Core(["mock"])).not.toThrowError();
  });

  it("should throw an error when hostnames are not provided", () => {
    const emptyCore = new Core([]);
    expect(() => (emptyCore as any).__getHosts()).toThrowError(
      `Provide hostnames or path to hostnames! Report this error ${NPM_URL}`,
    );
  });

  describe("Function listen", () => {
    it('should call mdns.on and log "Looking for hostnames..."', () => {
      const mdnsOnMock = vi.spyOn(mdns, "on").mockImplementation((event, callback: any): any => {
        if (event === "response") {
          callback({ answers: [] }); // call the callback with dummy data
        }
      });

      core.listen();
      expect(logger.info).toHaveBeenCalledWith("Looking for hostnames...", hostnames);
      expect(mdnsOnMock.mock.calls[0][0]).toEqual("response");
    });

    it("should not call mdns.on when listener is disabled", () => {
      core.setDisableListener(true);
      core.listen();
      expect(logger.info).toHaveBeenCalledWith("Listener is disabled");
      expect(mdns.on).not.toHaveBeenCalled();
    });

    it("should emit an error", async () => {
      const spyEmit = vi.spyOn(myEvent, "emit"); // 1️⃣ Spy first

      core["error"] = true;
      const errorMessage = `An error occurred while trying to listen to mdns! Report this error ${NPM_URL}`;

      core.listen(); // 2️⃣ Then trigger the code that may emit

      // 3️⃣ Wait one microtask in case the emit happens asynchronously
      await new Promise(process.nextTick);

      // 4️⃣ Now assert
      expect(spyEmit).toHaveBeenCalledWith(EmittedEvent.ERROR, expect.objectContaining({ message: errorMessage }));
    });
  });

  describe("Function unpublishAll", () => {
    it("should call unpublishAll from bonjour service", () => {
      core.unpublishAll();
      expect(bonjourMock.unpublishAll).toHaveBeenCalled();
    });
  });

  describe("Function publish", () => {
    it("should publish a given name", () => {
      const name = "Mydevice1";
      const bonjourObject = { name } as Service;

      const debugSpy = vi.spyOn(core as any, "debug");
      bonjourMock.publish.mockReturnValue(bonjourObject);

      const result = core.publish(name);

      expect(bonjourMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
          name: name,
          type: "TXT",
          txt: expect.objectContaining({
            uuid: expect.any(String),
            ipv4: expect.any(String),
          }),
        }),
      );
      expect(debugSpy).toHaveBeenCalledWith(bonjourObject);
      expect(result).toStrictEqual(bonjourObject);
    });

    it("should not publish a name when publisher disabled", () => {
      core["disablePublisher"] = true;
      const result = core.publish("Mydevice1");
      expect(result).toBeUndefined();
    });
  });

  describe("Function stop", () => {
    it("should remove all listeners", () => {
      core.stop();
      expect(mdns.removeAllListeners).toHaveBeenCalled();
      expect(myEvent.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe("Function handleBufferData", () => {
    it("should parse key-value pairs correctly", () => {
      const buffer = Buffer.from('key1=value1 key2="value with spaces"');
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({ key1: "value1", key2: "value with spaces" });
    });

    it("should handle empty buffer", () => {
      const buffer = Buffer.from("");
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({});
    });

    it("should handle quoted values with special characters", () => {
      const buffer = Buffer.from('key1="value with \\"quotes\\"" key2=unquotedValue');
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({ key1: 'value with "quotes"', key2: "unquotedValue" });
    });
  });
});
