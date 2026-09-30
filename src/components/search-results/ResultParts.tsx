import { HighlightedText } from "@/src/components/HighlightedText";
import type { ContentType, MatchReason, SearchHit } from "@/src/types/search";

const TYPE_LABELS: Record<ContentType, string> = {
  test: "Test",
  news: "Actualité",
  guide: "Guide d’achat",
  product: "Produit",
};

const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  brand: "Marque exacte",
  model: "Référence produit exacte",
  productName: "Nom du produit exact",
  title: "Trouvé dans le titre",
  category: "Trouvé dans la catégorie",
  description: "Mention dans la description",
  content: "Mention dans l’article",
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

export function ResultTypeBadge({ type }: { type: ContentType }) {
  return (
    <span className="border border-[#2ea428] bg-[#58dd51] px-2 py-1 text-[10px] font-black uppercase tracking-[0.07em] text-[#1d1d1d]">
      {TYPE_LABELS[type]}
    </span>
  );
}

export function ResultIdentity({ result, showDate = false }: { result: SearchHit; showDate?: boolean }) {
  const publishedAt = showDate ? formatDate(result.publishedAt) : undefined;

  return (
    <>
      {result.brand && <span className="font-bold text-neutral-800"><HighlightedText value={result.formatted.brand ?? result.brand} /></span>}
      {result.model && <span className="font-mono font-bold text-neutral-800">· <HighlightedText value={result.formatted.model ?? result.model} /></span>}
      {result.category && <span>· <HighlightedText value={result.formatted.category ?? result.category} /></span>}
      {publishedAt && <time dateTime={result.publishedAt}>· {publishedAt}</time>}
    </>
  );
}

export function MatchReason({ reason }: { reason: MatchReason }) {
  return (
    <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {MATCH_REASON_LABELS[reason]}
    </p>
  );
}

export function ResultUrl({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-3 block max-w-full truncate text-xs font-medium text-neutral-400 transition hover:text-[#d7192d] hover:underline">
      {url}
    </a>
  );
}

export function getResultExcerpt(result: SearchHit) {
  return result.matchedFields.includes("content")
    ? result.formatted.content ?? result.content
    : result.formatted.description ?? result.description;
}
