import { HighlightedText } from "@/src/components/HighlightedText";
import { getResultExcerpt, MatchReason, ResultIdentity, ResultTypeBadge, ResultUrl } from "@/src/components/search-results/ResultParts";
import type { SearchHit } from "@/src/types/search";

export function ArticleSearchResult({ result }: { result: SearchHit }) {
  const excerpt = getResultExcerpt(result);

  return (
    <article className="group border-b border-neutral-200 py-6 first:pt-3 last:border-0 sm:py-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500"><ResultTypeBadge type={result.type} /><ResultIdentity result={result} showDate /></div>
      <div className="mb-2"><MatchReason reason={result.matchReason} /></div>
      <h2 className="text-xl font-black leading-tight tracking-[-0.025em] text-neutral-950 sm:text-2xl">
        <a href={result.url} target="_blank" rel="noreferrer" className="transition group-hover:text-[#d7192d]"><HighlightedText value={result.formatted.title ?? result.title} /></a>
      </h2>
      {excerpt && <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 sm:text-base sm:leading-7"><HighlightedText value={excerpt} /></p>}
      <ResultUrl url={result.url} />
    </article>
  );
}
