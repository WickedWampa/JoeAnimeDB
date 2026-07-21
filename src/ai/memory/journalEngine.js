import { MEMORY_EVENT_TYPES, MEMORY_EVENT_ICONS, profileTopDimensions, titleOf, clampScore, memorySemanticKey } from './memoryTypes';

function nowIso() {
  return new Date().toISOString();
}

function itemStatus(item = {}) {
  return String(item.status || '').toLowerCase();
}

function shortTitles(items = [], limit = 8) {
  return items.map(titleOf).filter(Boolean).slice(0, limit);
}

function makeEvent(type, title, summary, details = {}) {
  const createdAt = nowIso();
  const semanticKey = memorySemanticKey(type, title, details);
  return {
    id: `${type}-${semanticKey}-${createdAt.slice(0, 10)}`,
    semanticKey,
    createdAt,
    type,
    icon: MEMORY_EVENT_ICONS[type] || '🧠',
    title,
    summary,
    ...details
  };
}

function profileSnapshotEvent(library = [], previousProfile = null, nextProfile = null) {
  const stats = nextProfile?.stats || {};
  const top = profileTopDimensions(nextProfile, 5);
  const topText = top.map((dimension) => `${dimension.label} ${dimension.score}%`).join(', ');

  return makeEvent(
    MEMORY_EVENT_TYPES.SNAPSHOT,
    'JoeAI memory recalculated',
    topText ? `Top taste signals: ${topText}.` : 'JoeAI generated a fresh taste profile snapshot.',
    {
      stats,
      learned: top.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        score: dimension.score,
        confidence: dimension.confidence,
        evidence: dimension.evidence?.slice(0, 4) || []
      })),
      previousConfidence: previousProfile?.confidence || null,
      nextConfidence: nextProfile?.confidence || 0
    }
  );
}

function milestoneEvents(library = [], previousProfile = null, nextProfile = null) {
  const stats = nextProfile?.stats || {};
  const previousCompleted = Number(previousProfile?.stats?.completed || 0);
  const completed = Number(stats.completed || 0);
  const events = [];

  for (const threshold of [25, 50, 75, 100, 150, 200, 250, 300]) {
    if (completed >= threshold && previousCompleted < threshold) {
      events.push(makeEvent(
        MEMORY_EVENT_TYPES.MILESTONE,
        `${threshold} anime completed`,
        `You crossed ${threshold} completed anime. JoeAI has a stronger base for taste predictions now.`,
        { threshold, completed }
      ));
    }
  }

  if (Number(stats.rewatches || 0) >= 10 && Number(previousProfile?.stats?.rewatches || 0) < 10) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.MILESTONE,
      'Comfort Seeker unlocked',
      'You have at least 10 total rewatches, so JoeAI can identify anchor series more confidently.',
      { rewatches: stats.rewatches }
    ));
  }

  return events;
}

function tasteShiftEvents(previousProfile = null, nextProfile = null) {
  if (!previousProfile?.dimensions || !nextProfile?.dimensions) return [];

  const events = [];
  for (const [key, nextDimension] of Object.entries(nextProfile.dimensions || {})) {
    const previousScore = Number(previousProfile.dimensions?.[key]?.score || 0);
    const nextScore = Number(nextDimension.score || 0);
    const delta = nextScore - previousScore;

    if (Math.abs(delta) < 5) continue;

    events.push(makeEvent(
      MEMORY_EVENT_TYPES.TASTE_SHIFT,
      `${nextDimension.label} ${delta > 0 ? 'increased' : 'decreased'}`,
      `${nextDimension.label} shifted from ${previousScore}% to ${nextScore}%.`,
      {
        key,
        label: nextDimension.label,
        previousScore,
        nextScore,
        delta,
        evidence: nextDimension.evidence?.slice(0, 5) || []
      }
    ));
  }

  return events.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0)).slice(0, 4);
}

function librarySummaryEvents(library = [], nextProfile = null) {
  const completed = library.filter((item) => itemStatus(item) === 'completed');
  const watching = library.filter((item) => itemStatus(item) === 'watching');
  const favorites = library.filter((item) => item.favorite);
  const rewatched = library.filter((item) => Number(item.rewatches || 0) > 0)
    .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0));

  const events = [];

  if (completed.length) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.COMPLETION,
      `${completed.length} completed anime analyzed`,
      `JoeAI used your completed list to strengthen its profile of your taste.`,
      { titles: shortTitles(completed, 10), count: completed.length }
    ));
  }

  if (watching.length) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.WATCHING,
      `${watching.length} currently watching`,
      `JoeAI is watching these active shows as possible taste-shift signals.`,
      { titles: shortTitles(watching, 8), count: watching.length }
    ));
  }

  if (rewatched.length) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.REWATCH,
      'Anchor series detected',
      `${titleOf(rewatched[0])} is currently your strongest comfort signal.`,
      { titles: rewatched.slice(0, 8).map((item) => `${titleOf(item)} (${item.rewatches}x)`), count: rewatched.length }
    ));
  }

  if (favorites.length) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.FAVORITE,
      `${favorites.length} favorites influencing memory`,
      `Favorites are weighted heavily because they are explicit taste signals.`,
      { titles: shortTitles(favorites, 8), count: favorites.length }
    ));
  }

  return events;
}

