import { loadEnvConfig } from "@next/env";
import { load } from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import robotsParser from "robots-parser";

import {
  KNOWN_BRANDS,
  canonicalizeKnownBrand,
  containsWholeTerm,
  findKnownBrands,
  inferProductIdentity,
  normalizeSearchText,
  type KnownBrand,
} from "../src/config/search";
import type { ContentType, SearchDocument } from "../src/types/search";

loadEnvConfig(process.cwd());

const SITE_ORIGIN = "https://www.lesnumeriques.com";
const ROBOTS_URL = `${SITE_ORIGIN}/robots.txt`;
const USER_AGENT =
  "lesnumeriques-search-portfolio/1.0 (limited metadata research crawler; max 250 pages)";
const OUTPUT_PATH = path.join(process.cwd(), "data", "lesnumeriques.json");
const TEMP_OUTPUT_PATH = `${OUTPUT_PATH}.tmp`;
const ABSOLUTE_PAGE_LIMIT = 250;
const DEFAULT_DELAY_MS = 1200;
const MINIMUM_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_METADATA_BYTES = 500_000;
const MAX_SITEMAP_BYTES = 10_000_000;

type Candidate = {
  url: string;
  sitemapType: ContentType;
  targetBrand?: KnownBrand;
  isControl?: boolean;
};

type JsonLdNode = Record<string, unknown>;

class CrawlStoppedError extends Error {}

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsedValue = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsedValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsedValue));
}

const pageLimit = readBoundedInteger(
  process.env.CRAWL_LIMIT,
  ABSOLUTE_PAGE_LIMIT,
  1,
  ABSOLUTE_PAGE_LIMIT,
);
const configuredDelayMs = readBoundedInteger(
  process.env.CRAWL_DELAY_MS,
  DEFAULT_DELAY_MS,
  MINIMUM_DELAY_MS,
  60_000,
);
const brandTarget = readBoundedInteger(process.env.CRAWL_BRAND_TARGET, 35, 30, 40);
const controlTarget = readBoundedInteger(process.env.CRAWL_CONTROL_TARGET, 25, 20, 40);

const CATEGORY_URL_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "Smartphones", pattern: /\/(?:telephone-portable|telephonie)\// },
  { label: "TV", pattern: /\/(?:tv-televiseur|televiseur|videoprojecteur)\// },
  {
    label: "Audio",
    pattern:
      /\/(?:casque|casque-audio|casque-nomade|casque-bluetooth|casque-gaming-micro|ecouteurs|ecouteurs-intra-auriculaires|barre-de-son|enceinte-portable)\//,
  },
  { label: "Moniteurs", pattern: /\/(?:moniteur-ecran-lcd|ecran-pc|ecran-lcd)\// },
  { label: "Ordinateurs", pattern: /\/(?:ordinateur-portable|pc-portable)\// },
  {
    label: "Photo",
    pattern: /\/(?:appareil-photo-numerique|objectif-photo|camera)\//,
  },
  {
    label: "Composants",
    pattern: /\/(?:carte-graphique|ssd|cpu-processeur|carte-mere|memoire-ram)\//,
  },
  {
    label: "Objets connectés",
    pattern: /\/(?:montre-connectee|bracelet-connecte|objet-connecte)\//,
  },
];

const CONTROL_BRAND_TERMS = [
  "Sennheiser",
  "Bose",
  "JBL",
  "Apple",
  "Philips",
  "Panasonic",
  "TCL",
  "Hisense",
  "Google",
  "Motorola",
  "Honor",
  "Oppo",
  "OnePlus",
  "Nothing",
  "Acer",
  "Dell",
  "Lenovo",
  "HP",
  "MSI",
  "Canon",
  "Nikon",
  "Fujifilm",
  "AMD",
  "Nvidia",
] as const;

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

function isSiteUrl(value: string) {
  try {
    return new URL(value).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return normalizedValue || undefined;
}

function asRecord(value: unknown): JsonLdNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonLdNode)
    : undefined;
}

function jsonLdTypes(node: JsonLdNode) {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  return Array.isArray(type) ? type.filter((item): item is string => typeof item === "string") : [];
}

function collectJsonLdNodes(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) return value.flatMap(collectJsonLdNodes);

  const node = asRecord(value);
  if (!node) return [];

  const graphNodes = collectJsonLdNodes(node["@graph"]);
  return [node, ...graphNodes];
}

