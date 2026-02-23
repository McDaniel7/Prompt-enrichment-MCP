# Prompt Enrichment MCP

> An MCP server that helps non-experts generate expert-level prompts by asking the right clarifying questions before any AI agent task begins.

When you ask an AI coding agent to *"build an AWS Lambda"* or a video agent to *"generate a 10-second clip"*, critical details go unspecified — runtime, trigger type, memory allocation, BGM, aspect ratio, camera motion. The result drifts from what you actually wanted.

`prompt-enrichment-mcp` intercepts your AI agent requests and asks the clarifying questions you didn't know you needed to answer — so the agent builds exactly what you meant.

## How It Works

1. Prepend `/pe` to any request in Cursor (e.g., `/pe build a Lambda that resizes uploaded images`)
2. The skill calls `classify_domain` — your request is embedded and matched against the knowledge base via semantic similarity
3. The skill calls `enrich_prompt` — returns curated expert questions for the matched domain
4. Cursor asks you 6–8 tailored multiple-choice questions
5. Your answers are assembled into a complete, expert-level prompt
6. Cursor proceeds with the task using the enriched prompt

If your request doesn't match any known domain, the system uses universal discovery dimensions as a fallback and learns the new domain for future use.

## Installation

### Prerequisites
- Node.js >= 18
- Cursor IDE

### 1. Clone and build

```bash
git clone https://github.com/YOUR_USERNAME/Prompt-enrichment-MCP.git
cd Prompt-enrichment-MCP
npm install
npm run build
```

On first run, the embedding model (`all-MiniLM-L6-v2`, ~25 MB) is downloaded automatically from HuggingFace. No API key required.

### 2. Configure Cursor

Add the MCP server to your Cursor MCP configuration (`~/.cursor/mcp.json` or the workspace `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "prompt-enrichment": {
      "command": "node",
      "args": ["/absolute/path/to/Prompt-enrichment-MCP/dist/index.js"],
      "env": {
        "SIMILARITY_THRESHOLD": "0.40"
      }
    }
  }
}
```

Replace `/absolute/path/to/` with the actual path where you cloned the repo.

### 3. Add the Cursor Skill

Copy `skill/SKILL.md` to your Cursor skills directory:

```bash
cp skill/SKILL.md ~/.cursor/skills/prompt-enrichment.md
```

Or add it as a Cursor Rule in your workspace's `.cursor/rules/` directory.

## Usage

Simply prepend `/pe` to any request:

```
/pe build a Lambda that resizes images uploaded to S3
/pe create a 10-second product video for a coffee brand
/pe design a REST API for a task management app
/pe write a SQL query to find top customers by revenue
```

Cursor will ask clarifying questions and build the enriched prompt before starting work.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `SIMILARITY_THRESHOLD` | `0.40` | Minimum cosine similarity score to match a domain. Raise for stricter matching; lower to be more permissive. |
| `KB_PATH` | `<project root>/kb` | Override the knowledge base directory path. Useful for sharing a KB across multiple installations. |

## Knowledge Base

The knowledge base lives in `kb/domains/`. Each domain is a single JSON file.

### Included Domains (v0.1.0)

| Domain | Key |
|---|---|
| AWS Lambda Function | `aws_lambda` |
| React UI Component | `react_component` |
| SQL Query / Database Schema | `sql_query` |
| Terraform / Infrastructure as Code | `terraform_module` |
| AI Video Generation | `video_generation` |
| REST API Design | `rest_api_design` |
| Docker Container | `docker_container` |
| Python Script | `python_script` |

### Adding New Domains

New domains are added automatically when you use `/pe` with an unrecognized request. They are saved with `review_status: "pending"`. To promote a community-generated domain to `"approved"`, edit the JSON file and change the status.

You can also add domains manually by creating a new JSON file in `kb/domains/` following the schema of an existing entry.

### Embeddings Cache

Domain embeddings are cached in `kb/embeddings-cache.json` and recomputed automatically when domain content changes. You do not need to manage this file manually.

## Contributing

Contributions to the knowledge base (new domain files) and to the server code are welcome. Please open a pull request with:
- A new domain JSON file in `kb/domains/`
- Well-crafted questions with realistic, non-overlapping options

## License

MIT
