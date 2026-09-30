export const KNOWN_BRANDS = ["Samsung", "Sony", "LG", "Xiaomi", "Asus"] as const;

export type KnownBrand = (typeof KNOWN_BRANDS)[number];

const COMPARISON_TERMS = new Set(["vs", "versus", "contre"]);

export const QUERY_CATEGORY_HINTS = [
  { queryTerms: ["oled"], categoryTerms: ["téléviseur", "tv"] },
  {
    queryTerms: ["casque", "écouteurs"],
    categoryTerms: ["casque", "écouteur", "audio"],
  },
  {
    queryTerms: ["smartphone", "galaxy"],
    categoryTerms: ["smartphone", "téléphone"],
  },
  {
    queryTerms: ["laptop"],
    categoryTerms: ["ordinateur portable", "pc portable"],
  },
] as const;

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

export function createReferenceKey(value: string) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function containsWholeTerm(text: string, term: string) {
  const normalizedText = normalizeSearchText(text);
  const normalizedTerm = normalizeSearchText(term);
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escapedTerm}(?=$|[^a-z0-9])`, "i").test(
    normalizedText,
  );
}

export function canonicalizeKnownBrand(value: string): KnownBrand | undefined {
  const normalizedValue = normalizeSearchText(value);
  return KNOWN_BRANDS.find((brand) => normalizeSearchText(brand) === normalizedValue);
}

export function findKnownBrands(text: string) {
  return KNOWN_BRANDS.filter((brand) => containsWholeTerm(text, brand));
}

export function getBoostedBrand(query: string): KnownBrand | undefined {
  const queryTerms = normalizeSearchText(query).split(/\s+/);
  if (queryTerms.some((term) => COMPARISON_TERMS.has(term))) return undefined;

  const brands = findKnownBrands(query);
  return brands.length === 1 ? brands[0] : undefined;
}

export function prepareSearchQuery(query: string) {
  const terms = query.split(/\s+/).filter(Boolean);
  const significantTerms = terms.filter(
    (term) => !COMPARISON_TERMS.has(normalizeSearchText(term)),
  );
  return significantTerms.length > 0 ? significantTerms.join(" ") : query;
}

const PRODUCT_REFERENCE_PATTERN = /\b[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;

function isProductReferenceToken(token: string) {
  if (token.length < 3 || token.length > 24) return false;
  if (!/[A-Z]/.test(token) || !/\d/.test(token)) return false;
  if (/^\d{4}$/.test(token)) return false;
  return true;
}

function canonicalizeProductReference(token: string, brand?: string) {
  if (canonicalizeKnownBrand(brand ?? "") === "Samsung") {
    const televisionReference = token.match(/^\d{2}(S\d{2}[A-Z])$/);
    if (televisionReference) return televisionReference[1];
  }

  return token;
}

function getProductReferenceCandidates(value: string) {
  const reliableTitlePrefix = value.split(":", 1)[0].replace(/\([^)]*\)/g, " ");
  const tokens =
    reliableTitlePrefix.toLocaleUpperCase("fr-FR").match(PRODUCT_REFERENCE_PATTERN) ?? [];
  return tokens.filter(isProductReferenceToken);
}

export function extractProductReference(value: string, brand?: string) {
  const candidates = getProductReferenceCandidates(value);
  if (candidates.length === 0) return undefined;

  const hyphenatedReference = candidates.find((candidate) => candidate.includes("-"));
  const selectedReference = hyphenatedReference ?? candidates[0];
  return canonicalizeProductReference(selectedReference, brand);
}

export function inferProductIdentity(
  title: string,
  brand?: string,
): { model?: string; productName?: string } {
  const model = extractProductReference(title, brand);
  if (!model) return {};

  const candidates = getProductReferenceCandidates(title);
  const rawReference =
    candidates.find((candidate) => candidate.includes("-")) ?? candidates[0] ?? model;

  return {
    model,
    ...(brand ? { productName: `${brand} ${rawReference}` } : {}),
  };
}
