import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  containsWholeTerm,
  createReferenceKey,
  normalizeSearchText,
} from "../src/config/search";
import type { ContentType, SearchDocument } from "../src/types/search";

const DATA_PATH = path.join(process.cwd(), "data", "lesnumeriques.json");
const TOP_LIMIT = 10;

type ReferenceCoverage = {
  key: string;
  reference: string;
  brand: string;
  model: string;
  product: number;
  tests: number;
  news: number;
  guides: number;
  other: number;
  total: number;
  score: number;
  documents: Array<Pick<SearchDocument, "id" | "title" | "type" | "url">>;
};

type ReferenceSeed = {
  brand: string;
  model: string;
  reference: string;
  referenceKey?: string;
};

function referenceKey(brand: string, model: string) {
  return `${normalizeSearchText(brand)}:${normalizeSearchText(model)}`;
}

function hasExactIdentity(document: SearchDocument, brand: string, model: string) {
  return Boolean(
    document.brand &&
      document.model &&
      normalizeSearchText(document.brand) === normalizeSearchText(brand) &&
      normalizeSearchText(document.model) === normalizeSearchText(model),
  );
}

function hasStrongExplicitMention(
  document: SearchDocument,
  brand: string,
  model: string,
) {
  const titleOrProductName = [document.title, document.productName]
    .filter((value): value is string => Boolean(value))
    .some(
      (value) =>
        containsWholeTerm(value, brand) && containsWholeTerm(value, model),
    );
  if (titleOrProductName) return true;

  const content = normalizeSearchText(document.content ?? "");
  const exactReference = normalizeSearchText(`${brand} ${model}`);
  return content.includes(exactReference);
}

function isStronglyLinked(
  document: SearchDocument,
  brand: string,
  model: string,
) {
  return (
    hasExactIdentity(document, brand, model) ||
    hasStrongExplicitMention(document, brand, model)
  );
}

function scoreCoverage(counts: Record<ContentType, number>, other: number) {
  return (
    (counts.product > 0 ? 5 : 0) +
    (counts.test > 0 ? 5 : 0) +
    counts.news * 2 +
    counts.guide * 2 +
    other
  );
}

function explainCoverage(coverage: ReferenceCoverage) {
  const details = [
    coverage.product > 0 ? `${coverage.product} fiche(s) produit` : undefined,
    coverage.tests > 0 ? `${coverage.tests} test(s)` : undefined,
    coverage.news > 0 ? `${coverage.news} actualité(s)` : undefined,
    coverage.guides > 0 ? `${coverage.guides} guide(s)` : undefined,
  ].filter(Boolean);

  return `${coverage.reference} — score ${coverage.score}, ${details.join(", ")}.`;
}

async function analyzeReferences() {
  const parsed: unknown = JSON.parse(await readFile(DATA_PATH, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Le dataset doit être un tableau.");
  const documents = parsed as SearchDocument[];
  const references = new Map<
    string,
    ReferenceSeed
  >();
  const targetedIdentities = new Set<string>();

  for (const document of documents) {
    for (const targetedKey of document.referenceKeys ?? []) {
      if (references.has(`target:${targetedKey}`)) continue;
      const directDocument = documents.find(
        (candidate) =>
          candidate.referenceKeys?.includes(targetedKey) &&
          candidate.type === "product" &&
          candidate.brand &&
          candidate.model &&
          createReferenceKey(candidate.title) === targetedKey,
      );
      if (!directDocument?.brand || !directDocument.model) continue;
      references.set(`target:${targetedKey}`, {
        brand: directDocument.brand,
        model: directDocument.model,
        reference: directDocument.title,
        referenceKey: targetedKey,
      });
      targetedIdentities.add(referenceKey(directDocument.brand, directDocument.model));
    }
  }

  for (const document of documents) {
    if (!document.brand || !document.model) continue;
    const key = referenceKey(document.brand, document.model);
    if (targetedIdentities.has(key)) continue;
    if (!references.has(key)) {
      references.set(key, {
        brand: document.brand,
        model: document.model,
        reference: `${document.brand} ${document.model}`,
      });
    }
  }

  const coverage = [...references.entries()].map(([key, reference]) => {
    const linkedDocuments = documents.filter((document) =>
      reference.referenceKey
        ? document.referenceKeys?.includes(reference.referenceKey)
        : isStronglyLinked(document, reference.brand, reference.model),
    );
    const counts: Record<ContentType, number> = {
      product: 0,
      test: 0,
      news: 0,
      guide: 0,
    };

    let other = 0;
    for (const document of linkedDocuments) {
      const isDirectProductOrTest =
        (document.type === "product" || document.type === "test") &&
        hasStrongExplicitMention(document, reference.brand, reference.model) &&
        normalizeSearchText(document.title).includes(
          normalizeSearchText(reference.reference),
        );
      if (
        reference.referenceKey &&
        (document.type === "product" || document.type === "test") &&
        !isDirectProductOrTest
      ) {
        other += 1;
      } else {
        counts[document.type] += 1;
      }
    }

    return {
      key,
      ...reference,
      product: counts.product,
      tests: counts.test,
      news: counts.news,
      guides: counts.guide,
      other,
      total: linkedDocuments.length,
      score: scoreCoverage(counts, other),
      documents: linkedDocuments.map(({ id, title, type, url }) => ({
        id,
        title,
        type,
        url,
      })),
    } satisfies ReferenceCoverage;
  });

  return coverage.sort(
    (first, second) =>
      second.score - first.score ||
      second.total - first.total ||
      Number(second.product > 0 && second.tests > 0) -
        Number(first.product > 0 && first.tests > 0) ||
      first.reference.localeCompare(second.reference, "fr-FR", {
        numeric: true,
      }),
  );
}

async function main() {
  const coverage = await analyzeReferences();
  const topReferences = coverage.slice(0, TOP_LIMIT);
  const recommendations = coverage
    .filter((entry) => entry.product === 1 && entry.tests === 1)
    .slice(0, 3);

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          generatedFrom: path.relative(process.cwd(), DATA_PATH),
          scoring:
            "+5 si une fiche produit existe, +5 si un test existe, +2 par actualité, +2 par guide",
          topReferences,
          recommendations,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\nTop 10 des références les plus riches\n");
  console.table(
    topReferences.map((entry, index) => ({
      rang: index + 1,
      référence: entry.reference,
      product: entry.product,
      tests: entry.tests,
      news: entry.news,
      guides: entry.guides,
      autres: entry.other,
      total: entry.total,
      score: entry.score,
    })),
  );

  console.log("\nTop 3 recommandé pour la démonstration\n");
  recommendations.forEach((entry, index) => {
    console.log(`${index + 1}. ${explainCoverage(entry)}`);
  });

  if (recommendations[0]) {
    console.log(
      `\nRéférence recommandée : ${recommendations[0].reference} — elle combine le meilleur score avec une fiche produit unique et un test unique, ce qui permet une fusion sans ambiguïté.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur de l’analyse : ${message}`);
  process.exitCode = 1;
});
