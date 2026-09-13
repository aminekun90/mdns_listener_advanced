/**
 * Exemple : découvrir les machines du réseau local et dire ce qu'elles sont.
 *
 *   yarn start
 */
import Core, { EmittedEvent, type Responder } from "./src/index.js";

const mdns = new Core();

function decrire(r: Responder): string {
  const { category, vendor, model, confidence } = r.identity;
  const etiquette = [vendor, model].filter(Boolean).join(" ") || category;
  return `${etiquette} (${category}, ${confidence})`;
}

mdns.on(EmittedEvent.RESPONDER_FOUND, (r: Responder) => {
  mdns.info(`🖥️  ${r.hostname} — ${decrire(r)}`);
  mdns.info(`    ${r.addresses.ipv4.join(", ") || "pas d'IPv4"}`);
  for (const s of r.services) {
    const txt = Object.entries(s.txt)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    mdns.info(`    ${s.type.padEnd(24)} :${s.port} ${txt}`);
  }
  for (const indice of r.identity.evidence) mdns.info(`    ↳ ${indice}`);
});

mdns.on(EmittedEvent.RESPONDER_LOST, (hostname: string) => {
  mdns.info(`👋 ${hostname} a quitté le réseau`);
});

mdns.on(EmittedEvent.ERROR, (error: Error) => mdns.error(error.message));

mdns.info("🚀 Recherche des répondeurs mDNS...");
mdns.listen();
mdns.scan();

setTimeout(() => {
  mdns.info(`\n📋 ${mdns.getResponders().length} machine(s) vue(s)`);
  mdns.stop();
}, 10_000);
