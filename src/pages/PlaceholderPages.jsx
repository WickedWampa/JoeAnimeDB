import React, { useMemo, useState } from 'react';
import { Poster } from '../components/Poster';
import { score, countBy } from '../utils/animeUtils';
import { exportBackup, resetData } from '../services/storage';
import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata'; import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor';
import { buildTonightsWatch } from '../ai/tonightsWatch'; import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';

export function Universe({ anime, setQuery, setView }) {
  const studios = countBy(anime.map((item) => item.studio)).slice(0, 10);
  const genres = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 10);
  const jump = (term) => {
    setQuery(term);
    setView('library');
  };

  return (
    <section className="grid2">
      <div className="universeCore">
        <h1>Joe</h1>
        <p>{anime.length} anime connected by studios, genres, rankings, and rewatches.</p>
      </div>
      <div className="panel">
        <h2>Studios</h2>
        {studios.map(([name, count]) => <button className="branch" key={name} onClick={() => jump(name)}>{name}<span>{count}</span></button>)}
      </div>
      <div className="panel">
        <h2>Genres</h2>
        {genres.map(([name, count]) => <button className="branch" key={name} onClick={() => jump(name)}>{name}<span>{count}</span></button>)}
      </div>
    </section>
  );
}

export function Assistant({ anime, catalog = [], updateAnime }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      type: 'text',
      text: 'JoeAI is wicked smaht now. Ask what I can do, tell me what you finished, bulk add titles, or ask for recommendations.'
    }
  ]);
  const [text, setText] = useState('');
  const [addingId, setAddingId] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  function animeId(item) {
    return String(item?.malId || item?.id || item?.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }

  function parseStatus(value = '') {
    const lower = String(value).toLowerCase();
    if (lower.includes('completed') || lower.includes('finished') || lower.includes('watched')) return 'Completed';
    if (lower.includes('plan')) return 'Plan to Watch';
    if (lower.includes('hold')) return 'On Hold';
    if (lower.includes('dropped')) return 'Dropped';
    return 'Watching';
  }

  function parseSingleAdd(value = '') {
    const raw = String(value).trim();

    // Lists belong to bulk import, not single-title add.
    if (raw.includes(',') || /\r?\n/.test(raw)) return null;

    const patterns = [
      /^add\s+(.+?)(?:\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold))?$/i,
      /^i(?:'| a)?m watching\s+(.+)$/i,
      /^i started\s+(.+)$/i,
      /^started\s+(.+)$/i,
      /^i finished\s+(.+)$/i,
      /^finished\s+(.+)$/i,
      /^i completed\s+(.+)$/i,
      /^completed\s+(.+)$/i,
      /^mark\s+(.+?)\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match?.[1]) continue;

      const title = match[1]
        .replace(/\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '')
        .replace(/\s+to\s+(?:my\s+)?library$/i, '')
        .trim();

      if (title) return { title, status: parseStatus(raw) };
    }

    return null;
  }

  function parseBulkAdd(value = '') {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    const status = parseStatus(raw);

    let body = raw;

    const explicitBulk =
      lower.startsWith('add these') ||
      lower.startsWith('import these') ||
      lower.startsWith('bulk add') ||
      lower.startsWith('add list') ||
      lower.startsWith('import list');

    if (explicitBulk) {
      body = raw.includes(':')
        ? raw.slice(raw.indexOf(':') + 1)
        : raw.replace(/^(add these|import these|bulk add|add list|import list)/i, '');
    } else {
      // Natural bulk commands:
      // "add Bleach, One Piece, Initial D as completed"
      // "mark Bleach, Naruto as completed"
      // "I finished Bleach, Naruto, One Piece"
      body = raw
        .replace(/^(add|import|mark|i finished|finished|i completed|completed|i watched|watched)\s+/i, '')
        .replace(/\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '')
        .replace(/\s+to\s+(?:my\s+)?library$/i, '');
    }

    const hasListSeparator = body.includes(',') || /\r?\n/.test(body);
    if (!explicitBulk && !hasListSeparator) return null;

    const titles = [...new Set(
      body
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
    )];

    return titles.length > 1 ? { titles, status } : null;
  }

  function helpAnswer() {
    return [
      '🍜 JoeAI can do this now:',
      '',
      '• what should I watch next?',
      '• explain my Anime DNA',
      '• what are my top genres?',
      '• what studio do I watch most?',
      '• what am I watching?',
      '• add Frieren as completed',
      '• I finished World Trigger',
      '• I am watching Magi',
      '• add these as completed: Bleach, Naruto, One Piece',
      '',
      'I use the same importer as the Library, so I fetch metadata, skip duplicates, and update existing entries.'
    ].join('\n');
  }

  function libraryStatsAnswer() {
    const completed = anime.filter((item) => String(item.status).toLowerCase() === 'completed').length;
    const watching = anime.filter((item) => String(item.status).toLowerCase() === 'watching').length;
    const favorites = anime.filter((item) => item.favorite).length;

    return [
      '🍜 Library status:',
      '',
      `• ${anime.length} titles total`,
      `• ${completed} completed`,
      `• ${watching} currently watching`,
      `• ${favorites} favorites`,
      `• ${catalog.length} catalog titles for recommendations`
    ].join('\n');
  }

  function currentlyWatchingAnswer() {
    const watching = anime
      .filter((item) => String(item.status).toLowerCase() === 'watching')
      .slice(0, 12);

    if (!watching.length) {
      return 'Nothing is marked Watching right now. Say “I am watching Magi” and I will add/update it.';
    }

    return [
      'You are currently watching:',
      '',
      ...watching.map((item) => `• ${item.title}${item.episodeCount ? ` (${item.episodeCount} eps)` : ''}`)
    ].join('\n');
  }

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
  }

  async function addAnimeToLibrary(input) {
    const id = 'anime-' + animeId(input);
    setAddingId(id);

    try {
      const result = await executeJoeAICommand({
        intent: {
          kind: 'singleAdd',
          title: input.title,
          status: input.status || 'Watching'
        },
        anime,
        catalog,
        updateAnime,
        brain
      });

      setLog((current) => [...current, { who: 'bot', ...result }]);
    } catch (error) {
      console.warn('JoeAI add-to-library failed:', input.title, error);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: 'I could not add ' + input.title + ' yet. Check the console and we will fix the save path.'
        }
      ]);
    } finally {
      setAddingId('');
    }
  }

  async function executeBulkAddFromChat(command) {
    setLog((current) => [
      ...current,
      {
        who: 'bot',
        type: 'text',
        text: `Starting bulk import for ${command.titles.length} title(s)...`
      }
    ]);

    const result = await executeJoeAICommand({
      intent: {
        kind: 'bulkAdd',
        titles: command.titles,
        status: command.status || 'Watching'
      },
      anime,
      catalog,
      updateAnime,
      brain
    });

    setLog((current) => [...current, { who: 'bot', ...result }]);
  }

  async function ask() {
    const q = text.trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    const intent = parseJoeAIIntent(q);

    if (intent.kind === 'bulkAdd') {
      const action = { titles: intent.titles, status: intent.status, kind: 'bulkAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to bulk import',
          text: `I found ${intent.titles.length} title(s). I will add them as ${intent.status}, skip duplicates, and fetch metadata. Import these?`,
          confirmLabel: 'Import Titles',
          action
        }
      ]);
      return;
    }

    if (intent.kind === 'singleAdd') {
      const action = { title: intent.title, status: intent.status, kind: 'singleAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to update your library',
          text: `I will add or update “${intent.title}” as ${intent.status} and fetch metadata. Continue?`,
          confirmLabel: 'Do It',
          action
        }
      ]);
      return;
    }

    const result = await executeJoeAICommand({
      intent,
      anime,
      catalog,
      updateAnime,
      brain
    });

    setLog((current) => [...current, { who: 'bot', ...result }]);
  }

  function renderRecommendationCard(item, index) {
    const id = 'anime-' + animeId(item);
    const isAdding = addingId === id;

    return (
      <article className="joeaiRecCard" key={item.title + '-' + index}>
        <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
        <div className="joeaiRecBody">
          <div className="joeaiRecTopline">
            <span className="joeaiRecRank">#{index + 1}</span>
            <span className="joeaiMatchBadge">{item.match}%</span>
            <span className="joeaiMatchLabel">{item.matchLabel || 'Match'}</span>
          </div>

          <h3>{item.title}</h3>

          <div className="joeaiRecMeta">
            {item.year && <span>{item.year}</span>}
            {item.episodes && <span>{item.episodes} eps</span>}
            {item.studio && <span>{item.studio}</span>}
            {!item.metadataReady && <span>metadata pending</span>}
          </div>

          {item.reasons?.length > 0 && (
            <div className="joeaiReasonList">
              <strong>Why JoeAI picked it</strong>
              {item.reasons.map((reason) => (
                <span key={reason}>✓ {reason}</span>
              ))}
            </div>
          )}

          <div className="joeaiRecActions">
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, status: 'Watching' })} disabled={isAdding || !updateAnime}>
              {isAdding ? 'Adding...' : '+ Add to Library'}
            </button>
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, status: 'Completed' })} disabled={isAdding || !updateAnime}>
              Mark Completed
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderHelpCard(message, index) {
    return (
      <div key={index} className="chat bot joeaiHelpCard">
        <div className="joeaiHelpHero">
          <h2>{message.title}</h2>
          <p>{message.subtitle}</p>
        </div>

        <div className="joeaiHelpGrid">
          {(message.sections || []).map((section) => (
            <section key={section.title} className="joeaiHelpSection">
              <h3><span>{section.icon}</span>{section.title}</h3>
              <div>
                {(section.items || []).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setText(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {message.footer && <p className="joeaiHelpFooter">{message.footer}</p>}
      </div>
    );
  }

  function renderConfirmAction(message, index) {
    const action = message.action;

    return (
      <div key={index} className="chat bot joeaiConfirmCard">
        <div className="joeaiConfirmHeader">
          <h2>{message.title}</h2>
          <p>{message.text}</p>
        </div>

        {action?.kind === 'bulkAdd' && (
          <div className="joeaiConfirmList">
            {action.titles.map((title) => (
              <span key={title}>✓ {title}</span>
            ))}
          </div>
        )}

        <div className="joeaiConfirmActions">
          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setLog((current) => [...current, { who: 'bot', type: 'text', text: 'Canceled. No changes made.' }]);
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary"
            onClick={async () => {
              if (!pendingAction) return;
              const nextAction = pendingAction;
              setPendingAction(null);

              if (nextAction.kind === 'bulkAdd') {
                await executeBulkAddFromChat(nextAction);
              }

              if (nextAction.kind === 'singleAdd') {
                await addAnimeToLibrary(nextAction);
              }
            }}
          >
            {message.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  function renderBulkResult(message, index) {
    return (
      <div key={index} className="chat bot joeaiBulkResult">
        <div className="joeaiBulkHeader">
          <h2>{message.title}</h2>
          <div className="joeaiBulkStats">
            <span>Added: {message.added?.length || 0}</span>
            <span>Already in Library: {message.skipped?.length || 0}</span>
            <span>Failed: {message.failed?.length || 0}</span>
          </div>
        </div>

        {message.added?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Added</h3>
            {message.added.map((title) => (
              <div className="joeaiBulkRow added" key={title}>
                <span>✓</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.skipped?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Already in Library</h3>
            {message.skipped.map((title) => (
              <div className="joeaiBulkRow skipped" key={title}>
                <span>↪</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.failed?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Needs Attention</h3>
            {message.failed.map((title) => (
              <div className="joeaiBulkRow failed" key={title}>
                <span>!</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  function renderMessage(message, index) {
    if (message.type === 'helpCard') {
      return renderHelpCard(message, index);
    }

    if (message.type === 'confirmAction') {
      return renderConfirmAction(message, index);
    }

    if (message.type === 'bulkResult') {
      return renderBulkResult(message, index);
    }

    if (message.type === 'recommendations') {
      return (
        <div key={index} className="chat bot joeaiRecommendations">
          <div className="joeaiRecHeader">
            <h2>{message.title}</h2>
            <p>{message.subtitle}</p>
          </div>
          <div className="joeaiRecGrid">
            {message.items.map((item, itemIndex) => renderRecommendationCard(item, itemIndex))}
          </div>
        </div>
      );
    }

    return (
      <div key={index} className={'chat ' + message.who}>
        {message.text}
      </div>
    );
  }

  return (
    <section className="panel assistant-page">
      <div className="assistant-log">
        {log.map((message, index) => renderMessage(message, index))}
      </div>

      <div className="assistant-input joeaiChatInput">
        <textarea
          placeholder={'Ask JoeAI... try: add Frieren as completed\nOr: add these as completed: Bleach, Naruto, One Piece'}
          value={text}
          rows={2}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
        />
        <button onClick={ask}>Ask</button>
      </div>
    </section>
  );
}

export function Analytics({ anime }) {
  const studios = countBy(anime.map((item) => item.studio)).slice(0, 12);
  const genres = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 12);
  return (
    <section className="grid2">
      <BarPanel title="Studios" data={studios} />
      <BarPanel title="Genres" data={genres} />
    </section>
  );
}

function BarPanel({ title, data }) {
  const max = data[0]?.[1] || 1;
  return (
    <div className="panel">
      <h2>{title}</h2>
      {data.map(([name, count]) => (
        <div className="barRow" key={name}>
          <strong>{name}</strong>
          <div className="bar"><div style={{ width: `${(count / max) * 100}%` }} /></div>
          <span>{count}</span>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ anime, setSelected }) {
  const top = [...anime].sort((a, b) => Number(a.finalRank) - Number(b.finalRank)).slice(0, 18);
  return (
    <section className="panel">
      <h2>Timeline</h2>
      <div className="timelineCards">
        {top.map((item) => (
          <button className="timelineItem" key={item.id} onClick={() => setSelected(item)}>
            <Poster anime={item} className="thumb" />
            <strong>{item.title}</strong>
            <span>#{item.finalRank}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function BleachShrine({ anime, setSelected }) {
  const bleach = anime.find((item) => item.title === 'Bleach');
  const tybw = anime.find((item) => item.title === 'Bleach TYBW');
  return (
    <section className="shrine">
      <h1>BLEACH</h1>
      <p>GOAT status. Arcs, captains, openings, fights, and TYBW tracker live here.</p>
      <div className="shrineStats">
        <div><strong>#{bleach?.finalRank || 1}</strong><span>All-time</span></div>
        <div><strong>{bleach?.rewatches || 5}x</strong><span>Rewatches</span></div>
        <div><strong>{score(tybw || {}).toFixed(1)}</strong><span>TYBW</span></div>
      </div>
      <button onClick={() => bleach && setSelected(bleach)}>Open Bleach</button>
    </section>
  );
}

export function SettingsPage({ data, syncMetadata }) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <p>Backups, metadata sync, and database tools.</p>
      <div className="settingsActions">
        <button onClick={() => exportBackup(data)}>Export Backup</button>
        <button onClick={syncMetadata}>Update Database</button>
        <button onClick={resetData}>Reset Local Data</button>
      </div>
    </section>
  );
}
