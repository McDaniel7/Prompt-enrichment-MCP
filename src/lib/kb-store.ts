import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { embed } from "./embeddings.js";
import { findBestMatch } from "./similarity.js";
import type { DomainEntry, DiscoveryDimensions } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// kb/ lives at the project root: two levels up from dist/lib/ (or src/lib/ in dev)
const KB_BASE = process.env.KB_PATH
  ? path.resolve(process.env.KB_PATH)
  : path.resolve(__dirname, "../../kb");

const DOMAINS_DIR = path.join(KB_BASE, "domains");
const EMBEDDINGS_CACHE_PATH = path.join(KB_BASE, "embeddings-cache.json");
const DISCOVERY_PATH = path.join(KB_BASE, "discovery_dimensions.json");

interface EmbeddingsCache {
  [domain_key: string]: {
    embedding: number[];
    content_hash: string;
  };
}

function hashContent(entry: DomainEntry): string {
  const content = entry.description + " " + entry.example_requests.join(" ");
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return String(hash);
}

function loadEmbeddingsCache(): EmbeddingsCache {
  if (!fs.existsSync(EMBEDDINGS_CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(EMBEDDINGS_CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveEmbeddingsCache(cache: EmbeddingsCache): void {
  fs.writeFileSync(EMBEDDINGS_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function loadAllDomains(): DomainEntry[] {
  if (!fs.existsSync(DOMAINS_DIR)) {
    throw new Error(`KB domains directory not found: ${DOMAINS_DIR}`);
  }
  const files = fs
    .readdirSync(DOMAINS_DIR)
    .filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(DOMAINS_DIR, file), "utf-8");
    return JSON.parse(raw) as DomainEntry;
  });
}

export interface ClassifyCandidate {
  entry: DomainEntry;
  score: number;
}

export class KBStore {
  private domains: DomainEntry[] = [];
  private cache: EmbeddingsCache = {};
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.domains = loadAllDomains();
    this.cache = loadEmbeddingsCache();
    await this.syncEmbeddings();
    this.initialized = true;
  }

  /**
   * Ensures every domain has a valid cached embedding.
   * Recomputes only when the content hash changes.
   */
  private async syncEmbeddings(): Promise<void> {
    let dirty = false;
    for (const entry of this.domains) {
      const hash = hashContent(entry);
      const cached = this.cache[entry.domain_key];
      if (!cached || cached.content_hash !== hash) {
        const text =
          entry.description + " " + entry.example_requests.join(" ");
        const embedding = await embed(text);
        this.cache[entry.domain_key] = { embedding, content_hash: hash };
        dirty = true;
      }
    }
    if (dirty) saveEmbeddingsCache(this.cache);
  }

  /**
   * Finds the domain whose embedding is most similar to the query.
   * Returns the best candidate and its score regardless of threshold.
   */
  async findBestDomain(userRequest: string): Promise<ClassifyCandidate> {
    await this.initialize();
    const queryEmbedding = await embed(userRequest);
    const embeddings = this.domains.map(
      (d) => this.cache[d.domain_key].embedding
    );
    const { index, score } = findBestMatch(queryEmbedding, embeddings);
    return { entry: this.domains[index], score };
  }

  getDomainByKey(key: string): DomainEntry | undefined {
    return this.domains.find((d) => d.domain_key === key);
  }

  getDiscoveryDimensions(): DiscoveryDimensions {
    if (!fs.existsSync(DISCOVERY_PATH)) {
      throw new Error(`discovery_dimensions.json not found at ${DISCOVERY_PATH}`);
    }
    return JSON.parse(
      fs.readFileSync(DISCOVERY_PATH, "utf-8")
    ) as DiscoveryDimensions;
  }

  /**
   * Writes a new domain entry to the KB and updates the embeddings cache.
   */
  async addDomain(entry: DomainEntry): Promise<void> {
    await this.initialize();
    const filePath = path.join(DOMAINS_DIR, `${entry.domain_key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));

    const text = entry.description + " " + entry.example_requests.join(" ");
    const embedding = await embed(text);
    const hash = hashContent(entry);
    this.cache[entry.domain_key] = { embedding, content_hash: hash };
    saveEmbeddingsCache(this.cache);
    this.domains.push(entry);
  }

  incrementUsage(domainKey: string): void {
    const entry = this.getDomainByKey(domainKey);
    if (!entry) return;
    entry.metadata.usage_count += 1;
    entry.metadata.last_used = new Date().toISOString().split("T")[0];
    const filePath = path.join(DOMAINS_DIR, `${domainKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }
}

export const kbStore = new KBStore();
