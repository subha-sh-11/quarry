import type { Intent, SourceDef } from '../types';
import { arbeitnow, hnHiring, jobicy, remoteok, remotive } from './jobs';
import { githubOrgs, wikidata } from './companies';
import { crossref, devto, githubRepos, hnStories, huggingface, npm, openalex, stackexchange } from './knowledge';
import { coingecko, worldbank } from './market';

export const SOURCES: SourceDef[] = [
  remotive,
  remoteok,
  jobicy,
  arbeitnow,
  hnHiring,
  wikidata,
  githubOrgs,
  openalex,
  crossref,
  githubRepos,
  npm,
  huggingface,
  hnStories,
  devto,
  stackexchange,
  coingecko,
  worldbank,
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
export const sourcesFor = (intent: Intent) => SOURCES.filter((s) => s.intents.includes(intent));
