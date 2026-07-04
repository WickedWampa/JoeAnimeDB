import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';
import { buildPersonalityRecommendationText } from './joeAIPersonalityEngine';
import { findKnowledgeProfile } from './animeKnowledgeBase';
import { sameFranchise, enrichAnimeKnowledge } from './knowledge/knowledgeRegistry';
import { compareGenome } from './genome/genomeEngine';
import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';
import { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function keyFor(item = {}) {
  return String(item.malId || item.id || item.title || '');
}

function allTitles(anime = {}) {
  return [anime.title, anime.officialTitle, anime.japaneseTitle, ...(anime.titleSynonyms || [])].filter(Boolean);
}

function titleMatches(anime = {}, query = '') {
  const q = norm(query);
  if (!q) return false;

  return allTitles(anime).some((title) => {
    const t = norm(title);
    return t === q || t.includes(q) || q.includes(t);
  });
}

function extractSimilarityTitle(question = '') {
  const raw = String(question || '').trim();

  const patterns = [
    /similar\s+to\s+(.+?)[?.!]*$/i,
    /something\s+like\s+(.+?)[?.!]*$/i,
    /show\s+like\s+(.+?)[?.!]*$/i,
    /anime\s+like\s+(.+?)[?.!]*$/i,
    /show\s+me\s+something\s+like\s+(.+?)[?.!]*$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].replace(/[?.!]+$/g, '').trim();
  }

  const lowered = raw.toLowerCase();
  const lastLike = lowered.lastIndexOf(' like ');
  if (lastLike !== -1) return raw.slice(lastLike + 6).replace(/[?.!]+$/g, '').trim();

  return '';
}

function boostForKnowledge(source = {}, candidate = {}) {
  const found = findKnowledgeProfile(source);
  if (!found) return { boost: 0, reason: '' };

  const profile = found.profile;
  const candidateTitle = norm(`${candidate.title || ''} ${candidate.officialTitle || ''}`);
  const matches = profile.bestMatches || {};

  for (const [title, reason] of Object.entries(matches)) {
    const needle = norm(title);
    if (candidateTitle.includes(needle) || needle.includes(candidateTitle)) {
      return { boost: 0.42, reason };
    }
  }

  return { boost: 0, reason: '' };
}

function explainOverlap(sourceDna, candidateDna) {
  const sourceTraits = topDnaTraits(sourceDna, 14);
  const candidateTraits = new Set(topDnaTraits(candidateDna, 16).map((trait) => trait.key));

  return sourceTraits
    .filter((trait) => candidateTraits.has(trait.key))
    .slice(0, 6)
    .map((trait) => labelTrait(trait.key));
}

function buildCandidate({ source, item, anime, sourceDna }) {
  // SPRINT5_GENOME_SCORING
  const candidateDna = buildAnimeDNA(item);
  const dnaScore = dnaSimilarity(sourceDna, candidateDna);
  const sourceGenome = findGenomeCard(source);
  const candidateGenome = findGenomeCard(item);
  const genome = sourceGenome && candidateGenome ? compareGenome(sourceGenome, candidateGenome) : null;
  const knowledge = boostForKnowledge(source, item);
  const match = Math.min(0.99, Math.max(dnaScore + knowledge.boost, genome ? genome.score : 0));
  const owned = new Set(anime.map(keyFor)).has(keyFor(item));
  const reasons = explainOverlap(sourceDna, candidateDna);

  if (genome?.reasons?.length) {
    reasons.unshift(...genome.reasons.slice(0, 3));
  }

  if (knowledge.reason) {
    reasons.unshift('Curated knowledge match');
  }

  return {
    item,
    match,
    dnaScore,
    knowledgeBoost: knowledge.boost,
    knowledgeReason: knowledge.reason,
    reasons,
    owned
  };
}

export function recommendKnowledgeFirst({ query = '', anime = [], catalog = [], limit = 8 }) {
  const source =
    anime.find((item) => titleMatches(item, query)) ||
    catalog.find((item) => titleMatches(item, query));

  if (!source) {
    return {
      found: false,
      text: `I heard: “${query}”. I could not find that title in your library or catalog yet. Try the official title or add it first.`
    };
  }

  const sourceDna = buildAnimeDNA(source);

  const enrichedSource = enrichAnimeKnowledge(source);

  const pool = [...catalog, ...anime]
    // SPRINT4_EXCLUDE_SAME_FRANCHISE
    .filter((item) => keyFor(item) !== keyFor(source))
    .filter((item) => !sameFranchise(enrichedSource, item))
    .filter((item, index, arr) => arr.findIndex((other) => keyFor(other) === keyFor(item)) === index);

  const scored = pool
    .map((item) => buildCandidate({ source, item, anime, sourceDna }))
    .filter((entry) => entry.match > 0.35 || entry.knowledgeBoost > 0)
    .sort((a, b) => {
      if (b.knowledgeBoost !== a.knowledgeBoost) return b.knowledgeBoost - a.knowledgeBoost;
      return b.match - a.match;
    });

  const inLibrary = scored.filter((entry) => entry.owned).slice(0, Math.ceil(limit / 2));
  const discoveries = scored.filter((entry) => !entry.owned).slice(0, limit);

  return {
    found: true,
    source,
    inLibrary,
    discoveries,
    text: buildPersonalityRecommendationText({ source, inLibrary, discoveries })
  };
}

export function maybeKnowledgeFirstRecommendation(question = '', anime = [], catalog = []) {
  const title = extractSimilarityTitle(question);
  if (!title) {
    return maybeGenomeIntentRecommendation(question);
  }

  return recommendKnowledgeFirst({ query: title, anime, catalog }).text;
}
