// Core knowledge registry.
// This is intentionally small right now, but structured for Core100 expansion.

export const CORE_KNOWLEDGE_VERSION = '1.0.0';

export const KNOWLEDGE_PROFILES = [
  {
    knowledgeId: 'initial-d',
    seriesId: 'initial-d',
    franchiseId: 'initial-d',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['initial d', 'initial d first stage', 'initial d second stage', 'initial d fourth stage', 'initial d fifth stage', 'initial d final stage'],
    domains: ['motorsports', 'street racing', 'cars', 'touge']
  },
  {
    knowledgeId: 'dorohedoro',
    seriesId: 'dorohedoro',
    franchiseId: 'dorohedoro',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['dorohedoro'],
    domains: ['dark fantasy', 'chaos', 'body horror', 'black comedy']
  },
  {
    knowledgeId: 'bleach',
    seriesId: 'bleach',
    franchiseId: 'bleach',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['bleach', 'bleach thousand year blood war', 'bleach tybw'],
    domains: ['supernatural battle shonen', 'sword combat']
  },
  {
    knowledgeId: 'chainsaw-man',
    seriesId: 'chainsaw-man',
    franchiseId: 'chainsaw-man',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['chainsaw man'],
    domains: ['dark action', 'devils', 'black comedy']
  },
  {
    knowledgeId: 'frieren',
    seriesId: 'frieren',
    franchiseId: 'frieren',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['frieren', "frieren beyond journey's end", 'sousou no frieren'],
    domains: ['melancholy fantasy', 'travel fantasy']
  },
  {
    knowledgeId: 'made-in-abyss',
    seriesId: 'made-in-abyss',
    franchiseId: 'made-in-abyss',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['made in abyss'],
    domains: ['dark adventure', 'body horror', 'mystery']
  },
  {
    knowledgeId: 'golden-kamuy',
    seriesId: 'golden-kamuy',
    franchiseId: 'golden-kamuy',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['golden kamuy'],
    domains: ['historical adventure', 'survival', 'adult comedy']
  },
  {
    knowledgeId: 'one-piece',
    seriesId: 'one-piece',
    franchiseId: 'one-piece',
    pack: 'core100',
    version: CORE_KNOWLEDGE_VERSION,
    aliases: ['one piece'],
    domains: ['adventure shonen', 'found family', 'worldbuilding']
  }
];

function normalize(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(value = '') {
  return normalize(value).replace(/\s+/g, '-');
}

function titleFields(anime = {}) {
  return [
    anime.title,
    anime.officialTitle,
    anime.japaneseTitle,
    ...(anime.titleSynonyms || [])
  ].filter(Boolean);
}

export function findKnowledgeProfileForAnime(anime = {}) {
  const haystack = titleFields(anime).map(normalize).join(' | ');

  return KNOWLEDGE_PROFILES.find((profile) =>
    profile.aliases.some((alias) => {
      const cleanAlias = normalize(alias);
      return haystack.includes(cleanAlias) || cleanAlias.includes(normalize(anime.title || ''));
    })
  ) || null;
}

export function enrichAnimeKnowledge(anime = {}) {
  const profile = findKnowledgeProfileForAnime(anime);

  if (!profile) {
    return {
      ...anime,
      knowledgeId: anime.knowledgeId || null,
      seriesId: anime.seriesId || slug(anime.officialTitle || anime.title || anime.id || ''),
      franchiseId: anime.franchiseId || slug(anime.officialTitle || anime.title || anime.id || ''),
      knowledgePack: anime.knowledgePack || null,
      knowledgeVersion: anime.knowledgeVersion || null
    };
  }

  return {
    ...anime,
    knowledgeId: profile.knowledgeId,
    seriesId: profile.seriesId,
    franchiseId: profile.franchiseId,
    knowledgePack: profile.pack,
    knowledgeVersion: profile.version,
    knowledgeDomains: profile.domains
  };
}

export function sameFranchise(a = {}, b = {}) {
  const aId = a.franchiseId || enrichAnimeKnowledge(a).franchiseId;
  const bId = b.franchiseId || enrichAnimeKnowledge(b).franchiseId;
  return Boolean(aId && bId && aId === bId);
}
