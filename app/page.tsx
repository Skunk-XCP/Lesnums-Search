"use client";

import { useState, type FormEvent } from "react";

import { SearchBar } from "@/src/components/SearchBar";
import { SearchFilters, type SearchFilter } from "@/src/components/SearchFilters";
import { SearchResults } from "@/src/components/SearchResults";
import type { SearchApiError, SearchApiResponse } from "@/src/types/search";

type EditorialItem = {
  title: string;
  url: string;
  image: string;
  type: string;
  category: string;
  time: string;
};

const CATEGORIES = [
  "Téléphonie",
  "TV",
  "Audio",
  "Maison",
  "Informatique",
  "Photo",
  "Gaming",
  "Auto & Moto",
];

const TRENDING = ["Samsung Galaxy", "Sony Bravia", "LG OLED", "Xiaomi", "Asus ProArt"];

const FEATURED: EditorialItem[] = [
  {
    title: "Samsung Galaxy S26 FE : un smartphone qui fait du “fan service” minimum",
    url: "https://www.lesnumeriques.com/telephone-portable/samsung-galaxy-s26-fe-p78728/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/26/262282/c50b3e75-samsung-galaxy-s26-fe-un-smartphone-qui-fait-du-fan-service-minimum__1200_678__0-80-4266-2319.jpg",
    type: "Test",
    category: "Smartphone",
    time: "Il y a 2 h",
  },
  {
    title: "Samsung 990 : le SSD interne “budget” dans une industrie en crise",
    url: "https://www.lesnumeriques.com/ssd/samsung-ssd-990-p78581/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/26/262234/14aca271-samsung-990-le-ssd-interne-budget-dans-une-industrie-en-crise__1200_678__101-561-5999-3657.jpg",
    type: "Test",
    category: "SSD interne",
    time: "Hier à 07:00",
  },
  {
    title: "LG 83G6 : la nouvelle référence Oled de 2026 peaufine encore sa recette",
    url: "https://www.lesnumeriques.com/tv-televiseur/lg-83g6-p78302/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/25/256208/d50cb567-lg-83g6-la-nouvelle-reference-oled-de-2026-peaufine-encore-sa-recette__1200_678__0-854-5993-4000_wtmk.jpg",
    type: "Test",
    category: "Téléviseur",
    time: "La sélection de la rédaction",
  },
];

const LATEST = [
  { time: "13:52", title: "Le grand retour du filaire : pourquoi le câble fait de la résistance face au Bluetooth", type: "Actualité" },
  { time: "12:35", title: "Quel téléviseur Oled choisir en 2026 ? Notre comparatif des meilleurs modèles", type: "Guide" },
  { time: "11:48", title: "Samsung Galaxy : les modèles qui offrent aujourd'hui le meilleur rapport qualité-prix", type: "Actualité" },
  { time: "10:22", title: "Sony renouvelle ses casques et écouteurs sans fil haut de gamme", type: "Actualité" },
  { time: "09:10", title: "PC portables : pourquoi les écrans Oled se généralisent enfin", type: "Dossier" },
];

const REVIEWS: EditorialItem[] = [
  {
    title: "Sony Bravia Theatre Trio : un système home-cinéma original, mais inabouti",
    url: "https://www.lesnumeriques.com/barre-de-son/sony-bravia-theatre-trio-p78335/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/25/259811/73703623-sony-bravia-theatre-trio__1200_678__347-373-2722-1619_wtmk.jpg",
    type: "Test",
    category: "Audio",
    time: "5 min de lecture",
  },
  {
    title: "Xiaomi Redmi Note 17 5G : il n'est sauvé que par son autonomie",
    url: "https://www.lesnumeriques.com/telephone-portable/xiaomi-redmi-note-17-5g-p78893/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/26/261977/07799627-xiaomi-redmi-note-17-5g-la-victime-collaterale-d-une-crise-qui-le-depasse__1200_678__0-229-3000-1804.jpg",
    type: "Test",
    category: "Smartphone",
    time: "8 min de lecture",
  },
  {
    title: "Asus ProArt PZ14 : une tablette PC qui fait de l'ombre à la Surface",
    url: "https://www.lesnumeriques.com/ordinateur-portable/asus-poart-pz14-ht7407-p78233/test.html",
    image: "https://cdn.lesnumeriques.com/optim/test/26/261826/13ed509b-asus-proart-pz14-une-tablette-pc-sous-windows-qui-fait-de-l-ombre-a-la-surface-de-microsoft__1200_678__0-0-3072-1612_wtmk.jpg",
    type: "Test",
    category: "Ordinateur",
    time: "7 min de lecture",
  },
];

