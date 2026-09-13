/**
 * Corrélation des enregistrements mDNS en répondeurs.
 *
 * Un appareil n'annonce pas « je suis là » en un seul paquet : il émet un PTR
 * par type de service, un SRV et un TXT par instance, et un A ou AAAA pour
 * son nom d'hôte. Tant qu'on traite ces enregistrements séparément, on voit
 * des morceaux, jamais des machines.
 *
 * La clé de jointure est le `target` du SRV — le nom d'hôte réel. Deux
 * instances de service qui pointent vers le même target sont sur la même
 * machine, quels que soient leurs noms d'instance.
 *
 *   _ipp._tcp.local         PTR  → Bureau._ipp._tcp.local
 *   Bureau._ipp._tcp.local  SRV  → target hp.local, port 631
 *   Bureau._ipp._tcp.local  TXT  → usb_MFG=HP, usb_MDL=LaserJet
 *   hp.local                A    → 192.168.1.42
 */
import type { DeviceBuffer, Responder, ServiceInstance, SrvData } from "../types.js";
import { Identifier } from "./identify.js";
import { normalizeName, parseInstanceName } from "./names.js";

const TYPE_A = 1;
const TYPE_PTR = 12;
const TYPE_TXT = 16;
const TYPE_AAAA = 28;
const TYPE_SRV = 33;

/** Bit de poids fort de la classe : « remplace ce que tu sais » (RFC 6762 §10.2). */
const CACHE_FLUSH = 0x8000;

type InstanceState = {
  instance: string;
  type: string;
  port: number;
  priority: number;
  weight: number;
  txt: Record<string, string>;
  target: string | null;
  lastSeen: number;
  expiresAt: number;
};

type HostState = {
  hostname: string;
  ipv4: Set<string>;
  ipv6: Set<string>;
  firstSeen: number;
  lastSeen: number;
  expiresAt: number;
};

export type RegistryEvents = {
  onFound: (responder: Responder) => void;
  onUpdated: (responder: Responder) => void;
  onLost: (hostname: string) => void;
};

export class ResponderRegistry {
  private readonly hosts = new Map<string, HostState>();
  private readonly instances = new Map<string, InstanceState>();
  private readonly emitted = new Set<string>();

  public readonly identifier = new Identifier();

  constructor(
    private readonly events: RegistryEvents,
    private readonly parseTxt: (buffer: Buffer) => Record<string, string>,
  ) {}

  /** Absorbe une réponse complète et notifie les répondeurs touchés. */
  public ingest(answers: readonly DeviceBuffer[], now: number = Date.now()): void {
    const touches = new Set<string>();

    for (const answer of answers) {
      const brut = answer.name ?? "";
      // La clé est normalisée — DNS est insensible à la casse — mais le nom
      // d'instance est destiné à l'affichage : « Bureau » doit rester
      // « Bureau », pas devenir « bureau ».
      const nom = normalizeName(brut);
      if (!nom) continue;

      // Un TTL nul est un adieu : l'émetteur annonce son départ.
      if (answer.ttl === 0) {
        this.forget(nom, touches);
        continue;
      }

      const flush = ((answer.class ?? 0) & CACHE_FLUSH) !== 0;

      switch (answer.type) {
        case TYPE_A:
        case TYPE_AAAA:
          this.absorbAddress(nom, answer, flush, now, touches);
          break;
        case TYPE_SRV:
          this.absorbSrv(nom, brut, answer, now, touches);
          break;
        case TYPE_TXT:
          this.absorbTxt(nom, brut, answer, flush, now, touches);
          break;
        case TYPE_PTR:
          this.absorbPtr(answer, now);
          break;
      }
    }

    for (const hostname of touches) this.notify(hostname);
  }

  public list(): Responder[] {
    return [...this.hosts.keys()]
      .map((h) => this.build(h))
      .filter((r): r is Responder => r !== null);
  }

  public get(hostname: string): Responder | null {
    return this.build(normalizeName(hostname));
  }

  public clear(): void {
    this.hosts.clear();
    this.instances.clear();
    this.emitted.clear();
  }

  /** Retire ce qui a expiré. À appeler périodiquement. */
  public prune(now: number = Date.now()): void {
    const touches = new Set<string>();

    for (const [cle, inst] of this.instances) {
      if (inst.expiresAt <= now) {
        this.instances.delete(cle);
        if (inst.target) touches.add(inst.target);
      }
    }
    for (const [nom, host] of this.hosts) {
      if (host.expiresAt <= now && !this.servicesOf(nom).length) {
        this.hosts.delete(nom);
        if (this.emitted.delete(nom)) this.events.onLost(nom);
      } else {
        touches.add(nom);
      }
    }
    for (const hostname of touches) {
      if (this.hosts.has(hostname)) this.notify(hostname);
    }
  }

  // ─── absorption par type d'enregistrement ────────────────────────────────

