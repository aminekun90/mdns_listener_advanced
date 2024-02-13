import { expect, jest, describe, beforeAll, afterAll, it, beforeEach, afterEach } from '@jest/globals';
import { Core } from "@mdns-listener/Core";
import { NPM_URL } from "@mdns-listener/types";
import { EventEmitter } from "stream";
import mDNS from 'multicast-dns';
import { Bonjour } from 'bonjour-service';

jest.mock('multicast-dns', () => {
  return jest.fn(() => {
    return {
      on: jest.fn(),
      query: jest.fn(),
      destroy: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
    }
  });
});

jest.mock('stream', () => {
  
    return {
      EventEmitter: jest.fn(() => ({
        on: jest.fn(),
        query: jest.fn(),
        destroy: jest.fn(),
        emit: jest.fn(),
        removeAllListeners: jest.fn(),
      }))
    }
  
});

jest.mock('bonjour-service', () => {
  return {
    Bonjour: jest.fn().mockImplementation(() => ({
      publish: jest.fn(),
      unpublishAll: jest.fn(),
      destroy: jest.fn(),
    })),
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
  };
  error = null;
  hostnames = ['example'];
  const core = new Core(hostnames, undefined, undefined, logger, mdns, myEvent, bonjour);
  const hostsList: string[] = [];

  beforeAll(done => {
    done();
  });

  afterAll(done => {
    done();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });
  it("should be initialized", () => {
    expect(() => {
      return new Core(['mock']);
    }).not.toThrowError();
  });

  it("should throw an error when hostnames are not provided", () => {
    const core = new Core(hostsList);
    expect(() => (core as any).__getHosts()).toThrowError(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
  });

  describe('listen', () => {
    it('should call mdns.on and log a message "Looking for hostnames..."', () => {
      const mdnsOnMock = jest.spyOn(mdns, 'on').mockImplementation((event, callback: any): any => {
        if (event === 'response') {
          callback({ answers: [] }); // call the callback with a dummy response object
        }
      });
      core.listen();
      expect(logger.info).toHaveBeenCalledWith('Looking for hostnames...', hostnames);
      expect(mdnsOnMock.mock.calls[0][0]).toEqual('response');
    });
    it('should not call mdns.on and log a message "Looking for hostnames..."', () => {
      (core as any).disableListener = true;
      core.listen();
      expect(logger.info).toHaveBeenCalledWith('Listener is disabled');
      expect(mdns.on).not.toBeCalledWith();
    });
    // Add more test cases as needed
  });
  describe('stop function', () => {
    it("should call mdns.removeAllListener", () => {
      core.stop();
      expect(mdns.removeAllListeners).toBeCalledWith();
      expect(myEvent.removeAllListeners).toBeCalledWith();
    });

  });
});
