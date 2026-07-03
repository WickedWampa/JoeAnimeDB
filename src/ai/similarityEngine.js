import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';
import { buildCriticRecommendationText } from './animeCriticEngine';
import { buildPersonalityRecommendationText } from './joeAIPersonalityEngine';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function extractSimilarityTitle(question = '') {
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

function allTitles(anime = {}) {
  return [anime.title, anime.officialTitle, anime.japaneseTitle, ...(anime.titleSynonyms || [])].filter(Boolean);
}

function titleMatches(anime = {}, query = '') {
  const q = norm(query);
  return q && allTitles(anime).some((title) => {
    const t = norm(title);
    return t === q || t.includes(q) || q.includes(t);
  });
}

function meta(item = {}) {
  return [item.year, item.studio, item.episodeCount ? `${item.episodeCount} eps` : null, item.communityScore ? `MAL ${item.communityScore}` : null].filter(Boolean).join(' · ');
}

function explainOverlap(sourceDna, candidateDna) {
  const sourceTraits = topDnaTraits(sourceDna, 12);
  const candidateTraits = new Set(topDnaTraits(candidateDna, 14).map((trait) => trait.key));

  return sourceTraits
    .filter((trait) => candidateTraits.has(trait.key))
    .slice(0, 6)
    .map((trait) => labelTrait(trait.key));
}

function section(title, entries) {
  if (!entries.length) return '';
  return [
    title,
    '',
    entries.map(({ item, match, reasons }) => {
      const pct = Math.round(match * 100);
      const info = meta(item);
      return [
        `• ${item.title} — ${pct}% DNA match${info ? ` (${info})` : ''}`,
        reasons.length ? `  Why: ${reasons.join(', ')}` : ''
      ].filter(Boolean).join('\n');
    }).join('\n')
  ].join('\n');
}

export function recommendSimilarTo({ query = '', anime = [], catalog = [], limit = 8 }) {
  const cleanedQuery = String(query || '').trim();

  const source = anime.find((item) => titleMatches(item, cleanedQuery)) || catalog.find((item) => titleMatches(item, cleanedQuery));

  if (!source) {
    return {
      found: false,
      text: `I heard: “${cleanedQuery}”. I could not find that title in your library or catalog yet. Try the official title or add it first.`
    };
  }

  const sourceDna = buildAnimeDNA(source);
  const ownedKeys = new Set(anime.map((item) => String(item.malId || item.id || item.title)));

  const pool = [...catalog, ...anime]
    .filter((item) => String(item.malId || item.id || item.title) !== String(source.malId || source.id || source.title))
    .filter((item, index, arr) => {
      const id = String(item.malId || item.id || item.title);
      return arr.findIndex((other) => String(other.malId || other.id || other.title) === id) === index;
    });

  const matches = pool
    .map((item) => {
      const candidateDna = buildAnimeDNA(item);
      const match = dnaSimilarity(sourceDna, candidateDna);
      const reasons = explainOverlap(sourceDna, candidateDna);
      const owned = ownedKeys.has(String(item.malId || item.id || item.title));
      return { item, match, reasons, owned };
    })
    .filter((entry) => entry.match > 0.35)
    .sort((a, b) => b.match - a.match);

  const inLibrary = matches.filter((entry) => entry.owned).slice(0, Math.ceil(limit / 2));
  const discoveries = matches.filter((entry) => !entry.owned).slice(0, limit);

  const sourceTraits = topDnaTraits(sourceDna, 8).map((trait) => labelTrait(trait.key)).join(', ');

  return {
    found: true,
    source,
    matches,
    text: buildPersonalityRecommendationText({ source, inLibrary, discoveries })
  };
}

export function maybeSimilarRecommendation(question = '', anime = [], catalog = []) {
  const title = extractSimilarityTitle(question);
  if (!title) return null;
  return recommendSimilarTo({ query: title, anime, catalog }).text;
}