  private absorbAddress(
    nom: string,
    answer: DeviceBuffer,
    flush: boolean,
    now: number,
    touches: Set<string>,
  ): void {
    if (typeof answer.data !== "string") return;
    const host = this.host(nom, now);
    const cible = answer.type === TYPE_A ? host.ipv4 : host.ipv6;
    // Le bit cache-flush dit de remplacer, pas d'ajouter : sans lui, une
    // machine qui change d'adresse traîne l'ancienne indéfiniment.
    if (flush) cible.clear();
    cible.add(answer.data);
    host.lastSeen = now;
    host.expiresAt = now + answer.ttl * 1000;
    touches.add(nom);
  }

  private absorbSrv(
    nom: string,
    brut: string,
    answer: DeviceBuffer,
    now: number,
    touches: Set<string>,
  ): void {
    const srv = answer.data as SrvData | null;
    if (!srv?.target) return;
    const parsed = parseInstanceName(brut);
    if (!parsed) return;

    const inst = this.instance(nom, parsed.instance, parsed.type, now);
    const ancienne = inst.target;
    inst.target = normalizeName(srv.target);
    inst.port = srv.port;
    inst.priority = srv.priority;
    inst.weight = srv.weight;
    inst.lastSeen = now;
    inst.expiresAt = now + answer.ttl * 1000;

    this.host(inst.target, now).lastSeen = now;
    touches.add(inst.target);
    if (ancienne && ancienne !== inst.target) touches.add(ancienne);
  }

  private absorbTxt(
    nom: string,
    brut: string,
    answer: DeviceBuffer,
    flush: boolean,
    now: number,
    touches: Set<string>,
  ): void {
    const parsed = parseInstanceName(brut);
    if (!parsed) return;

    let buffer: Buffer | null = null;
    if (Buffer.isBuffer(answer.data)) buffer = answer.data as unknown as Buffer;
    else if (Array.isArray(answer.data)) buffer = Buffer.concat(answer.data as Buffer[]);
    if (!buffer) return;

    const inst = this.instance(nom, parsed.instance, parsed.type, now);
    const txt = this.parseTxt(buffer);
    inst.txt = flush ? txt : { ...inst.txt, ...txt };
    inst.lastSeen = now;
    inst.expiresAt = now + answer.ttl * 1000;
    if (inst.target) touches.add(inst.target);
  }

  /** Le PTR ne fait que déclarer l'existence d'une instance ; le SRV la place. */
  private absorbPtr(answer: DeviceBuffer, now: number): void {
    if (typeof answer.data !== "string") return;
    const parsed = parseInstanceName(answer.data);
    if (!parsed) return;
    const cle = normalizeName(answer.data);
    this.instance(cle, parsed.instance, parsed.type, now).expiresAt = now + answer.ttl * 1000;
  }

  // ─── construction et notification ────────────────────────────────────────

  private host(hostname: string, now: number): HostState {
    let h = this.hosts.get(hostname);
    if (!h) {
      h = {
        hostname,
        ipv4: new Set(),
        ipv6: new Set(),
        firstSeen: now,
        lastSeen: now,
        expiresAt: now + 120_000,
      };
      this.hosts.set(hostname, h);
    }
    return h;
  }

  private instance(cle: string, instance: string, type: string, now: number): InstanceState {
    let i = this.instances.get(cle);
    if (i) {
      // Le PTR arrive parfois avant le SRV : on garde la meilleure casse vue.
      if (instance && instance !== i.instance) i.instance = instance;
      return i;
    }
    if (!i) {
      i = {
        instance,
        type,
        port: 0,
        priority: 0,
        weight: 0,
        txt: {},
        target: null,
        lastSeen: now,
        expiresAt: now + 120_000,
      };
      this.instances.set(cle, i);
    }
    return i;
  }

  private servicesOf(hostname: string): ServiceInstance[] {
    const out: ServiceInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.target !== hostname) continue;
      out.push({
        instance: inst.instance,
        type: inst.type,
        port: inst.port,
        txt: { ...inst.txt },
        priority: inst.priority,
        weight: inst.weight,
      });
    }
    return out.sort((a, b) => a.type.localeCompare(b.type));
  }

  private build(hostname: string): Responder | null {
    const host = this.hosts.get(hostname);
    if (!host) return null;
    const services = this.servicesOf(hostname);
    return {
      hostname,
      addresses: { ipv4: [...host.ipv4], ipv6: [...host.ipv6] },
      services,
      firstSeen: host.firstSeen,
      lastSeen: host.lastSeen,
      identity: this.identifier.identify(services),
    };
  }

  private forget(nom: string, touches: Set<string>): void {
    const inst = this.instances.get(nom);
    if (inst) {
      this.instances.delete(nom);
      if (inst.target) touches.add(inst.target);
    }
    if (this.hosts.has(nom)) {
      this.hosts.delete(nom);
      if (this.emitted.delete(nom)) this.events.onLost(nom);
    }
  }

  private notify(hostname: string): void {
    const responder = this.build(hostname);
    if (!responder) return;
    // Un répondeur sans adresse ni service n'est qu'un nom : on attend.
    if (
      !responder.services.length &&
      !responder.addresses.ipv4.length &&
      !responder.addresses.ipv6.length
    ) {
      return;
    }
    if (this.emitted.has(hostname)) this.events.onUpdated(responder);
    else {
      this.emitted.add(hostname);
      this.events.onFound(responder);
    }
  }
}
