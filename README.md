# Recherche alternative Les Numériques

Prototype portfolio d'un moteur de recherche interne pour des contenus technologiques. Le projet indexe un échantillon limité de métadonnées publiques de Les Numériques afin d'évaluer une expérience de recherche alternative, sans reproduire le site ni collecter le contenu intégral des articles.

Le projet est indépendant et n'est pas affilié à Les Numériques.

## Stack

- Next.js 16 avec App Router
- React 19 et TypeScript strict
- Tailwind CSS 4
- Meilisearch
- Node.js, `tsx` et Cheerio pour la collecte de métadonnées et l'indexation
- npm

## Prérequis

- Windows 11, macOS ou Linux
- Node.js 20.19 minimum (ou 22.12 minimum)
- npm
- Docker Desktop avec Docker Compose

## Installation et lancement

### 1. Configurer l'environnement

Dans PowerShell :

```powershell
Copy-Item .env.example .env.local
```

Les valeurs proposées fonctionnent avec le fichier Docker Compose :

```env
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=local-development-key
MEILISEARCH_INDEX=contents
```

La clé reste exclusivement côté serveur. En production, remplacez-la par un secret robuste.

### 2. Démarrer Meilisearch

```bash
docker compose up -d
```

Meilisearch répond alors sur `http://localhost:7700`. Ses données sont conservées dans le volume Docker `meilisearch_data`.

### 3. Installer les dépendances

```bash
npm install
```

### 4. Collecter un échantillon public

```bash
npm run crawl
```

Le crawler commence par lire `robots.txt`, utilise uniquement les sitemaps qui y sont déclarés et examine au maximum 250 pages. La sélection cible Samsung, Sony, LG, Xiaomi et Asus dans plusieurs familles de produits, puis ajoute des documents concurrents qui mentionnent ces marques afin de créer des faux positifs contrôlés. Il attend au moins 1,2 seconde entre deux requêtes et s'arrête immédiatement si le site répond `403` ou `429`.

Seule la portion HTML nécessaire aux métadonnées est lue, avec une limite de taille. Pour les candidats de contrôle uniquement, le crawler peut lire jusqu'à 500 Ko afin de conserver un court paragraphe autour d'une mention de marque. Les données proviennent d'Open Graph, JSON-LD, des URL canoniques et des breadcrumbs, puis sont écrites dans `data/lesnumeriques.json`. Les contenus éditoriaux complets ne sont pas enregistrés et le corps du texte n'est jamais utilisé pour attribuer une marque.

Les réglages facultatifs `CRAWL_LIMIT`, `CRAWL_DELAY_MS`, `CRAWL_BRAND_TARGET` et `CRAWL_CONTROL_TARGET` sont plafonnés par le script : la limite ne peut pas dépasser 250 pages et le délai ne peut pas descendre sous 1 000 ms. À la fin, un résumé affiche les répartitions par marque, catégorie et type.

### 5. Créer et alimenter l'index

```bash
npm run search:index
```

Le script lit `data/lesnumeriques.json`, valide les documents, supprime les anciennes entrées de l'index puis ajoute les données réelles. Il applique :

- les attributs recherchables `brand`, `title`, `category`, `description`, `content`, dans cet ordre ;
- les filtres `type`, `brand`, `category` ;
- les synonymes `tv`/`téléviseur`, `gpu`/`carte graphique`, `apn`/`appareil photo` et `bt`/`bluetooth` ;
- `id` comme clé primaire.

La tolérance aux fautes de frappe native de Meilisearch reste active.

### 6. Démarrer l'application

```bash
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

## Commandes utiles

```bash
npm run dev           # serveur de développement
npm run crawl         # collecte limitée des métadonnées publiques
npm run crawl:reference -- "Sony WH-1000XM6" # crawl ciblé d'une référence
npm run crawl:references # crawl des références de démonstration
npm run search:index  # configuration et alimentation de Meilisearch
npm run search:benchmark # benchmark contre l'API locale
npm run analyze:references # classement des références les plus riches
npm run typecheck     # vérification TypeScript
npm run lint          # ESLint
npm run build         # build de production Next.js
npm run start         # serveur de production après le build
```

Pour arrêter Meilisearch sans supprimer les données :

```bash
docker compose down
```

## API de recherche

Le Route Handler `GET /api/search` accepte :

- `q` : texte recherché ;
- `type` : filtre facultatif parmi `test`, `news`, `guide`, `product`.

Exemple :

```text
/api/search?q=sony&type=test
```

Une requête vide renvoie une liste vide. Une valeur de filtre invalide renvoie une erreur `400`. Si Meilisearch est indisponible, l'API renvoie une erreur `503` exploitable par l'interface.

Une requête contenant une seule marque connue lance une passe prioritaire filtrée sur cette marque, sans supprimer les résultats textuels secondaires. Pour une requête complexe, tous les termes sont d'abord exigés et les indices de catégorie (`oled`, `casque`, `smartphone`, `laptop`) départagent les familles de produits. Les requêtes comparatives contenant `vs`, `versus` ou `contre` ne reçoivent pas de filtre de marque.

Chaque résultat expose sa raison de correspondance. Les extraits et surlignages produits par Meilisearch sont rendus sous forme de nœuds React, sans injection de HTML.

## Benchmark de pertinence

Avec Next.js et Meilisearch démarrés :

```bash
npm run search:benchmark
```

Les cas sont décrits dans `tests/search-cases.json`. Le benchmark vérifie notamment qu'un contenu de la marque demandée précède toujours un document concurrent qui ne fait que la mentionner.

## Structure

```text
app/
├── api/search/route.ts       # endpoint serveur vers Meilisearch
├── globals.css
├── layout.tsx
└── page.tsx                  # orchestration de l'interface
data/
├── lesnumeriques.json        # échantillon public généré par le crawler
└── search-data.json          # ancien jeu fictif, conservé séparément
scripts/
├── benchmark-search.ts       # exécution des cas de pertinence
├── crawl-lesnumeriques.ts    # crawler limité, respectueux de robots.txt
└── index-search-data.ts      # configuration et import de l'index
src/
├── components/               # barre, filtres et résultats
├── lib/meilisearch.ts        # client Meilisearch côté serveur
└── types/search.ts           # modèle et contrats d'API
docker-compose.yml            # service Meilisearch uniquement
tests/search-cases.json       # requêtes et attentes du benchmark
```

Le crawler reste entièrement séparé de l'API et de l'interface. Il produit le même contrat `SearchDocument`, ce qui permet de remplacer ou d'enrichir la source sans modifier le moteur de recherche.

## Limites du MVP

- Le crawler est volontairement limité à 250 pages et ne représente pas l'ensemble du catalogue.
- L'extraction dépend des métadonnées publiques et peut devoir évoluer si leur structure change.
- Aucun mécanisme de planification, de crawl incrémental ou de reprise n'est encore prévu.
- Le benchmark couvre un premier ensemble de cas déterministes, sans constituer encore un score global de pertinence.
- L'interface ne propose ni pagination, ni filtres par marque ou catégorie.
- Le déploiement de l'application et la sécurisation d'une instance Meilisearch publique ne sont pas couverts.

Les étapes futures pourront ajouter une source de données publiques, des recherches de référence et une comparaison de pertinence, tout en conservant le contrat `SearchDocument` actuel.
