/**
 * Vérifie que le paquet publie vraiment les types qu'il annonce.
 *
 * Deux régressions déjà rencontrées, et invisibles à la compilation :
 *
 *   1. `package.json` déclarait `./dist/index.d.ts` alors que `tsc` déposait
 *      les déclarations dans `dist/src/`. Le chemin ne pointait sur rien, et
 *      TypeScript retombait silencieusement en `any` chez les consommateurs.
 *   2. Les déclarations contenaient des imports `@/...`, un alias interne que
 *      personne ne peut résoudre hors du dépôt.
 *
 * Ce contrôle tourne à la fin de chaque build.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));

const problemes = [];

/** Chemins de types annoncés par package.json, dédupliqués. */
const annonces = new Set(
  [pkg.types, pkg.typings, pkg.exports?.["."]?.types].filter(Boolean),
);

if (annonces.size === 0) problemes.push("aucun chemin de types déclaré");

for (const chemin of annonces) {
  const abs = join(racine, chemin);
  if (!existsSync(abs)) {
    problemes.push(`déclaré mais absent : ${chemin}`);
    continue;
  }
  const contenu = readFileSync(abs, "utf8");
  if (/from\s+["']@\//.test(contenu)) {
    problemes.push(`${chemin} contient des imports d'alias @/ non résolvables`);
  }
}

/** Ce que `files` publiera doit exister. */
for (const entree of pkg.files ?? []) {
  if (!existsSync(join(racine, entree))) {
    problemes.push(`files déclare ${entree}, absent du disque`);
  }
}

/** Aucun alias ne doit subsister nulle part dans dist. */
function parcourir(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (e.name.endsWith(".d.ts") && /from\s+["']@\//.test(readFileSync(p, "utf8"))) {
      problemes.push(`${p.replace(racine + "/", "")} contient un import d'alias @/`);
    }
  }
}
if (existsSync(join(racine, "dist"))) parcourir(join(racine, "dist"));

if (problemes.length) {
  console.error("✖ point d'entrée des types incorrect :");
  for (const p of problemes) console.error(`   - ${p}`);
  process.exit(1);
}
console.log(`✔ types publiés vérifiés : ${[...annonces].join(", ")}`);