function parseJsonLdScripts(html: string) {
  const $ = load(html);
  const nodes: JsonLdNode[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const scriptContent = $(element).text().trim();
    if (!scriptContent) return;

    try {
      nodes.push(...collectJsonLdNodes(JSON.parse(scriptContent) as unknown));
    } catch {
      // Une balise JSON-LD invalide ne doit pas empêcher l'extraction des autres métadonnées.
    }
  });

  return { $, nodes };
}

function findJsonLdNode(nodes: JsonLdNode[], acceptedTypes: string[]) {
  return nodes.find((node) => jsonLdTypes(node).some((type) => acceptedTypes.includes(type)));
}

function extractBrand(product: JsonLdNode | undefined) {
  const brand = product?.brand;
  const extractedBrand =
    typeof brand === "string"
      ? asNonEmptyString(brand)
      : asNonEmptyString(asRecord(brand)?.name);

  if (!extractedBrand) return undefined;
  return canonicalizeKnownBrand(extractedBrand) ?? extractedBrand;
}

function inferBrandFromTitle(
  title: string,
  url: string,
  targetBrand: KnownBrand | undefined,
) {
  if (!targetBrand || !containsWholeTerm(new URL(url).pathname, targetBrand)) {
    return undefined;
  }

  const titleBrands = findKnownBrands(title);
  const normalizedBrand = normalizeSearchText(targetBrand);
  const normalizedTitle = normalizeSearchText(title);
  const slugTokens = normalizeSearchText(new URL(url).pathname.split("/").at(-1) ?? "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const brandAppearsEarlyInTitle = normalizedTitle.indexOf(normalizedBrand) <= 50;
  const brandAppearsEarlyInSlug = slugTokens.slice(0, 6).includes(normalizedBrand);

  return titleBrands.length === 1 &&
    titleBrands[0] === targetBrand &&
    brandAppearsEarlyInTitle &&
    brandAppearsEarlyInSlug
    ? targetBrand
    : undefined;
}

function extractMentionSnippet(
  $: ReturnType<typeof load>,
  documentBrand: string | undefined,
) {
  const ownKnownBrand = documentBrand
    ? canonicalizeKnownBrand(documentBrand)
    : undefined;
  let snippet: string | undefined;

  $("p.ed__a-p").each((_, element) => {
    if (snippet) return;

    const paragraph = asNonEmptyString($(element).text());
    if (!paragraph) return;

    const mentionedBrands = findKnownBrands(paragraph).filter(
      (brand) => brand !== ownKnownBrand,
    );
    if (mentionedBrands.length === 0) return;

    const mentionPosition = normalizeSearchText(paragraph).indexOf(
      normalizeSearchText(mentionedBrands[0]),
    );
    const start = Math.max(0, mentionPosition - 220);
    const end = Math.min(paragraph.length, start + 520);
    snippet = `${start > 0 ? "…" : ""}${paragraph.slice(start, end).trim()}${
      end < paragraph.length ? "…" : ""
    }`;
  });

  return snippet;
}

function extractCategory(nodes: JsonLdNode[]) {
  const breadcrumbs = findJsonLdNode(nodes, ["BreadcrumbList"]);
  const items = breadcrumbs?.itemListElement;
  if (!Array.isArray(items)) return undefined;

  const names = items
    .map((item) => asNonEmptyString(asRecord(item)?.name))
    .filter((name): name is string => Boolean(name));

  return names.at(-1);
}

function normalizePublishedAt(value: unknown) {
  const date = asNonEmptyString(value);
  if (!date) return undefined;

  const parsedDate = new Date(date);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
}

function inferContentType(url: string, sitemapType: ContentType): ContentType {
  const pathname = new URL(url).pathname;

  if (pathname.endsWith("/test.html")) return "test";
  if (/-g\d+\.html$/.test(pathname)) return "guide";
  if (/-n\d+\.html$/.test(pathname)) return "news";
  if (/-p\d+\.html$/.test(pathname)) return "product";
  return sitemapType;
}

function createDocumentId(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 24);
}

