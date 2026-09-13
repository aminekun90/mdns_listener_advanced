/**
 * Signatures d'identification des appareils.
 *
 * Rien ici n'est deviné à partir de rien : chaque signature dit sur quoi elle
 * s'appuie, et avec quelle confiance. L'ordre compte — la première qui
 * correspond gagne, et la table va du plus fiable au plus approximatif.
 *
 * Les trois niveaux :
 *   certain   — l'appareil déclare lui-même son modèle (_device-info)
 *   probable  — une clé TXT documentée par le constructeur
 *   guess     — le seul type de service, sans confirmation
 */
import type { DeviceCategory, Identity, ServiceInstance } from "../types.js";

export type SignatureMatch = Omit<Identity, "evidence"> & { evidence: string };

export type Signature = {
  /** Nom de la signature, pour le débogage. */
  readonly id: string;
  /** Décide si la signature s'applique, et ce qu'elle affirme. */
  readonly match: (services: readonly ServiceInstance[]) => SignatureMatch | null;
};

function find(services: readonly ServiceInstance[], type: string): ServiceInstance | undefined {
  return services.find((s) => s.type === type);
}

function has(services: readonly ServiceInstance[], type: string): boolean {
  return services.some((s) => s.type === type);
}

/** Catégorie déduite du seul type de service — le niveau le plus faible. */
const PAR_TYPE: ReadonlyArray<readonly [string, DeviceCategory, string?]> = [
  ["_ipp._tcp", "printer"],
  ["_ipps._tcp", "printer"],
  ["_printer._tcp", "printer"],
  ["_pdl-datastream._tcp", "printer"],
  ["_scanner._tcp", "scanner"],
  ["_uscan._tcp", "scanner"],
  ["_uscans._tcp", "scanner"],
  ["_googlecast._tcp", "tv", "Google"],
  ["_androidtvremote2._tcp", "tv", "Google"],
  // AirPlay n'est volontairement pas dans cette table : le protocole est
  // d'Apple, les appareils qui le parlent ne le sont pas forcement, et la
  // signature « airplay » ci-dessus decide a partir du modele annonce.
  ["_sonos._tcp", "speaker", "Sonos"],
  ["_spotify-connect._tcp", "speaker"],
  ["_hap._tcp", "iot"],
  ["_matter._tcp", "iot"],
  ["_matterc._udp", "iot"],
  ["_esphomelib._tcp", "iot", "ESPHome"],
  ["_hue._tcp", "iot", "Philips"],
  ["_smb._tcp", "nas"],
  ["_afpovertcp._tcp", "nas", "Apple"],
  ["_nfs._tcp", "nas"],
  ["_adisk._tcp", "nas", "Apple"],
  ["_rtsp._tcp", "camera"],
  ["_axis-video._tcp", "camera", "Axis"],
  ["_workstation._tcp", "computer"],
  ["_ssh._tcp", "computer"],
  ["_sftp-ssh._tcp", "computer"],
  ["_companion-link._tcp", "computer", "Apple"],
];

export const BUILTIN_SIGNATURES: readonly Signature[] = [
  {
    // Le mécanisme canonique : l'appareil publie son propre modèle.
    // Apple l'utilise partout, et il est repris bien au-delà.
    id: "device-info",
    match(services) {
      const s = find(services, "_device-info._tcp");
      const model = s?.txt.model;
      if (!model) return null;
      return {
        category: categoryForModel(model),
        vendor: vendorForModel(model),
        model,
        confidence: "certain",
        evidence: `_device-info._tcp TXT model=${model}`,
      };
    },
  },
  {
    id: "googlecast",
    match(services) {
      const s = find(services, "_googlecast._tcp");
      if (!s) return null;
      const model = s.txt.md;
      return {
        category: model && /group/i.test(model) ? "speaker" : "tv",
        vendor: "Google",
        model,
        confidence: model ? "probable" : "guess",
        evidence: model ? `_googlecast._tcp TXT md=${model}` : "_googlecast._tcp présent",
      };
    },
  },
  {
    // AirPlay est un protocole Apple, mais des tiers l'implementent : une
    // lampe connectee annonce « model=Table lamp » sans etre un produit
    // Apple, et un Mac qui recoit de l'AirPlay reste un ordinateur, pas un
    // televiseur. On ne conclut donc ni sur le fabricant ni sur la categorie
    // sans que le modele le confirme.
    id: "airplay",
    match(services) {
      const s = find(services, "_airplay._tcp") ?? find(services, "_raop._tcp");
      if (!s) return null;
      const model = s.txt.model ?? s.txt.am;
      if (!model) {
        return {
          category: "unknown",
          confidence: "guess",
          evidence: "AirPlay présent, sans modèle annoncé",
        };
      }
      const connu = categoryForModel(model);
      return {
        category: connu !== "unknown" ? connu : "speaker",
        vendor: vendorForModel(model),
        model,
        confidence: "probable",
        evidence: `AirPlay TXT model=${model}`,
      };
    },
  },
  {
    id: "ipp-printer",
    match(services) {
      const s = find(services, "_ipp._tcp") ?? find(services, "_ipps._tcp");
      if (!s) return null;
      const vendor = s.txt.usb_MFG ?? s.txt.mfg;
      const model = s.txt.usb_MDL ?? s.txt.ty ?? s.txt.product?.replace(/^\(|\)$/g, "");
      if (!vendor && !model) return null;
      return {
        category: "printer",
        vendor,
        model,
        confidence: "probable",
        evidence: `IPP TXT ${vendor ? `usb_MFG=${vendor}` : ""}${vendor && model ? " " : ""}${model ? `usb_MDL=${model}` : ""}`,
      };
    },
  },
  {
    id: "homekit",
    match(services) {
      const s = find(services, "_hap._tcp");
      if (!s) return null;
      const model = s.txt.md;
      return {
        category: "iot",
        model,
        confidence: model ? "probable" : "guess",
        evidence: model ? `HomeKit TXT md=${model}` : "_hap._tcp présent",
      };
    },
  },
  {
    id: "type-connu",
    match(services) {
      for (const [type, category, vendor] of PAR_TYPE) {
        if (has(services, type)) {
          return {
            category,
            vendor,
            confidence: "guess",
            evidence: `${type} présent, sans métadonnée de modèle`,
          };
        }
      }
      return null;
    },
  },
];

/** Les identifiants de modèle Apple sont de la forme `MacBookPro18,1`. */
function vendorForModel(model: string): string | undefined {
  if (/^(Mac|iMac|iPhone|iPad|iPod|AppleTV|AudioAccessory|Watch|Xserve|RackMac)/i.test(model)) {
    return "Apple";
  }
  return undefined;
}

function categoryForModel(model: string): DeviceCategory {
  if (/iPhone/i.test(model)) return "phone";
  if (/iPad|iPod/i.test(model)) return "tablet";
  if (/AppleTV/i.test(model)) return "tv";
  if (/AudioAccessory|HomePod/i.test(model)) return "speaker";
  if (/Mac|Xserve/i.test(model)) return "computer";
  if (/Watch/i.test(model)) return "wearable";
  return "unknown";
}
