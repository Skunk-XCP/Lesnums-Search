import { loadEnvConfig } from "@next/env";
import { load } from "cheerio";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import robotsParser from "robots-parser";

import {
  KNOWN_BRANDS,
  containsWholeTerm,
  createReferenceKey,
  extractProductReference,
  normalizeSearchText,
  type KnownBrand,
} from "../src/config/search";
import type { ContentType, SearchDocument } from "../src/types/search";
import {
  extractDocument,
  readMetadataHtml,
  type Candidate,
} from "./crawl-lesnumeriques";

loadEnvConfig(process.cwd());

const SITE_ORIGIN = "https://www.lesnumeriques.com";
const ROBOTS_URL = `${SITE_ORIGIN}/robots.txt`;
const DATA_PATH = path.join(process.cwd(), "data", "lesnumeriques.json");
const TEMP_DATA_PATH = `${DATA_PATH}.reference.tmp`;
const USER_AGENT =
  "lesnumeriques-search-portfolio/1.0 (targeted reference metadata crawler)";
const REQUEST_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 20_000;
const SEARCH_PAGE_LIMIT = 2;
const CANDIDATE_LIMIT_PER_REFERENCE = 60;

const DEFAULT_REFERENCES = [
  "Sony WH-1000XM6",
  "Samsung Galaxy S25 Ultra",
  "LG 83G6",
  "Sony WH-1000XM5",
  "Sony WF-1000XM5",
  "Samsung Galaxy S24 Ultra",
] as const;

type TargetReference = {
  query: string;
  brand: KnownBrand;
  model?: string;
  signature: string;
  key: string;
};

type DiscoveredCandidate = Candidate & {
  source: "internal-search" | "sitemap" | "related-link";
};

type ReferenceReport = Record<ContentType, number> & {
  reference: string;
  other: number;
  total: number;
};

class PoliteFetcher {
  private lastRequestAt = 0;

  constructor(private readonly isAllowed: (url: string) => boolean) {}

