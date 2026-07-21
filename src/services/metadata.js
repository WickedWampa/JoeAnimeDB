import { shouldPreferManualMetadata, manualMetadataToAnime } from './metadataResolver';
import { getManualMetadata } from '../data/manualMetadataOverrides';
import { fetchKitsuMetadata } from './kitsuProvider';
const SEARCH_FIXES = {
  "Bleach TYBW": "Bleach Sennen Kessen-hen",
  "Slime S2": "Tensei shitara Slime Datta Ken 2nd Season",
  "Slime S3": "Tensei shitara Slime Datta Ken 3rd Season",
  "That Time I Got Reincarnated as a Slime": "Tensei shitara Slime Datta Ken",
  "Reincarnated as a Slime Movie": "Tensei shitara Slime Datta Ken Movie",
  "Slime Diaries": "Tensura Nikki",
  "Mushoku Tensei": "Mushoku Tensei: Isekai Ittara Honki Dasu",
  "Mushoku Tensei S2": "Mushoku Tensei II",
  "Solo Leveling S2": "Solo Leveling Season 2",
  "SAO II": "Sword Art Online II",
  "SAO Alicization": "Sword Art Online: Alicization",
  "SAO War of Underworld": "Sword Art Online: Alicization - War of Underworld",
  "Fullmetal Alchemist Brotherhood": "Fullmetal Alchemist: Brotherhood",
  "Re:ZERO": "Re:Zero kara Hajimeru Isekai Seikatsu",
  "Code Geass": "Code Geass: Hangyaku no Lelouch",
  "Fate UBW": "Fate/stay night: Unlimited Blade Works",
  "Fate Zero": "Fate/Zero",
  "G Gundam": "Mobile Fighter G Gundam",
  "Gundam Wing": "Mobile Suit Gundam Wing",
  "Kill la Kill": "Kill la Kill",
  "Megalo Box": "Megalo Box",
  "Mob Psycho 100": "Mob Psycho 100",
  "Noragami": "Noragami",
  "One Punch Man": "One Punch Man",
  "Soul Eater": "Soul Eater"
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cleanTitle(title) {
  return (SEARCH_FIXES[title] || title)
    .replace(/\bS2\b/gi, 'Season 2')
    .replace(/\bS3\b/gi, 'Season 3')
    .replace(/\bTYBW\b/gi, 'Thousand-Year Blood War')
    .trim();
}

export function isRemoteCover(cover) {
  return typeof cover === 'string' && /^https?:\/\//i.test(cover);
}

export function needsArtworkRepair(anime) {
  // The seed file used local paths like covers/kill-la-kill.jpg, but those images
  // are not bundled yet. Treat non-http covers as repair candidates.
  return !isRemoteCover(anime?.cover);
}

function normalizedTitleKey(value = '') {
  return String(cleanTitle(value) || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function titleSimilarity(left = '', right = '') {
  const a = normalizedTitleKey(left);
  const b = normalizedTitleKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;

  if (longer.includes(shorter)) {
    return shorter.length / Math.max(longer.length, 1);
  }

  const aTokens = new Set(String(left).toLowerCase().match(/[a-z0-9]+/g) || []);
  const bTokens = new Set(String(right).toLowerCase().match(/[a-z0-9]+/g) || []);
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;

  return union ? intersection / union : 0;
}

export function pickBest(results, title) {
  if (!results || !results.length) return null;

  const ranked = results
    .map((item) => {
      const names = [
        item.title,
        item.title_english,
        item.title_japanese,
        ...(item.title_synonyms || [])
      ].filter(Boolean);

      return {
        item,
        similarity: Math.max(0, ...names.map((name) => titleSimilarity(name, title)))
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  return ranked[0]?.similarity >= 0.72 ? ranked[0].item : null;
}

const JIKAN_RETRY_DELAYS_MS = [0, 1400, 3200];
const JIKAN_TIMEOUT_MS = 18000;

async function fetchJikanWithRetry(url) {
  let lastError = null;

  for (let attempt = 0; attempt < JIKAN_RETRY_DELAYS_MS.length; attempt += 1) {
    if (JIKAN_RETRY_DELAYS_MS[attempt]) {
      await sleep(JIKAN_RETRY_DELAYS_MS[attempt]);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JIKAN_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.ok) return response;

      const error = new Error(`Jikan ${response.status}`);
      error.status = response.status;
      lastError = error;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === JIKAN_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = error?.name === 'AbortError' || status === 429 || status >= 500;

      if (!retryable || attempt === JIKAN_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Jikan metadata lookup failed');
}

export async function fetchMetadata(anime) {
  const title = anime?.title || anime?.officialTitle || '';
  const q = encodeURIComponent(cleanTitle(title));
  const url = `https://api.jikan.moe/v4/anime?q=${q}&limit=8&sfw=true`;

  try {
    const res = await fetchJikanWithRetry(url);
    const payload = await res.json();
    const match = pickBest(payload.data, title);

    if (!match) {
      throw new Error(`Jikan returned no confident title match for ${title}`);
    }

    const genres = [
      ...(match.genres || []),
      ...(match.themes || []),
      ...(match.demographics || [])
    ].map((g) => g?.name).filter(Boolean);

    const remoteCover =
      match.images?.webp?.large_image_url ||
      match.images?.jpg?.large_image_url ||
      match.images?.webp?.image_url ||
      match.images?.jpg?.image_url ||
      '';

    return {
      ...anime,
      malId: match.mal_id,
      officialTitle: match.title_english || match.title || title,
      titleSynonyms: [
        ...new Set([
          ...(anime.titleSynonyms || []),
          ...(match.title_synonyms || []),
          match.title_japanese
        ].filter(Boolean))
      ],
      cover: remoteCover || anime.cover || '',
      trailerUrl: match.trailer?.url || anime.trailerUrl || '',
      synopsis: match.synopsis || anime.synopsis || '',
      description: match.synopsis || anime.description || '',
      type: match.type || anime.type || 'TV',
      year: match.year || anime.year || '',
      episodeCount: match.episodes || anime.episodeCount || anime.episodes || 0,
      episodes: match.episodes || anime.episodes || anime.episodeCount || 0,
      communityScore: match.score || anime.communityScore || '',
      malScore: match.score || anime.malScore || anime.communityScore || '',
      studio: match.studios?.length
        ? match.studios.map((studio) => studio.name).filter(Boolean).join(' / ')
        : anime.studio || '',
      genres: genres.length
        ? [...new Set([...(anime.genres || []), ...genres])].slice(0, 12)
        : anime.genres || [],
      metadataSource: 'jikan',
      metadataNeedsRefresh: !genres.length,
      metadataUpdatedAt: new Date().toISOString()
    };
  } catch (jikanError) {
    console.warn(`Jikan metadata failed for ${title}; trying Kitsu.`, jikanError);

    try {
      return await fetchKitsuMetadata(anime);
    } catch (kitsuError) {
      const error = new Error(
        `Metadata lookup failed for ${title}. ` +
        `Jikan: ${jikanError?.message || jikanError}; ` +
        `Kitsu: ${kitsuError?.message || kitsuError}`
      );
      error.jikanError = jikanError;
      error.kitsuError = kitsuError;
      throw error;
    }
  }
}
