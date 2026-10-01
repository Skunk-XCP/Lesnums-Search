import "server-only";

import { Meilisearch } from "meilisearch";

const DEFAULT_INDEX = "contents";

let client: Meilisearch | undefined;

export function getMeilisearchClient(): Meilisearch {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST?.trim();
    const apiKey = process.env.MEILISEARCH_API_KEY?.trim();

    if (!host) {
      throw new Error("La variable d'environnement MEILISEARCH_HOST est requise.");
    }

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
