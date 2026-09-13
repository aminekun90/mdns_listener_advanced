import { Core } from "@/Core.js";
import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import { EmittedEvent, type Responder } from "@/types.js";
import * as dgram from "node:dgram";
import * as os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("node:dgram");
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, networkInterfaces: vi.fn(), homedir: vi.fn(() => "/home/t") };
});

/** Assemble un paquet de réponse mDNS à partir d'enregistrements bruts. */
function paquet(records: { name: string; type: number; ttl?: number; rdata: Buffer }[]): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(records.length, 6); // AN

  const corps = records.map(({ name, type, ttl = 120, rdata }) => {
    const rr = Buffer.alloc(10);
    rr.writeUInt16BE(type, 0);
    rr.writeUInt16BE(1, 2);
    rr.writeUInt32BE(ttl, 4);
    rr.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([DNSBuffer.encodeName(name), rr, rdata]);
  });

  return Buffer.concat([header, ...corps]);
}

const rdataA = (ip: string) => Buffer.from(ip.split(".").map(Number));

function rdataSrv(port: number, target: string): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(0, 2);
  head.writeUInt16BE(port, 4);
  return Buffer.concat([head, DNSBuffer.encodeName(target)]);
}

function rdataTxt(pairs: Record<string, string>): Buffer {
  return Buffer.concat(
    Object.entries(pairs).map(([k, v]) => {
      const s = Buffer.from(`${k}=${v}`, "utf8");
      return Buffer.concat([Buffer.from([s.length]), s]);
    }),
  );
}

describe("Core — répondeurs corrélés", () => {
  let core: Core;
  let handlers: Record<string, (msg: Buffer) => void>;
  let envoyes: Buffer[];

  beforeEach(() => {
    handlers = {};
    envoyes = [];
    (os.networkInterfaces as unknown as Mock).mockReturnValue({
      en0: [{ address: "192.168.1.2", family: "IPv4", internal: false }],
    });
    (dgram.createSocket as unknown as Mock).mockReturnValue({
      on: vi.fn((event: string, h: (m: Buffer) => void) => {
        handlers[event] = h;
      }),
      bind: vi.fn((_o: unknown, cb?: () => void) => cb?.()),
      send: vi.fn((buf: Buffer) => envoyes.push(buf)),
      close: vi.fn(),
      setMulticastTTL: vi.fn(),
      setMulticastLoopback: vi.fn(),
      addMembership: vi.fn(),
      setBroadcast: vi.fn(),
      address: vi.fn(() => ({ address: "0.0.0.0", port: 5353 })),
    });
    core = new Core([], null, { debug: false });
  });

  afterEach(() => {
    core.stop();
    vi.clearAllMocks();
  });

  const IMPRIMANTE = [
    { name: "Bureau._ipp._tcp.local", type: 33, rdata: rdataSrv(631, "hp.local") },
    {
      name: "Bureau._ipp._tcp.local",
      type: 16,
      rdata: rdataTxt({ usb_MFG: "HP", usb_MDL: "LaserJet" }),
    },
    { name: "hp.local", type: 1, rdata: rdataA("192.168.1.42") },
  ];

  it("émet RESPONDER_FOUND avec les services corrélés", () => {
    const vu: Responder[] = [];
    core.listen().on(EmittedEvent.RESPONDER_FOUND, (r: Responder) => vu.push(r));

    handlers["message"](paquet(IMPRIMANTE));

    const r = vu.at(-1);
    expect(r?.hostname).toBe("hp.local");
    expect(r?.addresses.ipv4).toEqual(["192.168.1.42"]);
    expect(r?.services[0]).toMatchObject({ instance: "Bureau", type: "_ipp._tcp", port: 631 });
    expect(r?.identity).toMatchObject({ category: "printer", vendor: "HP", model: "LaserJet" });
  });

  it("expose les répondeurs par getResponders et getResponder", () => {
    core.listen();
    handlers["message"](paquet(IMPRIMANTE));

    expect(core.getResponders()).toHaveLength(1);
    expect(core.getResponder("HP.LOCAL")?.hostname).toBe("hp.local");
    expect(core.getResponder("inconnu.local")).toBeNull();
  });

  it("émet RESPONDER_UPDATED au second passage, pas FOUND", () => {
    const found = vi.fn();
    const updated = vi.fn();
    core.listen().on(EmittedEvent.RESPONDER_FOUND, found).on(EmittedEvent.RESPONDER_UPDATED, updated);

    handlers["message"](paquet(IMPRIMANTE));
    handlers["message"](paquet(IMPRIMANTE));

    expect(found).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalled();
  });

  it("signale la perte sur un paquet d'adieu", () => {
    const perdu = vi.fn();
    core.listen().on(EmittedEvent.RESPONDER_LOST, perdu);

    handlers["message"](paquet(IMPRIMANTE));
    handlers["message"](paquet([{ name: "hp.local", type: 1, ttl: 0, rdata: rdataA("192.168.1.42") }]));

    expect(perdu).toHaveBeenCalledWith("hp.local");
  });

  describe("parcours d'arbre", () => {
    it("interroge un type de service découvert", () => {
      core.listen();
      envoyes.length = 0;
      handlers["message"](
        paquet([
          {
            name: "_services._dns-sd._udp.local",
            type: 12,
            rdata: DNSBuffer.encodeName("_ipp._tcp.local"),
          },
        ]),
      );

      // Sans cette relance, scan() ne rendrait que la liste des types.
      expect(envoyes.length).toBeGreaterThan(0);
    });

    it("interroge SRV et TXT d'une instance découverte", () => {
      core.listen();
      envoyes.length = 0;
      handlers["message"](
        paquet([
          {
            name: "_ipp._tcp.local",
            type: 12,
            rdata: DNSBuffer.encodeName("Bureau._ipp._tcp.local"),
          },
        ]),
      );

      expect(envoyes).toHaveLength(2); // un SRV, un TXT
    });

    it("n'interroge chaque nom qu'une seule fois", () => {
      core.listen();
      const p = paquet([
        { name: "_ipp._tcp.local", type: 12, rdata: DNSBuffer.encodeName("A._ipp._tcp.local") },
      ]);
      handlers["message"](p);
      const apresPremier = envoyes.length;
      handlers["message"](p);

      expect(envoyes.length).toBe(apresPremier);
    });

    it("se tait quand le parcours est désactivé", () => {
      core.listen();
      core.setAutoWalk(false);
      envoyes.length = 0;
      handlers["message"](
        paquet([
          { name: "_ipp._tcp.local", type: 12, rdata: DNSBuffer.encodeName("B._ipp._tcp.local") },
        ]),
      );

      expect(envoyes).toHaveLength(0);
    });
  });

  it("accepte une signature d'identification maison", () => {
    core.addSignature({
      id: "mon-materiel",
      match: (services) =>
        services.some((s) => s.txt.usb_MFG === "HP")
          ? { category: "printer", vendor: "Atelier", confidence: "certain", evidence: "maison" }
          : null,
    });
    core.listen();
    handlers["message"](paquet(IMPRIMANTE));

    expect(core.getResponder("hp.local")?.identity.vendor).toBe("Atelier");
  });

  it("oublie tout à l'arrêt", () => {
    core.listen();
    handlers["message"](paquet(IMPRIMANTE));
    expect(core.getResponders()).toHaveLength(1);

    core.stop();
    expect(core.getResponders()).toHaveLength(0);
  });
});
