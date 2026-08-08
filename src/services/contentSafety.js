export const CONTENT_SAFETY_MODES = [
  {
    id: 'kid-safe',
    label: 'Kid-safe',
    description: 'Only known G and PG titles. Unknown ratings are hidden.'
  },
  {
    id: 'teen',
    label: 'Teen',
    description: 'Allows G and PG titles. Unknown ratings may appear.'
  },
  {
    id: 'mature',
    label: 'Mature',
    description: 'Also allows R-rated titles, while explicit titles stay hidden.'
  },
  {
    id: 'unrestricted',
    label: 'Unrestricted',
    description: 'No content-rating filter is applied.'
  }
];

const VALID_MODES = new Set(CONTENT_SAFETY_MODES.map((mode) => mode.id));

export function normalizeContentSafetyMode(value = 'unrestricted') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : 'unrestricted';
}

function inferRatingFromGuide(guide = '') {
  const normalized = String(guide || '').trim().toLowerCase();
  if (!normalized) return '';

  if (/\b(18\+|adult|explicit|hentai)\b/.test(normalized)) return 'R18';
  if (/\b(17\+|mature|restricted)\b/.test(normalized)) return 'R';
  if (/\b(13\+|teen|parental guidance)\b/.test(normalized)) return 'PG';
  if (/\b(general|all ages)\b/.test(normalized)) return 'G';
  return '';
}

export function getContentRating(item = {}) {
  const rawRating = String(
    item.ageRating
    || item.age_rating
    || item.contentRating
    || ''
  ).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const guide = String(item.ageRatingGuide || item.age_rating_guide || '').trim();
  const nsfw = item.nsfw === true || String(item.nsfw || '').toLowerCase() === 'true';

  let rating = '';
  if (['R18', 'R18PLUS', 'RX', 'NC17'].includes(rawRating)) rating = 'R18';
  else if (['R', 'R17', 'MA', 'TVMA'].includes(rawRating)) rating = 'R';
  else if (['PG', 'PG13', 'TVPG', 'TV14'].includes(rawRating)) rating = 'PG';
  else if (['G', 'TVG', 'ALL'].includes(rawRating)) rating = 'G';
  else rating = inferRatingFromGuide(guide);

  if (nsfw) rating = 'R18';

  return {
    rating,
    label: rating || 'Not rated',
    guide,
    nsfw,
    known: Boolean(rating)
  };
}

export function isContentAllowed(item = {}, mode = 'unrestricted') {
  const normalizedMode = normalizeContentSafetyMode(mode);
  if (normalizedMode === 'unrestricted') return true;

  const rating = getContentRating(item);
  if (rating.nsfw || rating.rating === 'R18') return false;

  if (normalizedMode === 'kid-safe') {
    return rating.known && ['G', 'PG'].includes(rating.rating);
  }

  if (normalizedMode === 'teen') {
    return !rating.known || ['G', 'PG'].includes(rating.rating);
  }

  return !rating.known || ['G', 'PG', 'R'].includes(rating.rating);
}

export function filterContentBySafety(items = [], mode = 'unrestricted') {
  return (Array.isArray(items) ? items : []).filter((item) => isContentAllowed(item, mode));
}

export function contentSafetyModeLabel(mode = 'unrestricted') {
  const normalizedMode = normalizeContentSafetyMode(mode);
  return CONTENT_SAFETY_MODES.find((option) => option.id === normalizedMode)?.label || 'Unrestricted';
}
