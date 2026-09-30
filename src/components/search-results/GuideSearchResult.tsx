import Image from "next/image";

import { HighlightedText } from "@/src/components/HighlightedText";
import { MatchReason, ResultTypeBadge } from "@/src/components/search-results/ResultParts";
import type { SearchHit } from "@/src/types/search";

export function GuideSearchResult({ result }: { result: SearchHit }) {
  return (
    <article className="group border-b border-neutral-200 py-6 first:pt-3 last:border-0 sm:py-7">
      <div className={result.imageUrl ? "grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]" : undefined}>
        {result.imageUrl && (
          <a href={result.url} target="_blank" rel="noreferrer" className="relative block aspect-[16/9] overflow-hidden bg-neutral-100" tabIndex={-1} aria-hidden="true">
            <Image src={result.imageUrl} alt="" fill sizes="(max-width: 639px) 100vw, 180px" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.02]" />
          </a>
        )}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <ResultTypeBadge type="guide" />
            {result.category && <span className="font-bold text-neutral-700"><HighlightedText value={result.formatted.category ?? result.category} /></span>}
          </div>
          <div className="mb-2"><MatchReason reason={result.matchReason} /></div>
          <h2 className="text-xl font-black leading-tight tracking-[-0.025em] text-neutral-950 sm:text-2xl">
            <a href={result.url} target="_blank" rel="noreferrer" className="transition group-hover:text-[#d7192d]"><HighlightedText value={result.formatted.title ?? result.title} /></a>
          </h2>
          {result.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600"><HighlightedText value={result.formatted.description ?? result.description} /></p>}
          <a href={result.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex border-b-2 border-[#e21b2d] pb-0.5 text-sm font-black text-neutral-950 transition hover:text-[#d7192d]">Voir le guide →</a>
        </div>
      </div>
    </article>
  );
}
