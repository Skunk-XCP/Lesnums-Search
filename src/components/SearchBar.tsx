"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  SearchSuggestion,
  SuggestionsApiResponse,
} from "@/src/types/search";

type SearchBarProps = {
  query: string;
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (query: string) => void;
  onClear: () => void;
};

const DEBOUNCE_MS = 180;
const SUGGESTIONS_ID = "search-suggestions";

export function SearchBar({
  query,
  isLoading,
  onQueryChange,
  onSubmit,
  onSelectSuggestion,
  onClear,
}: SearchBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || isDismissed) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Suggestions indisponibles");

        const data = (await response.json()) as SuggestionsApiResponse;
        setSuggestions(data.suggestions);
        setActiveIndex(-1);
        setIsOpen(
          data.suggestions.length > 0 && document.activeElement === inputRef.current,
        );
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setIsOpen(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isDismissed, query]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function selectSuggestion(suggestion: SearchSuggestion) {
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsDismissed(true);
    onSelectSuggestion(suggestion.query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      setIsDismissed(true);
      return;
    }

    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  function clearSearch() {
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsDismissed(true);
    onClear();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        className="flex w-full border border-neutral-300 bg-[#f5f5f5] transition focus-within:border-neutral-500 focus-within:bg-white"
        onSubmit={(event) => {
          setIsOpen(false);
          setIsDismissed(true);
          onSubmit(event);
        }}
      >
        <label className="sr-only" htmlFor="search-query">
          Rechercher un produit, un test ou une actualité
        </label>
        <input
          ref={inputRef}
          id="search-query"
          type="search"
          role="combobox"
          value={query}
          onChange={(event) => {
            if (!event.target.value.trim()) {
              setSuggestions([]);
              setIsOpen(false);
              setActiveIndex(-1);
            }
            setIsDismissed(false);
            onQueryChange(event.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0 && !isDismissed) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={SUGGESTIONS_ID}
          aria-activedescendant={
            activeIndex >= 0 ? `${SUGGESTIONS_ID}-${activeIndex}` : undefined
          }
          placeholder="Rechercher un produit, un test, une marque, un logiciel..."
          autoComplete="off"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-4 text-sm font-medium text-neutral-950 outline-none placeholder:font-normal placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Effacer la recherche"
            className="grid h-11 w-10 shrink-0 place-items-center text-neutral-500 transition hover:text-neutral-950"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
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

      {isOpen && query.trim() && suggestions.length > 0 && (
        <ul
          id={SUGGESTIONS_ID}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 border border-t-0 border-neutral-300 bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${SUGGESTIONS_ID}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between gap-4 border-t border-neutral-100 px-4 py-3 text-left first:border-t-0 ${
                  activeIndex === index ? "bg-neutral-100" : "bg-white hover:bg-neutral-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-neutral-950">
                    {suggestion.name}
                  </span>
                  {suggestion.kind === "product" && (
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      {[suggestion.brand, suggestion.category].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.08em] text-neutral-400">
                  {suggestion.kind === "brand" ? "Marque" : suggestion.type === "product" ? "Produit" : "Référence"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
