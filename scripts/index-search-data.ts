import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Meilisearch } from "meilisearch";

import { inferProductIdentity } from "../src/config/search";
import { CONTENT_TYPES, type SearchDocument } from "../src/types/search";

loadEnvConfig(process.cwd());

const DATA_PATH = path.join(process.cwd(), "data", "lesnumeriques.json");
const DEFAULT_INDEX = "contents";
const DEFAULT_BATCH_SIZE = 25;
const BATCH_DELAY_MS = 750;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    (document.relatedModels === undefined ||
      (Array.isArray(document.relatedModels) &&
        document.relatedModels.every(isString))) &&
    (document.referenceKeys === undefined ||
      (Array.isArray(document.referenceKeys) &&
        document.referenceKeys.every(isString))) &&
    (document.productName === undefined || isString(document.productName)) &&
    (document.category === undefined || isString(document.category)) &&
    (document.description === undefined || isString(document.description)) &&
    (document.content === undefined || isString(document.content)) &&
    (document.publishedAt === undefined || isString(document.publishedAt)) &&
    (document.imageUrl === undefined || isString(document.imageUrl)) &&
    (document.priceFrom === undefined || isFiniteNumber(document.priceFrom)) &&
    (document.currency === undefined || isString(document.currency)) &&
    (document.priceCompareUrl === undefined || isString(document.priceCompareUrl))
  );
}

function toIndexedDocument(document: SearchDocument): SearchDocument {
  const identity = inferProductIdentity(document.title, document.brand);

  return {
    id: document.id,
    title: document.title,
    url: document.url,
    type: document.type,
    ...(document.brand ? { brand: document.brand } : {}),
    ...(document.model
      ? { model: document.model }
      : identity.model
        ? { model: identity.model }
        : {}),
    ...(document.relatedModels ? { relatedModels: document.relatedModels } : {}),
    ...(document.referenceKeys ? { referenceKeys: document.referenceKeys } : {}),
    ...(document.productName
      ? { productName: document.productName }
      : identity.productName
        ? { productName: identity.productName }
        : {}),
    ...(document.category ? { category: document.category } : {}),
    ...(document.description ? { description: document.description } : {}),
    ...(document.content ? { content: document.content } : {}),
    ...(document.publishedAt ? { publishedAt: document.publishedAt } : {}),
    ...(document.imageUrl ? { imageUrl: document.imageUrl } : {}),
    ...(document.priceFrom !== undefined ? { priceFrom: document.priceFrom } : {}),
    ...(document.currency ? { currency: document.currency } : {}),
    ...(document.priceCompareUrl ? { priceCompareUrl: document.priceCompareUrl } : {}),
  };
}

async function readDocuments(): Promise<SearchDocument[]> {
  const parsedData: unknown = JSON.parse(await readFile(DATA_PATH, "utf8"));

  if (!Array.isArray(parsedData) || !parsedData.every(isSearchDocument)) {
    throw new Error(`Le fichier ${DATA_PATH} contient des documents invalides.`);
  }

  const documents = parsedData as SearchDocument[];
  for (let index = 0; index < documents.length; index += 1) {
    documents[index] = toIndexedDocument(documents[index]);
  }

  return documents;
}

function getBatchSize() {
  const configuredValue = process.env.MEILISEARCH_BATCH_SIZE?.trim();
  if (!configuredValue) return DEFAULT_BATCH_SIZE;

  const batchSize = Number(configuredValue);
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error("MEILISEARCH_BATCH_SIZE doit être un entier strictement positif.");
  }

  return batchSize;
}

async function waitForSucceededTask(
  client: Meilisearch,
  taskUid: number,
  operation: string,
) {
  const completedTask = await client.tasks.waitForTask(taskUid);
  if (completedTask.status !== "succeeded") {
    throw new Error(
      `${operation} a échoué avec le statut « ${completedTask.status} ».`,
    );
  }
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function main() {
  const host = process.env.MEILISEARCH_HOST?.trim();
  const apiKey = process.env.MEILISEARCH_API_KEY?.trim();
  const indexName = process.env.MEILISEARCH_INDEX?.trim() || DEFAULT_INDEX;
  const batchSize = getBatchSize();

  if (!host) {
    throw new Error("La variable d'environnement MEILISEARCH_HOST est requise.");
  }

  const client = new Meilisearch({ host, ...(apiKey ? { apiKey } : {}) });
  const index = client.index<SearchDocument>(indexName);
  const documents = await readDocuments();

  if (documents.length === 0) {
    throw new Error("Aucun document à indexer. Exécutez d'abord `npm run crawl`.");
  }

  console.log(`Configuration de l'index « ${indexName} » sur ${host}…`);

  const indexes = await client.getIndexes({ limit: 1_000 });
  const indexExists = indexes.results.some(({ uid }) => uid === indexName);

  if (indexExists) {
    const deleteTask = await index.deleteAllDocuments();
    await waitForSucceededTask(client, deleteTask.taskUid, "La suppression des documents");
  } else {
    const createTask = await client.createIndex(indexName, { primaryKey: "id" });
    await waitForSucceededTask(client, createTask.taskUid, "La création de l'index");
  }

  const settingsTask = await index.updateSettings({
    searchableAttributes: [
      "brand",
      "model",
      "relatedModels",
      "referenceKeys",
      "productName",
      "title",
      "category",
      "description",
      "content",
    ],
    filterableAttributes: [
      "type",
      "brand",
      "model",
      "relatedModels",
      "referenceKeys",
      "category",
    ],
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
      disableOnAttributes: ["model", "relatedModels", "referenceKeys"],
    },
  });
  await waitForSucceededTask(client, settingsTask.taskUid, "La configuration de l'index");

  const batchCount = Math.ceil(documents.length / batchSize);
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const batchNumber = Math.floor(offset / batchSize) + 1;
    const batch = documents.slice(offset, offset + batchSize);

    console.log(`Batch ${batchNumber}/${batchCount} : ${batch.length} documents`);
    const documentsTask = await index.addDocuments(batch, { primaryKey: "id" });
    await waitForSucceededTask(
      client,
      documentsTask.taskUid,
      `Le batch ${batchNumber}/${batchCount}`,
    );
    console.log("Task completed");

    if (batchNumber < batchCount) {
      await wait(BATCH_DELAY_MS);
    }
  }

  console.log(
    `${documents.length} documents indexés avec succès en ${batchCount} batches.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur d'indexation : ${message}`);
  process.exitCode = 1;
});
