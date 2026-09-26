export const CONTENT_TYPES = ["test", "news", "guide", "product"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export type SearchDocument = {
  id: string;
  title: string;
  url: string;
  type: ContentType;
  brand?: string;
  model?: string;
  productName?: string;
  category?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
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

export function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}