function extractDocument(html: string, candidate: Candidate, responseUrl: string) {
  const { $, nodes } = parseJsonLdScripts(html);
  const article = findJsonLdNode(nodes, ["NewsArticle", "Article"]);
  const product = findJsonLdNode(nodes, ["Product"]);
  const webPage = findJsonLdNode(nodes, ["WebPage"]);
  const type = inferContentType(responseUrl, candidate.sitemapType);

  const canonicalCandidate =
    asNonEmptyString($("link[rel='canonical']").attr("href")) ??
    asNonEmptyString($("meta[property='og:url']").attr("content")) ??
    responseUrl;
  const canonicalUrl = new URL(canonicalCandidate, SITE_ORIGIN).href;
  if (!isSiteUrl(canonicalUrl)) return undefined;

  const openGraphTitle = asNonEmptyString($("meta[property='og:title']").attr("content"));
  const structuredTitle =
    type === "product"
      ? asNonEmptyString(product?.name)
      : asNonEmptyString(article?.headline);
  const title =
    structuredTitle ?? openGraphTitle ?? asNonEmptyString($("title").text());
  if (!title) return undefined;

  const structuredDescription =
    type === "product"
      ? asNonEmptyString(product?.description)
      : asNonEmptyString(article?.description);
  const description =
    structuredDescription ??
    asNonEmptyString($("meta[property='og:description']").attr("content")) ??
    asNonEmptyString($("meta[name='description']").attr("content"));
  const publishedAt = normalizePublishedAt(
    article?.datePublished ??
      webPage?.datePublished ??
      $("meta[property='article:published_time']").attr("content"),
  );
  const structuredBrand = extractBrand(product);
  const brand =
    structuredBrand ?? inferBrandFromTitle(title, canonicalUrl, candidate.targetBrand);
  const category = extractCategory(nodes);
  const content = candidate.isControl ? extractMentionSnippet($, brand) : undefined;
  const identity = inferProductIdentity(title, brand);

  return {
    id: createDocumentId(canonicalUrl),
    title,
    url: canonicalUrl,
    type,
    ...(brand ? { brand } : {}),
    ...(identity.model ? { model: identity.model } : {}),
    ...(identity.productName ? { productName: identity.productName } : {}),
    ...(category ? { category } : {}),
    ...(description ? { description } : {}),
    ...(content ? { content } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  } satisfies SearchDocument;
}

async function readMetadataHtml(response: Response, includeContent: boolean) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytesRead = 0;

  while (bytesRead < MAX_METADATA_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;
    html += decoder.decode(value, { stream: true });

    const breadcrumbPosition = html.indexOf("BreadcrumbList");
    const breadcrumbScriptEnd =
      breadcrumbPosition >= 0
        ? html.toLowerCase().indexOf("</script>", breadcrumbPosition)
        : -1;
    if (!includeContent && breadcrumbScriptEnd >= 0) {
      html = html.slice(0, breadcrumbScriptEnd + "</script>".length);
      await reader.cancel();
      break;
    }
  }

  if (bytesRead >= MAX_METADATA_BYTES) await reader.cancel();
  html += decoder.decode();
  return html;
}

class PoliteFetcher {
  private lastRequestStartedAt = 0;

  constructor(
    private readonly delayMs: number,
    private readonly isAllowed: (url: string) => boolean,
  ) {}

  private async waitForNextSlot() {
    const elapsedMs = Date.now() - this.lastRequestStartedAt;
    if (elapsedMs < this.delayMs) await sleep(this.delayMs - elapsedMs);
    this.lastRequestStartedAt = Date.now();
  }

  async fetch(url: string) {
    if (!isSiteUrl(url)) throw new Error(`URL externe refusée : ${url}`);
    if (!this.isAllowed(url)) throw new Error(`URL interdite par robots.txt : ${url}`);

    await this.waitForNextSlot();
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 403 || response.status === 429) {
      throw new CrawlStoppedError(
        `Le site a répondu ${response.status}. Arrêt immédiat, sans nouvelle tentative.`,
      );
    }
    if (!response.ok) throw new Error(`Réponse HTTP ${response.status}`);
    if (!isSiteUrl(response.url) || !this.isAllowed(response.url)) {
      throw new Error(`Redirection refusée : ${response.url}`);
    }

