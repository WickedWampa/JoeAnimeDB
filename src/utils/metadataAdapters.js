function clean(value = '') {
  return String(value ?? '').trim();
}

function valueName(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return clean(value);

  return clean(
    value.name ||
    value.title ||
    value.label ||
    value.canonicalTitle ||
    value.officialTitle ||
    ''
  );
}

function splitNames(value, { splitCommas = true } = {}) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitNames(entry, { splitCommas }));
  }

  const name = valueName(value);
  if (!name) return [];

  return name
    .split(splitCommas
      ? /\s+\/\s+|\s*;\s*|\s*\|\s*|\s*,\s*/
      : /\s+\/\s+|\s*;\s*|\s*\|\s*/)
    .map(clean)
    .filter(Boolean);
}

function uniqueNames(values = [], options = {}) {
  const seen = new Set();

  return values
    .flatMap((value) => splitNames(value, options))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}



const STUDIO_ALIASES = new Map([
  ['8 bit', '8bit'],
  ['eight bit', '8bit'],
  ['8bit', '8bit'],
  ['a 1 pictures', 'A-1 Pictures'],
  ['a1 pictures', 'A-1 Pictures'],
  ['a 1 pictures inc', 'A-1 Pictures'],
  ['bones inc', 'Bones'],
  ['cloverworks inc', 'CloverWorks'],
  ['olm inc', 'OLM'],
  ['oriental light and magic', 'OLM'],
  ['pierrot', 'Studio Pierrot'],
  ['studio pierrot', 'Studio Pierrot'],
  ['science saru', 'Science SARU'],
  ['wit studio', 'WIT Studio'],
  ['white fox', 'White Fox'],
  ['kyoto animation co ltd', 'Kyoto Animation']
]);

const NON_STUDIO_ORGANIZATIONS = [
  /^aniplex(?: of america)?$/i,
  /^avex(?: pictures)?$/i,
  /^bandai visual$/i,
  /^crunchyroll$/i,
  /^dentsu$/i,
  /^fuji tv$/i,
  /^funimation$/i,
  /^kadokawa$/i,
  /^kodansha$/i,
  /^mainichi broadcasting(?: system)?$/i,
  /^netflix$/i,
  /^nippon television network corporation$/i,
  /^pony canyon$/i,
  /^shueisha$/i,
  /^sumzap$/i,
  /^toho$/i,
  /^tv tokyo$/i
];

function studioKey(value = '') {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeStudioName(value = '') {
  const name = valueName(value);
  if (!name) return '';

  const key = studioKey(name);
  if (!key) return '';
  if (NON_STUDIO_ORGANIZATIONS.some((pattern) => pattern.test(name.trim()))) return '';

  return STUDIO_ALIASES.get(key) || name.trim();
}

export function normalizeStudioNames(values = []) {
  const seen = new Set();

  return values
    .flatMap((value) => splitNames(value, { splitCommas: false }))
    .map(normalizeStudioName)
    .filter(Boolean)
    .filter((name) => {
      const key = studioKey(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeAnimeStudioFields(anime = {}) {
  const studios = normalizeStudioNames([
    anime.animationStudios,
    anime.productionStudios,
    anime.studios,
    anime.studio
  ]);

  return {
    ...anime,
    studio: studios.join(' / '),
    animationStudios: studios,
    productionStudios: studios,
    studios
  };
}

export function getAnimeStudios(anime = {}) {
  return normalizeStudioNames([
    anime.animationStudios,
    anime.productionStudios,
    anime.studios,
    anime.studio
  ]);
}

export function getAnimeProducers(anime = {}) {
  return uniqueNames([
    anime.producers,
    anime.productionCompanies,
    anime.productionPartners
  ]);
}

export function getAnimeLicensors(anime = {}) {
  return uniqueNames([
    anime.licensors,
    anime.publishers,
    anime.distributors
  ]);
}

export function getAnimeNetworks(anime = {}) {
  return uniqueNames([
    anime.networks,
    anime.broadcasters,
    anime.broadcastNetworks
  ]);
}

export function getAnimeGenres(anime = {}) {
  return uniqueNames(anime.genres);
}

export function getAnimeThemes(anime = {}) {
  return uniqueNames([
    anime.themes,
    anime.tags,
    anime.categories,
    anime.demographics,
    anime.viewerMotivations,
    anime.fantasyPillars
  ]);
}

export function getAnimeTasteSignals(anime = {}) {
  return uniqueNames([
    getAnimeGenres(anime),
    getAnimeThemes(anime)
  ]);
}

export function getPrimaryStudio(anime = {}) {
  return getAnimeStudios(anime)[0] || '';
}

export function productionSearchText(anime = {}) {
  return uniqueNames([
    getAnimeStudios(anime),
    getAnimeProducers(anime),
    getAnimeLicensors(anime),
    getAnimeNetworks(anime)
  ]).join(' ');
}
