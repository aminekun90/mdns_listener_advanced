
import { Core } from "../../index";
jest.mock('multicast-dns');
describe("Core", () => {
    const hostsList: string[] = [];
    const core = new Core(hostsList);
    beforeAll(done => {
        done()
    });
    afterAll(done => {
        done()
    });
    it("should be initialized", () => {
        expect(() => {
            return new Core(hostsList);
        }).not.toThrowError();
    });
    it("should throw an error when hostnames are not provided", () => {
        expect(() => (core as any).__getHosts()).toThrowError("Provide hostnames or path to hostnames ! More at https://www.npmjs.com/package/mdns-listener-advanced");
    });
});