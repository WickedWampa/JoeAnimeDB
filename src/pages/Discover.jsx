import React, { useMemo, useRef, useState } from 'react';
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
  Flame
} from 'lucide-react';
import { Poster } from '../components/Poster';
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
  // and current Jikan/catalog metadata.
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

  inferredMalIds(item).forEach((malId) => keys.add(`mal:${malId}`));
  if (id) keys.add(`id:${String(id)}`);

  return keys;
}

function uniqueCatalog(items = []) {
  const seen = new Set();

  return items.filter((item) => {
    const keys = identityKeys(item);
    if (!keys.size) return false;

    const duplicate = [...keys].some((key) => seen.has(key));
    if (duplicate) return false;

    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function isInLibrary(item, libraryKeys) {
  return [...identityKeys(item)].some((key) => libraryKeys.has(key));
}

function cardKey(item = {}) {
  return String(item.malId || item.id || normalizeTitle(titleOf(item)));
}

function DiscoverCard({ item, onOpen, onAddWatching, onToggleFollow, adding = false, following = false }) {
  const score = numericScore(item);

  return (
    <article className="discoverCard" onClick={() => onOpen(item)}>
      <div className="discoverPosterWrap">
        <Poster anime={item} className="discoverPoster" mode="thumb" />
        {score > 0 && <span className="discoverScore">★ {score.toFixed(2)}</span>}
      </div>

      <div className="discoverCardCopy">
        <strong>{titleOf(item)}</strong>
        <small>{(item.genres || []).slice(0, 2).join(' + ') || item.studio || 'Recommendation catalog'}</small>
        <span>
          {item.year && <b>{item.year}</b>}
          {item.type && <b>{item.type}</b>}
          {(item.episodeCount || item.episodes) && <b>{item.episodeCount || item.episodes} eps</b>}
        </span>
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
      </div>
    </article>
  );
}

function Shelf({ icon, title, subtitle, items, onOpen, onBrowse, onAddWatching, onToggleFollow, addingKey }) {
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
              following={Boolean(item.followed)}
              adding={addingKey === cardKey(item)}
            />
          ))}
        </div>
      </div>
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

export function Discover({ anime = [], catalog = [], setSelected, setView, updateAnime, updateCatalogAnime, fetchMoreCatalogTitles }) {
  const [catalogBrowser, setCatalogBrowser] = useState(null);
  const [addingKey, setAddingKey] = useState('');
  const [fetchingMore, setFetchingMore] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');

  const libraryLookup = useMemo(() => {
    const malIds = new Set();
    const legacyFingerprints = new Set();
    const legacyTitles = [];

    anime.forEach((item) => {
      const ids = inferredMalIds(item);

      if (ids.length) {
        ids.forEach((id) => malIds.add(String(id)));
        return;
      }

      // Title matching remains only for old records that have not acquired
      // a MAL ID yet. Update Database will progressively eliminate these.
      rawTitles(item).forEach((title) => {
        legacyTitles.push(title);
        titleFingerprints(title).forEach((key) => legacyFingerprints.add(key));
      });
    });

    return { malIds, legacyFingerprints, legacyTitles };
  }, [anime]);

  const unseenCatalog = useMemo(() => {
    const validCatalog = uniqueCatalog(
      (catalog || []).filter((item) => item && titleOf(item))
    );

    return validCatalog.filter((item) => {
      const catalogMalIds = inferredMalIds(item);

      if (
        catalogMalIds.length &&
        catalogMalIds.some((id) => libraryLookup.malIds.has(String(id)))
      ) {
        return false;
      }

      // If both sides have MAL IDs and they differ, they are different anime.
      // Do not collapse legitimate sequels merely because names look similar.
      if (catalogMalIds.length) return true;

      const catalogTitles = rawTitles(item);

      const fingerprintMatch = catalogTitles.some((title) =>
        [...titleFingerprints(title)].some((key) =>
          libraryLookup.legacyFingerprints.has(key)
        )
      );

      if (fingerprintMatch) return false;

      return !catalogTitles.some((catalogTitle) =>
        libraryLookup.legacyTitles.some((libraryTitle) =>
          strongTitleMatch(catalogTitle, libraryTitle)
        )
      );
    });
  }, [catalog, libraryLookup]);

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

  const tasteAnchors = useMemo(
    () => [...anime]
      .filter((item) => personalScore(item) > 0)
      .sort((a, b) =>
        personalScore(b) - personalScore(a) ||
        Number(b.rewatches || 0) - Number(a.rewatches || 0)
      )
      .slice(0, 6),
    [anime]
  );

  const primaryAnchor = tasteAnchors[0] || null;

  const personalizedMatches = useMemo(() => {
    return [...unseenCatalog]
      .map((item) => {
        let value = numericScore(item) * 4;
        const reasons = new Set();

        tasteAnchors.forEach((anchorItem, index) => {
          const weight = Math.max(1, 6 - index);
          const shared = sharedGenres(item, anchorItem);

          if (shared.length) {
            value += shared.length * weight * 4;
            reasons.add(`${shared.slice(0, 2).join(' + ')} like ${titleOf(anchorItem)}`);
          }

          if (item.studio && anchorItem.studio && item.studio === anchorItem.studio) {
            value += weight * 5;
            reasons.add(`${item.studio} studio signal`);
          }
        });

        return {
          item,
          value,
          confidence: Math.max(58, Math.min(98, Math.round(56 + value / 8))),
          reasons: [...reasons].slice(0, 3)
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [unseenCatalog, tasteAnchors]);

  const dailyPick = useMemo(() => {
    const pool = personalizedMatches.slice(0, 10);
    return pool.length ? pool[daySeed() % pool.length] : null;
  }, [personalizedMatches]);

  const becauseYouLoved = useMemo(() => {
    if (!primaryAnchor) return [];

    return [...unseenCatalog]
      .map((item) => ({
        item,
        overlap: sharedGenres(item, primaryAnchor).length,
        sameStudio: Boolean(item.studio && primaryAnchor.studio && item.studio === primaryAnchor.studio),
        score: numericScore(item)
      }))
      .filter((entry) => entry.overlap > 0 || entry.sameStudio)
      .sort((a, b) =>
        b.overlap - a.overlap ||
        Number(b.sameStudio) - Number(a.sameStudio) ||
        b.score - a.score
      )
      .slice(0, 24)
      .map((entry) => entry.item);
  }, [unseenCatalog, primaryAnchor]);

  const mindBenders = useMemo(
    () => [...unseenCatalog]
      .filter((item) => {
        const genres = (item.genres || []).map((genre) => String(genre).toLowerCase());
        return genres.some((genre) =>
          ['psychological', 'mystery', 'sci-fi', 'suspense', 'supernatural'].includes(genre)
        );
      })
      .sort((a, b) => numericScore(b) - numericScore(a))
      .slice(0, 24),
    [unseenCatalog]
  );

  const movieNight = useMemo(
    () => [...unseenCatalog]
      .filter((item) => String(item.type || '').toLowerCase().includes('movie'))
      .sort((a, b) => numericScore(b) - numericScore(a))
      .slice(0, 24),
    [unseenCatalog]
  );

  const emotionalDamage = useMemo(
    () => [...unseenCatalog]
      .filter((item) => {
        const genres = (item.genres || []).map((genre) => String(genre).toLowerCase());
        return genres.includes('drama') && (
          genres.includes('romance') ||
          genres.includes('award winning') ||
          genres.includes('slice of life')
        );
      })
      .sort((a, b) => numericScore(b) - numericScore(a))
      .slice(0, 24),
    [unseenCatalog]
  );

  const studios = useMemo(() => {
    const map = new Map();

    unseenCatalog.forEach((item) => {
      if (!item.studio) return;
      map.set(item.studio, (map.get(item.studio) || 0) + 1);
    });

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [unseenCatalog]);

  const genres = useMemo(() => {
    const map = new Map();

    unseenCatalog.forEach((item) => {
      (item.genres || []).forEach((genre) => {
        map.set(genre, (map.get(genre) || 0) + 1);
      });
    });

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [unseenCatalog]);

  const studioSpotlight = useMemo(() => {
    const topStudio = studios[0]?.[0];
    if (!topStudio) return [];

    return unseenCatalog
      .filter((item) => item.studio === topStudio)
      .sort((a, b) => numericScore(b) - numericScore(a))
      .slice(0, 24);
  }, [studios, unseenCatalog]);

  async function addWatching(item) {
    if (!updateAnime || !item) return;

    const key = cardKey(item);
    setAddingKey(key);
    setCatalogMessage('');

    try {
      await updateAnime({
        ...item,
        id: item.malId ? `anime-${item.malId}` : `anime-${normalizeTitle(titleOf(item))}`,
        title: titleOf(item),
        officialTitle: item.officialTitle || titleOf(item),
        status: 'Watching',
        favorite: false,
        rewatches: 0,
        finalRank: anime.length + 1,
        notes: item.notes || 'Added from Discover.',
        addedFrom: 'Discover'
      });

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

    const following = !Boolean(item.followed);
    await updateCatalogAnime({
      ...item,
      followed: following,
      ignored: false,
      followedAt: following ? (item.followedAt || new Date().toISOString()) : '',
      listUpdatedAt: new Date().toISOString()
    });

    setCatalogMessage(
      following
        ? `🔔 Following ${titleOf(item)}.`
        : `Stopped following ${titleOf(item)}.`
    );
  }

  async function fetchMore() {
    if (!fetchMoreCatalogTitles || fetchingMore) return;

    setFetchingMore(true);
    setCatalogMessage('Fetching the next catalog page...');

    try {
      const result = await fetchMoreCatalogTitles({ limit: 25 });

      setCatalogMessage(
        result.added.length
          ? `✓ Added ${result.added.length} new catalog title${result.added.length === 1 ? '' : 's'}.`
          : result.received
            ? 'That page only contained titles already in your library or catalog. Try Fetch More again.'
            : 'Jikan returned no titles for that page.'
      );
    } catch (error) {
      console.warn('Fetch more catalog titles failed:', error);
      setCatalogMessage(error?.message || 'Could not fetch more titles right now.');
    } finally {
      setFetchingMore(false);
    }
  }

  function surpriseMe() {
    if (!unseenCatalog.length) return;
    setSelected?.(unseenCatalog[Math.floor(Math.random() * unseenCatalog.length)]);
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
            <button type="button" className="primary" onClick={() => browse()}>
              <LibraryBig /> Browse Entire Catalog
            </button>
            <button type="button" onClick={fetchMore} disabled={fetchingMore}>
              <LibraryBig /> {fetchingMore ? 'Fetching...' : 'Fetch More Titles'}
            </button>
            <button type="button" onClick={surpriseMe}>
              <Shuffle /> Surprise Me
            </button>
            <button type="button" onClick={() => setView?.('assistant')}>
              <Sparkles /> Ask JoeAI
            </button>
          </div>
          {catalogMessage && <p className="discoverCatalogMessage">{catalogMessage}</p>}
        </div>

        <div className="discoverHeroStats">
          <span><strong>{unseenCatalog.length}</strong>Unseen Titles</span>
          <span><strong>{genres.length}</strong>Genres</span>
          <span><strong>{studios.length}</strong>Studios</span>
        </div>
      </section>

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
            </div>
          </div>

          <div className="dailyPickPoster">
            <Poster anime={dailyPick.item} mode="thumb" />
          </div>
        </section>
      )}

      {primaryAnchor && becauseYouLoved.length > 0 && (
        <Shelf
          icon={<Heart />}
          title={`Because You Loved ${titleOf(primaryAnchor)}`}
          subtitle={`Built from shared genres, studio signals, and your ${personalScore(primaryAnchor).toFixed(1)} rating.`}
          items={becauseYouLoved}
          onOpen={setSelected}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
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
        items={joeAIPicks.length ? joeAIPicks : highestRated}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'JoeAI Picks')}
      />

      <Shelf
        icon={<Trophy />}
        title="Highest Rated"
        subtitle="Top community-rated anime you have not added yet."
        items={highestRated}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      <Shelf
        icon={<Gem />}
        title="Hidden Gems"
        subtitle="Well-rated titles with a genuinely smaller audience."
        items={hiddenGems}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('hidden', 'Hidden Gems')}
      />

      <Shelf
        icon={<Brain />}
        title="Mind Melters"
        subtitle="Psychological, mystery, supernatural, and sci-fi picks that make you work for it."
        items={mindBenders}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('genre', 'Psychological')}
      />

      <Shelf
        icon={<Flame />}
        title="Prepare for Emotional Damage"
        subtitle="Drama-heavy picks for when apparently feeling okay was getting boring."
        items={emotionalDamage}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('genre', 'Drama')}
      />

      <Shelf
        icon={<Film />}
        title="Movie Night"
        subtitle="Highly rated unseen anime movies from your catalog."
        items={movieNight}
        onOpen={setSelected}
        onAddWatching={addWatching}
        onToggleFollow={toggleFollow}
        addingKey={addingKey}
        onBrowse={() => browse('all', 'Entire Catalog')}
      />

      {studioSpotlight.length > 0 && (
        <Shelf
          icon={<Building2 />}
          title={`${studios[0][0]} Spotlight`}
          subtitle={`Unseen catalog titles from ${studios[0][0]}.`}
          items={studioSpotlight}
          onOpen={setSelected}
          onAddWatching={addWatching}
          onToggleFollow={toggleFollow}
          addingKey={addingKey}
          onBrowse={() => browse('studio', studios[0][0])}
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