function observationEvents(library = [], previousProfile = null, nextProfile = null) {
  const top = profileTopDimensions(nextProfile, 4);
  const stats = nextProfile?.stats || {};
  const events = [];

  if (top[0]) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.OBSERVATION,
      `${top[0].label} is your strongest signal`,
      `JoeAI currently sees ${top[0].label.toLowerCase()} as the clearest predictor of what you will enjoy.`,
      { key: top[0].key, score: top[0].score, evidence: top[0].evidence?.slice(0, 5) || [] }
    ));
  }

  if (Number(stats.rewatches || 0) >= 5) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.COMFORT,
      'Rewatches matter in your profile',
      'Your rewatches suggest comfort and long-term attachment are important parts of your anime taste.',
      { rewatches: stats.rewatches }
    ));
  }

  if (top.some((item) => item.key === 'worldbuilding') && top.some((item) => item.key === 'longRunning')) {
    events.push(makeEvent(
      MEMORY_EVENT_TYPES.OBSERVATION,
      'Worlds over one-offs',
      'Your strongest patterns lean toward stories with large worlds and long-form payoff.',
      { related: ['worldbuilding', 'longRunning'] }
    ));
  }

  return events.slice(0, 4);
}


function uncertaintyEvents(library = [], previousProfile = null, nextProfile = null) {
  const weak = Object.values(nextProfile?.dimensions || {})
    .filter((item) => Number(item.score || 0) > 0)
    .sort((a, b) => Number(a.confidence || 0) - Number(b.confidence || 0))
    .slice(0, 2);

  if (!weak.length) return [];

  return [makeEvent(
    MEMORY_EVENT_TYPES.UNCERTAINTY,
    `${weak[0].label} is still uncertain`,
    `JoeAI sees ${weak[0].label.toLowerCase()} in your library, but confidence is only ${clampScore(weak[0].confidence)}%.`,
    {
      key: weak[0].key,
      label: weak[0].label,
      score: weak[0].score,
      confidence: weak[0].confidence,
      evidence: weak[0].evidence?.slice(0, 5) || [],
      semanticKey: `uncertainty-${weak[0].key}`
    }
  )];
}

function dailyThoughtEvents(library = [], previousProfile = null, nextProfile = null) {
  const top = profileTopDimensions(nextProfile, 3);
  const stats = nextProfile?.stats || {};
  const main = top[0];

  if (!main) return [];

  return [makeEvent(
    MEMORY_EVENT_TYPES.DAILY_THOUGHT,
    'Daily JoeAI thought',
    `${main.label} is still the strongest predictor in your profile. ${stats.rewatches || 0} rewatches make the comfort signals especially valuable.`,
    {
      key: main.key,
      label: main.label,
      score: main.score,
      confidence: main.confidence,
      evidence: main.evidence?.slice(0, 5) || [],
      semanticKey: `daily-thought-${main.key}`
    }
  )];
}

function predictionReadinessEvents(library = [], previousProfile = null, nextProfile = null) {
  const stats = nextProfile?.stats || {};
  const confidence = clampScore(nextProfile?.confidence || 0);
  if (confidence < 70) return [];

  return [makeEvent(
    MEMORY_EVENT_TYPES.PREDICTION_READY,
    'JoeAI prediction model is online',
    `With ${stats.completed || 0} completed anime and ${stats.rewatches || 0} rewatches, JoeAI can now explain recommendation confidence from your own history.`,
    {
      confidence,
      completed: stats.completed || 0,
      rewatches: stats.rewatches || 0,
      semanticKey: 'prediction-readiness'
    }
  )];
}

export function buildMemoryJournal(library = [], previousProfile = null, nextProfile = null) {
  if (!Array.isArray(library) || library.length === 0) {
    return {
      createdAt: nowIso(),
      type: 'memory_onboarding',
      icon: '🧠',
      title: 'JoeAI is ready to learn',
      summary: 'Add or import anime to begin building your Anime DNA and memory timeline.',
      confidence: 0,
      previousConfidence: previousProfile?.confidence || null,
      nextConfidence: 0,
      events: [],
      completed: [],
      watching: [],
      favorites: [],
      rewatched: [],
      learned: []
    };
  }

  const events = [
    ...milestoneEvents(library, previousProfile, nextProfile),
    ...tasteShiftEvents(previousProfile, nextProfile),
    ...observationEvents(library, previousProfile, nextProfile),
    ...uncertaintyEvents(library, previousProfile, nextProfile),
    ...dailyThoughtEvents(library, previousProfile, nextProfile),
    ...predictionReadinessEvents(library, previousProfile, nextProfile),
    ...librarySummaryEvents(library, nextProfile)
  ];

  const snapshot = profileSnapshotEvent(library, previousProfile, nextProfile);
  const allEvents = [snapshot, ...events];

  return {
    createdAt: nowIso(),
    type: 'memory_batch',
    icon: '🧠',
    title: 'JoeAI memory update',
    summary: allEvents[1]?.summary || snapshot.summary,
    confidence: clampScore(nextProfile?.confidence || 0),
    previousConfidence: previousProfile?.confidence || null,
    nextConfidence: nextProfile?.confidence || 0,
    events: allEvents,
    completed: shortTitles(library.filter((item) => itemStatus(item) === 'completed'), 12),
    watching: shortTitles(library.filter((item) => itemStatus(item) === 'watching'), 12),
    favorites: shortTitles(library.filter((item) => item.favorite), 12),
    rewatched: library
      .filter((item) => Number(item.rewatches || 0) > 0)
      .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0))
      .map((item) => `${titleOf(item)} (${item.rewatches}x)`)
      .slice(0, 12),
    learned: profileTopDimensions(nextProfile, 5).map((dimension) => `${dimension.label}: ${dimension.score}% confidence ${dimension.confidence}%`)
  };
}
