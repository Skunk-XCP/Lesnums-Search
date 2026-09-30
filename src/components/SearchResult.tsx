import { ArticleSearchResult } from "@/src/components/search-results/ArticleSearchResult";
import { GuideSearchResult } from "@/src/components/search-results/GuideSearchResult";
import { ProductSearchResult } from "@/src/components/search-results/ProductSearchResult";
import type { SearchHit } from "@/src/types/search";

export function SearchResult({ result }: { result: SearchHit }) {
  if (result.type === "product") return <ProductSearchResult result={result} />;
  if (result.type === "guide") return <GuideSearchResult result={result} />;
  return <ArticleSearchResult result={result} />;
}
