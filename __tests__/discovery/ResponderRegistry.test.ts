import { ResponderRegistry } from "@/discovery/ResponderRegistry.js";
import type { DeviceBuffer, Responder } from "@/types.js";
import { parseTxtRecord } from "@/utils/parsers.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Encode un TXT au format DNS : [longueur][chaîne]… */
function txt(pairs: Record<string, string>): Buffer[] {
  const parts = Object.entries(pairs).map(([k, v]) => {
    const s = Buffer.from(`${k}=${v}`, "utf8");
    return Buffer.concat([Buffer.from([s.length]), s]);
  });
  return [Buffer.concat(parts)];
}

const CACHE_FLUSH = 0x8000;

function rec(p: Partial<DeviceBuffer> & Pick<DeviceBuffer, "name" | "type">): DeviceBuffer {
  return { class: 1, ttl: 120, data: null, ...p } as DeviceBuffer;
}

/** L'imprimante de la documentation : PTR, SRV, TXT, A. */
const IMPRIMANTE: DeviceBuffer[] = [
  rec({ name: "_ipp._tcp.local", type: 12, data: "Bureau._ipp._tcp.local" }),
  rec({
    name: "Bureau._ipp._tcp.local",
    type: 33,
    data: { priority: 0, weight: 0, port: 631, target: "hp-laser.local" },
  }),
  rec({
    name: "Bureau._ipp._tcp.local",
    type: 16,
    data: txt({ usb_MFG: "HP", usb_MDL: "LaserJet M281" }),
  }),
  rec({ name: "hp-laser.local", type: 1, data: "192.168.1.42" }),
];

