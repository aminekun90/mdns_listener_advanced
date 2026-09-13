/**
 * Identification d'un répondeur à partir des services qu'il annonce.
 *
 * Le principe : on ne conclut jamais sans dire d'où vient la conclusion.
 * Chaque identité porte son niveau de confiance et la liste des indices qui
 * l'ont produite, pour que l'appelant puisse décider de s'y fier ou non.
 */
import type { Identity, ServiceInstance } from "../types.js";
import { BUILTIN_SIGNATURES, type Signature } from "./signatures.js";

export class Identifier {
  private readonly custom: Signature[] = [];

  /**
   * Ajoute une signature, évaluée avant celles fournies par la bibliothèque.
   * Permet de reconnaître un matériel maison sans attendre une version.
   */
  public add(signature: Signature): this {
    this.custom.push(signature);
    return this;
  }

  public clearCustom(): this {
    this.custom.length = 0;
    return this;
  }

  /**
   * Évalue toutes les signatures et agrège leurs indices.
   *
   * La première correspondance donne la catégorie et la confiance ; les
   * suivantes ne servent qu'à compléter les champs manquants et à enrichir
   * les preuves. Une signature « certain » ne peut pas être dégradée par une
   * signature plus faible évaluée ensuite.
   */
  public identify(services: readonly ServiceInstance[]): Identity {
    if (services.length === 0) {
      return { category: "unknown", confidence: "guess", evidence: [] };
    }

    let resultat: Identity | null = null;

    for (const signature of [...this.custom, ...BUILTIN_SIGNATURES]) {
      const m = signature.match(services);
      if (!m) continue;

      if (!resultat) {
        resultat = {
          category: m.category,
          vendor: m.vendor,
          model: m.model,
          confidence: m.confidence,
          evidence: [m.evidence],
        };
        continue;
      }

      resultat.evidence.push(m.evidence);
      resultat.vendor ??= m.vendor;
      resultat.model ??= m.model;
      if (resultat.category === "unknown") resultat.category = m.category;
    }

    return resultat ?? { category: "unknown", confidence: "guess", evidence: [] };
  }
}
