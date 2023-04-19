import {expect, jest, describe,beforeAll,afterAll,it,beforeEach,afterEach} from '@jest/globals';
import { Core } from "@mdns-listener/Core";
import { NPM_URL } from "@mdns-listener/types";
import { EventEmitter } from "stream";


jest.mock('multicast-dns', () => {
    return jest.fn(() => {
      return {
        on: jest.fn(),
        query: jest.fn(),
        destroy: jest.fn(),
        emit: jest.fn(),
      }
    });
  });
import mDNS from 'multicast-dns';

describe("Core", () => {
    const hostsList: string[] = [];
    const core = new Core(hostsList);
    const mdnsMock = mDNS as jest.MockedClass<any>;
    
    beforeAll(done => {
        done();
    });
    afterAll(done => {
        done();
    });
    it("should be initialized", () => {
        expect(() => {
            return new Core(hostsList);
        }).not.toThrowError();
    });
    it("should throw an error when hostnames are not provided", () => {
        expect(() => (core as any).__getHosts()).toThrowError(`Provide hostnames or path to hostnames ! Report this error ${NPM_URL}`);
    });

    describe('listen', () => {
        let myEvent: EventEmitter;
        let mdns: any;
        let logger: any;
        let error: any;
        let hostnames: string[];
        let core: Core;

        beforeEach(() => {
            myEvent = new EventEmitter();
            mdns = mdnsMock();
            logger = {
                state: {
                    isEnabled: false,
                },
                info: jest.fn(),
            };
            error = null;
            hostnames = ['example'];
            core = new Core(hostnames, undefined, undefined, logger, mdns, myEvent);
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        it('should call mdns.on and log a message "Looking for hostnames..."', () => {
            
            const mdnsOnMock = jest.spyOn(mdns, 'on').mockImplementation((event, callback:any) => {
              if (event === 'response') {
                callback({ answers: [] }); // call the callback with a dummy response object
                
              }
            });
            core.listen();
            expect(logger.info).toHaveBeenCalledWith('Looking for hostnames...', hostnames);
            expect(mdnsOnMock.mock.calls[0][0]).toEqual('response');
          });
        
    });
});