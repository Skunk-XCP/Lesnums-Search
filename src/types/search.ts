export const CONTENT_TYPES = ["test", "news", "guide", "product"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export type SearchDocument = {
  id: string;
  title: string;
  url: string;
  type: ContentType;
  brand?: string;
  model?: string;
  relatedModels?: string[];
  referenceKeys?: string[];
  productName?: string;
  category?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  imageUrl?: string;
  priceFrom?: number;
  currency?: string;
  priceCompareUrl?: string;
};

export type MatchReason =
  | "brand"
  | "model"
  | "productName"
  | "title"
  | "category"
  | "description"
  | "content"
  | "text";

export type SearchHit = SearchDocument & {
  formatted: Partial<
    Pick<
      SearchDocument,
      "title" | "brand" | "model" | "productName" | "category" | "description" | "content"
    >
  >;
  matchedFields: Array<keyof SearchDocument>;
  matchReason: MatchReason;
  relatedTest?: {
    id: string;
    title: string;
    url: string;
    publishedAt?: string;
  };
};

export type SearchApiResponse = {
  hits: SearchHit[];
  estimatedTotalHits: number;
  processingTimeMs: number;
  query: string;
};

export type SearchApiError = {
  error: string;
};

export type SearchSuggestion = {
  id: string;
  query: string;
  name: string;
  kind: "brand" | "product";
  brand?: string;
  model?: string;
  category?: string;
  type?: ContentType;
};

export type SuggestionsApiResponse = {
  suggestions: SearchSuggestion[];
};

export function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}