  async fetch(url: string) {
    if (new URL(url).origin !== SITE_ORIGIN) {
      throw new Error(`URL externe refusée : ${url}`);
    }
    if (!this.isAllowed(url)) throw new Error(`URL interdite par robots.txt : ${url}`);

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, REQUEST_DELAY_MS - elapsed),
      );
    }
    this.lastRequestAt = Date.now();

    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 403 || response.status === 429) {
      throw new Error(`Arrêt immédiat demandé par le site (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(`Réponse HTTP ${response.status} pour ${url}`);
    if (new URL(response.url).origin !== SITE_ORIGIN) {
      throw new Error(`Redirection externe refusée : ${response.url}`);
    }
    return response;
  }
}

function parseTargets(args: string[]) {
  const references = args.includes("--defaults")
    ? [...DEFAULT_REFERENCES]
    : [args.filter((argument) => !argument.startsWith("--")).join(" ").trim()];

  return references.filter(Boolean).map((query): TargetReference => {
    const brand = KNOWN_BRANDS.find((candidate) => containsWholeTerm(query, candidate));
    if (!brand) {
      throw new Error(
        `Marque non prise en charge dans « ${query} ». Marques : ${KNOWN_BRANDS.join(", ")}.`,
      );
    }

    const terms = normalizeSearchText(query).match(/[a-z0-9]+/g) ?? [];
    if (terms.length < 2) {
      throw new Error(`La référence « ${query} » est trop courte.`);
    }

    const brandTerms = new Set(
      normalizeSearchText(brand).match(/[a-z0-9]+/g) ?? [],
    );
    const signatureTerms = terms.filter((term) => !brandTerms.has(term));
    if (signatureTerms.length === 0) {
      throw new Error(`La rÃ©fÃ©rence Â« ${query} Â» ne contient aucun modÃ¨le.`);
    }

    return {
      query,
      brand,
      model: extractProductReference(query, brand),
      signature: signatureTerms.join(" "),
      key: createReferenceKey(query),
    };
  });
}

function textContainsReference(value: string, target: TargetReference) {
  const normalizedValue = normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${normalizedValue} `.includes(` ${target.signature} `);
}

function inferType(url: string): ContentType {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/test.html")) return "test";
  if (/-g\d+\.html$/.test(pathname)) return "guide";
  if (/-n\d+\.html$/.test(pathname)) return "news";
  return "product";
}

function isContentUrl(url: string) {
  try {
    const parsedUrl = new URL(url, SITE_ORIGIN);
    return (
      parsedUrl.origin === SITE_ORIGIN &&
      (/-[png]\d+\.html$/.test(parsedUrl.pathname) ||
        parsedUrl.pathname.endsWith("/test.html"))
    );
  } catch {
    return false;
  }
}

function canonicalUrl(value: string) {
  const url = new URL(value, SITE_ORIGIN);
  url.hash = "";
  return url.href;
}

function extractLocations(xml: string) {
  const $ = load(xml, { xmlMode: true });
  return $("loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter((url) => url.startsWith(SITE_ORIGIN));
}

function classifySitemap(url: string): ContentType | undefined {
  if (/sitemaps-products-\d{4}\.xml$/.test(url)) return "product";
  if (/sitemaps-test-\d{4}\.xml$/.test(url)) return "test";
  if (/sitemaps-news-\d{4}\.xml$/.test(url)) return "news";
  if (/sitemaps-guide(?:-auto)?-\d{4}\.xml$/.test(url)) return "guide";
  return undefined;
}

async function discoverFromInternalSearch(
  target: TargetReference,
  fetcher: PoliteFetcher,
) {
  const discovered: DiscoveredCandidate[] = [];

  for (let page = 1; page <= SEARCH_PAGE_LIMIT; page += 1) {
    const searchUrl = new URL("/recherche", SITE_ORIGIN);
    searchUrl.searchParams.set("q", target.query);
    if (page > 1) searchUrl.searchParams.set("page", String(page));

    const response = await fetcher.fetch(searchUrl.href);
    const $ = load(await response.text());
    const resultArticles = $("[data-pagination-ajax-list-ul] article");

    resultArticles.each((index, article) => {
      const link = $(article).find("a[href]").first();
      const href = link.attr("href");
      if (!href) return;

      const url = canonicalUrl(href);
      if (!isContentUrl(url)) return;
      const resultText = $(article).text().replace(/\s+/g, " ").trim();
      const type = inferType(url);
      const isStrictCandidate =
        textContainsReference(resultText, target) ||
        textContainsReference(decodeURIComponent(new URL(url).pathname), target);
      const isTopGuideCandidate = type === "guide" && index < 12;

      if (isStrictCandidate || isTopGuideCandidate) {
        discovered.push({
          url,
          sitemapType: type,
          targetBrand: target.brand,
          source: "internal-search",
        });
      }
    });
  }

  return discovered;
}

async function discoverFromSitemaps(
  targets: TargetReference[],
  fetcher: PoliteFetcher,
  sitemapIndexUrl: string,
) {
  const indexResponse = await fetcher.fetch(sitemapIndexUrl);
  const sitemapIndex = await indexResponse.text();
  const minimumYear = new Date().getUTCFullYear() - 4;
  const sitemapEntries = extractLocations(sitemapIndex)
    .map((url) => ({
      url,
      type: classifySitemap(url),
      year: Number(url.match(/-(\d{4})\.xml$/)?.[1]),
    }))
    .filter(
      (entry): entry is { url: string; type: ContentType; year: number } =>
        Boolean(entry.type) && entry.year >= minimumYear,
    );
  const candidates = new Map<string, DiscoveredCandidate[]>();
  for (const target of targets) candidates.set(target.query, []);

  for (const sitemap of sitemapEntries) {
    const response = await fetcher.fetch(sitemap.url);
    const locations = extractLocations(await response.text());

    for (const target of targets) {
      for (const url of locations) {
        if (!textContainsReference(decodeURIComponent(new URL(url).pathname), target)) {
          continue;
        }
        candidates.get(target.query)?.push({
          url,
          sitemapType: sitemap.type,
          targetBrand: target.brand,
          source: "sitemap",
        });
      }
    }
  }

  return candidates;
}

function extractReferenceSnippet(html: string, target: TargetReference) {
  const $ = load(html);
  let snippet: string | undefined;

  $("p.ed__a-p, article p, main p").each((_, paragraph) => {
    if (snippet) return;
    const text = $(paragraph).text().replace(/\s+/g, " ").trim();
    if (!text || !textContainsReference(text, target)) return;
    snippet = text.length > 650 ? `${text.slice(0, 647).trim()}…` : text;
  });

  return snippet;
}

function isStrictMatch(
  document: SearchDocument,
  target: TargetReference,
  snippet: string | undefined,
) {
  return (
    textContainsReference(document.title, target) ||
    textContainsReference(document.productName ?? "", target) ||
    textContainsReference(decodeURIComponent(new URL(document.url).pathname), target) ||
    snippet !== undefined
  );
}

function hasPrimaryReferenceMatch(
  document: SearchDocument,
  target: TargetReference,
) {
  return (
    textContainsReference(document.title, target) ||
    textContainsReference(decodeURIComponent(new URL(document.url).pathname), target)
  );
}

function enrichDocument(
  document: SearchDocument,
  target: TargetReference,
  snippet: string | undefined,
) {
  const relatedModels = new Set(document.relatedModels ?? []);
  const referenceKeys = new Set(document.referenceKeys ?? []);
  referenceKeys.add(target.key);
  const isPrimaryMatch = hasPrimaryReferenceMatch(document, target);
  if (
    target.model &&
    (!isPrimaryMatch || (document.model && document.model !== target.model))
  ) {
    relatedModels.add(target.model);
  }

  return {
    ...document,
    ...(isPrimaryMatch && !document.brand ? { brand: target.brand } : {}),
    ...(isPrimaryMatch && !document.model && target.model
      ? { model: target.model }
      : {}),
    ...(relatedModels.size > 0
      ? { relatedModels: [...relatedModels].sort() }
      : {}),
    referenceKeys: [...referenceKeys].sort(),
    ...(isPrimaryMatch && !document.productName && target.model
      ? { productName: `${target.brand} ${target.model}` }
      : {}),
    ...(!document.content && snippet ? { content: snippet } : {}),
  } satisfies SearchDocument;
}

function sanitizePreviousTargetedAssociations(
  documents: SearchDocument[],
  targets: TargetReference[],
) {
  return documents.map((sourceDocument) => {
    const document = { ...sourceDocument };
    const relatedModels = new Set(document.relatedModels ?? []);
    const referenceKeys = new Set(document.referenceKeys ?? []);

    for (const target of targets) {
      const isPrimary = hasPrimaryReferenceMatch(document, target);
      const isStrictlyLinked =
        isPrimary ||
        textContainsReference(document.productName ?? "", target) ||
        textContainsReference(document.content ?? "", target);
      if (isStrictlyLinked) referenceKeys.add(target.key);
      else referenceKeys.delete(target.key);

      if (!target.model || isPrimary || !isStrictlyLinked) continue;
      if (
        document.model &&
        normalizeSearchText(document.model) === normalizeSearchText(target.model)
      ) {
        relatedModels.add(target.model);
        delete document.model;
      }
      if (
        document.productName &&
        normalizeSearchText(document.productName) ===
          normalizeSearchText(`${target.brand} ${target.model}`)
      ) {
        delete document.productName;
      }
      if (
        document.brand === target.brand &&
        !containsWholeTerm(document.title, target.brand)
      ) {
        delete document.brand;
      }
    }

    if (relatedModels.size > 0) {
      document.relatedModels = [...relatedModels].sort();
    }
    if (referenceKeys.size > 0) document.referenceKeys = [...referenceKeys].sort();
    else delete document.referenceKeys;
    return document;
  });
}

function mergeDocuments(existing: SearchDocument, incoming: SearchDocument) {
  const relatedModels = new Set([
    ...(existing.relatedModels ?? []),
    ...(incoming.relatedModels ?? []),
  ]);
  const referenceKeys = new Set([
    ...(existing.referenceKeys ?? []),
    ...(incoming.referenceKeys ?? []),
  ]);
  const chooseLonger = (first?: string, second?: string) =>
    (second?.length ?? 0) > (first?.length ?? 0) ? second : first;

  return {
    ...existing,
    ...incoming,
    title: chooseLonger(existing.title, incoming.title) ?? incoming.title,
    description: chooseLonger(existing.description, incoming.description),
    content: chooseLonger(existing.content, incoming.content),
    ...(relatedModels.size > 0
      ? { relatedModels: [...relatedModels].sort() }
      : {}),
    ...(referenceKeys.size > 0
      ? { referenceKeys: [...referenceKeys].sort() }
      : {}),
  } satisfies SearchDocument;
}

function discoverRelatedLinks(
  html: string,
  target: TargetReference,
): DiscoveredCandidate[] {
  const $ = load(html);
  const discovered: DiscoveredCandidate[] = [];

  $("main a[href], article a[href]").each((_, link) => {
    const href = $(link).attr("href");
    if (!href) return;
    const url = canonicalUrl(href);
    if (!isContentUrl(url)) return;
    const linkText = $(link).text().replace(/\s+/g, " ").trim();
    const type = inferType(url);
    if (
      type !== "guide" &&
      !textContainsReference(linkText, target) &&
      !textContainsReference(decodeURIComponent(new URL(url).pathname), target)
    ) {
      return;
    }

    discovered.push({
      url,
      sitemapType: type,
      targetBrand: target.brand,
      source: "related-link",
    });
  });

  return discovered;
}

function isDocumentLinked(document: SearchDocument, target: TargetReference) {
  return Boolean(
    document.referenceKeys?.includes(target.key) ||
      textContainsReference(document.title, target) ||
      textContainsReference(document.productName ?? "", target) ||
      textContainsReference(document.content ?? "", target),
  );
}

function createReport(documents: SearchDocument[], target: TargetReference) {
  const linked = documents.filter((document) => isDocumentLinked(document, target));
  const report: ReferenceReport = {
    reference: target.query,
    product: 0,
    test: 0,
    news: 0,
    guide: 0,
    other: 0,
    total: linked.length,
  };
  for (const document of linked) {
    const isPrimary = hasPrimaryReferenceMatch(document, target);
    if ((document.type === "product" || document.type === "test") && !isPrimary) {
      report.other += 1;
    } else {
      report[document.type] += 1;
    }
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const targets = parseTargets(args);
  if (targets.length === 0) {
    throw new Error(
      'Utilisation : npm run crawl:reference -- "Sony WH-1000XM6" ou npm run crawl:references',
    );
  }

  if (args.includes("--sanitize-only")) {
    const parsedData = JSON.parse(
      await readFile(DATA_PATH, "utf8"),
    ) as SearchDocument[];
    const documents = sanitizePreviousTargetedAssociations(parsedData, targets);
    await writeFile(TEMP_DATA_PATH, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
    await rename(TEMP_DATA_PATH, DATA_PATH);
    console.log("Associations ciblées normalisées sans nouveau téléchargement.");
    console.table(
      targets.map((target) => {
        const report = createReport(documents, target);
        return {
          référence: report.reference,
          product: report.product,
          tests: report.test,
          news: report.news,
          guides: report.guide,
          autres: report.other,
          total: report.total,
        };
      }),
    );
    return;
  }

  const robotsResponse = await fetch(ROBOTS_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!robotsResponse.ok) throw new Error(`robots.txt HTTP ${robotsResponse.status}`);
  const robotsText = await robotsResponse.text();
  const robots = robotsParser(ROBOTS_URL, robotsText);
  const sitemapIndexUrl = robots
    .getSitemaps()
    .find((url) => url.endsWith("/sitemaps/sitemaps-index.xml"));
  if (!sitemapIndexUrl) throw new Error("Index sitemap introuvable dans robots.txt.");

  const fetcher = new PoliteFetcher(
    (url) => robots.isAllowed(url, USER_AGENT) !== false,
  );
  const parsedData = JSON.parse(await readFile(DATA_PATH, "utf8")) as SearchDocument[];
  const existingData = sanitizePreviousTargetedAssociations(parsedData, targets);
  const documentsByUrl = new Map(
    existingData.map((document) => [document.url, document]),
  );
  const sitemapCandidates = await discoverFromSitemaps(
    targets,
    fetcher,
    sitemapIndexUrl,
  );
  let added = 0;
  let updated = 0;

  for (const target of targets) {
    console.log(`\nDécouverte ciblée : ${target.query}`);
    const searchUrl = new URL("/recherche", SITE_ORIGIN);
    searchUrl.searchParams.set("q", target.query);
    const canCrawlInternalSearch = robots.isAllowed(searchUrl.href, USER_AGENT) !== false;
    const searchCandidates = canCrawlInternalSearch
      ? await discoverFromInternalSearch(target, fetcher)
      : [];
    if (!canCrawlInternalSearch) {
      console.log("Recherche interne ignorée conformément à robots.txt.");
    }
    const initialCandidates = [
      ...searchCandidates,
      ...(sitemapCandidates.get(target.query) ?? []),
    ];
    const queue = [
      ...new Map(initialCandidates.map((candidate) => [candidate.url, candidate])).values(),
    ].slice(0, CANDIDATE_LIMIT_PER_REFERENCE);
    const visited = new Set<string>();
    let accepted = 0;

    for (let index = 0; index < queue.length; index += 1) {
      if (visited.size >= CANDIDATE_LIMIT_PER_REFERENCE) break;
      const candidate = queue[index];
      if (visited.has(candidate.url)) continue;
      visited.add(candidate.url);

      try {
        const response = await fetcher.fetch(candidate.url);
        if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
          continue;
        }
        const html = await readMetadataHtml(response, true);
        const extracted = extractDocument(html, candidate, response.url);
        if (!extracted) continue;
        const snippet = extractReferenceSnippet(html, target);
        if (!isStrictMatch(extracted, target, snippet)) continue;

        const enriched = enrichDocument(extracted, target, snippet);
        const existing = documentsByUrl.get(enriched.url);
        if (existing) {
          const merged = mergeDocuments(existing, enriched);
          if (JSON.stringify(merged) !== JSON.stringify(existing)) updated += 1;
          documentsByUrl.set(enriched.url, merged);
        } else {
          documentsByUrl.set(enriched.url, enriched);
          added += 1;
        }
        accepted += 1;

        for (const related of discoverRelatedLinks(html, target)) {
          if (
            queue.length < CANDIDATE_LIMIT_PER_REFERENCE &&
            !visited.has(related.url) &&
            !queue.some((item) => item.url === related.url)
          ) {
            queue.push(related);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Arrêt immédiat")) throw error;
        console.warn(`Page ignorée (${candidate.url}) : ${message}`);
      }
    }

    console.log(
      `${accepted} page(s) strictement associée(s) sur ${visited.size} vérifiée(s).`,
    );
  }

  const documents = [...documentsByUrl.values()];
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(TEMP_DATA_PATH, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
  await rename(TEMP_DATA_PATH, DATA_PATH);

  console.log(`\nCorpus enrichi : ${added} ajout(s), ${updated} mise(s) à jour.`);
  console.table(
    targets.map((target) => {
      const report = createReport(documents, target);
      return {
        référence: report.reference,
        product: report.product,
        tests: report.test,
        news: report.news,
        guides: report.guide,
        autres: report.other,
        total: report.total,
      };
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur du crawl ciblé : ${message}`);
  process.exitCode = 1;
});
