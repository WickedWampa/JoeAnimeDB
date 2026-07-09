import { DIMENSION_LABELS, MEMORY_DIMENSIONS, normalizeText, profileTopDimensions } from './memoryTypes';

function asPercent(value = 0) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(number)));
}

function listLines(items = [], prefix = '• ') {
  return items.filter(Boolean).slice(0, 8).map((item) => `${prefix}${item}`).join('\n');
}

function findDimensionFromText(text = '', profile = {}) {
  const lower = normalizeText(text);
  const dimensions = profile.dimensions || {};

  for (const key of MEMORY_DIMENSIONS) {
    const label = DIMENSION_LABELS[key] || key;
    const tokens = [key, label, label.replace(/\s*\/\s*/g, ' ')].map(normalizeText);
    if (tokens.some((token) => token && lower.includes(token))) return dimensions[key] || null;
  }

  const aliases = [
    ['worlds', 'worldbuilding'],
    ['worldbuilding', 'worldbuilding'],
    ['found family', 'foundFamily'],
    ['comfort', 'longRunning'],
    ['rewatch', 'longRunning'],
    ['kingdom', 'kingdomBuilding'],
    ['political', 'politics'],
    ['strategy', 'strategicBattles'],
    ['battle', 'strategicBattles'],
    ['supernatural', 'supernaturalCombat'],
    ['power', 'powerFantasy'],
    ['comedy', 'comedy'],
    ['romance', 'romance'],
    ['sports', 'sports']
  ];

  const match = aliases.find(([alias]) => lower.includes(alias));
  return match ? dimensions[match[1]] || null : null;
}

function weakestSignals(profile = {}) {
  const dimensions = Object.values(profile.dimensions || {})
    .filter((item) => Number(item.score || 0) > 0)
    .sort((a, b) => Number(a.confidence || 0) - Number(b.confidence || 0) || Number(a.score || 0) - Number(b.score || 0));
  return dimensions.slice(0, 5);
}

function strongestSignals(profile = {}) {
  return profileTopDimensions(profile, 6);
}

function recentEvents(memory = {}, limit = 6) {
  return (memory.eventFeed || memory.events || memory.journalEntry?.events || [])
    .filter(Boolean)
    .slice(0, limit);
}

function dailyThought(memory = {}) {
  const profile = memory.profile || {};
  const top = strongestSignals(profile);
  const weak = weakestSignals(profile);
  const stats = profile.stats || {};
  const events = recentEvents(memory, 4);

  const lead = top[0]
    ? `Your strongest signal today is ${top[0].label} at ${asPercent(top[0].score)}%.`
    : 'JoeAI is still collecting enough signal to form a strong opinion.';

  const evidence = top[0]?.evidence?.slice(0, 5) || [];
  const uncertainty = weak[0]
    ? `The area I am least certain about is ${weak[0].label}; I need more ratings, drops, or rewatches there before I trust that signal.`
    : 'I do not have a clear uncertainty yet.';

  return [
    '🌅 JoeAI Daily Thought',
    '',
    lead,
    evidence.length ? `Evidence I am leaning on: ${evidence.join(', ')}.` : '',
    '',
    `I am reading ${stats.completed || 0} completed anime and ${stats.rewatches || 0} rewatches as the backbone of your profile.`,
    uncertainty,
    events.length ? '' : '',
    events.length ? 'Recent memory trail:' : '',
    events.length ? listLines(events.map((event) => `${event.icon || '🧠'} ${event.title || event.summary || event.type}`)) : ''
  ].filter(Boolean).join('\n');
}

function answerUncertainty(memory = {}) {
  const profile = memory.profile || {};
  const weak = weakestSignals(profile);

  if (!weak.length) {
    return '❔ JoeAI Uncertainty\n\nI do not have enough weak-signal data yet. Ratings, dropped shows, and recommendation feedback will help me learn what does *not* fit you.';
  }

  return [
    '❔ JoeAI Uncertainty',
    '',
    'These are the areas I trust the least right now:',
    weak.map((item) => `• ${item.label} — ${asPercent(item.score)}% affinity, ${asPercent(item.confidence)}% confidence`).join('\n'),
    '',
    'Why this matters: weak confidence is useful. It tells JoeAI where it should avoid overexplaining or overrecommending until your library gives stronger evidence.'
  ].join('\n');
}