function EditorialCard({ item, large = false }: { item: EditorialItem; large?: boolean }) {
  return (
    <article className={`group relative overflow-hidden bg-neutral-900 ${large ? "min-h-[420px] sm:min-h-[520px]" : "min-h-[250px]"}`}>
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.025]"
        style={{ backgroundImage: `url("${item.image}")` }}
        role="img"
        aria-label=""
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex flex-col justify-end p-5 text-white sm:p-7">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em]">
          <span className="bg-[#e30613] px-2 py-1">{item.type}</span>
          <span>{item.category}</span>
        </div>
        <h2 className={`font-black leading-[1.08] tracking-[-0.025em] ${large ? "max-w-2xl text-3xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>
          {item.title}
        </h2>
        <p className="mt-3 text-xs text-neutral-300">{item.time}</p>
      </a>
    </article>
  );
}

function EditorialHome({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <>
      <section className="grid gap-1 md:grid-cols-[2fr_1fr]">
        <EditorialCard item={FEATURED[0]} large />
        <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
          <EditorialCard item={FEATURED[1]} />
          <EditorialCard item={FEATURED[2]} />
        </div>
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="flex items-end justify-between border-b-4 border-black pb-3">
            <h2 className="text-3xl font-black tracking-[-0.04em]">En ce moment</h2>
            <span className="hidden text-xs font-bold uppercase tracking-[0.1em] text-neutral-500 sm:block">Toute l’actualité tech</span>
          </div>
          <div>
            {LATEST.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onSearch(item.title)}
                className="group grid w-full grid-cols-[50px_1fr] gap-3 border-b border-neutral-200 py-5 text-left sm:grid-cols-[65px_1fr_auto]"
              >
                <time className="font-mono text-xs font-bold text-[#e30613]">{item.time}</time>
                <span className="font-bold leading-6 transition group-hover:text-[#e30613]">{item.title}</span>
                <span className="hidden self-center text-[10px] font-black uppercase tracking-[0.1em] text-neutral-400 sm:block">{item.type}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="border-t-4 border-black bg-[#f1f1f1] p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#e30613]">Le moteur des Numériques</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-tight">Une recherche qui comprend ce que vous cherchez.</h2>
          <p className="mt-4 text-sm leading-6 text-neutral-600">
            Les marques réellement liées à un produit passent avant les simples mentions. Chaque résultat indique précisément où la correspondance a été trouvée.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {TRENDING.slice(0, 4).map((query) => (
              <button key={query} type="button" onClick={() => onSearch(query)} className="border border-neutral-300 bg-white px-3 py-2 text-xs font-bold transition hover:border-[#e30613] hover:text-[#e30613]">
                {query}
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between border-b-4 border-black pb-3">
          <h2 className="text-3xl font-black tracking-[-0.04em]">Les derniers tests</h2>
          <button type="button" onClick={() => onSearch("test")} className="text-xs font-black uppercase tracking-[0.1em] text-[#e30613]">Voir tous les tests →</button>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {REVIEWS.map((item) => (
            <div key={item.url}>
              <EditorialCard item={item} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all");
  const [response, setResponse] = useState<SearchApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function search(nextFilter: SearchFilter = activeFilter, requestedQuery = query) {
    const normalizedQuery = requestedQuery.trim();
    if (!normalizedQuery) return;

    setQuery(normalizedQuery);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    const searchParams = new URLSearchParams({ q: normalizedQuery });
    if (nextFilter !== "all") searchParams.set("type", nextFilter);

    try {
      const apiResponse = await fetch(`/api/search?${searchParams.toString()}`);
      const data: SearchApiResponse | SearchApiError = await apiResponse.json();
      if (!apiResponse.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "La recherche a échoué.");
      }
      setResponse(data);
    } catch (searchError: unknown) {
      setResponse(null);
      setError(searchError instanceof Error ? searchError.message : "Une erreur inattendue est survenue.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search();
  }

  function handleFilterChange(filter: SearchFilter) {
    setActiveFilter(filter);
    if (hasSearched && query.trim()) void search(filter);
  }

  function showHome() {
    setQuery("");
    setResponse(null);
    setError(null);
    setHasSearched(false);
    setActiveFilter("all");
  }

  return (
    <div className="min-h-screen bg-white text-[#191919]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="border-b border-neutral-100">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-6 lg:gap-9">
            <button type="button" onClick={showHome} className="shrink-0 text-left" aria-label="Retour à l'accueil">
              <span className="block text-[20px] font-black leading-none tracking-[-0.075em] sm:text-[27px]">LES NUMÉRIQUES</span>
              <span className="mt-1 block h-[3px] w-10 bg-[#e30613]" />
            </button>
            <div className="min-w-0 w-full flex-1">
              <SearchBar
                query={query}
                isLoading={isLoading}
                onQueryChange={setQuery}
                onSubmit={handleSubmit}
                onSelectSuggestion={(suggestionQuery) => void search(activeFilter, suggestionQuery)}
                onClear={showHome}
              />
            </div>
            <div className="hidden shrink-0 items-center gap-5 text-xs font-bold text-neutral-600 lg:flex">
              <span>Vidéo</span>
              <span>Forum</span>
              <span className="border-l border-neutral-300 pl-5">Connexion</span>
            </div>
          </div>
        </div>

        <div className="bg-[#202020] text-white">
          <nav aria-label="Catégories" className="mx-auto flex max-w-[1180px] gap-6 overflow-x-auto px-4 py-3 text-[11px] font-black uppercase tracking-[0.06em] [scrollbar-width:none] sm:px-6">
            <button type="button" onClick={() => search(activeFilter, "produits")} className="shrink-0 text-[#ff4b57]">Tous les produits</button>
            {CATEGORIES.map((category) => (
              <button key={category} type="button" onClick={() => search(activeFilter, category)} className="shrink-0 transition hover:text-[#ff4b57]">{category}</button>
            ))}
          </nav>
        </div>

        <div className="border-b border-neutral-200 bg-[#f6f6f6]">
          <div className="mx-auto flex max-w-[1180px] gap-3 overflow-x-auto px-4 py-2.5 text-xs [scrollbar-width:none] sm:px-6">
            <span className="shrink-0 font-black uppercase tracking-[0.08em] text-[#e30613]">En ce moment :</span>
            {TRENDING.map((item) => (
              <button key={item} type="button" onClick={() => search(activeFilter, item)} className="shrink-0 font-semibold text-neutral-600 hover:text-black hover:underline">{item}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
        {hasSearched ? (
          <section className="mx-auto max-w-[900px]">
            <button type="button" onClick={showHome} className="mb-5 text-xs font-bold text-neutral-500 hover:text-[#e30613]">← Retour à la une</button>
            <div className="flex flex-col gap-4 border-b-4 border-black pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#e30613]">Recherche enrichie</p>
                <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Résultats pour « {query} »</h1>
              </div>
              <SearchFilters activeFilter={activeFilter} onChange={handleFilterChange} />
            </div>
            <SearchResults response={response} error={error} hasSearched={hasSearched} isLoading={isLoading} />
          </section>
        ) : (
          <EditorialHome onSearch={(nextQuery) => void search(activeFilter, nextQuery)} />
        )}
      </main>

      <footer className="mt-14 bg-[#202020] text-neutral-400">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div><strong className="text-white">LES NUMÉRIQUES — SEARCH LAB</strong><span className="ml-3">Prototype portfolio indépendant</span></div>
          <span>195 contenus publics · Meilisearch</span>
        </div>
      </footer>
    </div>
  );
}