    return response;
  }

  async fetchXml(url: string) {
    const response = await this.fetch(url);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("xml")) {
      throw new Error(`Type de contenu inattendu pour le sitemap : ${contentType}`);
    }

    const xml = await response.text();
    if (Buffer.byteLength(xml) > MAX_SITEMAP_BYTES) {
      throw new Error("Sitemap trop volumineux, lecture abandonnée.");
    }
    return xml;
  }
}

function extractLocations(xml: string) {
  const $ = load(xml, { xmlMode: true });
  return $("loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(isSiteUrl);
}

function classifySitemap(url: string, currentYear: number): ContentType | undefined {
  const yearPattern = `(?:${currentYear}|${currentYear - 1}|${currentYear - 2})`;
  if (new RegExp(`/sitemaps-test-${yearPattern}\\.xml$`).test(url)) return "test";
  if (new RegExp(`/sitemaps-news-${yearPattern}\\.xml$`).test(url)) return "news";
  if (new RegExp(`/sitemaps-products-${yearPattern}\\.xml$`).test(url)) return "product";
  if (new RegExp(`/sitemaps-guide(?:-auto)?-${yearPattern}\\.xml$`).test(url)) {
    return "guide";
  }
  return undefined;
}

function getUrlCategory(url: string) {
  const pathname = new URL(url).pathname;
  return CATEGORY_URL_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.label;
}

function takeDiversifiedCandidates(candidates: Candidate[], limit: number) {
  const groups = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const category = getUrlCategory(candidate.url) ?? "Autres";
    const key = `${category}:${candidate.sitemapType}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const selected: Candidate[] = [];
  let itemIndex = 0;

  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const candidate = group[itemIndex];
      if (candidate) {
        selected.push(candidate);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
    itemIndex += 1;
  }

  return selected;
}

function selectTargetedCandidates(
  urlsByType: Map<ContentType, string[]>,
  limit: number,
) {
  const allCandidates = [...urlsByType.entries()].flatMap(([sitemapType, urls]) =>
    [...new Set(urls)].map((url) => ({ url, sitemapType })),
  );
  const candidates: Candidate[] = [];
  const perBrandCandidateLimit = Math.min(40, brandTarget + 5);

  for (const brand of KNOWN_BRANDS) {
    const brandCandidates = allCandidates
      .filter((candidate) => getUrlCategory(candidate.url))
      .filter((candidate) => containsWholeTerm(new URL(candidate.url).pathname, brand))
      .map((candidate) => ({ ...candidate, targetBrand: brand }));

    candidates.push(
      ...takeDiversifiedCandidates(brandCandidates, perBrandCandidateLimit),
    );
  }

  const selectedUrls = new Set(candidates.map((candidate) => candidate.url));
  const controlCandidateLimit = Math.max(0, limit - candidates.length);
  const allControlCandidates = allCandidates
    .filter((candidate) => candidate.sitemapType === "test")
    .filter((candidate) => getUrlCategory(candidate.url))
    .filter((candidate) => !selectedUrls.has(candidate.url))
    .filter(
      (candidate) =>
        !KNOWN_BRANDS.some((brand) =>
          containsWholeTerm(new URL(candidate.url).pathname, brand),
        ),
    )
    .map((candidate) => ({ ...candidate, isControl: true }));
  const priorityControlCandidates = allControlCandidates.filter((candidate) =>
    CONTROL_BRAND_TERMS.some((brand) =>
      containsWholeTerm(new URL(candidate.url).pathname, brand),
    ),
  );
  const priorityControlUrls = new Set(
    priorityControlCandidates.map((candidate) => candidate.url),
  );
  const controlCandidates = [
    ...priorityControlCandidates,
    ...allControlCandidates.filter(
      (candidate) => !priorityControlUrls.has(candidate.url),
    ),
  ];

  candidates.push(
    ...takeDiversifiedCandidates(controlCandidates, controlCandidateLimit),
  );

  return [
    ...new Map(candidates.map((candidate) => [candidate.url, candidate])).values(),
  ].slice(0, limit);
}

function isControlDocument(document: SearchDocument) {
  if (!document.brand || canonicalizeKnownBrand(document.brand)) return false;

  const searchableText = `${document.title} ${document.description ?? ""} ${document.content ?? ""}`;
  return findKnownBrands(searchableText).length > 0;
}

function getCategoryGroup(category: string | undefined) {
  const normalizedCategory = normalizeSearchText(category ?? "");
  if (/smartphone|telephone/.test(normalizedCategory)) return "Smartphones";
  if (/televiseur|videoprojecteur|\btv\b/.test(normalizedCategory)) return "TV";
  if (/casque|ecouteur|audio|enceinte|barre de son/.test(normalizedCategory)) return "Audio";
  if (/moniteur|ecran pc/.test(normalizedCategory)) return "Moniteurs";
  if (/ordinateur|pc portable/.test(normalizedCategory)) return "Ordinateurs";
  if (/photo|objectif|camera/.test(normalizedCategory)) return "Photo";
  if (/ssd|carte graphique|processeur|cpu|carte mere|memoire/.test(normalizedCategory)) {
    return "Composants";
  }
  if (/montre|bracelet|objet connecte/.test(normalizedCategory)) return "Objets connectés";
  return "Autres";
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function printDatasetSummary(documents: SearchDocument[]) {
  const brandCounts = new Map<string, number>();
  let otherBrands = 0;

  for (const document of documents) {
    const knownBrand = document.brand
      ? canonicalizeKnownBrand(document.brand)
      : undefined;
    if (knownBrand) {
      brandCounts.set(knownBrand, (brandCounts.get(knownBrand) ?? 0) + 1);
    } else {
      otherBrands += 1;
    }
  }

  const categoryCounts = countBy(documents.map((document) => getCategoryGroup(document.category)));
  const typeCounts = countBy(documents.map((document) => document.type));
  const typeLabels: Record<ContentType, string> = {
    test: "Tests",
    news: "Actualités",
    guide: "Guides",
    product: "Produits",
  };

  console.log("\nRésumé du corpus");
  console.log(`Nombre total : ${documents.length}`);
  console.log("Par marque :");
  for (const brand of KNOWN_BRANDS) {
    console.log(`  ${brand} : ${brandCounts.get(brand) ?? 0}`);
  }
  console.log(`  Autres : ${otherBrands}`);
  console.log("Par catégorie :");
  for (const [category, count] of categoryCounts) {
    console.log(`  ${category} : ${count}`);
  }
  console.log("Par type :");
  for (const type of ["test", "news", "guide", "product"] as const) {
    console.log(`  ${typeLabels[type]} : ${typeCounts.get(type) ?? 0}`);
  }
  console.log(
    `Documents de contrôle : ${documents.filter(isControlDocument).length}`,
  );
}

async function fetchRobots() {
  const response = await fetch(ROBOTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`robots.txt inaccessible (HTTP ${response.status}). Crawl annulé.`);
  }

  return response.text();
}

async function writeDocuments(documents: SearchDocument[]) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(TEMP_OUTPUT_PATH, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
  await rename(TEMP_OUTPUT_PATH, OUTPUT_PATH);
}

async function main() {
  console.log("Lecture de robots.txt…");
  const robotsText = await fetchRobots();
  const robots = robotsParser(ROBOTS_URL, robotsText);
  const sitemapIndexUrl = robots
    .getSitemaps()
    .find((url) => url.endsWith("/sitemaps/sitemaps-index.xml"));

  if (!sitemapIndexUrl) {
    throw new Error("L'index sitemap attendu n'est pas déclaré dans robots.txt. Crawl annulé.");
  }

  const robotsDelayMs = (robots.getCrawlDelay(USER_AGENT) ?? 0) * 1000;
  const delayMs = Math.max(configuredDelayMs, robotsDelayMs, MINIMUM_DELAY_MS);
  const politeFetcher = new PoliteFetcher(
    delayMs,
    (url) => robots.isAllowed(url, USER_AGENT) !== false,
  );

  console.log(`Délai entre requêtes : ${delayMs} ms. Limite : ${pageLimit} pages.`);
  const sitemapIndex = await politeFetcher.fetchXml(sitemapIndexUrl);
  const currentYear = new Date().getUTCFullYear();
  const selectedSitemaps = extractLocations(sitemapIndex)
    .map((url) => ({ url, type: classifySitemap(url, currentYear) }))
    .filter((entry): entry is { url: string; type: ContentType } => Boolean(entry.type));

  const urlsByType = new Map<ContentType, string[]>([
    ["test", []],
    ["news", []],
    ["guide", []],
    ["product", []],
  ]);

  for (const sitemap of selectedSitemaps) {
    console.log(`Lecture du sitemap ${sitemap.type} : ${sitemap.url}`);
    const sitemapXml = await politeFetcher.fetchXml(sitemap.url);
    urlsByType.get(sitemap.type)?.push(...extractLocations(sitemapXml).reverse());
  }

  const candidates = selectTargetedCandidates(urlsByType, pageLimit);
  if (candidates.length === 0) throw new Error("Aucune URL éligible trouvée dans les sitemaps.");

  console.log(`${candidates.length} pages sélectionnées. Extraction des métadonnées…`);
  const documentsByUrl = new Map<string, SearchDocument>();
  const retainedBrandCounts = new Map<KnownBrand, number>();
  let retainedControlCount = 0;

  for (const [index, candidate] of candidates.entries()) {
    try {
      const response = await politeFetcher.fetch(candidate.url);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        throw new Error(`Type de contenu ignoré : ${contentType}`);
      }

      const metadataHtml = await readMetadataHtml(response, candidate.isControl === true);
      const document = extractDocument(metadataHtml, candidate, response.url);
      if (!document) throw new Error("Métadonnées essentielles absentes");
      if (robots.isAllowed(document.url, USER_AGENT) === false) {
        throw new Error("URL canonique interdite par robots.txt");
      }

      const documentKnownBrand = document.brand
        ? canonicalizeKnownBrand(document.brand)
        : undefined;
      const targetBrand = candidate.targetBrand;
      const canRetainTarget =
        targetBrand !== undefined &&
        documentKnownBrand === targetBrand &&
        (retainedBrandCounts.get(targetBrand) ?? 0) < brandTarget;
      const canRetainControl =
        isControlDocument(document) && retainedControlCount < controlTarget;

      if (canRetainTarget && targetBrand) {
        documentsByUrl.set(document.url, document);
        retainedBrandCounts.set(
          targetBrand,
          (retainedBrandCounts.get(targetBrand) ?? 0) + 1,
        );
      } else if (canRetainControl && !documentsByUrl.has(document.url)) {
        documentsByUrl.set(document.url, document);
        retainedControlCount += 1;
      }
    } catch (error: unknown) {
      if (error instanceof CrawlStoppedError) {
        console.warn(error.message);
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Page ignorée (${candidate.url}) : ${message}`);
    }

    if ((index + 1) % 10 === 0 || index + 1 === candidates.length) {
      console.log(
        `Progression : ${index + 1}/${candidates.length} pages, ${documentsByUrl.size} documents valides.`,
      );
    }

    const brandTargetsReached = KNOWN_BRANDS.every(
      (brand) => (retainedBrandCounts.get(brand) ?? 0) >= brandTarget,
    );
    if (brandTargetsReached && retainedControlCount >= controlTarget) {
      console.log("Tous les quotas sont atteints, arrêt anticipé du crawl.");
      break;
    }
  }

  const documents = [...documentsByUrl.values()];
  await writeDocuments(documents);
  console.log(`${documents.length} documents publics enregistrés dans ${OUTPUT_PATH}.`);
  printDatasetSummary(documents);

  for (const brand of KNOWN_BRANDS) {
    const count = retainedBrandCounts.get(brand) ?? 0;
    if (count < 30) {
      console.warn(`Corpus incomplet pour ${brand} : seulement ${count} documents.`);
    }
  }
  if (retainedControlCount < 20) {
    console.warn(
      `Corpus de contrôle incomplet : seulement ${retainedControlCount} documents.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur du crawler : ${message}`);
  process.exitCode = 1;
});
