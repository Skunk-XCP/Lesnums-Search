import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalizeKnownBrand,
  normalizeSearchText,
  type KnownBrand,
} from "../src/config/search";
import type { ContentType, SearchApiResponse } from "../src/types/search";

loadEnvConfig(process.cwd());

const CASES_PATH = path.join(process.cwd(), "tests", "search-cases.json");
const SEARCH_API_URL =
  process.env.SEARCH_API_URL?.trim() || "http://localhost:3000/api/search";

type SearchCase = {
  query: string;
  expectedTopBrand?: KnownBrand;
  expectedModel?: string;
  expectedTopType?: ContentType;
  expectRelatedTest?: boolean;
  minimumHits?: number;
  maximumHits?: number;
  requireAllHitsModel?: boolean;
  forbiddenTitleTerms?: string[];
  requireBrandBeforeTextOnly?: boolean;
};

function isSearchCase(value: unknown): value is SearchCase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.query === "string" &&
    (candidate.expectedTopBrand === undefined ||
      (typeof candidate.expectedTopBrand === "string" &&
        canonicalizeKnownBrand(candidate.expectedTopBrand) !== undefined)) &&
    (candidate.expectedModel === undefined ||
      typeof candidate.expectedModel === "string") &&
    (candidate.expectedTopType === undefined ||
      ["test", "news", "guide", "product"].includes(
        candidate.expectedTopType as string,
      )) &&
    (candidate.expectRelatedTest === undefined ||
      typeof candidate.expectRelatedTest === "boolean") &&
    (candidate.minimumHits === undefined ||
      typeof candidate.minimumHits === "number") &&
    (candidate.maximumHits === undefined ||
      typeof candidate.maximumHits === "number") &&
    (candidate.requireAllHitsModel === undefined ||
      typeof candidate.requireAllHitsModel === "boolean") &&
    (candidate.forbiddenTitleTerms === undefined ||
      (Array.isArray(candidate.forbiddenTitleTerms) &&
        candidate.forbiddenTitleTerms.every((term) => typeof term === "string"))) &&
    (candidate.requireBrandBeforeTextOnly === undefined ||
      typeof candidate.requireBrandBeforeTextOnly === "boolean")
  );
}

async function readCases() {
  const fileContent = await readFile(CASES_PATH, "utf8");
  const parsedCases: unknown = JSON.parse(fileContent);
  if (!Array.isArray(parsedCases) || !parsedCases.every(isSearchCase)) {
    throw new Error("Le fichier de benchmark contient un cas invalide.");
  }
  return parsedCases;
}

async function runCase(searchCase: SearchCase) {
  const url = new URL(SEARCH_API_URL);
  url.searchParams.set("q", searchCase.query);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);

  const result = (await response.json()) as SearchApiResponse;
  const topHit = result.hits[0];
  const failures: string[] = [];

  if (
    searchCase.minimumHits !== undefined &&
    result.hits.length < searchCase.minimumHits
  ) {
    failures.push(
      `au moins ${searchCase.minimumHits} résultat(s) attendu(s), reçu(s) : ${result.hits.length}`,
    );
  }

  if (
    searchCase.maximumHits !== undefined &&
    result.hits.length > searchCase.maximumHits
  ) {
    failures.push(
      `au plus ${searchCase.maximumHits} résultat(s) attendu(s), reçu(s) : ${result.hits.length}`,
    );
  }

  if (
    searchCase.expectedTopBrand &&
    canonicalizeKnownBrand(topHit?.brand ?? "") !== searchCase.expectedTopBrand
  ) {
    failures.push(
      `première marque attendue : ${searchCase.expectedTopBrand}, reçue : ${topHit?.brand ?? "aucune"}`,
    );
  }

  if (searchCase.expectedModel && topHit?.model !== searchCase.expectedModel) {
    failures.push(
      `première référence attendue : ${searchCase.expectedModel}, reçue : ${topHit?.model ?? "aucune"}`,
    );
  }

  if (searchCase.expectedTopType && topHit?.type !== searchCase.expectedTopType) {
    failures.push(
      `premier type attendu : ${searchCase.expectedTopType}, reçu : ${topHit?.type ?? "aucun"}`,
    );
  }

  if (searchCase.expectRelatedTest && !topHit?.relatedTest) {
    failures.push("le résultat produit enrichi ne contient pas son test associé");
  }

  if (
    searchCase.requireAllHitsModel &&
    searchCase.expectedModel &&
    result.hits.some((hit) => hit.model !== searchCase.expectedModel)
  ) {
    failures.push(
      `un résultat ne correspond pas à la référence ${searchCase.expectedModel}`,
    );
  }

  for (const forbiddenTerm of searchCase.forbiddenTitleTerms ?? []) {
    if (
      result.hits.some((hit) =>
        normalizeSearchText(hit.title).includes(normalizeSearchText(forbiddenTerm)),
      )
    ) {
      failures.push(`résultat interdit présent : ${forbiddenTerm}`);
    }
  }

  if (searchCase.requireBrandBeforeTextOnly && searchCase.expectedTopBrand) {
    const brandIndex = result.hits.findIndex(
      (hit) => canonicalizeKnownBrand(hit.brand ?? "") === searchCase.expectedTopBrand,
    );
    const textOnlyIndex = result.hits.findIndex(
      (hit) =>
        hit.matchReason === "description" &&
        canonicalizeKnownBrand(hit.brand ?? "") !== searchCase.expectedTopBrand,
    );

    if (brandIndex < 0 || (textOnlyIndex >= 0 && brandIndex >= textOnlyIndex)) {
      failures.push("un résultat de simple mention précède la marque attendue");
    }
  }

  return {
    query: searchCase.query,
    status: failures.length === 0 ? "OK" : "ÉCHEC",
    firstResult: topHit?.title ?? "Aucun résultat",
    details: failures.join(" ; "),
  };
}

async function main() {
  const searchCases = await readCases();
  const results = [];

  for (const searchCase of searchCases) {
    results.push(await runCase(searchCase));
  }

  console.table(results);
  const failureCount = results.filter((result) => result.status === "ÉCHEC").length;
  if (failureCount > 0) {
    throw new Error(`${failureCount} cas de benchmark en échec.`);
  }
  console.log(`${results.length} cas de benchmark réussis.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur du benchmark : ${message}`);
  process.exitCode = 1;
});
