import { META_QUERY, isServiceType, normalizeName, parseInstanceName } from "@/discovery/names.js";
import { describe, expect, it } from "vitest";

describe("découpage des noms DNS-SD", () => {
  it("sépare instance et type", () => {
    expect(parseInstanceName("Bureau._ipp._tcp.local")).toEqual({
      instance: "Bureau",
      type: "_ipp._tcp",
      domain: "local",
    });
  });

  it("accepte les points dans le nom d'instance", () => {
    // RFC 6763 §4.1.1 : l'instance est un libellé unique, points compris.
    expect(parseInstanceName("Salon 2.0._airplay._tcp.local")?.instance).toBe("Salon 2.0");
  });

  it("gère UDP autant que TCP", () => {
    expect(parseInstanceName("Thermostat._matterc._udp.local")?.type).toBe("_matterc._udp");
  });

  it("normalise la casse du type", () => {
    expect(parseInstanceName("X._IPP._TCP.local")?.type).toBe("_ipp._tcp");
  });

  it("refuse un nom d'hôte simple", () => {
    expect(parseInstanceName("imprimante.local")).toBeNull();
  });

  it("refuse un type de service seul", () => {
    expect(parseInstanceName("_ipp._tcp.local")).toBeNull();
  });

  it("reconnaît un type de service", () => {
    expect(isServiceType("_ipp._tcp.local")).toBe(true);
    expect(isServiceType("Bureau._ipp._tcp.local")).toBe(false);
    expect(isServiceType("imprimante.local")).toBe(false);
  });

  it("normalise en retirant le point final et la casse", () => {
    expect(normalizeName("HP-Laser.LOCAL.")).toBe("hp-laser.local");
  });

  it("expose la méta-requête, qui n'est pas un type de service ordinaire", () => {
    expect(META_QUERY).toBe("_services._dns-sd._udp.local");
    // Elle porte un libellé de plus que `_type._proto.domaine` : la traiter
    // comme un type ordinaire ferait boucler le parcours d'arbre sur elle.
    expect(isServiceType(META_QUERY)).toBe(false);
  });
});
