import {
  QUERY_CATEGORY_HINTS,
  extractProductReference,
  getBoostedBrand,
  normalizeSearchText,
  prepareSearchQuery,
  type KnownBrand,
} from "@/src/config/search";
import { getSearchIndex } from "@/src/lib/meilisearch";
import {
  isContentType,
  type MatchReason,
  type SearchApiError,
  type SearchApiResponse,
  type SearchDocument,
  type SearchHit,
} from "@/src/types/search";

const SEARCH_LIMIT = 50;
const HIGHLIGHT_PRE_TAG = "<mark>";
const HIGHLIGHT_POST_TAG = "</mark>";
const MATCHABLE_FIELDS: Array<keyof SearchDocument> = [
  "title",
  "brand",
  "model",
  "productName",
  "category",
  "description",
  "content",
];

type MeilisearchHit = SearchDocument & {
  _formatted?: Partial<SearchDocument>;
  _matchesPosition?: Partial<Record<keyof SearchDocument, unknown[]>>;
};

function createTypeFilter(type: string) {
  return type ? `type = "${type}"` : undefined;
}

function createBrandFilter(brand: string, type: string) {
  const filters = [`brand = "${brand}"`];
  if (type) filters.push(`type = "${type}"`);
  return filters.join(" AND ");
}

function createProductFilter(brand: string, model: string, type: string) {
  const filters = [`brand = "${brand}"`, `model = "${model}"`];
  if (type) filters.push(`type = "${type}"`);
  return filters.join(" AND ");
}

function getBrandQueryRelevanceScore(
  hit: SearchDocument,
  query: string,
  brand: KnownBrand,
) {
  const normalizedBrand = normalizeSearchText(brand);
  const queryTerms = normalizeSearchText(query)
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term !== normalizedBrand && term.length > 1) ?? [];
  const title = normalizeSearchText(hit.title);
  const category = normalizeSearchText(hit.category ?? "");
  const description = normalizeSearchText(hit.description ?? "");
  const content = normalizeSearchText(hit.content ?? "");
  let score = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) score += 40;
    if (category.includes(term)) score += 30;
    if (description.includes(term)) score += 10;
    if (content.includes(term)) score += 5;
  }

  for (const hint of QUERY_CATEGORY_HINTS) {
    if (
      hint.queryTerms.some((term) => queryTerms.includes(normalizeSearchText(term))) &&
      hint.categoryTerms.some((term) => category.includes(normalizeSearchText(term)))
    ) {
      score += 150;
    }
  }

  return score;
}

function getMatchedFields(hit: MeilisearchHit) {
  return MATCHABLE_FIELDS.filter((field) => {
    const matches = hit._matchesPosition?.[field];
    return Array.isArray(matches) && matches.length > 0;
  });
}

function getMatchReason(
  matchedFields: Array<keyof SearchDocument>,
  isBrandBoosted: boolean,
): MatchReason {
  if (matchedFields.includes("model")) return "model";
  if (matchedFields.includes("productName")) return "productName";
  if (isBrandBoosted || matchedFields.includes("brand")) return "brand";
  if (matchedFields.includes("title")) return "title";
  if (matchedFields.includes("category")) return "category";
  if (matchedFields.includes("description")) return "description";
  if (matchedFields.includes("content")) return "content";
  return "text";
}

function toSearchHit(hit: MeilisearchHit, isBrandBoosted: boolean): SearchHit {
  const matchedFields = getMatchedFields(hit);

  return {
    id: hit.id,
    title: hit.title,
    url: hit.url,
    type: hit.type,
    ...(hit.brand ? { brand: hit.brand } : {}),
    ...(hit.model ? { model: hit.model } : {}),
    ...(hit.productName ? { productName: hit.productName } : {}),
    ...(hit.category ? { category: hit.category } : {}),
    ...(hit.description ? { description: hit.description } : {}),
    ...(hit.content ? { content: hit.content } : {}),
    ...(hit.publishedAt ? { publishedAt: hit.publishedAt } : {}),
    formatted: {
      title: hit._formatted?.title ?? hit.title,
      ...(hit.brand ? { brand: hit._formatted?.brand ?? hit.brand } : {}),
      ...(hit.model ? { model: hit._formatted?.model ?? hit.model } : {}),
      ...(hit.productName
        ? { productName: hit._formatted?.productName ?? hit.productName }
        : {}),
      ...(hit.category
        ? { category: hit._formatted?.category ?? hit.category }
        : {}),
      ...(hit.description
        ? { description: hit._formatted?.description ?? hit.description }
        : {}),
      ...(hit.content
        ? { content: hit._formatted?.content ?? hit.content }
        : {}),
    },
    matchedFields,
    matchReason: getMatchReason(matchedFields, isBrandBoosted),
  };
}

