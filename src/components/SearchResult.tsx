import { HighlightedText } from "@/src/components/HighlightedText";
import type { ContentType, MatchReason, SearchHit } from "@/src/types/search";

const TYPE_LABELS: Record<ContentType, string> = {
  test: "Test",
  news: "Actualité",
  guide: "Guide",
  product: "Produit",
};

const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  brand: "Marque exacte",
  model: "Référence produit exacte",
  productName: "Nom du produit exact",
  title: "Trouvé dans le titre",
  category: "Trouvé dans la catégorie",
  description: "Mention dans la description",
  content: "Mention dans l'article",
  text: "Correspondance textuelle",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(date?: string) {
  if (!date) return undefined;

  const parsedDate = new Date(date);
  return Number.isNaN(parsedDate.getTime()) ? undefined : dateFormatter.format(parsedDate);
}

export function SearchResult({ result }: { result: SearchHit }) {
  const publishedAt = formatDate(result.publishedAt);
  const excerpt = result.matchedFields.includes("content")
    ? result.formatted.content ?? result.content
    : result.formatted.description ?? result.description;

  return (
    <article className="group border-b border-neutral-200 py-6 first:pt-3 last:border-0 sm:py-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="bg-[#e21b2d] px-2 py-1 font-black uppercase tracking-[0.05em] text-white">
          {TYPE_LABELS[result.type]}
        </span>
        {result.brand && (
          <span className="font-bold text-neutral-800">
            <HighlightedText value={result.formatted.brand ?? result.brand} />
          </span>
        )}
        {result.model && (
          <span className="font-mono font-bold text-neutral-800">
            · <HighlightedText value={result.formatted.model ?? result.model} />
          </span>
        )}
        {result.category && (
          <span>
            · <HighlightedText value={result.formatted.category ?? result.category} />
          </span>
        )}
        {publishedAt && <time dateTime={result.publishedAt}>· {publishedAt}</time>}
      </div>
      <p className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {MATCH_REASON_LABELS[result.matchReason]}
      </p>
      <h2 className="text-xl font-black leading-tight tracking-[-0.025em] text-neutral-950 sm:text-2xl">
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="transition group-hover:text-[#d7192d]"
        >
          <HighlightedText value={result.formatted.title ?? result.title} />
        </a>
      </h2>
      {excerpt && (
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 sm:text-base sm:leading-7">
          <HighlightedText value={excerpt} />
        </p>
      )}
      <a
        href={result.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block truncate text-xs font-medium text-neutral-400 transition hover:text-[#d7192d] hover:underline"
      >
        {result.url}
      </a>
    </article>
  );
}
