// Shared title normalization and alias expansion for every metadata/search path.

const TITLE_ALIASES = [
  {
    test: /^re\s*:?\s*zero\b/i,
    aliases: [
      'Re:ZERO -Starting Life in Another World-',
      'Re:ZERO -Starting Life in Another World',
      'Re:Zero kara Hajimeru Isekai Seikatsu',
      'Re Zero'
    ]
  },
  {
    test: /^tsukimichi\b/i,
    aliases: [
      'Tsukimichi: Moonlit Fantasy',
      'Tsuki ga Michibiku Isekai Douchuu'
    ]
  },
  {
    test: /^solo leveling\b/i,
    aliases: ['Solo Leveling', 'Ore dake Level Up na Ken']
  },
  {
    test: /^(?:the\s+)?faraway paladin\b/i,
    aliases: ['The Faraway Paladin', 'Saihate no Paladin', '最果てのパラディン']
  },
  {
    test: /^i['’]?ve been killing slimes for 300 years\b/i,
    aliases: [
      "I've Been Killing Slimes for 300 Years and Maxed Out My Level",
      'Slime Taoshite 300-nen, Shiranai Uchi ni Level Max ni Nattemashita',
      'Slime Taoshite 300-nen',
      'スライム倒して300年、知らないうちにレベルMAXになってました'
    ]
  },
  {
    test: /^(?:the\s+)?ossan newbie adventurer\b/i,
    aliases: [
      'The Ossan Newbie Adventurer, Trained to Death by the Most Powerful Party, Became Invincible',
      'Shinmai Ossan Boukensha, Saikyou Party ni Shinu hodo Kitaerarete Muteki ni Naru',
      'Shinmai Ossan Boukensha',
      '新米オッサン冒険者、最強パーティに死ぬほど鍛えられて無敵になる。'
    ]
  },
  {
    test: /^black lagoon\b/i,
    aliases: ['Black Lagoon', 'ブラック・ラグーン']
  },
  {
    test: /^cowboy bebop\b/i,
    aliases: ['Cowboy Bebop', 'Kaubōi Bibappu', 'カウボーイビバップ']
  }
];

export function normalizeSearchTitle(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:|/]+|[\s\-:|/]+$/g, '')
    .trim();
}

export function titleSearchKey(value = '') {
  return normalizeSearchTitle(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function uniqueTitles(values = []) {
  const seen = new Set();

  return values
    .map(normalizeSearchTitle)
    .filter((value) => {
      const key = titleSearchKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function titlesFromInput(input = '') {
  if (typeof input === 'string') return [input];

  const item = input || {};
  return [
    item.title,
    item.englishTitle,
    item.officialTitle,
    item.canonicalTitle,
    item.japaneseTitle,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
  ];
}

function aliasesFor(title = '') {
  return TITLE_ALIASES
    .filter((entry) => entry.test.test(normalizeSearchTitle(title)))
    .flatMap((entry) => entry.aliases);
}

function punctuationVariants(value = '') {
  const original = normalizeSearchTitle(value);
  if (!original) return [];

  const noDecorativeDashes = original
    .replace(/\s*-\s*([^-\n]+?)\s*-\s*/g, ': $1')
    .replace(/\s+/g, ' ')
    .trim();

  const punctuationLight = original
    .replace(/[:：]/g, ' ')
    .replace(/[!?.,'"]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const editionStripped = stripEditionNoise(original);
  const subtitleStripped = stripTitleSubtitle(original);
  const franchiseOnly = franchiseBaseTitle(original);
  const romanArabic = romanToArabicTitleTokens(original)
    .replace(/\s+/g, ' ')
    .trim();

  return uniqueTitles([
    original,
    noDecorativeDashes,
    punctuationLight,
    editionStripped,
    subtitleStripped,
    franchiseOnly,
    romanArabic
  ]);
}

export function buildTitleSearchQueries(input = '', options = {}) {
  const { includeAnimeTerms = false, limit = 36 } = options;
  const originals = uniqueTitles(titlesFromInput(input));
  const aliases = uniqueTitles(originals.flatMap(aliasesFor));
  const baseQueries = uniqueTitles([...originals, ...aliases].flatMap(punctuationVariants));

  if (!includeAnimeTerms) return baseQueries.slice(0, limit);

  return uniqueTitles(
    baseQueries.flatMap((title) => [
      title,
      `${title} anime`,
      `${title} TV series`,
      `${title} anime television series`
    ])
  ).slice(0, limit);
}

export function romanToArabicTitleTokens(value = '') {
  return String(value || '')
    .replace(/\biii\b/gi, ' 3 ')
    .replace(/\bii\b/gi, ' 2 ')
    .replace(/\biv\b/gi, ' 4 ');
}

export function normalizeTitleWords(value = '') {
  return romanToArabicTitleTokens(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\b(?:the\s+)?final\s+season\b/gi, ' season ')
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, ' season $1 ')
    .replace(/\b(?:season|series)\s*(\d+)\b/gi, ' season $1 ')
    .replace(/\b(?:part|cour)\s*(\d+)\b/gi, ' part $1 ')
    .replace(/\bs\s*(\d+)\b/gi, ' season $1 ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function compactTitleKey(value = '') {
  return normalizeTitleWords(value).replace(/\s+/g, '');
}

export function stripEditionNoise(value = '') {
  return normalizeSearchTitle(value)
    .replace(/\s*[-–—:]\s*(part|cour)\s*\d+\s*$/i, '')
    .replace(/\s+(part|cour)\s*\d+\s*$/i, '')
    .replace(/\s+(season|series)\s*\d+\s*(part\s*\d+)?\s*$/i, '')
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season\s*$/i, '')
    .replace(/\s+(the\s+)?final\s+season\s*(part\s*\d+)?\s*$/i, '')
    .replace(/\s+(movie|film|special|ova|ona|recap)\s*$/i, '')
    .replace(/\s+[sS]\d+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripTitleSubtitle(value = '') {
  const title = normalizeSearchTitle(value);
  if (/^re\s*:\s*zero/i.test(title)) {
    return title.replace(/\s*-\s*starting life.*$/i, '').trim();
  }
  const colonIndex = title.indexOf(':');
  if (colonIndex > 5) return title.slice(0, colonIndex).trim();
  const dashMatch = title.match(/^(.{6,}?)\s+-\s+.+$/);
  return dashMatch ? dashMatch[1].trim() : title;
}

export function franchiseBaseTitle(value = '') {
  return stripTitleSubtitle(stripEditionNoise(value))
    .replace(/\s+(chapter|arc)\s+\d+\s*$/i, '')
    .replace(/\s+(part|cour)\s+\d+\s*$/i, '')
    .replace(/\s+(season|series)\s+\d+\s*$/i, '')
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season\s*$/i, '')
    .replace(/\s+(the\s+)?final\s+season\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function knownTitles(input = {}) {
  return uniqueTitles(titlesFromInput(input));
}
