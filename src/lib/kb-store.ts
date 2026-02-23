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

// Score returned for a keyword match (must exceed the default 0.40 threshold).
const KEYWORD_MATCH_SCORE = 0.45;

// Minimum token length to be considered a meaningful keyword.
const MIN_TOKEN_LEN = 3;

// Common English stopwords to ignore during keyword matching.
const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "that", "this", "from", "have",
  "will", "can", "its", "all", "use", "using", "used", "build", "create",
  "write", "make", "need", "want", "into", "via", "per",
]);

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

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= MIN_TOKEN_LEN && !STOPWORDS.has(w))
  );
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
  mode: "embedding" | "keyword";
}

export class KBStore {
  private domains: DomainEntry[] = [];
  private cache: EmbeddingsCache = {};
  private initialized = false;
  private embeddingAvailable = true;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.domains = loadAllDomains();
    this.cache = loadEmbeddingsCache();
    await this.syncEmbeddings();
    this.initialized = true;
  }

  /**
   * Attempts to compute and cache embeddings for all domains.
   * If the model is unavailable (e.g. no network), silently skips and
   * marks the store to use keyword fallback.
   */
  private async syncEmbeddings(): Promise<void> {
    let dirty = false;
    for (const entry of this.domains) {
      const hash = hashContent(entry);
      const cached = this.cache[entry.domain_key];
      if (!cached || cached.content_hash !== hash) {
        try {
          const text =
            entry.description + " " + entry.example_requests.join(" ");
          const embedding = await embed(text);
          this.cache[entry.domain_key] = { embedding, content_hash: hash };
          dirty = true;
        } catch {
          process.stderr.write(
            `[prompt-enrichment-mcp] Embedding model unavailable — falling back to keyword matching.\n`
          );
          this.embeddingAvailable = false;
          return;
        }
      }
    }
    if (dirty) saveEmbeddingsCache(this.cache);
  }

  /**
   * Finds the most relevant domain for a user request.
   * Uses semantic embeddings when available, keyword matching as fallback.
   */
  async findBestDomain(userRequest: string): Promise<ClassifyCandidate> {
    await this.initialize();

    if (this.embeddingAvailable) {
      try {
        const queryEmbedding = await embed(userRequest);
        const embeddings = this.domains.map(
          (d) => this.cache[d.domain_key].embedding
        );
        const { index, score } = findBestMatch(queryEmbedding, embeddings);
        return { entry: this.domains[index], score, mode: "embedding" };
      } catch {
        process.stderr.write(
          `[prompt-enrichment-mcp] Embedding failed — switching to keyword fallback.\n`
        );
        this.embeddingAvailable = false;
      }
    }

    return this.keywordMatch(userRequest);
  }

  /**
   * Keyword-based fallback classifier.
   * Scores each domain by token overlap with the user request.
   * Returns KEYWORD_MATCH_SCORE (above threshold) for the best overlapping
   * domain, or 0 if no meaningful overlap is found.
   */
  private keywordMatch(userRequest: string): ClassifyCandidate {
    const requestTokens = tokenize(userRequest);
    let bestEntry = this.domains[0];
    let bestOverlap = 0;

    for (const entry of this.domains) {
      const domainTokens = tokenize(
        entry.description + " " + entry.example_requests.join(" ")
      );
      let overlap = 0;
      for (const token of requestTokens) {
        if (domainTokens.has(token)) overlap++;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestEntry = entry;
      }
    }

    return {
      entry: bestEntry,
      score: bestOverlap > 0 ? KEYWORD_MATCH_SCORE : 0.0,
      mode: "keyword",
    };
  }

  getDomainByKey(key: string): DomainEntry | undefined {
    return this.domains.find((d) => d.domain_key === key);
  }

  getDiscoveryDimensions(): DiscoveryDimensions {
    if (!fs.existsSync(DISCOVERY_PATH)) {
      throw new Error(
        `discovery_dimensions.json not found at ${DISCOVERY_PATH}`
      );
    }
    return JSON.parse(
      fs.readFileSync(DISCOVERY_PATH, "utf-8")
    ) as DiscoveryDimensions;
  }

  /**
   * Writes a new domain entry to the KB and updates the embeddings cache.
   * Embedding computation is attempted but skipped gracefully on failure.
   */
  async addDomain(entry: DomainEntry): Promise<void> {
    await this.initialize();
    const filePath = path.join(DOMAINS_DIR, `${entry.domain_key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));

    if (this.embeddingAvailable) {
      try {
        const text = entry.description + " " + entry.example_requests.join(" ");
        const embedding = await embed(text);
        const hash = hashContent(entry);
        this.cache[entry.domain_key] = { embedding, content_hash: hash };
        saveEmbeddingsCache(this.cache);
      } catch {
        // Keyword mode — domain is still saved to disk, no embedding stored.
      }
    }

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
