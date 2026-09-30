import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { INDICATORS, INTENTS } from './schema';
import type { PlanDraft } from './planner';

const MODEL = 'claude-opus-5-5';

const PlanSchema = z.object({
  intent: z.enum(['jobs', 'companies', 'research', 'opensource', 'discussions', 'crypto', 'economy']),
  title: z.string(),
  keywords: z.array(z.string()),
  context: z.array(z.string()),
  excludes: z.array(z.string()),
  country: z.string().nullable(),
  countries: z.array(z.string()),
  city: z.string().nullable(),
  remote: z.boolean().nullable(),
  since: z.string().nullable(),
  limit: z.number().int(),
  sort: z.enum(['relevance', 'recent', 'popular']),
  indicator: z.string().nullable(),
  requiredFields: z.array(z.string()),
  notes: z.array(z.string()),
});

function system() {
  const intents = Object.values(INTENTS)
    .map((d) => `- ${d.id}: ${d.label}. Fields: ${d.fields.map((f) => f.key).join(', ')}`)
    .join('\n');
  return `You translate a business user's plain-English data request into a collection plan for Quarry, which only queries a fixed set of public APIs.

Today is ${new Date().toISOString().slice(0, 10)}.

Pick exactly one intent:
${intents}

Rules:
- keywords: the short search terms a search API should receive (1-3 items). Put alternatives ("React or Vue") as separate items; keep a single multi-word topic as one item ("retrieval augmented generation"). Never include place names, dates, counts, or words that just name the entity type (jobs, companies, papers).
- context: role or seniority words useful for ranking but too narrow for search (e.g. "senior", "engineer").
- country: ISO 3166-1 alpha-2 code or null. countries: list of ISO codes (economy intent only, else []).
- since: YYYY-MM-DD lower bound for the time window, or null.
- limit: requested number of records, default 60 (economy 300, crypto 25), max 500.
- indicator: for economy only, one of ${INDICATORS.map((i) => `${i.code} (${i.label})`).join('; ')}; otherwise null.
- requiredFields: field keys from the chosen intent that the user said must be present.
- notes: 2-5 short sentences explaining how you interpreted the request, written for the user.
- title: a 3-7 word name for this dataset.`;
}

export async function planWithClaude(brief: string, apiKey: string): Promise<PlanDraft> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(PlanSchema) },
    system: system(),
    messages: [{ role: 'user', content: brief }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to plan this request.');
  const p = res.parsed_output;
  if (!p) throw new Error('Claude returned an unparseable plan.');
  const validFields = new Set(INTENTS[p.intent].fields.map((f) => f.key));
  return {
    intent: p.intent,
    title: p.title,
    keywords: p.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 4),
    context: p.context,
    excludes: p.excludes,
    country: p.country?.toUpperCase() || undefined,
    countries: p.intent === 'economy' ? p.countries.map((c) => c.toUpperCase()) : undefined,
    city: p.city || undefined,
    remote: p.remote ?? undefined,
    since: p.since && /^\d{4}-\d{2}-\d{2}$/.test(p.since) ? p.since : undefined,
    limit: Math.min(500, Math.max(5, p.limit || 60)),
    sort: p.sort,
    indicator: p.intent === 'economy' ? INDICATORS.find((i) => i.code === p.indicator)?.code ?? INDICATORS[0].code : undefined,
    requiredFields: p.requiredFields.filter((f) => validFields.has(f)),
    notes: [...p.notes, `Planned by ${MODEL}.`],
  };
}
