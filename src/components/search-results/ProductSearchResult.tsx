import Image from "next/image";

import { HighlightedText } from "@/src/components/HighlightedText";
import {
  MatchReason,
  ResultIdentity,
  ResultTypeBadge,
  ResultUrl,
} from "@/src/components/search-results/ResultParts";
import {
  DEMO_PRICE_NOTICE,
  getDemoPrice,
} from "@/src/data/demoPrices";
import type { SearchHit } from "@/src/types/search";

function formatPrice(price: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: price % 1 === 0 ? 0 : 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export function ProductSearchResult({ result }: { result: SearchHit }) {
  const formattedName = result.formatted.title ?? result.title;
  const demoPrice = getDemoPrice(result.id);
  const isDemoPricing = result.priceFrom === undefined && demoPrice !== undefined;
  const priceFrom = result.priceFrom ?? demoPrice?.priceFrom;
  const currency = result.currency ?? demoPrice?.currency;
  const offers = isDemoPricing ? demoPrice.offers.slice(0, 3) : [];
  const compareUrl = result.priceCompareUrl ?? result.url;

  return (
    <article className="group border-b border-neutral-200 border-l-4 border-l-[#2ea428] bg-[#f8faf9] px-4 py-6 first:pt-5 last:border-b-0 sm:px-5 sm:py-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <ResultTypeBadge type="product" />
        <ResultIdentity result={result} />
      </div>
      <div className="mb-3">
        <MatchReason reason={result.matchReason} />
      </div>

      <div className={result.imageUrl ? "grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]" : undefined}>
        {result.imageUrl && (
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="relative block aspect-[4/3] w-full max-w-[180px] overflow-hidden bg-neutral-50"
            tabIndex={-1}
            aria-hidden="true"
          >
            <Image
              src={result.imageUrl}
              alt=""
              fill
              sizes="(max-width: 639px) 180px, 140px"
              unoptimized
              className="object-contain transition duration-300 group-hover:scale-[1.02]"
            />
          </a>
        )}

        <div className="min-w-0">
          <h2 className="text-xl font-black leading-tight tracking-[-0.025em] text-neutral-950 sm:text-2xl">
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="transition group-hover:text-[#d7192d]"
            >
              <HighlightedText value={formattedName} />
            </a>
          </h2>

          {priceFrom !== undefined && (
            <div className="mt-4 max-w-md border-y border-neutral-200 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-lg font-black text-neutral-950 sm:text-xl">
                  À partir de {formatPrice(priceFrom, currency)}{isDemoPricing ? " *" : ""}
                </p>
                {offers.length > 0 && (
                  <p className="text-xs font-bold text-neutral-500">
                    {offers.length} offres disponibles
                  </p>
                )}
              </div>

              {offers.length > 0 && (
                <ul className="mt-2 divide-y divide-neutral-200 text-sm">
                  {offers.map((offer) => (
                    <li key={offer.merchant} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <span className="font-semibold text-neutral-700">{offer.merchant}</span>
                      <span className="font-mono font-bold text-neutral-950">
                        {formatPrice(offer.price, currency)}
                      </span>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="col-span-2 inline-flex h-[30px] items-center justify-center justify-self-end rounded-[2px] border border-[#2ea428] bg-[#58dd51] px-3 text-xs font-bold uppercase tracking-[0.015rem] text-[#1d1d1d] transition hover:brightness-95 sm:col-span-1"
                      >
                        Voir l’offre
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {isDemoPricing && (
                <p className="mt-2 text-[10px] leading-4 text-neutral-400">
                  * {DEMO_PRICE_NOTICE}
                </p>
              )}
            </div>
          )}

          {result.description && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              <HighlightedText value={result.formatted.description ?? result.description} />
            </p>
          )}
          <ResultUrl url={result.url} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {result.relatedTest && (
              <a
                href={result.relatedTest.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-[30px] items-center rounded-[2px] border border-[#2ea428] bg-[#58dd51] px-4 text-xs font-bold uppercase tracking-[0.015rem] text-[#1d1d1d] transition hover:brightness-95"
              >
                Lire le test →
              </a>
            )}
            <a
              href={compareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex border-b-2 border-[#2ea428] pb-0.5 text-sm font-black text-neutral-950 transition hover:text-[#2a8d25]"
            >
              Comparer les prix →
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
