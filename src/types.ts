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

/** Catégorie d'appareil déduite des services annoncés. */
export type DeviceCategory =
  | "printer"
  | "scanner"
  | "speaker"
  | "tv"
  | "computer"
  | "phone"
  | "tablet"
  | "wearable"
  | "nas"
  | "camera"
  | "iot"
  | "unknown";

/**
 * Ce que la bibliothèque croit savoir de l'appareil, et pourquoi.
 *
 * `confidence` dit à quel point s'y fier :
 *   certain  — l'appareil déclare son modèle (`_device-info._tcp` TXT model=)
 *   probable — une clé TXT documentée par le constructeur
 *   guess    — le seul type de service, sans confirmation
 *
 * `evidence` liste les indices retenus, pour que l'appelant puisse juger
 * lui-même plutôt que de faire confiance à une étiquette.
 */
export type Identity = {
  category: DeviceCategory;
  vendor?: string;
  model?: string;
  confidence: "certain" | "probable" | "guess";
  evidence: string[];
};

/** Une instance de service annoncée par un répondeur. */
export type ServiceInstance = {
  /** Nom lisible de l'instance, par ex. `Bureau`. */
  instance: string;
  /** Type DNS-SD, par ex. `_ipp._tcp`. */
  type: string;
  port: number;
  txt: Record<string, string>;
  priority: number;
  weight: number;
};

/**
 * Une machine du réseau, reconstituée à partir de ses enregistrements.
 *
 * C'est l'agrégat que `DiscoveredService` ne donnait pas : tous les services
 * dont le SRV pointe vers le même nom d'hôte sont regroupés ici.
 */
export type Responder = {
  /** Nom d'hôte cible des SRV, par ex. `hp-laser.local`. Clé d'identité. */
  hostname: string;
  addresses: { ipv4: string[]; ipv6: string[] };
  services: ServiceInstance[];
  firstSeen: number;
  lastSeen: number;
  identity: Identity;
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
  /** Un répondeur complet vu pour la première fois (services corrélés). */
  RESPONDER_FOUND = "responderFound",
  /** Un répondeur déjà connu dont les services ou adresses ont changé. */
  RESPONDER_UPDATED = "responderUpdated",
  /** Un répondeur disparu : adieu reçu ou TTL expiré sur tous ses records. */
  RESPONDER_LOST = "responderLost",
}
