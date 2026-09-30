# Quarry

**Turn a sentence into a dataset you can trust.** Code Cubicle 6.0, Problem Statement 01: AI-Powered Data Intelligence Platform.

You describe the data you need in plain English. Quarry drafts an editable collection *recipe*, runs it against permitted public APIs, then filters, validates, deduplicates and ranks the results. Every value in the final table carries a **receipt**: which source it came from, the exact API request, the JSON path, the raw value and any transformation applied.

Live: https://subha-sh-11.github.io/quarry/

## What makes it different

| | |
|---|---|
| **Receipts for every cell** | Click any row to see, per field, the source, request URL, JSON path, raw value, transform and fetch time. When two sources agree on a value, both receipts are kept and the value counts as *corroborated*. When they disagree, the conflict is flagged instead of being silently overwritten. |
| **Editable recipes** | The plan isn't a black box. You can change the intent, search terms, country, time window, work mode, exclusions, output columns, required fields and sources before anything runs. |
| **On-device AI** | A 23 MB sentence-embedding model (all-MiniLM-L6-v2 via Transformers.js) runs in a Web Worker. It classifies the request, ranks records by meaning and merges near-duplicate listings across sources. No API key is needed and nothing leaves the browser. |
| **Optional Claude planner** | Add an Anthropic key in Settings and Claude Opus 5.5 turns the brief into a structured recipe (schema-validated output). If the call fails, Quarry falls back to the on-device planner. |
| **Permitted sources only** | Quarry never scrapes HTML. It calls 17 documented public APIs, and it records each API's terms, rate limit and required attribution. The attributions are exported with the data. |
| **Run diffs & watching** | Re-run a recipe, or put it on a schedule, and Quarry shows what's new, what's gone and which values changed since the previous run. |
| **Transparent filtering** | Every record that was dropped is listed with the reason it was dropped (for example: outside the location, dated before the window, or missing a required field). |

## Pipeline

1. **Understand**: parse the brief (on-device rules and embeddings, or Claude) into a recipe
2. **Check permissions**: resolve filters and confirm that every source is whitelisted
3. **Collect**: query sources in parallel, with per-source request logs and latency
4. **Extract & filter**: apply keyword, exclusion, location, remote and date constraints
5. **Validate**: normalise and check URLs, dates, numbers and money, and enforce required fields
6. **Deduplicate**: merge exact duplicates by key fields, then semantic near-duplicates
7. **Rank**: semantic similarity to the brief, blended with popularity or recency on request
8. **Publish**: the dataset with quality scores, plus a diff against the last run

## Data domains & sources

- **Jobs**: Remotive, Remote OK, Jobicy, Arbeitnow, HN "Who is hiring?" (the free-text first line is parsed into fields)
- **Companies & leads**: Wikidata (industry entity grounding plus SPARQL), GitHub organisations
- **Research**: OpenAlex, Crossref
- **Open source**: GitHub repositories, npm, Hugging Face Hub
- **Discussions**: Hacker News, DEV, Stack Overflow
- **Market data**: CoinGecko
- **Economic indicators**: World Bank WDI

## Stack

React 19, TypeScript and Vite. Transformers.js handles on-device embeddings, the Anthropic TypeScript SDK powers the optional planner, and IndexedDB stores recipes, runs and datasets. The app is fully static and deploys to GitHub Pages.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```
