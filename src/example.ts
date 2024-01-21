import { Core } from './Core';
import { Device, emittedEvent } from './types';
const ref = 'MyDevice2';
const mdns = new Core([ref], null, {
  debug: false,
  disableListener: false,
});

const event = mdns.listen();
mdns.publish(ref);
event.on(emittedEvent.RESPONSE, (found_hostnames: Array<Device>) => {
  mdns.info('found hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on(emittedEvent.RAW_RESPONSE, (hosts: object) => {
  mdns.info('raw response', hosts);
});
event.on(emittedEvent.ERROR, (error: Error) => {
  mdns.info('error', error);
  // mdns.stop();// To stop the listener
});
