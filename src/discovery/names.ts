/**
 * Découpage des noms DNS-SD.
 *
 * Un nom d'instance de service s'écrit `<instance>.<type>.<domaine>`, par
 * exemple `Bureau._ipp._tcp.local`. L'instance peut contenir des points —
 * DNS-SD l'autorise explicitement (RFC 6763 §4.1.1) — donc on ancre le
 * découpage sur le type, jamais sur le premier point rencontré.
 */

const INSTANCE = /^(.+)\.(_[^.]+\._(?:tcp|udp))\.([^.]+)\.?$/i;
const TYPE = /^(_[^.]+\._(?:tcp|udp))\.([^.]+)\.?$/i;

export type ParsedInstance = {
  instance: string;
  type: string;
  domain: string;
};

/** `Bureau._ipp._tcp.local` → { instance: "Bureau", type: "_ipp._tcp" } */
export function parseInstanceName(fqdn: string): ParsedInstance | null {
  const m = INSTANCE.exec(fqdn);
  if (!m) return null;
  return { instance: m[1], type: m[2].toLowerCase(), domain: m[3].toLowerCase() };
}

/** Vrai pour `_ipp._tcp.local`, faux pour une instance ou un nom d'hôte. */
export function isServiceType(fqdn: string): boolean {
  return TYPE.test(fqdn);
}

/** La méta-requête qui énumère les types de services présents sur le lien. */
export const META_QUERY = "_services._dns-sd._udp.local";

/** Normalise un nom pour servir de clé : minuscules, sans point final. */
export function normalizeName(name: string): string {
  return name.replace(/\.$/, "").toLowerCase();
}
