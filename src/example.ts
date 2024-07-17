import { Logger } from 'tslog';
import { Core } from './Core';
import { Device, EmittedEvent } from './types';
const ref = 'MyDevice2';
const mdns = new Core([ref], null, {
  debug: false,
  disableListener: false,
});
const logger = new Logger()
const event = mdns.listen();
mdns.publish(ref);
event.on(EmittedEvent.RESPONSE, (found_hostnames: Array<Device>) => {
  logger.info('found hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on(EmittedEvent.RAW_RESPONSE, (hosts: object) => {
  logger.info('raw response', hosts);
});
event.on(EmittedEvent.ERROR, (error: Error) => {
  logger.info('error', error);
  // mdns.stop();// To stop the listener
});
