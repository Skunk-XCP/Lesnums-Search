import type { ContentType } from "@/src/types/search";

export type SearchFilter = ContentType | "all";

const FILTERS: ReadonlyArray<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "test", label: "Tests" },
  { value: "news", label: "Actualités" },
  { value: "guide", label: "Guides" },
  { value: "product", label: "Produits" },
];

type SearchFiltersProps = {
  activeFilter: SearchFilter;
  onChange: (filter: SearchFilter) => void;
};

export function SearchFilters({ activeFilter, onChange }: SearchFiltersProps) {
  return (
    <div aria-label="Filtrer par type de contenu" className="flex flex-wrap gap-x-2 gap-y-2">
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter.value;

        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(filter.value)}
            className={`border px-4 py-2.5 text-xs font-black uppercase tracking-[0.06em] transition ${
              isActive
                ? "border-[#171717] bg-[#171717] text-white"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-[#e21b2d] hover:text-[#d7192d]"
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
