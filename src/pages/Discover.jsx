import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Sparkles,
  Trophy,
  Gem,
  Building2,
  Dna,
  Shuffle,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  LibraryBig,
  Star,
  Heart,
  Brain,
  Film,
  Flame,
  Radio,
  CalendarClock,
  RefreshCw,
  Grid2X2,
  List,
  } from 'lucide-react';
import { Poster } from '../components/Poster';
import { sameAnimeIdentity } from '../services/titleIdentity';
import { classifyAnimeRelease } from '../services/releaseState';
import { buildDiscoverPlan } from '../services/recommendationEngineV3';
import {
  applyLearnedSignals,
  hasSavedTitleDistinction,
  inferFeedbackTraits,
  recommendationKey
} from '../ai/intelligence/joeAIIntelligence';
import '../styles/discover.css';

const titleOf = (item = {}) => item.officialTitle || item.title || 'Unknown title';
const numericScore = (item = {}) => Number(item.communityScore ?? item.malScore ?? item.score ?? 0) || 0;
const memberCount = (item = {}) => Number(item.members ?? item.memberCount ?? item.popularityMembers ?? 0) || 0;

const personalScore = (item = {}) =>
  Number(item.joeScore ?? item.rating ?? item.finalScore ?? 0) || 0;

function daySeed() {
  const now = new Date();
  return Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`);
}

function sharedGenres(left = {}, right = {}) {
  const rightGenres = new Set((right.genres || []).map((genre) => String(genre).toLowerCase()));
  return (left.genres || []).filter((genre) => rightGenres.has(String(genre).toLowerCase()));
}

function normalizeTitle(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTitleWithoutArticles(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function canonicalSeasonTitle(value = '') {
  let text = String(value).toLowerCase();

  // Normalize common sequel naming styles.
  text = text
    .replace(/\bfirst season\b/g, ' season 1 ')
    .replace(/\bsecond season\b/g, ' season 2 ')
    .replace(/\bthird season\b/g, ' season 3 ')
    .replace(/\bfourth season\b/g, ' season 4 ')
    .replace(/\bfifth season\b/g, ' season 5 ')
    .replace(/\b1st season\b/g, ' season 1 ')
    .replace(/\b2nd season\b/g, ' season 2 ')
    .replace(/\b3rd season\b/g, ' season 3 ')
    .replace(/\b4th season\b/g, ' season 4 ')
    .replace(/\b5th season\b/g, ' season 5 ')
    .replace(/\bseason\s*([0-9]+)\b/g, ' season $1 ');

  // Common title aliases that appear differently between older library data
  // and current Kitsu/catalog metadata.
  text = text
    .replace(/\btybw\b/g, ' thousand year blood war ')
    .replace(/\bthousand[-\s]?year blood war\b/g, ' thousand year blood war ');

  return text.replace(/[^a-z0-9]+/g, '');
}

function normalizedWords(value = '') {
  let text = String(value).toLowerCase();

  text = text
    .replace(/\bfirst season\b/g, ' season 1 ')
    .replace(/\bsecond season\b/g, ' season 2 ')
    .replace(/\bthird season\b/g, ' season 3 ')
    .replace(/\bfourth season\b/g, ' season 4 ')
    .replace(/\bfifth season\b/g, ' season 5 ')
    .replace(/\b1st season\b/g, ' season 1 ')
    .replace(/\b2nd season\b/g, ' season 2 ')
    .replace(/\b3rd season\b/g, ' season 3 ')
    .replace(/\b4th season\b/g, ' season 4 ')
    .replace(/\b5th season\b/g, ' season 5 ')
    .replace(/\bseason\s*ii\b/g, ' season 2 ')
    .replace(/\bseason\s*iii\b/g, ' season 3 ')
    .replace(/\bseason\s*iv\b/g, ' season 4 ')
    .replace(/\bseason\s*v\b/g, ' season 5 ')
    .replace(/\btybw\b/g, ' thousand year blood war ')
    .replace(/\bthousand[-\s]?year blood war\b/g, ' thousand year blood war ')
    .replace(/\b(dubbed|dub|subbed|sub|uncut)\b/g, ' ');

  return text
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function titleFingerprints(value = '') {
  const raw = String(value || '');
  const variants = new Set([raw]);

  // Strip edition labels and subtitles that often differ between an older
  // library import and current catalog metadata.
  variants.add(raw.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));

  const subtitleParts = raw.split(/\s(?:-|–|—)\s|:/);
  if (subtitleParts[0]) variants.add(subtitleParts[0]);

  const fingerprints = new Set();

  variants.forEach((variant) => {
    const exact = normalizeTitle(variant);
    const articleFree = normalizeTitleWithoutArticles(variant);
    const canonical = canonicalSeasonTitle(variant);
    const words = normalizedWords(variant);

    if (exact) fingerprints.add(`exact:${exact}`);
    if (articleFree) fingerprints.add(`lite:${articleFree}`);
    if (canonical) fingerprints.add(`canonical:${canonical}`);
    if (words.length >= 3) fingerprints.add(`tokens:${[...words].sort().join('|')}`);
  });

  return fingerprints;
}

function explicitSeasonNumber(value = '') {
  const words = normalizedWords(value).join(' ');
  const match = words.match(/\bseason\s+([0-9]+)\b/);
  return match ? Number(match[1]) : null;
}

function strongTitleMatch(left = '', right = '') {
  const leftFingerprints = titleFingerprints(left);
  const rightFingerprints = titleFingerprints(right);

  if ([...leftFingerprints].some((key) => rightFingerprints.has(key))) {
    return true;
  }

  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  const leftCanonical = leftWords.join('');
  const rightCanonical = rightWords.join('');

  const shorterWords = leftWords.length <= rightWords.length ? leftWords : rightWords;
  const shorter = leftCanonical.length <= rightCanonical.length ? leftCanonical : rightCanonical;
  const longer = shorter === leftCanonical ? rightCanonical : leftCanonical;

  if (shorterWords.length < 3 || shorter.length < 10 || !longer.startsWith(shorter)) {
    return false;
  }

  const leftSeason = explicitSeasonNumber(left);
  const rightSeason = explicitSeasonNumber(right);

  // Never collapse two explicitly different seasons.
  if (leftSeason !== null && rightSeason !== null && leftSeason !== rightSeason) {
    return false;
  }

  // Prefix matching handles titles such as:
  // "Solo Leveling Season 2" vs
  // "Solo Leveling Season 2: Arise from the Shadow".
  return true;
}

function rawTitles(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.japaneseTitle,
    ...(item.titleSynonyms || []),
    ...(item.synonyms || []),
    ...((item.titles || []).map((entry) =>
      typeof entry === 'string' ? entry : entry?.title
    ))
  ].filter(Boolean);
}

function allTitleKeys(item = {}) {
  const keys = new Set();

  rawTitles(item).forEach((title) => {
    const exact = normalizeTitle(title);
    const articleFree = normalizeTitleWithoutArticles(title);

    if (exact) keys.add(`title:${exact}`);
    if (articleFree) keys.add(`title-lite:${articleFree}`);
  });

  return [...keys];
}

function inferredMalIds(item = {}) {
  const ids = new Set();
  const direct = item.malId || item.mal_id;

  if (direct) ids.add(String(direct));

  const rawId = String(item.id || '');

  // Library entries created from catalog cards commonly use IDs such as
  // "anime-14513", while catalog rows retain malId: 14513.
  const embeddedMalId = rawId.match(/(?:anime|catalog-mal|mal)[-_]?(\d+)$/i);
  if (embeddedMalId) ids.add(embeddedMalId[1]);

  // Some older imports used the MAL number itself as the local ID.
  if (/^\d+$/.test(rawId)) ids.add(rawId);

  return [...ids];
}

function identityKeys(item = {}) {
  const keys = new Set(allTitleKeys(item));
  const id = item.id;

  if (item.kitsuId) keys.add(`kitsu:${String(item.kitsuId)}`);
  const embeddedKitsuId = String(id || '').match(/(?:anime-kitsu|catalog-kitsu|kitsu)[-_]?(\d+)$/i);
  if (embeddedKitsuId) keys.add(`kitsu:${embeddedKitsuId[1]}`);
  inferredMalIds(item).forEach((malId) => keys.add(`mal:${malId}`));
  if (id) keys.add(`id:${String(id)}`);

  return keys;
}


const LIVE_DISCOVER_CACHE_KEY = 'joeanime-live-discover-cache-v1';
const LIVE_DISCOVER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readLiveDiscoverCacheSnapshot() {
  try {
    const raw = localStorage.getItem(LIVE_DISCOVER_CACHE_KEY);
    if (!raw) return { rows: [], savedAt: 0 };

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

    if (!rows.length) return { rows: [], savedAt };

    // Keep stale cache as a fallback if live providers are unavailable.
    // The timestamp is still retained so the UI can decide when to refresh.
    return {
      rows: rows.filter(isValidCatalogEntry),
      savedAt
    };
  } catch (error) {
    console.warn('Could not read live Discover cache.', error);
    return { rows: [], savedAt: 0 };
  }
}

function writeLiveDiscoverCache(rows = [], savedAt = Date.now()) {
  try {
    const validRows = (rows || []).filter(isValidCatalogEntry);

    localStorage.setItem(
      LIVE_DISCOVER_CACHE_KEY,
      JSON.stringify({
        savedAt,
        rows: validRows
      })
    );
  } catch (error) {
    console.warn('Could not save live Discover cache.', error);
  }
}

function liveDiscoverCacheIsFresh() {
  const { savedAt } = readLiveDiscoverCacheSnapshot();
  return Boolean(savedAt && Date.now() - savedAt < LIVE_DISCOVER_CACHE_MAX_AGE_MS);
}

const DELETED_CATALOG_TITLES = new Set([
  'delete',
  'deleted',
  '[deleted]',
  'removed',
  '[removed]'
]);

function catalogImageUrls(item = {}) {
  return [
    item.cover,
    item.poster,
    item.posterImage,
    item.coverImage,
    item.image,
    item.images?.jpg?.image_url,
    item.images?.jpg?.large_image_url,
    item.images?.webp?.image_url,
    item.images?.webp?.large_image_url
  ]
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'string') return [value];

      return [
        value.original,
        value.large,
        value.medium,
        value.small,
        value.tiny
      ].filter(Boolean);
    })
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function isDeletedCatalogEntry(item = {}) {
  const rawTitle = String(
    item.officialTitle ||
    item.title ||
    item.canonicalTitle ||
    ''
  ).trim();

  const normalizedTitle = rawTitle.toLowerCase();

  if (!rawTitle || DELETED_CATALOG_TITLES.has(normalizedTitle)) {
    return true;
  }

  if (/^\[?(?:delete|deleted|removed)\]?$/i.test(rawTitle)) {
    return true;
  }

  const slug = String(item.slug || '').trim().toLowerCase();
  if (DELETED_CATALOG_TITLES.has(slug)) {
    return true;
  }

  const imageUrls = catalogImageUrls(item);
  const onlyDeletedPlaceholders =
    imageUrls.length > 0 &&
    imageUrls.every((url) =>
      /image[-_ ]?missing|missing[-_ ]?image|deleted|placeholder/i.test(url)
    );

  // Do not reject normal upcoming titles merely because artwork is not ready.
  // Only treat a placeholder as a tombstone when the row also has no useful
  // descriptive or release metadata.
  if (
    onlyDeletedPlaceholders &&
    !(item.synopsis || item.description || item.airedFrom || item.startDate || item.year)
  ) {
    return true;
  }

  return false;
}

function isValidCatalogEntry(item = {}) {
  return Boolean(item && !isDeletedCatalogEntry(item));
}

function uniqueCatalog(items = []) {
  const unique = [];

  items.forEach((item) => {
    if (!isValidCatalogEntry(item)) return false;

    const keys = identityKeys(item);
    if (!keys.size) return;
    if (unique.some((candidate) => sameAnimeIdentity(candidate, item))) return;
    unique.push(item);
  });

  return unique;
}

function cardKey(item = {}) {
  return String(item.kitsuId || item.malId || item.id || normalizeTitle(titleOf(item)));
}

function franchiseKey(item = {}) {
  const words = normalizedWords(titleOf(item)).filter((word) => ![
    'season', 'part', 'movie', 'film', 'final', 'special', 'ova', 'ona',
    'episode', 'episodes', 'cour', 'arc', 'chapter', 'the', 'a', 'an'
  ].includes(word) && !/^\d+$/.test(word));

  // Three distinctive words are enough to group obvious franchise entries
  // without collapsing unrelated titles that share one generic word.
  return words.slice(0, 3).join('|') || cardKey(item);
}

const DISCOVER_REJECTION_REASONS = [
  { value: 'too_dark', label: 'Too dark' },
  { value: 'too_long', label: 'Too long' },
  { value: 'too_romantic', label: 'Too romantic' },
  { value: 'wrong_mood', label: 'Wrong mood' },
  { value: 'bad_match', label: 'Bad match' }
];

function DiscoverCard({
  item,
  onOpen,
  onAddWatching,
  onToggleFollow,
  onRecommendationFeedback,
  feedbackSource = 'Discover',
  adding = false,
  following = false,
  showRelease = false
}) {
  const score = numericScore(item);
  const intelligence = item.joeAIRecommendation || null;
  const receipt = intelligence?.confidenceReceipt || null;
  const [whyOpen, setWhyOpen] = useState(false);
  const [feedbackMenuOpen, setFeedbackMenuOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState(
    intelligence?.feedbackAction || ''
  );
  const release = classifyAnimeRelease(item);

  useEffect(() => {
    setFeedbackStatus(intelligence?.feedbackAction || '');
  }, [intelligence?.feedbackAction, item.kitsuId, item.malId, item.id]);

  async function sendFeedback(event, action, reason = '') {
    event?.stopPropagation();
    if (!onRecommendationFeedback) return;

    if (action === 'not_for_me' && !reason) {
      setFeedbackMenuOpen((current) => !current);
      return;
    }

    const saved = await onRecommendationFeedback(item, action, reason, feedbackSource);
    if (!saved) return;
    setFeedbackStatus(action);
    setFeedbackMenuOpen(false);
  }

  return (
    <article className={`discoverCard ${intelligence ? 'discoverSmartCard' : ''}`} onClick={() => onOpen(item)}>
      <div className="discoverPosterWrap">
        <Poster anime={item} className="discoverPoster" mode="thumb" />
        {score > 0 && <span className="discoverScore">★ {score.toFixed(2)}</span>}
        {intelligence?.tasteMatch > 0 && (
          <span className="discoverTasteBadge">{intelligence.tasteMatch}% match</span>
        )}
        {showRelease && (
          <span className={`discoverReleaseBadge release-${release.key}`}>
            <CalendarClock /> {release.label} · {release.dateText}
          </span>
        )}
      </div>

      <div className="discoverCardCopy">
        <strong>{titleOf(item)}</strong>
        <small>{(item.genres || []).slice(0, 2).join(' + ') || item.studio || 'Recommendation catalog'}</small>
        <span>
          {item.year && <b>{item.year}</b>}
          {item.type && <b>{item.type}</b>}
          {(item.episodeCount || item.episodes) && <b>{item.episodeCount || item.episodes} eps</b>}
        </span>

        {intelligence && (
          <div className="discoverCardIntelligence">
            <div className="discoverCardConfidence">
              <span>Prediction <strong>{receipt?.predictionConfidence || intelligence.tasteMatch}%</strong></span>
              <span>{receipt?.genomeTier || 'Metadata only'}</span>
            </div>

            <p>
              {intelligence.reasons?.[0]
                || `JoeAI sees a ${intelligence.tasteMatch}% taste match.`}
            </p>

            <button
              type="button"
              className="discoverWhyButton"
              onClick={(event) => {
                event.stopPropagation();
                setWhyOpen((current) => !current);
              }}
            >
              {whyOpen ? 'Hide reasoning' : 'Why this?'}
            </button>

            {whyOpen && (
              <div className="discoverWhyPanel" onClick={(event) => event.stopPropagation()}>
                {(intelligence.reasons || []).map((reason) => (
                  <span key={reason}>✓ {reason}</span>
                ))}
                {(intelligence.warnings || []).map((warning) => (
                  <span key={warning} className="warning">⚠ {warning}</span>
                ))}
                {receipt && (
                  <small>
                    Data {receipt.dataConfidence}% · Prediction {receipt.predictionConfidence}% · {receipt.genomeTier}
                  </small>
                )}
              </div>
            )}
          </div>
        )}

        <div className="discoverCardActions">
          <button
            type="button"
            className="discoverQuickAdd"
            disabled={adding}
            onClick={(event) => {
              event.stopPropagation();
              onAddWatching?.(item);
            }}
          >
            {adding ? 'Adding...' : '+ Watching'}
          </button>

          <button
            type="button"
            className={`discoverFollowButton ${following ? 'active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow?.(item);
            }}
          >
            {following ? '🔔 Following' : '🔔 Follow'}
          </button>
        </div>

        {intelligence && onRecommendationFeedback && (
          <div className="discoverFeedbackControls" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={feedbackStatus === 'good_pick' ? 'active' : ''} onClick={(event) => sendFeedback(event, 'good_pick')}>
              👍 Good
            </button>
            <button type="button" className={feedbackStatus === 'not_for_me' ? 'active negative' : ''} onClick={(event) => sendFeedback(event, 'not_for_me')}>
              👎 Not for Me
            </button>
            <button type="button" onClick={(event) => sendFeedback(event, 'already_seen')}>
              ✓ Seen
            </button>
            <button type="button" className={feedbackStatus === 'maybe_later' ? 'active' : ''} onClick={(event) => sendFeedback(event, 'maybe_later')}>
              ◷ Later
            </button>

            {feedbackMenuOpen && (
              <div className="discoverFeedbackReasonMenu">
                <strong>What missed?</strong>
                {DISCOVER_REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={(event) => sendFeedback(event, 'not_for_me', reason.value)}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            )}

            {feedbackStatus && (
              <small className="discoverFeedbackSaved">
                Saved: {String(feedbackStatus).replace(/_/g, ' ')}
              </small>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Shelf({
  icon,
  title,
  subtitle,
  items,
  onOpen,
  onBrowse,
  onAddWatching,
  onToggleFollow,
  onRecommendationFeedback,
  addingKey
}) {
  const railRef = useRef(null);

  function slide(direction) {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.82, 620),
      behavior: 'smooth'
    });
  }

  if (!items.length) return null;

  return (
    <section className="discoverShelf">
      <div className="discoverShelfHeader">
        <div>
          <h2>{icon}{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="discoverShelfActions">
          {onBrowse && (
            <button type="button" className="discoverBrowseLink" onClick={onBrowse}>
              View All
            </button>
          )}
          <button type="button" className="discoverArrow" aria-label={`Scroll ${title} left`} onClick={() => slide(-1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="discoverArrow" aria-label={`Scroll ${title} right`} onClick={() => slide(1)}>
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="discoverRailViewport">
        <div className="discoverRail" ref={railRef}>
          {items.map((item) => (
            <DiscoverCard
              key={cardKey(item)}
              item={item}
              onOpen={onOpen}
              onAddWatching={onAddWatching}
              onToggleFollow={onToggleFollow}
              onRecommendationFeedback={onRecommendationFeedback}
              feedbackSource={`Discover shelf: ${title}`}
              following={Boolean(item.followed)}
              adding={addingKey === cardKey(item)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LiveDiscoverBrowser({
  mode,
  items,
  studios,
  genres,
  onBack,
  onOpen,
  onAddWatching,
  onToggleFollow,
  addingKey
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(mode === 'upcoming' ? 'release' : 'score');
  const [studio, setStudio] = useState('');
  const [genre, setGenre] = useState('');
  const [viewMode, setViewMode] = useState('poster');

  const filtered = useMemo(() => {
    let results = [...items];
    const clean = query.trim().toLowerCase();

    if (clean) {
      results = results.filter((item) => [
        titleOf(item),
        item.studio,
        ...(item.genres || [])
      ].filter(Boolean).join(' ').toLowerCase().includes(clean));
    }

    if (studio) results = results.filter((item) => item.studio === studio || (item.studios || []).includes(studio));
    if (genre) results = results.filter((item) => (item.genres || []).includes(genre));

    if (sort === 'release') {
      results.sort((a, b) => new Date(a.airedFrom || '9999-12-31') - new Date(b.airedFrom || '9999-12-31'));
    } else if (sort === 'popularity') {
      results.sort((a, b) => memberCount(b) - memberCount(a));
    } else if (sort === 'studio') {
      results.sort((a, b) => String(a.studio || '').localeCompare(String(b.studio || '')) || titleOf(a).localeCompare(titleOf(b)));
    } else {
      results.sort((a, b) => numericScore(b) - numericScore(a));
    }

    return results;
  }, [items, query, sort, studio, genre]);

  return (
    <section className="discoverLiveHub">
      <header className="discoverLiveHeader">
        <div>
          <p className="discoverEyebrow">Live Discover</p>
          <h2>{mode === 'airing' ? <><Radio /> Airing Now</> : <><CalendarClock /> Coming Soon</>}</h2>
          <span>{filtered.length} title{filtered.length === 1 ? '' : 's'} · live Discover catalog</span>
        </div>
        <button type="button" className="discoverBackButton" onClick={onBack}>← Recommendations</button>
      </header>

      <div className="discoverLiveToolbar">
        <label className="discoverSearch">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search live titles..." />
        </label>

        <select value={genre} onChange={(event) => setGenre(event.target.value)}>
          <option value="">All genres</option>
          {genres.map(([name]) => <option key={name} value={name}>{name}</option>)}
        </select>

        <select value={studio} onChange={(event) => setStudio(event.target.value)}>
          <option value="">All studios</option>
          {studios.map(([name]) => <option key={name} value={name}>{name}</option>)}
        </select>

        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="release">Release date</option>
          <option value="score">Score</option>
          <option value="popularity">Popularity</option>
          <option value="studio">Studio</option>
        </select>

        <div className="discoverViewToggle">
          <button type="button" className={viewMode === 'poster' ? 'active' : ''} onClick={() => setViewMode('poster')}><Grid2X2 /> Poster</button>
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List /> List</button>
        </div>
      </div>

      {viewMode === 'poster' ? (
        <div className="discoverLiveGrid">
          {filtered.map((item) => (
            <DiscoverCard
              key={cardKey(item)}
              item={item}
              onOpen={onOpen}
              onAddWatching={onAddWatching}
              onToggleFollow={onToggleFollow}
              following={Boolean(item.followed)}
              adding={addingKey === cardKey(item)}
              showRelease
            />
          ))}
        </div>
      ) : (
        <div className="discoverLiveList">
          {filtered.map((item) => (
            <article key={cardKey(item)} onClick={() => onOpen(item)}>
              <Poster anime={item} className="discoverLiveListPoster" mode="thumb" />
              <div>
                <h3>{titleOf(item)}</h3>
                <p>{[item.studio, (item.genres || []).slice(0, 3).join(' • ')].filter(Boolean).join(' · ')}</p>
                <small>{item.airedFrom ? new Date(item.airedFrom).toLocaleDateString() : (item.status || 'Date TBA')}</small>
              </div>
              <strong>{numericScore(item) ? `★ ${numericScore(item).toFixed(2)}` : 'Unscored'}</strong>
              <div className="discoverLiveListActions">
                <button type="button" onClick={(event) => { event.stopPropagation(); onAddWatching(item); }}>+ Watching</button>
                <button type="button" className={item.followed ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onToggleFollow(item); }}>{item.followed ? '🔔 Following' : '🔔 Follow'}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!filtered.length && <div className="discoverEmpty">No live titles matched these filters.</div>}
    </section>
  );
}

function CatalogBrowser({
  catalog,
  initialCollection,
  studios,
  genres,
  onClose,
  onOpenTitle,
  onAddWatching,
  onToggleFollow,
  addingKey
}) {
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState(initialCollection || { type: 'all', value: 'Entire Catalog' });
  const [sort, setSort] = useState('rating');

  const filtered = useMemo(() => {
    let results = [...catalog];

    if (collection.type === 'studio') {
      results = results.filter((item) => item.studio === collection.value);
    }

    if (collection.type === 'genre') {
      results = results.filter((item) => (item.genres || []).includes(collection.value));
    }

    if (collection.type === 'hidden') {
      results = results.filter((item) => {
        const members = memberCount(item);
        const popularityRank = Number(item.popularity || 0);

        return (
          numericScore(item) >= 7.2 &&
          (
            (members > 0 && members < 80000) ||
            (members <= 0 && popularityRank >= 1500)
          )
        );
      });
    }

    const clean = query.trim().toLowerCase();
    if (clean) {
      results = results.filter((item) => {
        const haystack = [
          titleOf(item),
          item.studio,
          ...(item.genres || []),
          ...(item.titleSynonyms || [])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(clean);
      });
    }

    if (sort === 'rating') {
      results.sort((a, b) => numericScore(b) - numericScore(a));
    } else if (sort === 'title') {
      results.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    } else if (sort === 'year-new') {
      results.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    } else if (sort === 'year-old') {
      results.sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999));
    }

    return results;
  }, [catalog, collection, query, sort]);

  return (
    <div className="discoverCatalogOverlay" role="dialog" aria-modal="true" aria-labelledby="discoverCatalogTitle">
      <section className="discoverCatalogModal">
        <header className="discoverCatalogHeader">
          <div>
            <p>JoeAI Recommendation Catalog</p>
            <h2 id="discoverCatalogTitle"><LibraryBig /> {collection.value || 'Entire Catalog'}</h2>
            <span>{filtered.length} unseen titles</span>
          </div>

          <button type="button" className="discoverCatalogClose" onClick={onClose} aria-label="Close catalog browser">
            <X />
          </button>
        </header>

        <div className="discoverCatalogToolbar">
          <label className="discoverSearch">
            <Search />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, studio, genre..."
            />
          </label>

          <select
            value={`${collection.type}|${collection.value}`}
            onChange={(event) => {
              const [type, ...rest] = event.target.value.split('|');
              setCollection({ type, value: rest.join('|') });
            }}
          >
            <option value="all|Entire Catalog">Entire Catalog</option>
            <option value="hidden|Hidden Gems">Hidden Gems</option>
            <optgroup label="Genres">
              {genres.map(([name]) => <option key={`genre-${name}`} value={`genre|${name}`}>{name}</option>)}
            </optgroup>
            <optgroup label="Studios">
              {studios.map(([name]) => <option key={`studio-${name}`} value={`studio|${name}`}>{name}</option>)}
            </optgroup>
          </select>

          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="rating">Highest Rated</option>
            <option value="title">Title A–Z</option>
            <option value="year-new">Newest First</option>
            <option value="year-old">Oldest First</option>
          </select>
        </div>

        <div className="discoverCatalogGrid">
          {filtered.map((item) => (
            <DiscoverCard
              key={cardKey(item)}
              item={item}
              onOpen={onOpenTitle}
              onAddWatching={onAddWatching}
              onToggleFollow={onToggleFollow}
              following={Boolean(item.followed)}
              adding={addingKey === cardKey(item)}
            />
          ))}
        </div>

        {!filtered.length && (
          <div className="discoverEmpty">
            No unseen catalog titles matched this search.
          </div>
        )}
      </section>
    </div>
  );
}

export function Discover({
  anime = [],
  catalog = [],
  setSelected,
  setView,
  updateAnime,
  updateCatalogAnime,
  joeAIState = {},
  onRecommendationFeedback,
  fetchMoreCatalogTitles,
  refreshLiveDiscover
}) {
  const initialLiveCache = useRef(readLiveDiscoverCacheSnapshot()).current;
  const [catalogBrowser, setCatalogBrowser] = useState(null);
  const [addingKey, setAddingKey] = useState('');
  const [fetchingMore, setFetchingMore] = useState(false);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [hubMode, setHubMode] = useState('recommendations');
  const [surpriseMenuOpen, setSurpriseMenuOpen] = useState(false);
  const [lastSurpriseKey, setLastSurpriseKey] = useState('');
  const [dailyFeedbackMenuOpen, setDailyFeedbackMenuOpen] = useState(false);
  const [liveState, setLiveState] = useState(
    initialLiveCache.rows.length ? 'cached' : 'idle'
  );
  const [liveCatalog, setLiveCatalog] = useState(() => {
    if (initialLiveCache.rows.length) return initialLiveCache.rows;

    return (catalog || []).filter((item) =>
      item?.discoverBucket === 'current' ||
      item?.discoverBucket === 'upcoming'
    );
  });

  useEffect(() => {
    const tagged = (catalog || []).filter((item) =>
      item?.discoverBucket === 'current' ||
      item?.discoverBucket === 'upcoming'
    );

    if (tagged.length) {
      setLiveCatalog(tagged);
      const newestSync = Math.max(
        0,
        ...tagged.map((item) => new Date(item.discoverSyncedAt || 0).getTime() || 0)
      );
      if (newestSync) writeLiveDiscoverCache(tagged, newestSync);
      setLiveState((current) =>
        current === 'idle' || current === 'cached' ? 'cached' : current
      );
    }
  }, [catalog]);

  useEffect(() => {
    if (!refreshLiveDiscover) return;
    if (liveDiscoverCacheIsFresh()) return;

    const lastSync = new Date(
      localStorage.getItem('joeanime-discover-live-synced-at') || 0
    ).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!Number.isFinite(lastSync) || Date.now() - lastSync > oneDay) {
      void refreshLive();
    }
  }, []);

  const libraryLookup = useMemo(() => {
    const kitsuIds = new Set();
    const malIds = new Set();
    const allFingerprints = new Set();
    const legacyFingerprints = new Set();
    const legacyTitles = [];

    anime.forEach((item) => {
      const kitsuId = item.kitsuId || item.kitsu_id;
      if (kitsuId) kitsuIds.add(String(kitsuId));
      const ids = inferredMalIds(item);
      ids.forEach((id) => malIds.add(String(id)));

      // Always retain exact title fingerprints. Some older library rows and
      // catalog rows disagree on MAL IDs even though they are the same title.
      rawTitles(item).forEach((title) => {
        titleFingerprints(title).forEach((key) => allFingerprints.add(key));

        if (!ids.length) {
          legacyTitles.push(title);
          titleFingerprints(title).forEach((key) => legacyFingerprints.add(key));
        }
      });
    });

    return { kitsuIds, malIds, allFingerprints, legacyFingerprints, legacyTitles };
  }, [anime]);

  const discoverCatalog = useMemo(() => {
    const validLiveCatalog = (liveCatalog || []).filter(isValidCatalogEntry);

    const overlaid = (catalog || [])
      .filter(isValidCatalogEntry)
      .map((item) => {
      const live = validLiveCatalog.find((candidate) =>
        sameAnimeIdentity(candidate, item)
      );

      return live ? { ...item, ...live, id: item.id || live.id } : item;
    });

    const missingLiveRows = validLiveCatalog.filter((item) =>
      !overlaid.some((candidate) => sameAnimeIdentity(candidate, item))
    );

    return uniqueCatalog([...overlaid, ...missingLiveRows]);
  }, [catalog, liveCatalog]);

  const unseenCatalog = useMemo(() => {
    const validCatalog = uniqueCatalog(
      (discoverCatalog || []).filter((item) => item && titleOf(item))
    );

    return validCatalog.filter((item) => {
      if (applyLearnedSignals(item, joeAIState).excluded) {
        return false;
      }

      const catalogMalIds = inferredMalIds(item);
      const catalogKitsuId = item.kitsuId || item.kitsu_id;

      if (catalogKitsuId && libraryLookup.kitsuIds.has(String(catalogKitsuId))) {
        return false;
      }

      if (
        catalogMalIds.length &&
        catalogMalIds.some((id) => libraryLookup.malIds.has(String(id)))
      ) {
        return false;
      }

      const catalogTitles = rawTitles(item);

      // Exact/canonical title fingerprints are checked even when the catalog
      // has a MAL ID. This catches legacy imports whose stored MAL ID is absent,
      // stale, or represented by a local anime-* ID.
      const exactTitleMatch = catalogTitles.some((title) =>
        [...titleFingerprints(title)].some((key) =>
          libraryLookup.allFingerprints.has(key)
        )
      );

      if (exactTitleMatch) return false;

      // If the catalog entry has an unmatched MAL ID, preserve legitimate
      // sequels. Broader fuzzy matching is only needed for ID-less legacy rows.
      if (catalogKitsuId || catalogMalIds.length) return true;

      const legacyFingerprintMatch = catalogTitles.some((title) =>
        [...titleFingerprints(title)].some((key) =>
          libraryLookup.legacyFingerprints.has(key)
        )
      );

      if (legacyFingerprintMatch) return false;

      return !catalogTitles.some((catalogTitle) =>
        libraryLookup.legacyTitles.some((libraryTitle) =>
          !hasSavedTitleDistinction(catalogTitle, libraryTitle, joeAIState)
          && strongTitleMatch(catalogTitle, libraryTitle)
        )
      );
    });
  }, [discoverCatalog, joeAIState, libraryLookup]);

  const airingNow = useMemo(
    () => [...unseenCatalog]
      .filter((item) => item.discoverBucket === 'current')
      .sort((a, b) => {
        const scoreDifference = numericScore(b) - numericScore(a);
        if (scoreDifference !== 0) return scoreDifference;
        return memberCount(b) - memberCount(a);
      })
      .slice(0, 24),
    [unseenCatalog]
  );

  const comingSoon = useMemo(
    () => [...unseenCatalog]
      .filter((item) => item.discoverBucket === 'upcoming')
      .sort((a, b) => {
        const left = new Date(a.airedFrom || '9999-12-31').getTime();
        const right = new Date(b.airedFrom || '9999-12-31').getTime();
        return left - right || numericScore(b) - numericScore(a);
      })
      .slice(0, 24),
    [unseenCatalog]
  );

  const highestRated = useMemo(
    () => [...unseenCatalog]
      .filter((item) => numericScore(item) > 0)
      .sort((a, b) => numericScore(b) - numericScore(a))
      .slice(0, 24),
    [unseenCatalog]
  );

  const hiddenGems = useMemo(
    () => [...unseenCatalog]
      .filter((item) => {
        const members = memberCount(item);
        const popularityRank = Number(item.popularity || 0);

        const hasAudienceData = members > 0 || popularityRank > 0;
        const genuinelyLessPopular =
          (members > 0 && members < 80000) ||
          (members <= 0 && popularityRank >= 1500);

        return (
          hasAudienceData &&
          genuinelyLessPopular &&
          numericScore(item) >= 7.2
        );
      })
      .sort((a, b) => {
        const scoreDifference = numericScore(b) - numericScore(a);
        if (scoreDifference !== 0) return scoreDifference;

        return memberCount(a) - memberCount(b);
      })
      .slice(0, 24),
    [unseenCatalog]
  );

  const joeAIPicks = useMemo(() => {
    const genreWeights = {};
    const studioWeights = {};

    anime.forEach((item) => {
      const personal = Number(item.joeScore ?? item.rating ?? item.finalScore ?? 0);
      const weight = personal >= 9 ? 5 : personal >= 8 ? 3 : personal > 0 ? 1.5 : 0.5;

      (item.genres || []).forEach((genre) => {
        genreWeights[genre] = (genreWeights[genre] || 0) + weight;
      });

      if (item.studio) {
        studioWeights[item.studio] = (studioWeights[item.studio] || 0) + weight;
      }
    });

    return [...unseenCatalog]
      .map((item) => ({
        item,
        value:
          (item.genres || []).reduce((sum, genre) => sum + (genreWeights[genre] || 0), 0) * 3 +
          (studioWeights[item.studio] || 0) * 2 +
          numericScore(item) * 1.5
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 24)
      .map((entry) => entry.item);
  }, [anime, unseenCatalog]);

  const genres = useMemo(() => {
    const counts = new Map();
    unseenCatalog.forEach((item) => (item.genres || []).forEach((genre) => counts.set(genre, (counts.get(genre) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [unseenCatalog]);

  const studios = useMemo(() => {
    const counts = new Map();
    unseenCatalog.forEach((item) => {
      const names = [item.studio, ...(item.studios || [])].filter(Boolean);
      [...new Set(names)].forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [unseenCatalog]);

  const engineV3 = useMemo(() => buildDiscoverPlan({
    library: anime,
    candidates: unseenCatalog,
    daySeed: daySeed(),
    joeAIState
  }), [anime, unseenCatalog, joeAIState]);

  const dailyPick = engineV3.dailyPick;
  const primaryAnchor = engineV3.anchor;
  const topStudioName = engineV3.topStudio;
  const topStudioDisplay = studios.find(([name]) => name.toLowerCase() === topStudioName)?.[0] || topStudioName || 'Studio';

  const recommendationPlan = useMemo(() => {
    const claimed = [];
    const claimUnique = (items = []) => items.filter((item) => {
      const alreadyClaimed = claimed.some((candidate) => (
        cardKey(candidate) === cardKey(item)
        || sameAnimeIdentity(candidate, item)
      ));

      if (alreadyClaimed) return false;
      claimed.push(item);
      return true;
    });

    // The daily pick gets first claim so it is not repeated in a shelf.
    if (engineV3.dailyPick?.item) claimed.push(engineV3.dailyPick.item);

    // Claim shelf titles in the same order they are rendered. This final-page
    // guard keeps a title from leaking into multiple rows even if an engine or
    // cached catalog result supplies overlapping arrays.
    return {
      airingNow: claimUnique(engineV3.airingNow),
      comingSoon: claimUnique(engineV3.comingSoon),
      becauseYouLoved: claimUnique(engineV3.becauseYouLoved),
      joeAIPicks: claimUnique(engineV3.bestMatches),
      highestRated: claimUnique(engineV3.highestRated),
      hiddenGems: claimUnique(engineV3.hiddenGems),
      mindBenders: claimUnique(engineV3.mindBenders),
      emotionalDamage: claimUnique(engineV3.emotionalDamage),
      movieNight: claimUnique(engineV3.movieNight),
      studioSpotlight: claimUnique(engineV3.studioSpotlight)
    };
  }, [engineV3]);

  async function saveDiscoverFeedback(
    item,
    action,
    reason = '',
    sourcePrompt = 'Discover recommendation',
    announce = true
  ) {
    if (!item || !onRecommendationFeedback) return null;

    const intelligence = item.joeAIRecommendation || {};
    let saved;
    try {
      saved = await onRecommendationFeedback({
        animeKey: recommendationKey(item),
        title: titleOf(item),
        action,
        reason,
        traits: inferFeedbackTraits(item, reason),
        sourcePrompt,
        predictedMatch:
          intelligence.confidenceReceipt?.tasteMatch
          ?? intelligence.tasteMatch
          ?? item.match
          ?? null,
        algorithmVersion: 'discover-intelligence-v2'
      });
    } catch (error) {
      console.warn('Discover feedback save failed:', titleOf(item), error);
      if (announce) {
        setCatalogMessage(`JoeAI heard that feedback, but could not save it yet.`);
      }
      return null;
    }

    if (announce) {
      const messages = {
        good_pick: `JoeAI learned that ${titleOf(item)} looks like a good fit.`,
        not_for_me: `${titleOf(item)} was removed from future recommendations.`,
        already_seen: `${titleOf(item)} was marked as already seen and removed from Discover.`,
        maybe_later: `${titleOf(item)} was saved as a maybe-later pick.`,
        accepted: `JoeAI learned that you accepted ${titleOf(item)} from Discover.`
      };
      setCatalogMessage(messages[action] || `JoeAI saved your feedback for ${titleOf(item)}.`);
    }

    return saved;
  }

  async function saveDailyPickFeedback(action, reason = '') {
    if (!dailyPick?.item || !onRecommendationFeedback) return;
    if (action === 'not_for_me' && !reason) {
      setDailyFeedbackMenuOpen((current) => !current);
      return;
    }

    await saveDiscoverFeedback(
      {
        ...dailyPick.item,
        joeAIRecommendation: {
          tasteMatch: dailyPick.confidence,
          reasons: dailyPick.reasons,
          warnings: dailyPick.warnings,
          confidenceReceipt: dailyPick.confidenceReceipt
        }
      },
      action,
      reason,
      'JoeAI Pick of the Day'
    );
    setDailyFeedbackMenuOpen(false);
  }

  async function addWatching(item) {
    if (!updateAnime || !item) return;

    const key = cardKey(item);
    setAddingKey(key);
    setCatalogMessage('');

    try {
      const existing = anime.find((libraryItem) => sameAnimeIdentity(libraryItem, item));

      if (existing) {
        await updateAnime({
          ...existing,
          officialTitle: existing.officialTitle || item.officialTitle || titleOf(item),
          malId: existing.malId || existing.mal_id || item.malId || item.mal_id,
          cover: existing.cover || existing.imageUrl || item.cover || item.imageUrl,
          imageUrl: existing.imageUrl || existing.cover || item.imageUrl || item.cover,
          synopsis: existing.synopsis || item.synopsis,
          studio: existing.studio || item.studio,
          studios: (existing.studios?.length ? existing.studios : item.studios) || [],
          genres: (existing.genres?.length ? existing.genres : item.genres) || [],
          episodeCount: existing.episodeCount || existing.episodes || item.episodeCount || item.episodes,
          episodes: existing.episodes || existing.episodeCount || item.episodes || item.episodeCount,
          communityScore: existing.communityScore || existing.malScore || item.communityScore || item.malScore,
          malScore: existing.malScore || existing.communityScore || item.malScore || item.communityScore,
          status: 'Watching',
          kitsuId: existing.kitsuId || existing.kitsu_id || item.kitsuId || item.kitsu_id || '',
          recommendationAcceptedAt: new Date().toISOString(),
          recommendationSource: 'Discover',
          recommendationKey: recommendationKey(item),
          listUpdatedAt: new Date().toISOString()
        });

        await saveDiscoverFeedback(
          item,
          'accepted',
          '',
          'Discover add to Watching',
          false
        );
        setCatalogMessage(`✓ ${existing.title || titleOf(item)} was already in your Library — marked as Watching.`);
        return;
      }

      await updateAnime({
        ...item,
        id: item.kitsuId
          ? `anime-kitsu-${item.kitsuId}`
          : item.malId
            ? `anime-${item.malId}`
            : `anime-${normalizeTitle(titleOf(item))}`,
        title: titleOf(item),
        officialTitle: item.officialTitle || titleOf(item),
        status: 'Watching',
        favorite: false,
        rewatches: 0,
        finalRank: anime.length + 1,
        notes: item.notes || 'Added from Discover.',
        addedFrom: 'Discover',
        recommendationAcceptedAt: new Date().toISOString(),
        recommendationSource: 'Discover',
        recommendationKey: recommendationKey(item)
      });

      await saveDiscoverFeedback(
        item,
        'accepted',
        '',
        'Discover add to Watching',
        false
      );
      setCatalogMessage(`✓ Added ${titleOf(item)} as Watching.`);
    } catch (error) {
      console.warn('Discover quick add failed:', titleOf(item), error);
      setCatalogMessage(`Could not add ${titleOf(item)} yet.`);
    } finally {
      setAddingKey('');
    }
  }

  async function toggleFollow(item) {
    if (!updateCatalogAnime || !item) return;

    const existing = catalog.find((candidate) => sameAnimeIdentity(candidate, item));
    const persisted = existing || item;
    const following = !Boolean(persisted.followed);
    await updateCatalogAnime({
      ...item,
      ...persisted,
      id: persisted.id || item.id,
      kitsuId: persisted.kitsuId || item.kitsuId || '',
      followed: following,
      ignored: false,
      followedAt: following ? (persisted.followedAt || new Date().toISOString()) : '',
      listUpdatedAt: new Date().toISOString()
    });

    setCatalogMessage(
      following
        ? `🔔 Following ${titleOf(item)}.`
        : `Stopped following ${titleOf(item)}.`
    );
  }

  async function refreshLive() {
    if (!refreshLiveDiscover || refreshingLive) return;

    setRefreshingLive(true);
    setLiveState('loading');
    setCatalogMessage('Refreshing live anime feeds...');

    try {
      const result = await refreshLiveDiscover({ limitPerFeed: 80 });

      const refreshedLiveRows = (result.catalog || result.saved?.catalog || [])
        .filter((item) =>
          item?.discoverBucket === 'current' ||
          item?.discoverBucket === 'upcoming'
        );

      if (refreshedLiveRows.length) {
        setLiveCatalog(refreshedLiveRows);
        const previousSavedAt = readLiveDiscoverCacheSnapshot().savedAt;
        writeLiveDiscoverCache(
          refreshedLiveRows,
          result.received > 0 ? Date.now() : previousSavedAt
        );
      }

      setLiveState(result.state || (result.partial ? 'partial' : 'live'));

      const cacheNote = result.usedCache ? ' Cached Kitsu titles were kept for the unavailable feed.' : '';
      const providerNote = result.sources ? ` Sources: current ${result.sources.current}, upcoming ${result.sources.upcoming}.` : '';
      const partialNote = result.partial ? ' One or more feeds used a fallback or cache.' : '';

      setCatalogMessage(
        `✓ Live Discover ready: ${result.currentCount} current-season and ${result.upcomingCount} upcoming titles.${partialNote}${cacheNote}${providerNote}`
      );
    } catch (error) {
      console.warn('Live Discover refresh failed:', error);
      if (liveCatalog.length) {
        setLiveState('offline');
        setCatalogMessage('Kitsu is offline. Discover is safely showing the most recent cached catalog.');
      } else {
        setLiveState('error');
        setCatalogMessage(error?.message || 'Could not refresh live anime right now.');
      }
    } finally {
      setRefreshingLive(false);
    }
  }

  async function fetchMore() {
    if (!fetchMoreCatalogTitles || fetchingMore) return;

    setFetchingMore(true);
    setCatalogMessage('Fetching the next catalog page...');

    try {
      const result = await fetchMoreCatalogTitles({ limit: 25 });

      setCatalogMessage(
        result.added.length
          ? `✓ Added ${result.added.length} new catalog title${result.added.length === 1 ? '' : 's'} from ${result.provider || 'the live provider'}.`
          : result.received
            ? 'That page only contained titles already in your library or catalog. Try Fetch More again.'
            : 'Neither provider returned titles for that page.'
      );
    } catch (error) {
      console.warn('Fetch more catalog titles failed:', error);
      setCatalogMessage(error?.message || 'Could not fetch more titles right now.');
    } finally {
      setFetchingMore(false);
    }
  }

  function surpriseMe(mode = 'safe') {
    const pool = engineV3.surprisePools?.[mode] || [];
    if (!pool.length) {
      setCatalogMessage('JoeAI does not have enough matching catalog data for that surprise mode yet.');
      return;
    }

    const freshPool = pool.length > 1
      ? pool.filter((item) => cardKey(item) !== lastSurpriseKey)
      : pool;
    const item = freshPool[Math.floor(Math.random() * freshPool.length)] || pool[0];
    const labels = {
      safe: 'Safe Bet',
      hidden: 'Hidden Gem',
      wild: 'Wild Card',
      chaos: 'Pure Chaos'
    };

    setLastSurpriseKey(cardKey(item));
    setSurpriseMenuOpen(false);
    setCatalogMessage(`${labels[mode] || 'Surprise'}: ${titleOf(item)}`);
    setSelected?.(item);
  }

  function browse(type = 'all', value = 'Entire Catalog') {
    setCatalogBrowser({ type, value });
  }

  return (
    <section className="discoverPage">
      <section className="discoverHero compact">
        <div>
          <p className="discoverEyebrow">Recommendation Catalog</p>
          <h1><Compass /> Discover</h1>
          <p>Browse unseen anime from the catalog JoeAI uses to find your next favorite.</p>

          <div className="discoverHeroActions">
            <button type="button" className={hubMode === 'recommendations' ? 'primary' : ''} onClick={() => setHubMode('recommendations')}>
              <Sparkles /> Recommendations
            </button>
            <button type="button" className={hubMode === 'airing' ? 'primary' : ''} onClick={() => setHubMode('airing')}>
              <Radio /> Airing Now <b>{airingNow.length}</b>
            </button>
            <button type="button" className={hubMode === 'upcoming' ? 'primary' : ''} onClick={() => setHubMode('upcoming')}>
              <CalendarClock /> Coming Soon <b>{comingSoon.length}</b>
            </button>
            <button type="button" onClick={() => browse()}>
              <LibraryBig /> Browse Catalog
            </button>
            <button type="button" onClick={refreshLive} disabled={refreshingLive}>
              <RefreshCw className={refreshingLive ? 'discoverSpin' : ''} />
              {refreshingLive ? 'Checking providers...' : 'Refresh Live Anime'}
            </button>
            <button type="button" onClick={fetchMore} disabled={fetchingMore}>
              <LibraryBig /> {fetchingMore ? 'Fetching...' : 'Fetch More Titles'}
            </button>
            <div className="discoverSurpriseControl">
              <button
                type="button"
                className={surpriseMenuOpen ? 'active' : ''}
                onClick={() => setSurpriseMenuOpen((current) => !current)}
              >
                <Shuffle /> Surprise Me
              </button>

              {surpriseMenuOpen && (
                <div className="discoverSurpriseMenu">
                  <button type="button" onClick={() => surpriseMe('safe')}>
                    <strong>Safe Bet</strong>
                    <small>One of your strongest matches</small>
                  </button>
                  <button type="button" onClick={() => surpriseMe('hidden')}>
                    <strong>Hidden Gem</strong>
                    <small>Strong fit with a smaller audience</small>
                  </button>
                  <button type="button" onClick={() => surpriseMe('wild')}>
                    <strong>Wild Card</strong>
                    <small>A credible step outside your usual lane</small>
                  </button>
                  <button type="button" onClick={() => surpriseMe('chaos')}>
                    <strong>Pure Chaos</strong>
                    <small>Roll the entire healthy unseen catalog</small>
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setView?.('assistant')}>
              <Sparkles /> Ask JoeAI
            </button>
          </div>
          <div className={`discoverDataState state-${liveState}`} role="status">
            <span />
            {liveState === 'loading' && 'Refreshing Kitsu — saved titles remain available.'}
            {liveState === 'live' && 'Kitsu catalog is live and up to date.'}
            {liveState === 'cached' && 'Showing the saved Kitsu catalog while freshness is checked.'}
            {liveState === 'partial' && 'Kitsu returned partial data; cached rows filled the gaps.'}
            {liveState === 'offline' && 'Kitsu is unavailable; showing the last saved catalog.'}
            {liveState === 'error' && 'No live or cached Kitsu catalog is available yet.'}
            {liveState === 'idle' && 'Kitsu catalog is ready to refresh.'}
          </div>
          {catalogMessage && <p className="discoverCatalogMessage">{catalogMessage}</p>}
        </div>

        <div className="discoverHeroStats">
          <span><strong>{unseenCatalog.length}</strong>Unseen Titles</span>
          <span><strong>{genres.length}</strong>Genres</span>
          <span><strong>{studios.length}</strong>Studios</span>
        </div>
      </section>

      {hubMode !== 'recommendations' && (
        <LiveDiscoverBrowser
          mode={hubMode}
          items={hubMode === 'airing' ? airingNow : comingSoon}
          studios={studios}
          genres={genres}
          onBack={() => setHubMode('recommendations')}
          onOpen={setSelected}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
          onRecommendationFeedback={saveDiscoverFeedback}
          addingKey={addingKey}
        />
      )}

      {hubMode === 'recommendations' && (<>
      <Shelf
        icon={<Radio />}
        title="Airing Now"
        subtitle="Live current-season anime, ranked against your taste and filtered against your library."
        items={recommendationPlan.airingNow}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      <Shelf
        icon={<CalendarClock />}
        title="Coming Soon"
        subtitle="Upcoming anime JoeAI can start matching against your taste before they air."
        items={recommendationPlan.comingSoon}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      {dailyPick && (
        <section className="dailyPickHero">
          <div className="dailyPickBackdrop">
            <Poster anime={dailyPick.item} className="dailyPickBackdropPoster" mode="thumb" />
          </div>

          <div className="dailyPickContent">
            <p className="dailyPickEyebrow"><Star /> JoeAI Pick of the Day</p>
            <h2>{titleOf(dailyPick.item)}</h2>

            <div className="dailyPickMatch">
              <strong>{dailyPick.confidence}% Match</strong>
              <span>Chosen from your strongest Anime DNA signals</span>
            </div>

            {dailyPick.confidenceReceipt && (
              <div className="dailyPickConfidenceReceipt">
                <span>Data confidence <strong>{dailyPick.confidenceReceipt.dataConfidence}%</strong></span>
                <span>Prediction confidence <strong>{dailyPick.confidenceReceipt.predictionConfidence}%</strong></span>
                <span>{dailyPick.confidenceReceipt.genomeTier}</span>
              </div>
            )}

            <div className="dailyPickReasons">
              {(dailyPick.reasons.length ? dailyPick.reasons : [
                `Strong ${numericScore(dailyPick.item).toFixed(2)} community score`
              ]).map((reason) => (
                <span key={reason}>✓ {reason}</span>
              ))}
            </div>

            <div className="dailyPickActions">
              <button type="button" className="primary" onClick={() => setSelected?.(dailyPick.item)}>
                View Details
              </button>
              <button
                type="button"
                onClick={() => addWatching(dailyPick.item)}
                disabled={addingKey === cardKey(dailyPick.item)}
              >
                {addingKey === cardKey(dailyPick.item) ? 'Adding...' : '+ Watching'}
              </button>
              <button
                type="button"
                className={dailyPick.item.followed ? 'following' : ''}
                onClick={() => toggleFollow(dailyPick.item)}
              >
                {dailyPick.item.followed ? '🔔 Following' : '🔔 Follow'}
              </button>
              <button type="button" onClick={() => saveDailyPickFeedback('good_pick')}>
                👍 Good Pick
              </button>
              <button type="button" onClick={() => saveDailyPickFeedback('not_for_me')}>
                👎 Not for Me
              </button>
            </div>

            {dailyFeedbackMenuOpen && (
              <div className="dailyPickFeedbackReasons">
                <strong>What missed?</strong>
                {DISCOVER_REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => saveDailyPickFeedback('not_for_me', reason.value)}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dailyPickPoster">
            <Poster anime={dailyPick.item} mode="thumb" />
          </div>
        </section>
      )}

      {primaryAnchor && recommendationPlan.becauseYouLoved.length > 0 && (
        <Shelf
          icon={<Heart />}
          title={`Because You Loved ${titleOf(primaryAnchor)}`}
          subtitle={`Built from shared genres, studio signals, and your ${personalScore(primaryAnchor).toFixed(1)} rating.`}
          items={recommendationPlan.becauseYouLoved}
          onOpen={setSelected}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
          onRecommendationFeedback={saveDiscoverFeedback}
          addingKey={addingKey}
          onBrowse={() => browse('genre', (primaryAnchor.genres || [])[0] || 'Entire Catalog')}
        />
      )}

      <Shelf
        icon={<Sparkles />}
        title="JoeAI Picks"
        subtitle={anime.length
          ? 'Matched to the genres, studios, ratings, and patterns already visible in your library.'
          : 'Strong starting picks while JoeAI waits to learn your personal taste.'}
        items={recommendationPlan.joeAIPicks}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'JoeAI Picks')}
      />

      <Shelf
        icon={<Trophy />}
        title="Highest Rated"
        subtitle="Top community-rated anime you have not added yet."
        items={recommendationPlan.highestRated}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      <Shelf
        icon={<Gem />}
        title="Hidden Gems"
        subtitle="Well-rated titles with a genuinely smaller audience."
        items={recommendationPlan.hiddenGems}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('hidden', 'Hidden Gems')}
      />

      <Shelf
        icon={<Brain />}
        title="Mind Melters"
        subtitle="Psychological, mystery, supernatural, and sci-fi picks that make you work for it."
        items={recommendationPlan.mindBenders}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('genre', 'Psychological')}
      />

      <Shelf
        icon={<Flame />}
        title="Prepare for Emotional Damage"
        subtitle="Drama-heavy picks for when apparently feeling okay was getting boring."
        items={recommendationPlan.emotionalDamage}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('genre', 'Drama')}
      />

      <Shelf
        icon={<Film />}
        title="Movie Night"
        subtitle="Highly rated unseen anime movies from your catalog."
        items={recommendationPlan.movieNight}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        onRecommendationFeedback={saveDiscoverFeedback}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      {recommendationPlan.studioSpotlight.length > 0 && (
        <Shelf
          icon={<Building2 />}
          title={`${topStudioDisplay} Spotlight`}
          subtitle={`Unseen catalog titles from ${topStudioDisplay}.`}
          items={recommendationPlan.studioSpotlight}
          onOpen={setSelected}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
          onRecommendationFeedback={saveDiscoverFeedback}
          addingKey={addingKey}
          onBrowse={() => browse('studio', topStudioDisplay)}
        />
      )}

      <section className="discoverCollections compact">
        <article>
          <div className="discoverCollectionHeader">
            <h2><Building2 /> Browse Studios</h2>
            <button type="button" onClick={() => browse()}>All Catalog</button>
          </div>

          <div className="discoverChipRail">
            {studios.slice(0, 12).map(([name, count]) => (
              <button type="button" key={name} onClick={() => browse('studio', name)}>
                <span>{name}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
        </article>

        <article>
          <div className="discoverCollectionHeader">
            <h2><Dna /> Browse Genres</h2>
            <button type="button" onClick={() => browse()}>All Catalog</button>
          </div>

          <div className="discoverChipRail">
            {genres.slice(0, 12).map(([name, count]) => (
              <button type="button" key={name} onClick={() => browse('genre', name)}>
                <span>{name}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
        </article>
      </section>

      {!unseenCatalog.length && (
        <section className="discoverEmptyState">
          <h2>Discover is waiting for unseen catalog titles.</h2>
          <p>Run Update Database to build the recommendation catalog.</p>
        </section>
      )}

      </>)}

      {catalogBrowser && (
        <CatalogBrowser
          catalog={unseenCatalog}
          initialCollection={catalogBrowser}
          studios={studios}
          genres={genres}
          onClose={() => setCatalogBrowser(null)}
          onOpenTitle={(item) => {
            setCatalogBrowser(null);
            setSelected?.(item);
          }}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
          addingKey={addingKey}
        />
      )}
    </section>
  );
}
