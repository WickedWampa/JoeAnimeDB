import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Poster } from './Poster';
import {
  applySafeKitsuIdentity,
  mergeAnimeMetadata,
  enrichAnimeCandidate,
  findDuplicateAnime,
  importAnimeByTitle,
  resolveSafeKitsuIdentity,
  searchAnimeCandidates
} from '../services/animeImporter';
import { fetchKitsuAnimeByMalIds } from '../services/malKitsuMappingService';
import {
  importTitleKey,
  importedPersonalData,
  parseLibraryImport,
  readLibraryImportFile
} from '../services/libraryListImporter';
import { CONTENT_SAFETY_MODES } from '../services/contentSafety';
import {
  getSavedStreamingApps,
  saveStreamingApps,
  STREAMING_APP_OPTIONS
} from '../services/watchmodeService';
import '../styles/first-launch-onboarding.css';

const STEPS = [
  { eyebrow: 'Welcome', icon: '🍜' },
  { eyebrow: 'Make it yours', icon: '🎨' },
  { eyebrow: 'Taste anchors', icon: '❤️' },
  { eyebrow: 'Teach JoeAI', icon: '★' },
  { eyebrow: 'Ready', icon: '🧠' }
];

const THEMES = [
  { id: 'neon', label: 'Neon', colors: ['#37eaff', '#ff5cc8'] },
  { id: 'sakura', label: 'Sakura', colors: ['#ffd1e8', '#ff7abf'] },
  { id: 'vapor', label: 'Vapor', colors: ['#7df9ff', '#b984ff'] },
  { id: 'inferno', label: 'Inferno', colors: ['#ffb703', '#ff4d6d'] },
  { id: 'ramen', label: 'Ramen', colors: ['#ffd166', '#ff8552'] },
  { id: 'amoled', label: 'AMOLED', colors: ['#42f5ff', '#050505'] }
];

const PAGE_TIPS = {
  dashboard: {
    icon: '⌂',
    eyebrow: 'Home tip',
    title: 'Home turns your library into the next useful action.',
    body: 'Continue Watching, returning seasons, missed direct sequels, titles on your streaming services, and JoeAI Quick Pick appear when they have something useful to show. Empty shelves stay out of the way.'
  },
  library: {
    icon: '▤',
    eyebrow: 'Library tip',
    title: 'Add one title or paste a whole list.',
    body: 'Choose + Add Anime. Single Search lets you confirm the exact match; Bulk Paste accepts one title per line, skips duplicates, and flags uncertain matches for review.'
  },
  analytics: {
    icon: '🧬',
    eyebrow: 'Anime DNA tip',
    title: 'This is your taste fingerprint.',
    body: 'Genres, studios, scores, favorites, rewatches, and Genome signals combine here to explain what consistently works for you.'
  },
  assistant: {
    icon: '🧠',
    eyebrow: 'JoeAI tip',
    title: 'Ask naturally — then keep steering.',
    body: 'JoeAI can recommend what to watch, compare titles you own or have never seen, explain your Anime DNA, and make confirmed library changes. Follow up with things like “darker,” “no school,” “under 24 episodes,” “another one,” or “why that one?”'
  },
  discover: {
    icon: '✦',
    eyebrow: 'Discover tip',
    title: 'These matches exclude your library.',
    body: 'Match scores use your Anime DNA and Genome signals. Give JoeAI feedback so the next set gets sharper.'
  },
  following: {
    icon: '🔔',
    eyebrow: 'Following tip',
    title: 'Track titles without adding them.',
    body: 'Follow an upcoming or unseen anime to keep it on your radar while your watched library stays clean.'
  },
  settings: {
    icon: '⚙',
    eyebrow: 'Settings tip',
    title: 'Backup, import, and export do different jobs.',
    body: 'Choose My Streaming Apps to unlock On Your Services and Quick Watch. Full Backup creates a recovery copy; Restore replaces current data; Import Library List merges supported watch-list data instead.'
  },
  about: {
    icon: '?',
    eyebrow: 'Help tip',
    title: 'Version, backups, providers, and recovery tools live here.',
    body: 'Open your backup or log folders, check Kitsu and Wikidata, export safe diagnostics, replay the tutorial, or jump to the release notes.'
  }
};

function candidateKey(item = {}) {
  return String(item.kitsuId || item.malId || item.id || item.officialTitle || item.title || '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function defaultRating(item = {}) {
  const score = Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 8);
  return Number.isFinite(score) && score > 0 ? Math.min(10, Math.max(0.1, score)) : 8;
}

function importedTitleMatchesLibraryItem(requestedTitle = '', item = {}) {
  const wanted = importTitleKey(requestedTitle);
  if (!wanted) return false;

  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.canonicalTitle,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
  ]
    .map(importTitleKey)
    .filter(Boolean)
    .includes(wanted);
}

function findImportedLibraryItem(row = {}, library = []) {
  return library.find((item) =>
    (row.malId && String(item.malId || item.mal_id || '') === String(row.malId)) ||
    (row.anilistId && String(item.anilistId || '') === String(row.anilistId)) ||
    importedTitleMatchesLibraryItem(row.requestedTitle || row.title, item)
  );
}

function importTotal(summary = {}) {
  return (summary.added?.length || 0) + (summary.updated?.length || 0);
}