function answerSurprise(memory = {}) {
  const events = recentEvents(memory, 30);
  const tasteShift = events.find((event) => String(event.type || '').includes('taste_shift'));
  const profile = memory.profile || {};
  const top = strongestSignals(profile);
  const weak = weakestSignals(profile);

  if (tasteShift) {
    return [
      '🪞 What surprised JoeAI most',
      '',
      `${tasteShift.title}.`,
      tasteShift.summary || '',
      '',
      tasteShift.evidence?.length ? 'Evidence tied to that shift:' : '',
      tasteShift.evidence?.length ? listLines(tasteShift.evidence) : '',
      '',
      'My read: taste shifts are more important than static scores because they show how your anime identity is changing.'
    ].filter(Boolean).join('\n');
  }

  return [
    '🪞 What surprised JoeAI most',
    '',
    top[0]
      ? `${top[0].label} is much stronger than the rest of your profile. That tells me your taste is not random — it has a very clear center of gravity.`
      : 'I am still building enough signal to be surprised by anything.',
    weak[0] ? `The flip side: ${weak[0].label} is still less certain, so I should be careful recommending from that lane.` : '',
    '',
    'As you rate, drop, accept, and reject recommendations, I will be able to tell you what genuinely changed instead of only describing the current snapshot.'
  ].filter(Boolean).join('\n');
}

function answerPredictionReadiness(memory = {}) {
  const profile = memory.profile || {};
  const stats = profile.stats || {};
  const top = strongestSignals(profile).slice(0, 4);

  return [
    '🎯 JoeAI Prediction Readiness',
    '',
    `Current model confidence: ${asPercent(profile.confidence)}%.`,
    '',
    'Why I can make decent predictions now:',
    `• ${stats.completed || 0} completed anime`,
    `• ${stats.rewatches || 0} rewatches`,
    `• ${stats.rated || 0} rated titles`,
    top.length ? `• Clear top signals: ${top.map((item) => item.label).join(', ')}` : '',
    '',
    'What will make me better: accepted/rejected recommendations, dropped shows, and notes explaining *why* something worked or missed.'
  ].filter(Boolean).join('\n');
}

function answerWhenLearned(text = '', memory = {}) {
  const dimension = findDimensionFromText(text, memory.profile || {});
  if (!dimension) return null;

  const events = recentEvents(memory, 80);
  const related = events.filter((event) => {
    const haystack = normalizeText([
      event.type,
      event.title,
      event.summary,
      event.label,
      ...(event.evidence || []),
      ...(event.titles || [])
    ].filter(Boolean).join(' '));
    return haystack.includes(normalizeText(dimension.label)) || haystack.includes(normalizeText(dimension.key));
  });

  return [
    `🧠 When JoeAI learned about ${dimension.label}`,
    '',
    `Right now ${dimension.label} sits at ${asPercent(dimension.score)}% affinity with ${asPercent(dimension.confidence)}% confidence.`,
    '',
    related.length ? 'Memory trail:' : 'I do not have older event history for this trait yet, so I am using the current evidence snapshot.',
    related.length ? listLines(related.map((event) => `${event.icon || '🧠'} ${event.title || event.summary}`)) : '',
    '',
    dimension.evidence?.length ? 'Current evidence:' : '',
    dimension.evidence?.length ? listLines(dimension.evidence) : ''
  ].filter(Boolean).join('\n');
}

export function answerMemoryReflection(text = '', memory = {}) {
  const lower = String(text || '').toLowerCase();

  if (/\b(daily thought|today'?s thought|what did you notice|what are you thinking)\b/i.test(lower)) {
    return dailyThought(memory);
  }

  if (/\b(what surprised you|surprised|surprising|unexpected)\b/i.test(lower)) {
    return answerSurprise(memory);
  }

  if (/\b(least certain|not sure|uncertain|weakest|blind spot|blindspot)\b/i.test(lower)) {
    return answerUncertainty(memory);
  }

  if (/\b(prediction|accuracy|how confident|how good are you)\b/i.test(lower)) {
    return answerPredictionReadiness(memory);
  }

  if (/\b(when did you learn|when did you realize|when did i become|when did you notice)\b/i.test(lower)) {
    return answerWhenLearned(text, memory);
  }

  if (/\b(what did you learn|what have you learned|what are you learning)\b/i.test(lower)) {
    return dailyThought(memory);
  }

  return null;
}
