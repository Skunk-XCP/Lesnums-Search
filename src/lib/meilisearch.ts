import "server-only";

import { Meilisearch } from "meilisearch";

const DEFAULT_HOST = "http://localhost:7700";
const DEFAULT_INDEX = "contents";

let client: Meilisearch | undefined;

export function getMeilisearchClient(): Meilisearch {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST?.trim() || DEFAULT_HOST;
    const apiKey = process.env.MEILISEARCH_API_KEY?.trim();

    client = new Meilisearch({
      host,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  return client;
}

export function getSearchIndex() {
  const indexName = process.env.MEILISEARCH_INDEX?.trim() || DEFAULT_INDEX;
  return getMeilisearchClient().index(indexName);
}
