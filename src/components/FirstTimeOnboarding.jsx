import React, { useEffect, useMemo, useState } from 'react';
import { Poster } from './Poster';
import {
  enrichAnimeCandidate,
  findDuplicateAnime,
  searchAnimeCandidates
} from '../services/animeImporter';
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
    title: 'JoeAI can update your library too.',
    body: 'Try “add Frieren as completed” or “add Bleach, One Piece, Initial D as completed.” JoeAI asks you to choose when a title is ambiguous.'
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
    title: 'Import, back up, and maintain your library.',
    body: 'Import Library List accepts JoeAnimeDB CSV, plain-text, and ranked-list exports. You can also create full backups, check providers, change themes, and replay this tutorial.'
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

function StepProgress({ step }) {
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
  displayName = '',
  theme = 'neon',
  anime = [],
  onThemeChange,
  onSaveDisplayName,
  onUpdateAnime,
  onStepChange,
  onComplete,
  onSkip
}) {
  const [step, setStep] = useState(initialStep);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [prepared, setPrepared] = useState([]);
  const [ratings, setRatings] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(Math.max(0, Math.min(4, Number(initialStep || 0))));
    setNameDraft(displayName || '');
    setMessage('');
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

  async function prepareSelectedAnime() {
    if (!selected.length) {
      setPrepared([]);
      setRatings({});
      moveTo(3);
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
        <StepProgress step={step} />
        <div className="firstLaunchHeading">
          <span className="firstLaunchIcon">{STEPS[step].icon}</span>
          <div>
            <p className="firstLaunchEyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step].eyebrow}</p>
            {step === 0 && <h2 id="first-launch-title">Welcome to JoeAnimeDB.</h2>}
            {step === 1 && <h2 id="first-launch-title">Pick your signal.</h2>}
            {step === 2 && <h2 id="first-launch-title">What anime do you love?</h2>}
            {step === 3 && <h2 id="first-launch-title">Give JoeAI a head start.</h2>}
            {step === 4 && <h2 id="first-launch-title">Your library is ready.</h2>}
          </div>
        </div>

        <div className="firstLaunchContent">
          {step === 0 && (
            <>
              <p className="firstLaunchBody">
                JoeAnimeDB remembers what you watch and learns why it matters to you. Start with a name, or leave it blank and change it later in Settings.
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
              <div className="firstLaunchFeature">
                <b>No demo data.</b>
                <span>You begin with a clean library. Only the titles you choose become part of your Anime DNA.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="firstLaunchBody">Choose a theme now and watch the app change behind this window. You can switch again anytime in Settings.</p>
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
            </>
          )}

          {step === 2 && (
            <>
              <p className="firstLaunchBody">Search for up to three favorites. JoeAI will use their ratings, genres, and Genomes as your first taste anchors.</p>
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
                JoeAI will keep learning as your real library grows.
              </p>
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
                      <strong>Import a saved file</strong>
                      <span className="firstLaunchPath">Settings <i>›</i> Library <i>›</i> Import Library List</span>
                      <p>Choose a JoeAnimeDB CSV, plain-text library list, or ranked TXT list. Existing titles are skipped, while available scores and watch statuses are carried into the new library.</p>
                    </div>
                  </article>
                </div>
              </section>
              <div className="firstLaunchReadyGrid">
                <button type="button" onClick={() => onComplete?.('library')}>
                  <span>▤</span><strong>Library</strong><small>Add, rate, favorite, and rewatch</small>
                </button>
                <button type="button" onClick={() => onComplete?.('assistant')}>
                  <span>🧠</span><strong>JoeAI</strong><small>Ask about titles and your taste</small>
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
            Skip setup
          </button>
          <div>
            {step > 0 && step < 4 && (
              <button type="button" onClick={() => moveTo(step - 1)} disabled={busy}>Back</button>
            )}
            {step < 4 && (
              <button type="button" onClick={skipCurrentStep} disabled={busy}>Skip this step</button>
            )}
            {step === 0 && (
              <button type="button" className="primary" onClick={saveNameAndContinue} disabled={busy}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            )}
            {step === 1 && (
              <button type="button" className="primary" onClick={() => moveTo(2)}>Continue</button>
            )}
            {step === 2 && (
              <button type="button" className="primary" onClick={prepareSelectedAnime} disabled={busy}>
                {busy ? 'Preparing…' : selected.length ? `Rate ${selected.length} title${selected.length === 1 ? '' : 's'}` : 'Continue'}
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