function StepProgress({ step, updateOnly = false }) {
  if (updateOnly) {
    const updateStep = step === 4 ? 1 : 0;
    return (
      <div className="firstLaunchProgress" aria-label={`Update ${updateStep + 1} of 2`}>
        {[0, 1].map((index) => <span key={index} className={index <= updateStep ? 'active' : ''} aria-hidden="true" />)}
      </div>
    );
  }

  return (
    <div className="firstLaunchProgress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((item, index) => (
        <span
          key={item.eyebrow}
          className={index <= step ? 'active' : ''}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function AnimeChoice({ anime, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`firstLaunchAnimeChoice ${selected ? 'selected' : ''}`}
      disabled={disabled && !selected}
      onClick={onClick}
      aria-pressed={selected}
    >
      <Poster anime={anime} className="firstLaunchPoster" mode="thumb" />
      <span>
        <strong>{titleOf(anime)}</strong>
        <small>
          {[anime.year, anime.episodeCount || anime.episodes ? `${anime.episodeCount || anime.episodes} eps` : '']
            .filter(Boolean)
            .join(' · ') || anime.importLabel || 'Kitsu match'}
        </small>
      </span>
      <b>{selected ? '✓ Added' : '+ Add'}</b>
    </button>
  );
}

function RatingCard({ item, value, onChange }) {
  const title = titleOf(item);

  return (
    <article className="firstLaunchRatingCard">
      <Poster anime={item} className="firstLaunchPoster" mode="thumb" />
      <div className="firstLaunchRatingBody">
        <div className="firstLaunchRatingTitle">
          <strong>{title}</strong>
          <b>{Number(value.score).toFixed(1)}</b>
        </div>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={value.score}
          aria-label={`Rating for ${title}`}
          onChange={(event) => onChange({ ...value, score: Number(event.target.value) })}
        />
        <div className="firstLaunchRatingControls">
          <button
            type="button"
            className={value.favorite ? 'active' : ''}
            onClick={() => onChange({ ...value, favorite: !value.favorite })}
          >
            {value.favorite ? '♥ Favorite' : '♡ Favorite'}
          </button>
          <label>
            Rewatches
            <span>
              <button
                type="button"
                aria-label={`Remove a rewatch from ${title}`}
                onClick={() => onChange({ ...value, rewatches: Math.max(0, value.rewatches - 1) })}
              >−</button>
              <b>{value.rewatches}</b>
              <button
                type="button"
                aria-label={`Add a rewatch to ${title}`}
                onClick={() => onChange({ ...value, rewatches: value.rewatches + 1 })}
              >+</button>
            </span>
          </label>
        </div>
      </div>
    </article>
  );
}

export function FirstTimeOnboarding({
  open = false,
  initialStep = 0,
  source = '',
  displayName = '',
  theme = 'neon',
  contentSafetyMode = 'unrestricted',
  anime = [],
  onThemeChange,
  onContentSafetyModeChange,
  onSaveDisplayName,
  onUpdateAnime,
  onStepChange,
  onComplete,
  onSkip
}) {
  const updateOnly = source === 'beta22-update';
  const [step, setStep] = useState(initialStep);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [prepared, setPrepared] = useState([]);
  const [ratings, setRatings] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [streamingApps, setStreamingApps] = useState(() => getSavedStreamingApps());
  const [libraryImportProgress, setLibraryImportProgress] = useState(null);
  const [libraryImportSummary, setLibraryImportSummary] = useState(null);
  const libraryImportInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep(Math.max(0, Math.min(4, Number(initialStep || 0))));
    setNameDraft(displayName || '');
    setMessage('');
    setLibraryImportProgress(null);
    setLibraryImportSummary(null);
    setStreamingApps(getSavedStreamingApps());
  }, [open]);

  const selectedKeys = useMemo(
    () => new Set(selected.map(candidateKey)),
    [selected]
  );

  function moveTo(nextStep) {
    const normalized = Math.max(0, Math.min(4, nextStep));
    setStep(normalized);
    setMessage('');
    onStepChange?.(normalized);
  }

  async function search(event) {
    event?.preventDefault?.();
    const cleanQuery = query.trim();
    if (!cleanQuery || busy) return;

    setBusy(true);
    setMessage('Searching Kitsu…');
    try {
      const matches = await searchAnimeCandidates(cleanQuery, { limit: 6 });
      setResults(matches);
      setMessage(matches.length ? 'Choose the exact anime you love.' : 'No matches found. Try another title.');
    } catch (error) {
      console.warn('Onboarding anime search failed:', error);
      setResults([]);
      setMessage('Search is unavailable right now. You can skip this step and add titles later.');
    } finally {
      setBusy(false);
    }
  }

  function toggleCandidate(candidate) {
    const key = candidateKey(candidate);
    setSelected((current) => {
      if (current.some((item) => candidateKey(item) === key)) {
        return current.filter((item) => candidateKey(item) !== key);
      }
      if (current.length >= 3) return current;
      return [...current, candidate];
    });
  }

  function toggleStreamingApp(appId) {
    const selectedApps = new Set(streamingApps);
    if (selectedApps.has(appId)) selectedApps.delete(appId);
    else selectedApps.add(appId);
    setStreamingApps(saveStreamingApps([...selectedApps]));
  }

  async function saveNameAndContinue() {
    if (busy) return;
    const cleanName = nameDraft.trim();
    setBusy(true);
    try {
      if (cleanName && cleanName !== displayName) {
        await onSaveDisplayName?.(cleanName);
      }
      moveTo(1);
    } finally {
      setBusy(false);
    }
  }

  function saveLibraryImportSummary(summary) {
    setLibraryImportSummary(summary);

    try {
      localStorage.setItem('joeanime-library-import-review-v1', JSON.stringify(summary));
      window.dispatchEvent(new CustomEvent('joeanime:library-import-review-changed', {
        detail: summary
      }));
    } catch (error) {
      console.warn('Could not persist onboarding import review:', error);
    }
  }

  async function importLibraryRows(rows = []) {
    if (!rows.length || !onUpdateAnime || busy) return;

    const sourceName = rows[0]?.sourceName || 'the selected file';
    const confirmed = window.confirm(
      `Import ${rows.length} title${rows.length === 1 ? '' : 's'} from ${sourceName}? Existing titles keep their metadata while ratings, status, progress, and other supported list data are merged.`
    );
    if (!confirmed) return;

    setBusy(true);
    setLibraryImportSummary(null);
    let liveLibrary = [...anime];
    const summary = {
      added: [],
      updated: [],
      skipped: [],
      needsReview: [],
      failed: [],
      sourceName
    };
    let exactMalCandidates = new Map();

    try {
      const malIds = rows.map((row) => row.malId).filter(Boolean);
      if (malIds.length) {
        setMessage(`Resolving ${malIds.length} exact MyAnimeList identities through Kitsu…`);
        exactMalCandidates = await fetchKitsuAnimeByMalIds(malIds);
      }

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const progress = { processed: index + 1, total: rows.length, title: row.title };
        setLibraryImportProgress(progress);
        setMessage(`Importing ${progress.processed}/${progress.total}: ${progress.title}`);

        try {
          const exactMalCandidate = exactMalCandidates.get(String(row.malId || '')) || null;
          const existingBeforeLookup = findImportedLibraryItem(row, liveLibrary);
          if (existingBeforeLookup) {
            let merged = exactMalCandidate
              ? mergeAnimeMetadata(existingBeforeLookup, exactMalCandidate, row.status)
              : { ...existingBeforeLookup };
            merged = {
              ...merged,
              ...importedPersonalData(row),
              id: existingBeforeLookup.id,
              title: exactMalCandidate?.title || existingBeforeLookup.title,
              officialTitle:
                exactMalCandidate?.officialTitle ||
                existingBeforeLookup.officialTitle ||
                existingBeforeLookup.title,
              libraryNeedsReview: false,
              libraryReviewReason: '',
              identityReviewCandidates: []
            };

            if (
              !exactMalCandidate &&
              !String(existingBeforeLookup.kitsuId || existingBeforeLookup.kitsu_id || '').trim()
            ) {
              const linkage = await resolveSafeKitsuIdentity(merged);
              merged = applySafeKitsuIdentity(merged, linkage, 'onboarding-import-safe-resolution');
              const requiresReview = Boolean(
                linkage.identityDecision.needsReview || linkage.identityDecision.unresolved
              );
              if (requiresReview) {
                merged = {
                  ...merged,
                  libraryNeedsReview: true,
                  libraryReviewReason: linkage.identityDecision.reason,
                  identityReviewCandidates: (linkage.results || []).slice(0, 5)
                };
                summary.needsReview.push({
                  ...row,
                  title: row.requestedTitle || row.title,
                  importedRecordId: existingBeforeLookup.id,
                  reason: linkage.identityDecision.reason,
                  candidates: linkage.results || []
                });
              }
            }

            const saved = await onUpdateAnime(merged);
            liveLibrary = saved?.anime || liveLibrary.map((item) =>
              String(item.id) === String(merged.id) ? merged : item
            );
            summary.updated.push(merged.officialTitle || merged.title);
            continue;
          }

          const result = exactMalCandidate
            ? {
                candidate: exactMalCandidate,
                duplicate: findDuplicateAnime(liveLibrary, exactMalCandidate),
                results: [exactMalCandidate],
                identityDecision: {
                  safe: true,
                  kitsuId: exactMalCandidate.kitsuId,
                  needsReview: false,
                  unresolved: false,
                  reason: 'Official Kitsu MyAnimeList mapping.'
                }
              }
            : await importAnimeByTitle({
                title: row.requestedTitle || row.title,
                normalizedTitle: row.title,
                status: row.status || 'Completed',
                library: liveLibrary,
                requireSafeIdentity: true
              });

          if (result.duplicate) {
            const sameMalIdentity = Boolean(
              row.malId &&
              String(result.duplicate.malId || result.duplicate.mal_id || '') === String(row.malId)
            );
            if (sameMalIdentity || importedTitleMatchesLibraryItem(row.requestedTitle || row.title, result.duplicate)) {
              const mergedBase = exactMalCandidate
                ? mergeAnimeMetadata(result.duplicate, exactMalCandidate, row.status)
                : result.duplicate;
              const merged = {
                ...mergedBase,
                ...importedPersonalData(row),
                id: result.duplicate.id,
                title: exactMalCandidate?.title || result.duplicate.title,
                officialTitle:
                  exactMalCandidate?.officialTitle ||
                  result.duplicate.officialTitle ||
                  result.duplicate.title,
                libraryNeedsReview: false,
                libraryReviewReason: '',
                identityReviewCandidates: []
              };
              const saved = await onUpdateAnime(merged);
              liveLibrary = saved?.anime || liveLibrary.map((item) =>
                String(item.id) === String(merged.id) ? merged : item
              );
              summary.updated.push(merged.officialTitle || merged.title);
            } else {
              const collisionCandidates = [...(result.results || []), result.candidate].filter(Boolean);
              const candidateMetadata = result.candidate || collisionCandidates[0] || {};
              const reviewReason = `Possible duplicate collision with “${result.duplicate.officialTitle || result.duplicate.title}”.`;
              const reviewRecordId = `mal-review-${row.malId || `${index}-${String(row.title || 'title').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}`;
              const reviewRecord = {
                ...candidateMetadata,
                ...importedPersonalData(row),
                id: reviewRecordId,
                malId: row.malId || candidateMetadata.malId || '',
                mal_id: row.malId || candidateMetadata.mal_id || '',
                kitsuId: '',
                kitsu_id: '',
                title: row.requestedTitle || row.title,
                officialTitle: row.requestedTitle || row.title,
                addedFrom: row.sourceName || 'First-time onboarding import',
                finalRank: liveLibrary.length + 1,
                libraryNeedsReview: true,
                identityNeedsReview: true,
                metadataNeedsReview: true,
                libraryReviewReason: reviewReason,
                metadataReviewReason: reviewReason,
                identityReviewCandidates: collisionCandidates.slice(0, 5),
                identityResolutionStatus: 'review'
              };
              const saved = await onUpdateAnime(reviewRecord);
              liveLibrary = saved?.anime || [...liveLibrary, reviewRecord];
              summary.added.push(reviewRecord.officialTitle || reviewRecord.title);
              summary.needsReview.push({
                ...row,
                title: row.requestedTitle || row.title,
                importedRecordId: reviewRecord.id,
                reason: reviewReason,
                candidates: collisionCandidates
              });
            }
            continue;
          }

          if (!result.candidate) {
            summary.failed.push({
              ...row,
              title: row.requestedTitle || row.title,
              reason: 'No safe import candidate was returned.',
              candidates: result.results || []
            });
            continue;
          }

          const next = {
            ...result.candidate,
            ...importedPersonalData(row),
            id: result.candidate.id,
            title: result.candidate.title || row.title,
            officialTitle: result.candidate.officialTitle || result.candidate.title || row.title,
            addedFrom: row.sourceName || 'First-time onboarding import',
            favorite: Boolean(result.candidate.favorite),
            rewatches: row.rewatches !== undefined ? row.rewatches : Number(result.candidate.rewatches || 0),
            finalRank: liveLibrary.length + 1,
            notes: row.notes !== undefined ? row.notes : (result.candidate.notes || ''),
            libraryNeedsReview: Boolean(
              result.identityDecision?.needsReview || result.identityDecision?.unresolved
            ),
            libraryReviewReason:
              result.identityDecision?.reason || result.candidate.libraryReviewReason || '',
            identityReviewCandidates: (result.results || []).slice(0, 5)
          };

          const saved = await onUpdateAnime(next);
          liveLibrary = saved?.anime || [...liveLibrary, next];
          summary.added.push(next.officialTitle || next.title);

          if (result.identityDecision?.needsReview || result.identityDecision?.unresolved) {
            summary.needsReview.push({
              ...row,
              title: row.requestedTitle || row.title,
              importedRecordId: next.id,
              reason: result.identityDecision.reason,
              candidates: result.results || []
            });
          }
        } catch (error) {
          console.warn('Onboarding library import failed:', row.title, error);
          summary.failed.push({
            ...row,
            title: row.requestedTitle || row.title,
            reason: error?.message || String(error),
            candidates: []
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 40));
      }

      saveLibraryImportSummary(summary);
      const loaded = importTotal(summary);
      setMessage(
        `Import finished — ${summary.added.length} added, ${summary.updated.length} updated, ` +
        `${summary.needsReview.length} need review, ${summary.failed.length} failed.`
      );
      if (!loaded && !summary.needsReview.length && !summary.failed.length) {
        setMessage('Nothing new was found in that file. You can choose another file or start clean.');
      }
    } finally {
      setLibraryImportProgress(null);
      setBusy(false);
    }
  }

  async function handleLibraryImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;

    setBusy(true);
    setMessage(`Reading ${file.name}…`);
    try {
      const text = await readLibraryImportFile(file);
      const rows = parseLibraryImport(text, file.name.replace(/\.gz$/i, ''));
      if (!rows.length) {
        setMessage('No anime titles were found. Choose a MAL XML/XML.GZ, AniList JSON/CSV, or TXT/CSV list.');
        return;
      }
      setBusy(false);
      await importLibraryRows(rows);
    } catch (error) {
      setMessage(`Could not import that file: ${error?.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function prepareSelectedAnime() {
    if (!selected.length) {
      setPrepared([]);
      setRatings({});
      moveTo(importTotal(libraryImportSummary) ? 4 : 3);
      return;
    }

    setBusy(true);
    setMessage(`Preparing 1 of ${selected.length}…`);
    const nextPrepared = [];

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const choice = selected[index];
        setMessage(`Preparing ${index + 1} of ${selected.length}: ${titleOf(choice)}`);

        let completed = choice;
        try {
          const result = await enrichAnimeCandidate({
            candidate: choice,
            library: anime,
            status: 'Completed'
          });
          completed = result.candidate || choice;
        } catch (error) {
          console.warn('Onboarding metadata enrichment failed:', titleOf(choice), error);
        }

        const existing = findDuplicateAnime(anime, completed);
        nextPrepared.push(existing
          ? { ...existing, ...completed, id: existing.id, _onboardingExisting: existing }
          : completed);
      }

      const nextRatings = {};
      nextPrepared.forEach((item) => {
        const existing = item._onboardingExisting || item;
        nextRatings[candidateKey(item)] = {
          score: defaultRating(existing),
          favorite: item._onboardingExisting ? Boolean(existing.favorite) : true,
          rewatches: Math.max(0, Number(existing.rewatches || 0))
        };
      });

      setPrepared(nextPrepared);
      setRatings(nextRatings);
      moveTo(3);
    } finally {
      setBusy(false);
    }
  }

  async function saveRatingsAndContinue() {
    if (busy || !prepared.length) {
      moveTo(4);
      return;
    }

    setBusy(true);
    try {
      for (let index = 0; index < prepared.length; index += 1) {
        const item = prepared[index];
        const key = candidateKey(item);
        const rating = ratings[key] || {
          score: 8,
          favorite: true,
          rewatches: 0
        };
        const existing = item._onboardingExisting;
        const cleanItem = { ...item };
        delete cleanItem._onboardingExisting;

        setMessage(`Saving ${index + 1} of ${prepared.length}: ${titleOf(item)}`);
        await onUpdateAnime?.({
          ...(existing || {}),
          ...cleanItem,
          id: existing?.id || cleanItem.id,
          title: cleanItem.officialTitle || cleanItem.title || existing?.title,
          status: existing?.status || 'Completed',
          joeScore: Math.round(Number(rating.score) * 10) / 10,
          favorite: Boolean(rating.favorite),
          rewatches: Math.max(0, Number(rating.rewatches || 0)),
          addedFrom: existing?.addedFrom || 'First-time onboarding'
        });
      }
      moveTo(4);
    } catch (error) {
      console.warn('Could not save onboarding taste anchors:', error);
      setMessage(`Could not save that title: ${error?.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function skipCurrentStep() {
    if (step === 2) {
      setSelected([]);
      setPrepared([]);
      setRatings({});
    }
    moveTo(Math.min(4, step + 1));
  }

  if (!open) return null;

  return (
    <div className="firstLaunchOverlay" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
      <section className={`firstLaunchCard firstLaunchStep${step}`}>
        <StepProgress step={step} updateOnly={updateOnly} />
        <div className="firstLaunchHeading">
          <span className="firstLaunchIcon">{STEPS[step].icon}</span>
          <div>
            <p className="firstLaunchEyebrow">{updateOnly ? `Beta 22 update ${step === 4 ? 2 : 1} of 2` : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step].eyebrow}`}</p>
            {step === 0 && <h2 id="first-launch-title">Welcome to JoeAnimeDB.</h2>}
            {step === 1 && <h2 id="first-launch-title">{updateOnly ? 'Set up your new Home.' : 'Pick your signal.'}</h2>}
            {step === 2 && <h2 id="first-launch-title">What anime do you love?</h2>}
            {step === 3 && <h2 id="first-launch-title">Give JoeAI a head start.</h2>}
            {step === 4 && <h2 id="first-launch-title">{updateOnly ? 'Meet your Home Decision Engine.' : 'Your library is ready.'}</h2>}
          </div>
        </div>

        <div className="firstLaunchContent">
          {step === 0 && (
            <>
              <p className="firstLaunchBody">
                Bring your anime with you so Home, sequel discovery, Anime DNA, and JoeAI have something useful to work with immediately.
              </p>
              <label htmlFor="first-launch-name">What should JoeAI call you?</label>
              <input
                id="first-launch-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Display name (optional)"
                maxLength={32}
                autoFocus
              />
              <input
                ref={libraryImportInputRef}
                className="firstLaunchImportInput"
                type="file"
                accept=".txt,.csv,.json,.xml,.gz,text/plain,text/csv,application/json,application/xml,text/xml,application/gzip"
                onChange={handleLibraryImportFile}
              />
              <section className="firstLaunchImport" aria-labelledby="first-launch-import-title">
                <header>
                  <div>
                    <strong id="first-launch-import-title">Bring your library</strong>
                    <small>Import now or start clean. Nothing here replaces a JoeAnimeDB backup.</small>
                  </div>
                  <b>{libraryImportSummary ? `${importTotal(libraryImportSummary)} loaded` : 'Optional'}</b>
                </header>
                <div className="firstLaunchImportGrid">
                  <button type="button" onClick={() => libraryImportInputRef.current?.click()} disabled={busy}>
                    <span>🔷</span><strong>MyAnimeList</strong><small>XML or XML.GZ export</small>
                  </button>
                  <button type="button" onClick={() => libraryImportInputRef.current?.click()} disabled={busy}>
                    <span>🔹</span><strong>AniList</strong><small>JSON or CSV export</small>
                  </button>
                  <button type="button" onClick={() => libraryImportInputRef.current?.click()} disabled={busy}>
                    <span>📄</span><strong>TXT or CSV</strong><small>One title per line also works</small>
                  </button>
                </div>
              </section>
              {libraryImportProgress && (
                <div className="firstLaunchImportProgress" role="status" aria-live="polite">
                  <span><i style={{ width: `${Math.round((libraryImportProgress.processed / libraryImportProgress.total) * 100)}%` }} /></span>
                  <b>{libraryImportProgress.processed}/{libraryImportProgress.total}</b>
                  <small>{libraryImportProgress.title}</small>
                </div>
              )}
              {!libraryImportProgress && message && <p className="firstLaunchMessage" role="status">{message}</p>}
              {libraryImportSummary && (
                <div className="firstLaunchImportSummary" aria-label="Library import summary">
                  <span><b>{libraryImportSummary.added.length}</b> added</span>
                  <span><b>{libraryImportSummary.updated.length}</b> updated</span>
                  <span><b>{libraryImportSummary.needsReview.length}</b> need review</span>
                  <span><b>{libraryImportSummary.failed.length}</b> failed</span>
                </div>
              )}
              <div className="firstLaunchFeature">
                <b>No demo data.</b>
                <span>Import a real list or continue without importing to start clean. Uncertain matches are saved for review instead of being linked to the wrong anime.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="firstLaunchBody">Choose a theme, recommendation limits, and the streaming services you use. You can change any of these later in Settings.</p>
              <div className="firstLaunchThemes">
                {THEMES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={theme === option.id ? 'active' : ''}
                    onClick={() => onThemeChange?.(option.id)}
                    aria-pressed={theme === option.id}
                  >
                    <span style={{ '--theme-a': option.colors[0], '--theme-b': option.colors[1] }} />
                    <strong>{option.label}</strong>
                    <small>{theme === option.id ? 'Selected' : 'Preview'}</small>
                  </button>
                ))}
              </div>
              <div className="firstLaunchSafety">
                <div>
                  <strong>Recommendation content</strong>
                  <small>This filters Discover, JoeAI, and Quick Ask. You can change it later in Settings.</small>
                </div>
                <div className="firstLaunchSafetyOptions" role="radiogroup" aria-label="Recommendation content safety mode">
                  {CONTENT_SAFETY_MODES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={contentSafetyMode === option.id}
                      className={contentSafetyMode === option.id ? 'active' : ''}
                      onClick={() => onContentSafetyModeChange?.(option.id)}
                    >
                      <b>{option.label}</b>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              </div>
              <section className="firstLaunchStreaming" aria-labelledby="first-launch-streaming-title">
                <header>
                  <div>
                    <strong id="first-launch-streaming-title">My streaming services</strong>
                    <small>Unlocks On Your Services on Home and puts your providers first in Quick Watch.</small>
                  </div>
                  <b>{streamingApps.length ? `${streamingApps.length} selected` : 'Optional'}</b>
                </header>
                <div className="firstLaunchStreamingGrid" role="group" aria-label="My streaming services">
                  {STREAMING_APP_OPTIONS.map((option) => {
                    const isSelected = streamingApps.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={isSelected ? 'active' : ''}
                        aria-pressed={isSelected}
                        onClick={() => toggleStreamingApp(option.id)}
                      >
                        <strong>{option.label}</strong>
                        <small>{isSelected ? 'Selected' : option.description}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {step === 2 && (
            <>
              <p className="firstLaunchBody">
                {importTotal(libraryImportSummary)
                  ? `Your ${importTotal(libraryImportSummary)} imported titles already give JoeAI a head start. You can continue now or add up to three favorites as stronger taste anchors.`
                  : 'Search for up to three favorites. JoeAI will use their ratings, genres, and Genomes as your first taste anchors.'}
              </p>
              <form className="firstLaunchSearch" onSubmit={search}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try One Piece, Dragon Ball, Frieren…"
                  aria-label="Search anime"
                />
                <button type="submit" disabled={!query.trim() || busy}>{busy ? 'Searching…' : 'Search'}</button>
              </form>
              <div className="firstLaunchSelectionMeta">
                <span>{selected.length} of 3 selected</span>
                {message && <small>{message}</small>}
              </div>
              <div className="firstLaunchAnimeResults">
                {results.map((item) => {
                  const isSelected = selectedKeys.has(candidateKey(item));
                  return (
                    <AnimeChoice
                      key={candidateKey(item)}
                      anime={item}
                      selected={isSelected}
                      disabled={selected.length >= 3}
                      onClick={() => toggleCandidate(item)}
                    />
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="firstLaunchBody">
                Ratings use 0.1 steps. Favorites and rewatches carry extra weight because they signal lasting attachment.
              </p>
              {busy && <div className="firstLaunchWorking"><span />{message || 'Preparing your anchors…'}</div>}
              {!busy && prepared.length > 0 && (
                <div className="firstLaunchRatings">
                  {prepared.map((item) => {
                    const key = candidateKey(item);
                    return (
                      <RatingCard
                        key={key}
                        item={item}
                        value={ratings[key]}
                        onChange={(next) => setRatings((current) => ({ ...current, [key]: next }))}
                      />
                    );
                  })}
                </div>
              )}
              {!busy && !prepared.length && (
                <div className="firstLaunchEmpty">
                  <span>☆</span>
                  <strong>No anchors selected</strong>
                  <p>That’s completely fine. Add and rate anime from your Library whenever you’re ready.</p>
                </div>
              )}
              {!busy && message && <p className="firstLaunchMessage">{message}</p>}
            </>
          )}

          {step === 4 && (
            <>
              <p className="firstLaunchBody">
                {nameDraft.trim() ? `Welcome, ${nameDraft.trim()}. ` : ''}
                Your library is ready, and Home can start turning it into useful choices. The more you rate, favorite, rewatch, and teach JoeAI, the sharper its recommendations and Anime DNA become.
              </p>
              <div className="firstLaunchFeature">
                <b>Home is your decision engine.</b>
                <span>Continue Watching, Returning For You, You Missed a Sequel, On Your Services, and Quick Pick appear only when your library has something useful for them to show.</span>
              </div>
              <section className="firstLaunchBuildGuide" aria-labelledby="first-launch-home-title">
                <div className="firstLaunchBuildHeading">
                  <span>⌂</span>
                  <div>
                    <strong id="first-launch-home-title">What is new on Home</strong>
                    <small>Useful shelves appear automatically and disappear when they have nothing actionable.</small>
                  </div>
                </div>
                <div className="firstLaunchBuildSteps">
                  <article><b>1</b><div><strong>Continue Watching</strong><p>Every title marked Watching stays one action away from its Details card.</p></div></article>
                  <article><b>2</b><div><strong>Returning and missed sequels</strong><p>Verified direct continuations are separated into current or upcoming returns and older sequels missing from your library.</p></div></article>
                  <article><b>3</b><div><strong>On Your Services</strong><p>Uses the services you selected to surface personal matches you can stream now.</p></div></article>
                  <article><b>4</b><div><strong>JoeAI Quick Pick</strong><p>Choose a mood or format, then press the selected intent again whenever you want another qualified pick.</p></div></article>
                </div>
              </section>

              {!updateOnly && (
                <>
              <section className="firstLaunchBuildGuide" aria-labelledby="first-launch-build-title">
                <div className="firstLaunchBuildHeading">
                  <span>＋</span>
                  <div>
                    <strong id="first-launch-build-title">Four ways to build your library</strong>
                    <small>Use whichever is fastest for what you’re adding.</small>
                  </div>
                </div>
                <div className="firstLaunchBuildSteps">
                  <article>
                    <b>1</b>
                    <div>
                      <strong>Add one exact title</strong>
                      <span className="firstLaunchPath">Library <i>›</i> + Add Anime <i>›</i> Single Search</span>
                      <p>Search the name, choose the correct Kitsu result, set its status, then add it. This is best for sequels and franchises with similar names.</p>
                    </div>
                  </article>
                  <article>
                    <b>2</b>
                    <div>
                      <strong>Import a watch list</strong>
                      <span className="firstLaunchPath">Library <i>›</i> + Add Anime <i>›</i> Bulk Paste</span>
                      <p>Paste one anime title per line. JoeAnimeDB imports safe matches, skips titles already owned, and places uncertain matches in Needs Review for you to confirm.</p>
                    </div>
                  </article>
                  <article>
                    <b>3</b>
                    <div>
                      <strong>Tell JoeAI what to add</strong>
                      <span className="firstLaunchPath">JoeAI <i>›</i> Ask naturally</span>
                      <p>Try “add Frieren as completed” or give JoeAI a comma-separated list. It can set the status, skip duplicates, and ask which version you mean when a title is ambiguous.</p>
                    </div>
                  </article>
                  <article>
                    <b>4</b>
                    <div>
                      <strong>Import a library list (merge)</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Import Library List</span>
                      <p>Use this for MyAnimeList XML/XML.GZ, AniList JSON/CSV, or JoeAnimeDB TXT/CSV/ranked lists. Import adds or updates supported personal list data inside your current library. It does not replace the whole JoeAnimeDB database like Restore Full Backup does.</p>
                    </div>
                  </article>
                </div>
              </section>

              <section className="firstLaunchBuildGuide" aria-labelledby="first-launch-joeai-title">
                <div className="firstLaunchBuildHeading">
                  <span>🧠</span>
                  <div>
                    <strong id="first-launch-joeai-title">Meet the current JoeAI</strong>
                    <small>It is more than a search box — ask naturally, then steer the conversation.</small>
                  </div>
                </div>
                <div className="firstLaunchBuildSteps">
                  <article>
                    <b>1</b>
                    <div>
                      <strong>Get a recommendation built around you</strong>
                      <span className="firstLaunchPath">JoeAI <i>›</i> “what should I watch next?”</span>
                      <p>JoeAI uses your Anime DNA, ratings, favorites, rewatches, Genome signals, and the exact request you make. Try “recommend something like Bleach but shorter” or “recommend Slime without isekai.”</p>
                    </div>
                  </article>
                  <article>
                    <b>2</b>
                    <div>
                      <strong>Compare anime before you commit</strong>
                      <span className="firstLaunchPath">JoeAI <i>›</i> “which would I like better, Banana Fish or Gintama?”</span>
                      <p>If both titles are in your library, JoeAI uses your saved receipts. If one or both are unseen, it can compare predicted taste fit instead — without pretending you already rated them.</p>
                    </div>
                  </article>
                  <article>
                    <b>3</b>
                    <div>
                      <strong>Keep steering without starting over</strong>
                      <span className="firstLaunchPath">JoeAI <i>›</i> “darker” <i>›</i> “no school” <i>›</i> “another one”</span>
                      <p>Recommendation follow-ups keep the original request in context. Add or remove constraints, ask for another pick, or ask “why that one?” without rewriting the whole prompt.</p>
                    </div>
                  </article>
                  <article>
                    <b>4</b>
                    <div>
                      <strong>Ask what JoeAI has learned about you</strong>
                      <span className="firstLaunchPath">JoeAI <i>›</i> “what is unusual about my library?”</span>
                      <p>Ask why you like a title, what changed in your Anime DNA, what surprised JoeAI about your ratings, or what assumptions about your taste would probably be wrong.</p>
                    </div>
                  </article>
                </div>
              </section>

              <section className="firstLaunchBuildGuide" aria-labelledby="first-launch-backup-title">
                <div className="firstLaunchBuildHeading">
                  <span>🛟</span>
                  <div>
                    <strong id="first-launch-backup-title">Backup, restore, import, or export?</strong>
                    <small>They sound similar, but they are meant for different jobs.</small>
                  </div>
                </div>
                <div className="firstLaunchBuildSteps">
                  <article>
                    <b>1</b>
                    <div>
                      <strong>Full Backup = recovery copy</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Update Rolling Backup / Save Backup As...</span>
                      <p>Creates a JoeAnimeDB JSON backup containing the database plus supported app preferences and JoeAI memory. Use this before resets, browser cleanup, or moving to another device.</p>
                    </div>
                  </article>
                  <article>
                    <b>2</b>
                    <div>
                      <strong>Restore Full Backup = replace current data</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Restore Full Backup</span>
                      <p>Loads a JoeAnimeDB full-backup JSON and replaces the current database with that saved copy. Use it for recovery — not for importing a MAL or AniList watch list.</p>
                    </div>
                  </article>
                  <article>
                    <b>3</b>
                    <div>
                      <strong>Import Library List = merge titles</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Import Library List</span>
                      <p>Merges supported watch-list data into the library you already have. This is the option for MAL, AniList, TXT, CSV, and ranked-list imports.</p>
                    </div>
                  </article>
                  <article>
                    <b>4</b>
                    <div>
                      <strong>Export = portable/shareable list</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Export...</span>
                      <p>TXT, ranked list, CSV, MAL, and AniList exports are for sharing or moving list data. They do not contain everything needed to fully restore JoeAnimeDB.</p>
                    </div>
                  </article>
                </div>
              </section>
                </>
              )}

              <div className="firstLaunchReadyGrid">
                <button type="button" onClick={() => onComplete?.('dashboard')}>
                  <span>⌂</span><strong>Home</strong><small>Continue, discover sequels, or get a Quick Pick</small>
                </button>
                <button type="button" onClick={() => onComplete?.('library')}>
                  <span>▤</span><strong>Library</strong><small>Add, rate, favorite, and rewatch</small>
                </button>
                <button type="button" onClick={() => onComplete?.('assistant')}>
                  <span>🧠</span><strong>JoeAI</strong><small>Recommendations, comparisons & Anime DNA</small>
                </button>
                <button type="button" onClick={() => onComplete?.('discover')}>
                  <span>✦</span><strong>Discover</strong><small>Find unseen Anime DNA matches</small>
                </button>
              </div>
              <div className="firstLaunchFeature">
                <b>Tips continue as you explore.</b>
                <span>Each major page explains itself once. Dismissed tips stay dismissed and are included in your backup.</span>
              </div>
            </>
          )}
        </div>

        <footer className="firstLaunchActions">
          <button type="button" className="quiet" onClick={() => onSkip?.()} disabled={busy}>
            {updateOnly ? 'Skip update' : 'Skip setup'}
          </button>
          <div>
            {step > 0 && step < 4 && !updateOnly && (
              <button type="button" onClick={() => moveTo(step - 1)} disabled={busy}>Back</button>
            )}
            {step < 4 && !updateOnly && (
              <button type="button" onClick={skipCurrentStep} disabled={busy}>Skip this step</button>
            )}
            {step === 0 && (
              <button type="button" className="primary" onClick={saveNameAndContinue} disabled={busy}>
                {busy ? 'Importing…' : libraryImportSummary ? `Continue with ${importTotal(libraryImportSummary)} titles` : 'Continue — start clean'}
              </button>
            )}
            {step === 1 && (
              <button type="button" className="primary" onClick={() => moveTo(updateOnly ? 4 : 2)}>Continue</button>
            )}
            {step === 2 && (
              <button type="button" className="primary" onClick={prepareSelectedAnime} disabled={busy}>
                {busy ? 'Preparing…' : selected.length ? `Rate ${selected.length} title${selected.length === 1 ? '' : 's'}` : importTotal(libraryImportSummary) ? 'Use imported library' : 'Continue'}
              </button>
            )}
            {step === 3 && (
              <button type="button" className="primary" onClick={saveRatingsAndContinue} disabled={busy}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            )}
            {step === 4 && (
              <button type="button" className="primary" onClick={() => onComplete?.('dashboard')}>
                Start exploring
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

export function OnboardingPageTip({ view, dismissed = [], hidden = false, onDismiss }) {
  const tip = PAGE_TIPS[view];
  if (hidden || !tip || dismissed.includes(view)) return null;

  return (
    <aside className="onboardingPageTip" aria-live="polite">
      <button type="button" className="onboardingPageTipClose" onClick={() => onDismiss?.(view)} aria-label="Dismiss tip">×</button>
      <span className="onboardingPageTipIcon">{tip.icon}</span>
      <div>
        <p>{tip.eyebrow}</p>
        <strong>{tip.title}</strong>
        <span>{tip.body}</span>
        <button type="button" onClick={() => onDismiss?.(view)}>Got it</button>
      </div>
    </aside>
  );
}
