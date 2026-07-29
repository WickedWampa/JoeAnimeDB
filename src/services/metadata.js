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

export async function fetchMetadata(anime) {
  const title = anime?.title || anime?.officialTitle || '';
  const manual = getManualMetadata(title);

  if (manual && shouldPreferManualMetadata(title)) {
    return manualMetadataToAnime(anime, manual);
  }

  return fetchKitsuMetadata(anime);
}
