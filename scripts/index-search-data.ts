import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Meilisearch } from "meilisearch";

import { inferProductIdentity } from "../src/config/search";
import { CONTENT_TYPES, type SearchDocument } from "../src/types/search";

loadEnvConfig(process.cwd());

const DATA_PATH = path.join(process.cwd(), "data", "lesnumeriques.json");
const DEFAULT_HOST = "http://localhost:7700";
const DEFAULT_INDEX = "contents";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isSearchDocument(value: unknown): value is SearchDocument {
  if (!value || typeof value !== "object") return false;

  const document = value as Record<string, unknown>;
  return (
    isString(document.id) &&
    isString(document.title) &&
    isString(document.url) &&
    isString(document.type) &&
    CONTENT_TYPES.includes(document.type as SearchDocument["type"]) &&
    (document.brand === undefined || isString(document.brand)) &&
    (document.model === undefined || isString(document.model)) &&
    (document.productName === undefined || isString(document.productName)) &&
    (document.category === undefined || isString(document.category)) &&
    (document.description === undefined || isString(document.description)) &&
    (document.content === undefined || isString(document.content)) &&
    (document.publishedAt === undefined || isString(document.publishedAt))
  );
}

async function readDocuments(): Promise<SearchDocument[]> {
  const fileContent = await readFile(DATA_PATH, "utf8");
  const parsedData: unknown = JSON.parse(fileContent);

  if (!Array.isArray(parsedData) || !parsedData.every(isSearchDocument)) {
    throw new Error(`Le fichier ${DATA_PATH} contient des documents invalides.`);
  }

  return parsedData.map((document) => {
    const identity = inferProductIdentity(document.title, document.brand);
    return {
      ...document,
      ...(document.model ? {} : identity.model ? { model: identity.model } : {}),
      ...(document.productName
        ? {}
        : identity.productName
          ? { productName: identity.productName }
          : {}),
    };
  });
}

async function main() {
  const host = process.env.MEILISEARCH_HOST?.trim() || DEFAULT_HOST;
  const apiKey = process.env.MEILISEARCH_API_KEY?.trim();
  const indexName = process.env.MEILISEARCH_INDEX?.trim() || DEFAULT_INDEX;
  const client = new Meilisearch({ host, ...(apiKey ? { apiKey } : {}) });
  const index = client.index<SearchDocument>(indexName);
  const documents = await readDocuments();

  if (documents.length === 0) {
    throw new Error("Aucun document à indexer. Exécutez d'abord `npm run crawl`.");
  }

  console.log(`Configuration de l'index « ${indexName} » sur ${host}…`);

  const settingsTask = await index.updateSettings({
    searchableAttributes: [
      "brand",
      "model",
      "productName",
      "title",
      "category",
      "description",
      "content",
    ],
    filterableAttributes: ["type", "brand", "model", "category"],
    sortableAttributes: ["publishedAt"],
    synonyms: {
      tv: ["téléviseur"],
      gpu: ["carte graphique"],
      apn: ["appareil photo"],
      bt: ["bluetooth"],
      laptop: ["ordinateur portable"],
    },
    typoTolerance: {
      enabled: true,
      disableOnAttributes: ["model"],
    },
  });
  await client.tasks.waitForTask(settingsTask.taskUid);

  const deleteTask = await index.deleteAllDocuments();
  await client.tasks.waitForTask(deleteTask.taskUid);

  const documentsTask = await index.addDocuments(documents, { primaryKey: "id" });
  const completedTask = await client.tasks.waitForTask(documentsTask.taskUid);

  if (completedTask.status !== "succeeded") {
    throw new Error(`L'indexation a échoué avec le statut « ${completedTask.status} ».`);
  }

  console.log(`${documents.length} documents indexés avec succès.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur d'indexation : ${message}`);
  process.exitCode = 1;
});