const highlightOptions = {
  attributesToHighlight: [
    "title",
    "brand",
    "model",
    "productName",
    "category",
    "description",
    "content",
  ],
  attributesToCrop: ["description", "content"],
  cropLength: 32,
  cropMarker: "…",
  highlightPreTag: HIGHLIGHT_PRE_TAG,
  highlightPostTag: HIGHLIGHT_POST_TAG,
  showMatchesPosition: true,
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type")?.trim() ?? "";

  if (!query) {
    return Response.json({
      hits: [],
      estimatedTotalHits: 0,
      processingTimeMs: 0,
      query,
    } satisfies SearchApiResponse);
  }

  if (type && !isContentType(type)) {
    return Response.json(
      { error: "Le type de contenu demandé est invalide." } satisfies SearchApiError,
      { status: 400 },
    );
  }

  try {
    const index = getSearchIndex();
    const boostedBrand = getBoostedBrand(query);
    const meilisearchQuery = prepareSearchQuery(query);
    const productReference = boostedBrand
      ? extractProductReference(query, boostedBrand)
      : undefined;
    const commonOptions = {
      limit: SEARCH_LIMIT,
      matchingStrategy: "all" as const,
      ...highlightOptions,
    };

    if (boostedBrand && productReference) {
      const productResult = await index.search<SearchDocument>(meilisearchQuery, {
        ...commonOptions,
        filter: createProductFilter(boostedBrand, productReference, type),
      });

      return Response.json({
        hits: productResult.hits.map((hit) =>
          toSearchHit(hit as MeilisearchHit, true),
        ),
        estimatedTotalHits:
          productResult.estimatedTotalHits ?? productResult.hits.length,
        processingTimeMs: productResult.processingTimeMs,
        query,
      } satisfies SearchApiResponse);
    }

    const isExactBrandQuery =
      boostedBrand !== undefined &&
      normalizeSearchText(query) === normalizeSearchText(boostedBrand);
    const [strictBrandResult, brandResult, textResult] = await Promise.all([
      boostedBrand && !isExactBrandQuery
        ? index.search<SearchDocument>(meilisearchQuery, {
            ...commonOptions,
            filter: createBrandFilter(boostedBrand, type),
          })
        : Promise.resolve(undefined),
      boostedBrand
        ? index.search<SearchDocument>(meilisearchQuery, {
            ...commonOptions,
            filter: createBrandFilter(boostedBrand, type),
          })
        : Promise.resolve(undefined),
      index.search<SearchDocument>(meilisearchQuery, {
        ...commonOptions,
        ...(createTypeFilter(type) ? { filter: createTypeFilter(type) } : {}),
      }),
    ]);

    const hitsById = new Map<string, SearchHit>();
    const strictBrandHits = boostedBrand
      ? [...(strictBrandResult?.hits ?? [])].sort(
          (firstHit, secondHit) =>
            getBrandQueryRelevanceScore(secondHit, query, boostedBrand) -
            getBrandQueryRelevanceScore(firstHit, query, boostedBrand),
        )
      : [];
    const orderedHitGroups = isExactBrandQuery
      ? [
          { hits: brandResult?.hits ?? [], isBrandBoosted: true },
          { hits: textResult.hits, isBrandBoosted: false },
        ]
      : [
          { hits: strictBrandHits, isBrandBoosted: true },
          { hits: textResult.hits, isBrandBoosted: false },
          { hits: brandResult?.hits ?? [], isBrandBoosted: true },
        ];

    for (const group of orderedHitGroups) {
      for (const hit of group.hits) {
        if (!hitsById.has(hit.id)) {
          hitsById.set(
            hit.id,
            toSearchHit(hit as MeilisearchHit, group.isBrandBoosted),
          );
        }
      }
    }

    return Response.json({
      hits: [...hitsById.values()].slice(0, SEARCH_LIMIT),
      estimatedTotalHits: textResult.estimatedTotalHits ?? textResult.hits.length,
      processingTimeMs:
        textResult.processingTimeMs +
        (brandResult?.processingTimeMs ?? 0) +
        (strictBrandResult?.processingTimeMs ?? 0),
      query,
    } satisfies SearchApiResponse);
  } catch (error: unknown) {
    console.error("Meilisearch search failed", error);

    return Response.json(
      {
        error:
          "Le moteur de recherche est temporairement indisponible. Vérifiez que Meilisearch est démarré et que l’index a été créé.",
      } satisfies SearchApiError,
      { status: 503 },
    );
  }
}
