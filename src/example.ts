import { Core } from './Core';
import { Device } from './types';
const ref = 'MyDevice2';
const mdns = new Core(null, null, {
  debug: false,
  disableListener: false,
});

const event = mdns.listen();
mdns.publish(ref);
event.on('response', (found_hostnames: Array<Device>) => {
  mdns.info('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error: Error) => {
  mdns.info('error', error);
  // mdns.stop();// To stop the listener
});
