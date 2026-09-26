import { SearchResult } from "@/src/components/SearchResult";
import type { SearchApiResponse } from "@/src/types/search";

type SearchResultsProps = {
  response: SearchApiResponse | null;
  error: string | null;
  hasSearched: boolean;
  isLoading: boolean;
};

export function SearchResults({ response, error, hasSearched, isLoading }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm font-semibold text-neutral-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-[#e21b2d]" />
        Recherche en cours…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mt-8 border-l-4 border-red-600 bg-red-50 p-5 text-red-800">
        {error}
      </div>
    );
  }

  if (!hasSearched || !response) {
    return (
      <div className="py-12 text-center sm:py-16">
        <p className="text-xl font-black tracking-tight text-neutral-900">Que cherchez-vous ?</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">
          Saisissez une marque, un produit ou une technologie pour explorer le corpus public ciblé.
        </p>
      </div>
    );
  }

  if (response.estimatedTotalHits === 0) {
    return (
      <div className="py-10">
        <p className="font-bold text-neutral-900">Aucun résultat</p>
        <p className="mt-1 text-neutral-600">Essayez un terme plus général ou un autre filtre.</p>
      </div>
    );
  }

  return (
    <section className="mt-7" aria-live="polite">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-neutral-900 pb-3">
        <p className="text-sm text-neutral-600">
          <strong className="text-lg font-black text-neutral-950">{response.estimatedTotalHits}</strong>{" "}
          {response.estimatedTotalHits > 1 ? "résultats" : "résultat"}
        </p>
        <p className="font-mono text-[11px] text-neutral-500">{response.processingTimeMs} ms</p>
      </div>
      <div>
        {response.hits.map((result) => (
          <SearchResult key={result.id} result={result} />
        ))}
      </div>
    </section>
  );
}
