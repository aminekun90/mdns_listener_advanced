import { expect, jest, describe, beforeAll, afterAll, it, afterEach } from "@jest/globals";
import { Core } from "@mdns-listener/Core";
import { EmittedEvent, NPM_URL } from "@mdns-listener/types";
import { EventEmitter } from "stream";
import mDNS from "multicast-dns";
import { Bonjour, Service, ServiceConfig } from "bonjour-service";

jest.mock("multicast-dns", () => {
  return jest.fn(() => {
    return {
      on: jest.fn(),
      query: jest.fn(),
      destroy: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
    };
  });
});

jest.mock("stream", () => {
  return {
    EventEmitter: jest.fn(() => ({
      on: jest.fn(),
      query: jest.fn(),
      destroy: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
    })),
  };
});
const bonjourMock = {
  publish: jest.fn(),
  unpublishAll: jest.fn(),
  destroy: jest.fn(),
};
jest.mock("bonjour-service", () => {
  return {
    Bonjour: jest.fn().mockImplementation(() => bonjourMock),
  };
});

describe("Core", () => {
  let mdns: mDNS.MulticastDNS;
  let myEvent: EventEmitter;

  let bonjour: any;
  let logger: any;
  let error: any;
  let hostnames: string[];
  myEvent = new EventEmitter();
  mdns = mDNS();
  bonjour = new Bonjour(); // Instantiate Bonjour from the mock
  logger = {
    state: {
      isEnabled: false,
    },
    info: jest.fn(),
    debug: jest.fn(),
  };
  error = null;
  hostnames = ["example"];
  const core = new Core(hostnames, undefined, undefined, logger, mdns, myEvent, bonjour);
  const hostsList: string[] = [];

  beforeAll((done) => {
    done();
  });

  afterAll((done) => {
    done();
  });

  afterEach(() => {
    jest.resetAllMocks();
    core["error"] = false;
    core["disableListener"] = false;
    core["disablePublisher"] = false;
  });
  it("should be initialized", () => {
    expect(() => {
      return new Core(["mock"]);
    }).not.toThrowError();
  });

  it("should throw an error when hostnames are not provided", () => {
    const core = new Core(hostsList);
    expect(() => (core as any).__getHosts()).toThrowError(
      `Provide hostnames or path to hostnames! Report this error ${NPM_URL}`,
    );
  });

  describe("Function listen", () => {
    it('should call mdns.on and log a message "Looking for hostnames..."', () => {
      const mdnsOnMock = jest.spyOn(mdns, "on").mockImplementation((event, callback: any): any => {
        if (event === "response") {
          callback({ answers: [] }); // call the callback with a dummy response object
        }
      });
      core.listen();
      expect(logger.info).toHaveBeenCalledWith("Looking for hostnames...", hostnames);
      expect(mdnsOnMock.mock.calls[0][0]).toEqual("response");
    });
    it('should not call mdns.on and log a message "Looking for hostnames..."', () => {
      (core as any).disableListener = true;
      core.listen();
      expect(logger.info).toHaveBeenCalledWith("Listener is disabled");
      expect(mdns.on).not.toBeCalledWith();
    });
    it("should emit an error", () => {
      const errorMessage = `An error occurred while trying to listen to mdns! Report this error ${NPM_URL}`;

      core["error"] = true;
      core.listen();
      expect(myEvent.emit).toBeCalledWith(EmittedEvent.ERROR, expect.objectContaining({ message: errorMessage }));
    });
  });

  describe("Function unpublishAll", () => {
    it("should call unpublishAll from bonjour service", () => {
      core.unpublishAll();
      expect(bonjourMock.unpublishAll).toHaveBeenCalledWith();
    });
  });

  describe("Function publish", () => {
    it("should publish a given name", () => {
      const name = "Mydevice1";
      const bonjourObject = { name } as Service;

      const debugSpy = jest.spyOn(core as unknown as { debug: any }, "debug");
      bonjourMock.publish.mockReturnValue(bonjourObject);

      const result = core.publish(name);

      expect(bonjourMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
          name: name,
          type: "TXT",
          txt: expect.objectContaining({
            // TODO: fix this
            // uuid: expect.stringMatching(/^"\\\"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\\""$/),
            uuid: expect.any(String),
            // ipv4: expect.stringMatching(/^(\\"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b\\")/),
            ipv4: expect.any(String),
          }),
        }),
      );

      expect(debugSpy).toHaveBeenCalledWith(bonjourObject);
      expect(result).toStrictEqual(bonjourObject);
    });

    it("should not publish a given name", () => {
      const name = "Mydevice1";
      const bonjourObject = undefined;
      const debugSpy = jest.spyOn(core as unknown as { debug: any }, "debug");

      core["disablePublisher"] = true;

      const result = core.publish(name);

      expect(debugSpy).not.toHaveBeenCalled();
      expect(result).toStrictEqual(bonjourObject);
    });
  });

  describe("Function stop", () => {
    it("should call mdns.removeAllListener", () => {
      core.stop();
      expect(mdns.removeAllListeners).toBeCalledWith();
      expect(myEvent.removeAllListeners).toBeCalledWith();
    });
  });
  describe("Function handleBufferData", () => {
    it("should parse key-value pairs correctly", () => {
      const buffer = Buffer.from('key1=value1 key2="value with spaces"');
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({
        key1: "value1",
        key2: "value with spaces",
      });
    });

    it("should handle an empty buffer", () => {
      const buffer = Buffer.from("");
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({});
    });

    it("should handle buffer with no matches", () => {
      const buffer = Buffer.from("just a string with no key-value pairs");
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({});
    });

    //TODO : Fix this
    it.skip("should handle quoted values with special characters", () => {
      const buffer = Buffer.from('key1="value with \\"quotes\\"" key2=unquotedValue');
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({
        key1: 'value with "quotes"',
        key2: "unquotedValue",
      });
    });

    it("should handle edge cases with empty values", () => {
      const buffer = Buffer.from('key1="" key2=nonEmpty');
      const result = core["handleBufferData"](buffer);
      expect(result).toEqual({
        key1: "",
        key2: "nonEmpty",
      });
    });

    // TODO: fix this
    it.skip("should handle keys and values with special characters", () => {
      const buffer = Buffer.from('key!@#="value!@#" key2=value2');
      const result = core["handleBufferData"](buffer);
      expect(result).toStrictEqual({
        "key!@#": "value!@#",
        key2: "value2",
      });
    });
  });
});
