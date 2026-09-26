import type { FormEvent } from "react";

type SearchBarProps = {
  query: string;
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SearchBar({ query, isLoading, onQueryChange, onSubmit }: SearchBarProps) {
  return (
    <form className="flex w-full border border-neutral-300 bg-[#f5f5f5] transition focus-within:border-neutral-500 focus-within:bg-white" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="search-query">
        Rechercher un produit, un test ou une actualité
      </label>
      <input
        id="search-query"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Rechercher un produit, un test, une marque, un logiciel..."
        autoComplete="off"
        className="h-11 min-w-0 flex-1 border-0 bg-transparent px-4 text-sm font-medium text-neutral-950 outline-none placeholder:font-normal placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        aria-label="Lancer la recherche"
        className="grid h-11 w-12 shrink-0 place-items-center bg-[#e30613] text-white transition hover:bg-[#c9000c] disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </form>
  );
}
