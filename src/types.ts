export interface Options {
  debug?: boolean | null;
  disableListener?: boolean;
  disablePublisher?: boolean;
  noColor?: boolean;
  /** TTL in seconds for published service records (default: 120). */
  ttl?: number;
  /** Network interface name to bind for publishing, e.g. `'eth0'` or `'en0'`.
   *  Falls back to the first non-internal IPv4 address when omitted. */
  interface?: string;
}

export type Device = {
  name: string;
  type: string;
  data: DeviceData | Record<string, string>;
};

export type DeviceBuffer = {
  name: string;
  type: number;
  class: number;
  ttl: number;
  data: Buffer[] | string | SrvData | null;
};

export type DeviceData = {
  uuid: string;
  ipv4: string;
  ipv6?: string;
};

export type SrvData = {
  priority: number;
  weight: number;
  port: number;
  target: string;
};

export type DiscoveredService = {
  name: string;
  type: "PTR" | "SRV" | "A" | "AAAA" | "TXT";
  data: string | SrvData | Record<string, string>;
  ttl: number;
};

export type DeviceRegistryEntry = {
  device: Device;
  expiresAt: number;
};

export enum EmittedEvent {
  RESPONSE = "response",
  RAW_RESPONSE = "rawResponse",
  ERROR = "error",
  DISCOVERY = "discovery",
  /** Fired the first time a targeted device is seen in the registry. */
  DEVICE_FOUND = "deviceFound",
  /** Fired when a targeted device's TTL expires or a goodbye packet is received. */
  DEVICE_LOST = "deviceLost",
}
