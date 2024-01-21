export interface Options {
  debug?: boolean | null;
  disableListener?: boolean;
}
export const NPM_URL = 'https://www.npmjs.com/package/mdns-listener-advanced';

export type Device = {
  name: string;
  type: string;
  data: DeviceData;
};
export type DeviceBuffer = {
  name: string;
  type: string;
  data: Buffer;
};
export type DeviceData = {
  uuid: string;
  ipv4: string;
};

/**
 * Emitted event const
 */
export const emittedEvent = {
  RESPONSE: 'response',
  RAW_RESPONSE: 'rawResponse',
  ERROR: 'error',
};