describe("corrélation des enregistrements en répondeurs", () => {
  let trouves: Responder[];
  let majs: Responder[];
  let perdus: string[];
  let registre: ResponderRegistry;

  beforeEach(() => {
    trouves = [];
    majs = [];
    perdus = [];
    registre = new ResponderRegistry(
      {
        onFound: (r) => trouves.push(r),
        onUpdated: (r) => majs.push(r),
        onLost: (h) => perdus.push(h),
      },
      parseTxtRecord,
    );
  });

  it("regroupe quatre enregistrements en une seule machine", () => {
    registre.ingest(IMPRIMANTE);

    const liste = registre.list();
    expect(liste).toHaveLength(1);
    const r = liste[0];
    expect(r.hostname).toBe("hp-laser.local");
    expect(r.addresses.ipv4).toEqual(["192.168.1.42"]);
    expect(r.services).toHaveLength(1);
    expect(r.services[0]).toMatchObject({ instance: "Bureau", type: "_ipp._tcp", port: 631 });
    expect(r.services[0].txt).toEqual({ usb_MFG: "HP", usb_MDL: "LaserJet M281" });
  });

  it("réunit deux services distincts sur le même hôte", () => {
    registre.ingest([
      ...IMPRIMANTE,
      rec({
        name: "Bureau._http._tcp.local",
        type: 33,
        data: { priority: 0, weight: 0, port: 80, target: "hp-laser.local" },
      }),
    ]);

    const r = registre.get("hp-laser.local");
    expect(r?.services.map((s) => s.type).sort()).toEqual(["_http._tcp", "_ipp._tcp"]);
  });

  it("sépare deux machines qui offrent le même type de service", () => {
    registre.ingest([
      rec({
        name: "A._ipp._tcp.local",
        type: 33,
        data: { priority: 0, weight: 0, port: 631, target: "un.local" },
      }),
      rec({
        name: "B._ipp._tcp.local",
        type: 33,
        data: { priority: 0, weight: 0, port: 631, target: "deux.local" },
      }),
      rec({ name: "un.local", type: 1, data: "10.0.0.1" }),
      rec({ name: "deux.local", type: 1, data: "10.0.0.2" }),
    ]);

    expect(registre.list().map((r) => r.hostname).sort()).toEqual(["deux.local", "un.local"]);
  });

  it("collecte IPv4 et IPv6 du même hôte", () => {
    registre.ingest([
      ...IMPRIMANTE,
      rec({ name: "hp-laser.local", type: 28, data: "fe80:0000:0000:0000:0000:0000:0000:0001" }),
    ]);

    const r = registre.get("hp-laser.local");
    expect(r?.addresses.ipv4).toEqual(["192.168.1.42"]);
    expect(r?.addresses.ipv6).toHaveLength(1);
  });

  it("émet found une fois, puis updated", () => {
    registre.ingest(IMPRIMANTE);
    registre.ingest(IMPRIMANTE);

    expect(trouves).toHaveLength(1);
    expect(majs.length).toBeGreaterThanOrEqual(1);
  });

  it("n'émet rien pour un hôte sans adresse ni service", () => {
    // Un PTR seul ne prouve pas qu'une machine existe : il nomme une instance.
    registre.ingest([rec({ name: "_ipp._tcp.local", type: 12, data: "Seul._ipp._tcp.local" })]);
    expect(trouves).toHaveLength(0);
    expect(registre.list()).toHaveLength(0);
  });

  describe("bit cache-flush", () => {
    it("remplace l'adresse au lieu de l'accumuler", () => {
      registre.ingest(IMPRIMANTE);
      registre.ingest([
        rec({ name: "hp-laser.local", type: 1, class: 1 | CACHE_FLUSH, data: "192.168.1.99" }),
      ]);

      // Sans le bit, la machine traînerait ses deux adresses.
      expect(registre.get("hp-laser.local")?.addresses.ipv4).toEqual(["192.168.1.99"]);
    });

    it("accumule quand le bit est absent", () => {
      registre.ingest(IMPRIMANTE);
      registre.ingest([rec({ name: "hp-laser.local", type: 1, data: "192.168.1.99" })]);

      expect(registre.get("hp-laser.local")?.addresses.ipv4.sort()).toEqual([
        "192.168.1.42",
        "192.168.1.99",
      ]);
    });

    it("remplace le TXT entier au lieu de le fusionner", () => {
      registre.ingest(IMPRIMANTE);
      registre.ingest([
        rec({
          name: "Bureau._ipp._tcp.local",
          type: 16,
          class: 1 | CACHE_FLUSH,
          data: txt({ ty: "Nouveau" }),
        }),
      ]);

      expect(registre.get("hp-laser.local")?.services[0].txt).toEqual({ ty: "Nouveau" });
    });
  });

  describe("départ", () => {
    it("oublie l'hôte sur un adieu et signale la perte", () => {
      registre.ingest(IMPRIMANTE);
      registre.ingest([rec({ name: "hp-laser.local", type: 1, ttl: 0, data: "192.168.1.42" })]);

      expect(perdus).toEqual(["hp-laser.local"]);
      expect(registre.get("hp-laser.local")).toBeNull();
    });

    it("retire un service sur un adieu d'instance", () => {
      registre.ingest(IMPRIMANTE);
      registre.ingest([rec({ name: "Bureau._ipp._tcp.local", type: 16, ttl: 0, data: null })]);

      expect(registre.get("hp-laser.local")?.services).toHaveLength(0);
    });

    it("purge ce qui a expiré", () => {
      vi.useFakeTimers();
      const t0 = Date.now();
      registre.ingest(IMPRIMANTE, t0);
      registre.prune(t0 + 121_000);

      expect(perdus).toEqual(["hp-laser.local"]);
      vi.useRealTimers();
    });

    it("ne purge rien avant l'expiration", () => {
      const t0 = Date.now();
      registre.ingest(IMPRIMANTE, t0);
      registre.prune(t0 + 1_000);

      expect(perdus).toEqual([]);
      expect(registre.list()).toHaveLength(1);
    });
  });

  it("suit un service qui change d'hôte", () => {
    registre.ingest(IMPRIMANTE);
    registre.ingest([
      rec({
        name: "Bureau._ipp._tcp.local",
        type: 33,
        data: { priority: 0, weight: 0, port: 631, target: "autre.local" },
      }),
    ]);

    expect(registre.get("hp-laser.local")?.services).toHaveLength(0);
    expect(registre.get("autre.local")?.services).toHaveLength(1);
  });

  it("ignore un enregistrement sans nom", () => {
    expect(() => registre.ingest([rec({ name: "", type: 1, data: "1.2.3.4" })])).not.toThrow();
    expect(registre.list()).toHaveLength(0);
  });

  it("se vide sur clear", () => {
    registre.ingest(IMPRIMANTE);
    registre.clear();
    expect(registre.list()).toHaveLength(0);
  });
});
