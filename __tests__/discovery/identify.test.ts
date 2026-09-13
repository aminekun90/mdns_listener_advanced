import { Identifier } from "@/discovery/identify.js";
import type { ServiceInstance } from "@/types.js";
import { describe, expect, it } from "vitest";

function svc(type: string, txt: Record<string, string> = {}): ServiceInstance {
  return { instance: "X", type, port: 1, txt, priority: 0, weight: 0 };
}

describe("identification par signatures", () => {
  const id = new Identifier();

  it("croit l'appareil sur parole quand il déclare son modèle", () => {
    const r = id.identify([svc("_device-info._tcp", { model: "MacBookPro18,1" })]);
    expect(r).toMatchObject({
      category: "computer",
      vendor: "Apple",
      model: "MacBookPro18,1",
      confidence: "certain",
    });
    expect(r.evidence[0]).toContain("_device-info._tcp");
  });

  it("classe les modèles Apple par famille", () => {
    const cas: [string, string][] = [
      ["iPhone15,3", "phone"],
      ["iPad13,1", "tablet"],
      ["AppleTV11,1", "tv"],
      ["AudioAccessory5,1", "speaker"],
      ["Watch6,1", "wearable"],
    ];
    for (const [model, categorie] of cas) {
      expect(id.identify([svc("_device-info._tcp", { model })]).category).toBe(categorie);
    }
  });

  it("lit le modèle Chromecast dans la clé md", () => {
    const r = id.identify([svc("_googlecast._tcp", { md: "Chromecast Ultra", fn: "Salon" })]);
    expect(r).toMatchObject({ category: "tv", vendor: "Google", model: "Chromecast Ultra" });
    expect(r.confidence).toBe("probable");
  });

  it("distingue un groupe d'enceintes Cast d'un téléviseur", () => {
    expect(id.identify([svc("_googlecast._tcp", { md: "Google Cast Group" })]).category).toBe(
      "speaker",
    );
  });

  it("compose fabricant et modèle d'une imprimante IPP", () => {
    const r = id.identify([svc("_ipp._tcp", { usb_MFG: "HP", usb_MDL: "LaserJet M281" })]);
    expect(r).toMatchObject({ category: "printer", vendor: "HP", model: "LaserJet M281" });
  });

  it("retombe sur le type de service, en le disant", () => {
    const r = id.identify([svc("_sonos._tcp")]);
    expect(r).toMatchObject({ category: "speaker", vendor: "Sonos", confidence: "guess" });
    expect(r.evidence[0]).toContain("sans métadonnée");
  });

  it("ne prétend rien sans service", () => {
    expect(id.identify([])).toEqual({ category: "unknown", confidence: "guess", evidence: [] });
  });

  it("ne prétend rien sur un service inconnu", () => {
    expect(id.identify([svc("_bidule._tcp")]).category).toBe("unknown");
  });

  it("cumule les indices de plusieurs signatures", () => {
    const r = id.identify([
      svc("_device-info._tcp", { model: "AppleTV11,1" }),
      svc("_airplay._tcp", { model: "AppleTV11,1" }),
      svc("_raop._tcp"),
    ]);
    expect(r.confidence).toBe("certain");
    expect(r.evidence.length).toBeGreaterThan(1);
  });

  it("une signature faible ne dégrade pas une signature certaine", () => {
    const r = id.identify([
      svc("_device-info._tcp", { model: "MacBookPro18,1" }),
      svc("_ssh._tcp"),
    ]);
    expect(r.confidence).toBe("certain");
    expect(r.model).toBe("MacBookPro18,1");
  });

  describe("signatures ajoutées par l'utilisateur", () => {
    it("passe avant celles de la bibliothèque", () => {
      const perso = new Identifier().add({
        id: "ma-sonde",
        match: (services) =>
          services.some((s) => s.type === "_sonos._tcp")
            ? {
                category: "iot",
                vendor: "Maison",
                model: "Sonde v2",
                confidence: "certain",
                evidence: "signature maison",
              }
            : null,
      });

      const r = perso.identify([svc("_sonos._tcp")]);
      expect(r).toMatchObject({ vendor: "Maison", model: "Sonde v2", confidence: "certain" });
    });

    it("clearCustom rend la main aux signatures d'origine", () => {
      const perso = new Identifier().add({
        id: "tout",
        match: () => ({ category: "camera", confidence: "certain", evidence: "tout" }),
      });
      expect(perso.identify([svc("_sonos._tcp")]).category).toBe("camera");
      perso.clearCustom();
      expect(perso.identify([svc("_sonos._tcp")]).category).toBe("speaker");
    });
  });
});

describe("AirPlay — ce que le protocole ne prouve pas", () => {
  const id = new Identifier();

  it("ne fait pas d'un Mac un téléviseur", () => {
    // Vu sur un vrai réseau : un MacBook recevant de l'AirPlay était classé
    // « tv » parce que la signature supposait que tout AirPlay est un écran.
    const r = id.identify([svc("_airplay._tcp", { model: "Mac17,2" })]);
    expect(r.category).toBe("computer");
    expect(r.vendor).toBe("Apple");
  });

  it("n'attribue pas une lampe Sonos à Apple", () => {
    // AirPlay est un protocole Apple, pas une marque d'appareil : une lampe
    // connectée annonce « model=Table lamp » sans être un produit Apple.
    const r = id.identify([svc("_airplay._tcp", { model: "Table lamp" })]);
    expect(r.vendor).toBeUndefined();
    expect(r.model).toBe("Table lamp");
  });

  it("laisse Sonos gagner sur AirPlay quand les deux sont là", () => {
    const r = id.identify([svc("_airplay._tcp", { model: "Table lamp" }), svc("_sonos._tcp")]);
    expect(r.vendor).toBe("Sonos");
  });

  it("ne conclut rien d'un AirPlay sans modèle", () => {
    expect(id.identify([svc("_airplay._tcp")]).category).toBe("unknown");
  });

  it("reconnaît une Apple TV", () => {
    expect(id.identify([svc("_airplay._tcp", { model: "AppleTV11,1" })]).category).toBe("tv");
  });

  it("reconnaît un HomePod", () => {
    expect(id.identify([svc("_raop._tcp", { am: "AudioAccessory5,1" })]).category).toBe("speaker");
  });
});
