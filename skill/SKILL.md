# Prompt Enrichment Skill

## Purpose
This skill helps you generate expert-level prompts before starting a task. It asks you the clarifying questions you didn't know you needed to answer, so the agent builds exactly what you meant.

## Trigger
Activate this skill when the user's message **starts with or contains** `/pe` or `/prompt-enrichment`.

**Examples that activate this skill:**
- `/pe build a Lambda that resizes uploaded images`
- `/prompt-enrichment create a video ad for a coffee brand`
- `build a REST API /pe`

## Workflow

### Step 1 — Extract the request
Remove the trigger keyword (`/pe` or `/prompt-enrichment`) from the user's message. The remaining text is the `user_request`.

### Step 2 — Classify the domain
Call the `classify_domain` MCP tool with the `user_request`.

```
Tool: classify_domain
Input: { "user_request": "<extracted request>" }
```

### Step 3 — Get the enrichment object
Call the `enrich_prompt` MCP tool with the `user_request` and the `domain_key` returned in Step 2.

```
Tool: enrich_prompt
Input: { "user_request": "<extracted request>", "domain_key": "<from Step 2>" }
```

### Step 4 — Generate tailored questions
Follow the `steps` array in the returned object exactly:

- **Known domain**: Use `example_questions` as a reference framework. Generate 6–8 clarifying questions **tailored to the user's specific request**. Do not copy the examples verbatim — adapt them to what the user described.
- **Unknown domain**: Use `discovery_dimensions` as a structured framework. For each relevant dimension, generate a tailored multiple-choice question with 3–5 options.

### Step 5 — Collect answers
Present the questions as a **numbered multiple-choice list**. Wait for the user to answer before proceeding.

### Step 6 — Assemble the enriched prompt
Combine the original `user_request` with the user's answers into a detailed, expert-level prompt. Be specific — include all configuration details, constraints, and preferences the user specified.

### Step 7 — Confirm and proceed
Show the enriched prompt to the user. Ask: *"Does this look right? I'll proceed with this prompt."* Once confirmed, use the enriched prompt for the actual task.

### Step 8 — Grow the knowledge base (unknown domain only)
If `domain_key` was `"unknown"`, after the task completes call `add_domain` with:
- An inferred `domain_name` (e.g., "ML Curriculum Design")
- A one-sentence `description` of the domain
- The user's original request as `example_requests`
- The clarifying questions you generated as `questions`

```
Tool: add_domain
Input: {
  "domain_name": "<inferred name>",
  "description": "<one sentence>",
  "example_requests": ["<original user request>"],
  "questions": [{ "question": "...", "options": ["...", "..."] }, ...]
}
```

## Important Rules
- **Never skip the enrichment workflow** when `/pe` or `/prompt-enrichment` is present.
- **Never copy example questions verbatim** — always tailor them to the specific request.
- **Always wait for user answers** before assembling the enriched prompt.
- **Always confirm** the enriched prompt with the user before starting the task.
