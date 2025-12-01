export interface Options {
  debug?: boolean | null;
  disableListener?: boolean;
  disablePublisher?: boolean;
}

export type Device = {
  name: string;
  type: string;
  data: DeviceData | { [key: string]: string };
};
export type DeviceBuffer = { name: string; type: number; class: number; ttl: number; data: any; };
export type DeviceData = {
  uuid: string;
  ipv4: string;
};

/**
 * Emitted event const
 */
export enum EmittedEvent {
  RESPONSE = "response",
  RAW_RESPONSE = "rawResponse",
  ERROR = "error",
}
