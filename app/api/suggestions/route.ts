import {
  canonicalizeKnownBrand,
  normalizeSearchText,
} from "@/src/config/search";
import { getSearchIndex } from "@/src/lib/meilisearch";
import type {
  SearchDocument,
  SearchSuggestion,
  SuggestionsApiResponse,
} from "@/src/types/search";

const SUGGESTION_LIMIT = 7;
const CANDIDATE_LIMIT = 60;

function compareSuggestions(query: string) {
  const normalizedQuery = normalizeSearchText(query);

  return (first: SearchSuggestion, second: SearchSuggestion) => {
    const firstName = normalizeSearchText(first.name);
    const secondName = normalizeSearchText(second.name);
    const firstScore = firstName.startsWith(normalizedQuery)
      ? 0
      : firstName.includes(normalizedQuery)
        ? 1
        : 2;
    const secondScore = secondName.startsWith(normalizedQuery)
      ? 0
      : secondName.includes(normalizedQuery)
        ? 1
        : 2;

    if (firstScore !== secondScore) return firstScore - secondScore;
    if (first.type !== second.type) {
      if (first.type === "product") return -1;
      if (second.type === "product") return 1;
    }
    return firstName.localeCompare(secondName, "fr-FR", { numeric: true });
  };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return Response.json({ suggestions: [] } satisfies SuggestionsApiResponse);
  }

  try {
    const result = await getSearchIndex().search<SearchDocument>(query, {
      limit: CANDIDATE_LIMIT,
      matchingStrategy: "all",
      attributesToRetrieve: [
        "id",
        "title",
        "type",
        "brand",
        "model",
        "productName",
        "category",
      ],
    });
    const suggestions: SearchSuggestion[] = [];
    const exactBrand = canonicalizeKnownBrand(query);

    if (exactBrand && result.hits.some((hit) => hit.brand === exactBrand)) {
      suggestions.push({
        id: `brand:${normalizeSearchText(exactBrand)}`,
        query: exactBrand,
        name: exactBrand,
        kind: "brand",
        brand: exactBrand,
      });
    }

    const productsByIdentity = new Map<string, SearchSuggestion>();
    for (const hit of result.hits) {
      if (!hit.brand || !hit.model) continue;

      const name = hit.type === "product"
        ? hit.title
        : hit.productName ?? `${hit.brand} ${hit.model}`;
      const identity = `${normalizeSearchText(hit.brand)}:${normalizeSearchText(hit.model)}`;
      const suggestion: SearchSuggestion = {
        id: `product:${identity}`,
        query: `${hit.brand} ${hit.model}`,
        name,
        kind: "product",
        brand: hit.brand,
        model: hit.model,
        ...(hit.category ? { category: hit.category } : {}),
        type: hit.type,
      };
      const existing = productsByIdentity.get(identity);

      if (!existing || (existing.type !== "product" && hit.type === "product")) {
        productsByIdentity.set(identity, suggestion);
      }
    }

    suggestions.push(
      ...[...productsByIdentity.values()].sort(compareSuggestions(query)),
    );

    return Response.json({
      suggestions: suggestions.slice(0, SUGGESTION_LIMIT),
    } satisfies SuggestionsApiResponse);
  } catch (error: unknown) {
    console.error("Meilisearch suggestions failed", error);
    return Response.json(
      { error: "Les suggestions sont temporairement indisponibles." },
      { status: 503 },
    );
  }
}
