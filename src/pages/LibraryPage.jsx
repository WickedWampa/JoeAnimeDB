import React, { useMemo, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { Poster } from '../components/Poster';
import { buildLiveRankMap, score, sortAnimeByUserScore } from '../utils/animeUtils';
import {
  animeIdFromTitle,
  enrichAnimeCandidate,
  findDuplicateAnime,
  importAnimeByTitle,
  searchAnimeCandidates
} from '../services/animeImporter';
import '../styles/library-release-readiness.css';

function parseBulkTitles(value = '') {
  return [...new Set(
    String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  )];
}

function AddAnimeModal({ allAnime = [], updateAnime, deleteAnime, setSelected, onClose }) {
  const [tab, setTab] = useState('single');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Watching');
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [bulkProgress, setBulkProgress] = useState({ processed: 0, total: 0, current: '' });
  const [bulkSummary, setBulkSummary] = useState(null);
  const [lastBulkAddedIds, setLastBulkAddedIds] = useState([]);

  async function searchTitle() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setWorking(true);
    setMessage('Searching anime results...');
    setResults([]);
    setSelectedResult(null);
    setDuplicate(null);

    try {
      const matches = await searchAnimeCandidates(cleanTitle, { limit: 8 });
      setResults(matches);
      setMessage(matches.length ? `Found ${matches.length} possible matches. Pick the correct anime.` : 'No anime matches found.');
    } catch (error) {
      console.warn('Add Anime search failed:', cleanTitle, error);
      setMessage('Search failed. Try again in a minute.');
    } finally {
      setWorking(false);
    }
  }

  async function chooseResult(result) {
    setWorking(true);
    setMessage(`Finishing metadata for ${result.title}...`);

    try {
      const completion = await enrichAnimeCandidate({
        candidate: result,
        library: allAnime,
        status
      });

      const enriched = completion.candidate || result;
      const existing = findDuplicateAnime(allAnime, enriched);

      setSelectedResult(enriched);
      setDuplicate(existing || null);
      setMessage(
        existing
          ? 'Already in your library. You can update the existing entry with this completed metadata.'
          : completion.metadataEnrichment?.unresolved
            ? 'Ready to add. A small amount of metadata may still need repair.'
            : 'Metadata complete — ready to add.'
      );
    } catch (error) {
      console.warn('Add Anime enrichment failed:', result.title, error);
      const existing = findDuplicateAnime(allAnime, result);
      setSelectedResult(result);
      setDuplicate(existing || null);
      setMessage('Ready to add. Metadata can be repaired later if needed.');
    } finally {
      setWorking(false);
    }
  }

  async function upgradeExistingAnime() {
    if (!selectedResult || !duplicate) return;

    setWorking(true);
    setMessage('Updating existing library entry...');

    try {
      const next = {
        ...duplicate,
        ...selectedResult,
        id: duplicate.id,
        joeScore: duplicate.joeScore,
        finalRank: duplicate.finalRank,
        status: duplicate.status || status,
        favorite: Boolean(duplicate.favorite),
        rewatches: Number(duplicate.rewatches || 0),
        notes: duplicate.notes || selectedResult.notes || '',
        title: selectedResult.officialTitle || selectedResult.title || duplicate.title
      };

      const saved = await updateAnime(next);
      const savedAnime = saved.anime || [];
      const updated = savedAnime.find((item) => String(item.id) === String(next.id)) || next;

      setMessage('Updated existing entry!');
      setSelected?.(updated);
      onClose();
    } catch (error) {
      console.warn('Add Anime upgrade failed:', selectedResult.title, error);
      setMessage('Could not update the existing entry yet. Check the console.');
    } finally {
      setWorking(false);
    }
  }

  async function addAnime() {
    if (!selectedResult || duplicate) return;

    setWorking(true);
    setMessage('Adding to library...');

    const next = {
      ...selectedResult,
      id: animeIdFromTitle(selectedResult),
      status,
      favorite: false,
      rewatches: 0,
      finalRank: selectedResult.finalRank || allAnime.length + 1,
      notes: selectedResult.notes || 'Added manually.'
    };

    try {
      const saved = await updateAnime(next);
      const savedAnime = saved.anime || [];
      const added = savedAnime.find((item) => String(item.id) === String(next.id)) || next;

      setMessage('Added!');
      setSelected?.(added);
      onClose();
    } catch (error) {
      console.warn('Add Anime save failed:', next.title, error);
      setMessage('Could not save yet. Check the console.');
    } finally {
      setWorking(false);
    }
  }

  async function undoLastBulkImport() {
    if (!lastBulkAddedIds.length || !deleteAnime) return;
    if (!confirm(`Remove ${lastBulkAddedIds.length} anime added by the last bulk import?`)) return;

    setWorking(true);
    setMessage(`Removing ${lastBulkAddedIds.length} titles from the last import...`);

    try {
      for (const id of lastBulkAddedIds) {
        await deleteAnime(id);
      }

      const removedIds = new Set(lastBulkAddedIds.map(String));
      setBulkSummary((current) => current ? {
        ...current,
        added: current.added.filter((item) => !removedIds.has(String(item.id)))
      } : current);
      setLastBulkAddedIds([]);
      setMessage('Last bulk import removed. Your earlier library entries were left untouched.');
    } catch (error) {
      console.warn('Bulk import undo failed:', error);
      setMessage('Could not completely undo the last import. Try again or remove the remaining titles from their detail cards.');
    } finally {
      setWorking(false);
    }
  }

  async function bulkImport() {
    const titles = parseBulkTitles(bulkText);
    if (!titles.length) return;

    setWorking(true);
    setBulkSummary(null);
    setMessage('Starting bulk import...');
    setBulkProgress({ processed: 0, total: titles.length, current: '' });

    const added = [];
    const addedIds = [];
    const skipped = [];
    const review = [];
    const failed = [];
    let liveLibrary = [...allAnime];

    for (let index = 0; index < titles.length; index++) {
      const rawTitle = titles[index];

      setBulkProgress({ processed: index + 1, total: titles.length, current: rawTitle });
      setMessage(`Importing ${index + 1}/${titles.length}: ${rawTitle}`);

      try {
        const result = await importAnimeByTitle({
          title: rawTitle,
          status,
          library: liveLibrary
        });

        if (result.duplicate) {
          skipped.push({
            title: rawTitle,
            match: result.duplicate.title,
            reason: 'Already in library'
          });
          continue;
        }

        const matches = result.results || [];
        const candidate = result.candidate;

        if (!candidate) {
          failed.push({ title: rawTitle, reason: 'No match found' });
          continue;
        }

        const best = matches[0] || candidate;
        const bestConfidence = Number(
          best.importConfidence ||
          candidate.importConfidence ||
          0
        );
        const secondConfidence = Number(matches[1]?.importConfidence || 0);
        const confidenceGap = bestConfidence - secondConfidence;
        const exactIdentity = String(
          best.importLabel ||
          candidate.importLabel ||
          ''
        ).toLowerCase() === 'exact match';
        const strongIdentity = exactIdentity || bestConfidence >= 86;
        const genuinelyAmbiguous = Boolean(
          candidate.metadataNeedsReview ||
          (
            matches.length > 1 &&
            !strongIdentity &&
            bestConfidence < 78 &&
            confidenceGap < 8
          )
        );

        if (genuinelyAmbiguous && !result.metadataLookupFailed) {
          review.push({ title: rawTitle, matches });
          continue;
        }

        const next = {
          ...candidate,
          id: candidate.id || animeIdFromTitle(candidate),
          status,
          favorite: false,
          rewatches: 0,
          finalRank: liveLibrary.length + 1,
          notes:
            candidate.notes ||
            (result.metadataLookupFailed
              ? 'Added from bulk import. Metadata refresh may still be needed.'
              : 'Added from bulk import.')
        };

        const saved = await updateAnime(next);
        liveLibrary = saved.anime || [...liveLibrary, next];
        added.push(next);
        addedIds.push(next.id);
      } catch (error) {
        console.warn('Bulk import failed:', rawTitle, error);
        failed.push({ title: rawTitle, reason: error.message || 'Import failed' });
      }

      // Provider code already owns retry/backoff. Keep only a short UI yield.
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    // Revisit incomplete additions after the whole batch exists. This gives
    // franchise inheritance and Wikidata the same full-library context as the
    // manual metadata repair tool.
    const repairedAdded = [];

    for (let index = 0; index < added.length; index += 1) {
      const item = added[index];
      const needsCompletion = Boolean(
        !item.studio ||
        !Array.isArray(item.genres) ||
        !item.genres.length
      );

      if (!needsCompletion) {
        repairedAdded.push(item);
        continue;
      }

      setBulkProgress({
        processed: index + 1,
        total: added.length,
        current: item.title
      });
      setMessage(
        `Final metadata pass ${index + 1}/${added.length}: ${item.title}`
      );

      try {
        const completion = await enrichAnimeCandidate({
          candidate: item,
          library: liveLibrary,
          status: item.status || status
        });

        const repaired = {
          ...item,
          ...completion.candidate,
          id: item.id,
          title: item.title,
          status: item.status || status,
          favorite: Boolean(item.favorite),
          rewatches: Number(item.rewatches || 0),
          notes:
            item.notes ||
            completion.candidate?.notes ||
            'Added from bulk import.'
        };

        const saved = await updateAnime(repaired);
        liveLibrary = saved.anime || liveLibrary;

        const savedItem = liveLibrary.find(
          (animeItem) => String(animeItem.id) === String(repaired.id)
        ) || repaired;

        repairedAdded.push(savedItem);
      } catch (error) {
        console.warn('Bulk final metadata pass failed:', item.title, error);
        repairedAdded.push(item);
      }

      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    setLastBulkAddedIds(addedIds);
    setBulkSummary({
      added: repairedAdded,
      skipped,
      review,
      failed
    });
    setMessage(
      review.length
        ? `Bulk import complete — ${review.length} title${review.length === 1 ? '' : 's'} genuinely need identity review.`
        : 'Bulk import complete — metadata finalization finished.'
    );
    setWorking(false);
  }

  async function importReviewedMatch(reviewItem, match) {
    if (!match) return;

    const existing = findDuplicateAnime(allAnime, match);

    if (existing) {
      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        skipped: [
          ...current.skipped,
          {
            title: reviewItem.title,
            match: existing.title,
            reason: 'Already in library'
          }
        ]
      }));
      return;
    }

    const next = {
      ...match,
      id: animeIdFromTitle(match),
      status,
      favorite: false,
      rewatches: 0,
      finalRank: allAnime.length + (bulkSummary?.added?.length || 0) + 1,
      notes: 'Added from bulk import review.'
    };

    try {
      const saved = await updateAnime(next);
      const savedAnime = saved.anime || [];
      const added = savedAnime.find((item) => String(item.id) === String(next.id)) || next;

      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        added: [...current.added, added]
      }));

      setSelected?.(added);
    } catch (error) {
      console.warn('Review import failed:', reviewItem.title, error);

      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        failed: [
          ...current.failed,
          {
            title: reviewItem.title,
            reason: error.message || 'Review import failed'
          }
        ]
      }));
    }
  }

  const bulkTitles = parseBulkTitles(bulkText);

  return (
    <div className="modalBackdrop addAnimeBackdrop" onClick={onClose}>
      <section className="addAnimeModal" onClick={(event) => event.stopPropagation()}>
        <button className="close" type="button" onClick={onClose}>×</button>

        <div className="addAnimeHeader">
          <p className="eyebrow">JoeAnimeDB Importer</p>
          <h2>🍜 Add Anime</h2>
          <p>Search one title or paste a whole watch list. JoeAnimeDB fetches metadata and skips duplicates.</p>
        </div>

        <div className="importTabs">
          <button type="button" className={tab === 'single' ? 'active' : ''} onClick={() => setTab('single')}>
            Single Search
          </button>
          <button type="button" className={tab === 'bulk' ? 'active' : ''} onClick={() => setTab('bulk')}>
            Bulk Paste
          </button>
        </div>

        {tab === 'single' ? (
          <>
            <div className="addAnimeSearch">
              <input
                autoFocus
                placeholder="Example: World Trigger"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && searchTitle()}
              />

              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option>Watching</option>
                <option>Completed</option>
                <option>Plan to Watch</option>
                <option>On Hold</option>
                <option>Dropped</option>
              </select>

              <button type="button" onClick={searchTitle} disabled={working || !title.trim()}>
                {working ? 'Searching...' : 'Search'}
              </button>
            </div>

            {message && <p className={`addAnimeMessage ${duplicate ? 'warning' : ''}`}>{message}</p>}

            {results.length > 0 && !selectedResult && (
              <div className="addAnimeResults">
                {results.map((result) => {
                  const resultDuplicate = findDuplicateAnime(allAnime, result);

                  return (
                    <button
                      type="button"
                      className={`addAnimeResult ${resultDuplicate ? 'alreadyOwned' : ''}`}
                      key={result.malId || result.title}
                      onClick={() => chooseResult(result)}
                    >
                      <Poster anime={result} className="addAnimeResultPoster" />
                      <span>
                        <span className={`importLabel ${String(result.importLabel || 'Related').replace(/\s+/g, '').toLowerCase()}`}>
                          {result.importConfidence ? `${result.importConfidence}% · ` : ''}{result.importLabel || 'Related'}
                        </span>
                        {resultDuplicate && <span className="importOwnedBadge">✓ Already in Library</span>}
                        <strong>{result.title}</strong>
                        <small className="importMeta">
                          {[
                            result.year,
                            result.type ? `${result.type === 'TV' ? '📺' : result.type === 'Movie' ? '🎞' : result.type === 'OVA' ? '💿' : '🎬'} ${result.type}` : null,
                            result.episodeCount ? `📚 ${result.episodeCount} eps` : null,
                            result.studio ? `🎭 ${result.studio}` : null,
                            result.communityScore ? `⭐ ${result.communityScore}` : null
                          ].filter(Boolean).join(' • ')}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedResult && (
              <div className="addAnimePreview">
                <Poster anime={selectedResult} className="addAnimePoster" />

                <div>
                  <button className="addAnimeBack" type="button" onClick={() => { setSelectedResult(null); setDuplicate(null); }}>
                    ← Back to results
                  </button>

                  <h3>{selectedResult.title}</h3>

                  <div className="addAnimeMeta">
                    {selectedResult.importLabel && <span>{selectedResult.importConfidence ? `${selectedResult.importConfidence}% · ` : ''}{selectedResult.importLabel}</span>}
                    {selectedResult.year && <span>{selectedResult.year}</span>}
                    {(selectedResult.episodeCount || selectedResult.episodes) && <span>{selectedResult.episodeCount || selectedResult.episodes} eps</span>}
                    {selectedResult.type && <span>{selectedResult.type}</span>}
                    {selectedResult.studio && <span>{selectedResult.studio}</span>}
                    {(selectedResult.communityScore || selectedResult.malScore) && <span>⭐ {selectedResult.communityScore || selectedResult.malScore}</span>}
                  </div>

                  {selectedResult.genres?.length > 0 && (
                    <div className="tags addAnimeTags">
                      {selectedResult.genres.slice(0, 5).map((genre) => <span key={genre}>{genre}</span>)}
                    </div>
                  )}

                  {selectedResult.synopsis && <p className="addAnimeSynopsis">{selectedResult.synopsis}</p>}

                  {duplicate ? (
                    <div className="addAnimeActions">
                      <button type="button" onClick={upgradeExistingAnime} disabled={working}>
                        {working ? 'Updating...' : 'Update Existing Entry'}
                      </button>
                      <button type="button" onClick={() => setSelected?.(duplicate)}>Open Existing</button>
                      <button type="button" onClick={onClose}>Cancel</button>
                    </div>
                  ) : (
                    <div className="addAnimeActions">
                      <button type="button" onClick={addAnime} disabled={working}>
                        {working ? 'Adding...' : `Add as ${status}`}
                      </button>
                      <button type="button" onClick={onClose}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bulkImporter">
            <div className="bulkControls">
              <label>
                <span className="controlLabel">Default Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>Watching</option>
                  <option>Completed</option>
                  <option>Plan to Watch</option>
                  <option>On Hold</option>
                  <option>Dropped</option>
                </select>
              </label>

              <button type="button" onClick={bulkImport} disabled={working || !bulkTitles.length}>
                {working ? 'Importing...' : `Import ${bulkTitles.length || ''} Title${bulkTitles.length === 1 ? '' : 's'}`}
              </button>
            </div>

            <textarea
              className="bulkTextarea"
              placeholder={'Paste one title per line...\n\nBleach\nWorld Trigger\nMagi\nFrieren'}
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              disabled={working}
            />

            {working && (
              <div className="bulkProgress">
                <div className="bulkBar">
                  <div style={{ width: `${bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%` }} />
                </div>
                <p>{bulkProgress.processed} / {bulkProgress.total} · {bulkProgress.current}</p>
              </div>
            )}

            {message && <p className="addAnimeMessage">{message}</p>}

            {bulkSummary && (
              <div className="bulkSummary">
                <h3>🎉 Import Complete</h3>
                <div className="bulkSummaryStats">
                  <span>Added: {bulkSummary.added.length}</span>
                  <span>Skipped: {bulkSummary.skipped.length}</span>
                  <span>Needs review: {bulkSummary.review.length}</span>
                  <span>Failed: {bulkSummary.failed.length}</span>
                </div>

                <div className="bulkSummaryActions">
                  <button type="button" onClick={onClose}>Go To Library</button>
                  {lastBulkAddedIds.length > 0 && (
                    <button type="button" onClick={undoLastBulkImport} disabled={working}>
                      Undo Last Import
                    </button>
                  )}
                </div>

                {bulkSummary.added.length > 0 && (
                  <details open>
                    <summary>Added</summary>
                    {bulkSummary.added.map((item) => (
                      <button className="bulkResultRow" type="button" key={item.id} onClick={() => setSelected?.(item)}>
                        <span>✓ {item.title}</span>
                        <small>{[item.year, item.studio, item.episodeCount ? `${item.episodeCount} eps` : null].filter(Boolean).join(' • ')}</small>
                        <b>Open</b>
                      </button>
                    ))}
                  </details>
                )}

                {bulkSummary.skipped.length > 0 && (
                  <details>
                    <summary>Skipped duplicates</summary>
                    {bulkSummary.skipped.map((item) => <p key={item.title}>✓ {item.title} → {item.match}</p>)}
                  </details>
                )}

                {bulkSummary.review.length > 0 && (
                  <details open>
                    <summary>Needs review</summary>
                    {bulkSummary.review.map((item) => (
                      <div className="bulkReviewCard" key={item.title}>
                        <h4>⚠ {item.title}</h4>
                        <p>Pick the correct match:</p>

                        <div className="bulkReviewMatches">
                          {(item.matches || []).slice(0, 4).map((match) => (
                            <button
                              type="button"
                              key={match.malId || match.title}
                              onClick={() => importReviewedMatch(item, match)}
                            >
                              <Poster anime={match} className="bulkReviewPoster" />
                              <span>
                                <strong>{match.title}</strong>
                                <small>
                                  {[
                                    match.importConfidence ? `${match.importConfidence}% ${match.importLabel || 'Match'}` : null,
                                    match.year,
                                    match.type,
                                    match.episodeCount ? `${match.episodeCount} eps` : null,
                                    match.studio
                                  ].filter(Boolean).join(' • ')}
                                </small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </details>
                )}

                {bulkSummary.failed.length > 0 && (
                  <details>
                    <summary>Failed</summary>
                    {bulkSummary.failed.map((item) => <p key={item.title}>✗ {item.title}: {item.reason}</p>)}
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function LibraryPage({
  anime,
  allAnime,
  mode,
  setSelected,
  title,
  updateAnime,
  deleteAnime,
  query = '',
  onClearSearch,
  emptyMessage
}) {
  const [addingAnime, setAddingAnime] = useState(false);
  const libraryForDupes = useMemo(() => allAnime || anime || [], [allAnime, anime]);

  // finalRank is legacy persisted data, so it can become stale whenever a score changes.
  // Build the visible ranking from the current Joe scores on every render instead.
  const liveRankMap = useMemo(() => buildLiveRankMap(libraryForDupes), [libraryForDupes]);

  const rankedAnime = useMemo(
    () => sortAnimeByUserScore(anime),
    [anime]
  );

  async function handleFavoriteClick(event, item) {
    event.stopPropagation();
    await updateAnime({
      ...item,
      favorite: !Boolean(item.favorite)
    });
  }

  const canAddAnime = title === 'Library' || title === 'Rankings';
  const libraryIsEmpty = libraryForDupes.length === 0;
  const hasNoResults = !libraryIsEmpty && rankedAnime.length === 0;

  return (
    <>
      <section
        className={`pageHeader libraryHeader libraryArchiveHeroLive ${title === 'Favorites' ? 'favoritesArchiveHero' : ''}`}
      >
        <div className="libraryArchiveLiveArt" aria-hidden="true" />
        <div className="libraryArchiveLiveCopy">
          <p className="eyebrow">
            {title === 'Favorites' ? 'Your Anime Hall of Fame' : 'Your Anime Archive'}
          </p>

          <h1>{title}</h1>

          <p className="libraryArchiveLiveTagline">
            {title === 'Favorites'
              ? 'The stories that earned a permanent place in your collection.'
              : 'Your complete anime collection. Every story. Every moment. All in one place.'}
          </p>

          <div className="libraryArchiveLiveStats">
            <div>
              <span>▤</span>
              <strong>{allAnime?.length || anime.length}</strong>
              <small>Total Titles</small>
            </div>

            <div>
              <span>☆</span>
              <strong>{(allAnime || anime).filter((item) => item.favorite).length}</strong>
              <small>Favorites</small>
            </div>

            <div>
              <span>↻</span>
              <strong>{(allAnime || anime).reduce((sum, item) => sum + Number(item.rewatches || 0), 0)}</strong>
              <small>Rewatches</small>
            </div>

            <div>
              <span>✦</span>
              <strong>{Math.max(
                0,
                (allAnime?.length || anime.length) -
                  (allAnime || anime).filter((item) => Number(item.joeScore || item.score || 0) > 0).length
              )}</strong>
              <small>Unrated</small>
            </div>
          </div>
        </div>

        {canAddAnime && (
          <button
            className="addAnimeButton libraryArchiveLiveAdd"
            type="button"
            onClick={() => setAddingAnime(true)}
          >
            + Add Anime
          </button>
        )}
      </section>

      {rankedAnime.length === 0 ? (
        <section className={`libraryStateCard ${hasNoResults ? 'noResults' : 'emptyLibrary'}`} role="status">
          <span className="libraryStateIcon" aria-hidden="true">{hasNoResults ? '⌕' : '▤'}</span>
          <p className="eyebrow">{hasNoResults ? 'No Matches' : 'Your Archive Awaits'}</p>
          <h2>{hasNoResults ? 'No titles match this search' : 'Build your anime library'}</h2>
          <p>
            {hasNoResults
              ? `Nothing in your library matches “${query.trim()}”. Try a title, studio, genre, status, year, or priority.`
              : (emptyMessage || 'Add a title, paste a watch list, or import a saved list from Settings to get started.')}
          </p>
          <div className="libraryStateActions">
            {hasNoResults && onClearSearch && (
              <button type="button" onClick={onClearSearch}>Clear Search</button>
            )}
            {canAddAnime && (
              <button type="button" onClick={() => setAddingAnime(true)}>+ Add Anime</button>
            )}
          </div>
        </section>
      ) : mode === 'list' ? (
        <section className="tablePanel">
          <table>
            <thead>
              <tr>
                <th>Fav</th>
                <th>#</th>
                <th>Anime</th>
                <th>Score</th>
                <th>Studio</th>
                <th>Genres</th>
                <th>Episodes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rankedAnime.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)}>
                  <td>
                    <button
                      className="favoriteListButton"
                      type="button"
                      title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={(event) => handleFavoriteClick(event, item)}
                    >
                      {item.favorite ? '❤️' : '🤍'}
                    </button>
                  </td>
                  <td>{liveRankMap.get(String(item.id)) || '—'}</td>
                  <td className="titleCell">
                    <Poster anime={item} className="thumb" />
                    <span className="libraryTitleStack">
                      <strong>{item.title}</strong>
                      {(item.metadataNeedsReview || item.metadataNeedsRefresh) && (
                        <span
                          className={`metadataReviewBadge ${item.metadataNeedsReview ? 'identityReview' : ''}`}
                          title={item.metadataReviewReason || 'Some metadata still needs review'}
                        >
                          ⚠ {item.metadataNeedsReview ? 'Needs Review' : 'Metadata Incomplete'}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>★ {score(item).toFixed(1)}</td>
                  <td>{item.studio}</td>
                  <td>{(item.genres || []).slice(0, 3).join(', ')}</td>
                  <td>{item.episodeCount || '—'}</td>
                  <td>{item.status ? <span className={`statusPill compact ${item.status.replace(/\s+/g, '').toLowerCase()}`}>{item.status}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="posterGrid libraryPosterGrid">
          {rankedAnime.map((item) => (
            <AnimeCard
              key={item.id}
              anime={item}
              displayRank={liveRankMap.get(String(item.id))}
              totalCount={libraryForDupes.length}
              setSelected={setSelected}
              updateAnime={updateAnime}
            />
          ))}
        </section>
      )}

      {addingAnime && (
        <AddAnimeModal
          allAnime={libraryForDupes}
          updateAnime={updateAnime}
          deleteAnime={deleteAnime}
          setSelected={setSelected}
          onClose={() => setAddingAnime(false)}
        />
      )}
    </>
  );
}
