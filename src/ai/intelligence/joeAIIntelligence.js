const clean = (value = '') => String(value || '').trim();
const lower = (value = '') => clean(value).toLowerCase();

export function normalizeJoeAIKey(value = '') {
  return lower(value).replace(/[^a-z0-9]+/g, '');
}

export function recommendationKey(item = {}) {
  const malId = item.malId ?? item.mal_id;
  if (malId !== undefined && malId !== null && malId !== '') return `mal:${malId}`;
  const kitsuId = item.kitsuId ?? item.kitsu_id;
  if (kitsuId !== undefined && kitsuId !== null && kitsuId !== '') return `kitsu:${kitsuId}`;
  return `title:${normalizeJoeAIKey(item.officialTitle || item.title || item.name)}`;
}

export function sanitizeJoeAIConversationMessages(messages = [], limit = 48) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-limit)
    .map((message) => {
      try {
        const safe = JSON.parse(JSON.stringify(message));
        if (typeof safe?.text === 'string') safe.text = safe.text.slice(0, 12000);
        if (Array.isArray(safe?.items)) safe.items = safe.items.slice(0, 10);
        return safe;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function promptExclusions(value = '') {
  const found = [];
  const pattern = /(?:^|\b)(?:without|avoid|exclude|nothing\s+with|nothing\s+that\s+has|no(?!\s+(?:more|less|fewer)\s+than))\s+([a-z0-9][a-z0-9 -]{1,30})/gi;
  let match;
  while ((match = pattern.exec(String(value || '')))) {
    const phrase = lower(match[1])
      .split(/\b(?:but|and|with|under|over|that|which)\b/)[0]
      .trim();
    if (phrase) found.push(phrase);
  }
  return [...new Set(found)].slice(0, 8);
}

export function normalizeJoeAIState(state = {}) {
  return {
    feedback: Array.isArray(state?.feedback) ? state.feedback : [],
    preferences: Array.isArray(state?.preferences) ? state.preferences : [],
    conversation: state?.conversation && typeof state.conversation === 'object'
      ? state.conversation
      : {}
  };
}

function latestFeedbackByAnime(state = {}) {
  const latest = new Map();
  normalizeJoeAIState(state).feedback.forEach((entry) => {
    const key = entry.animeKey || normalizeJoeAIKey(entry.title);
    if (!key) return;

    const current = latest.get(key);
    const currentTime = Date.parse(current?.createdAt || '') || 0;
    const entryTime = Date.parse(entry?.createdAt || '') || 0;

    if (!current || entryTime >= currentTime) {
      latest.set(key, entry);
    }
  });
  return latest;
}

function preferenceMap(state = {}) {
  return new Map(
    normalizeJoeAIState(state).preferences.map((entry) => [entry.key, entry])
  );
}

export function hasSavedTitleDistinction(left = '', right = '', state = {}) {
  const pair = [normalizeJoeAIKey(left), normalizeJoeAIKey(right)].filter(Boolean).sort();
  if (pair.length !== 2) return false;
  return preferenceMap(state).has(`title_distinction:${pair.join(':')}`);
}

function itemText(item = {}) {
  return lower([
    item.officialTitle,
    item.title,
    item.synopsis,
    item.description,
    item.type,
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.tags || []),
    ...(item.genomeTraits || [])
  ].filter(Boolean).join(' '));
}

function relevantLearningEvidence(item = {}, state = {}) {
  const normalized = normalizeJoeAIState(state);
  const text = itemText(item);
  const key = recommendationKey(item);
  const titleKey = `title:${normalizeJoeAIKey(item.officialTitle || item.title)}`;
  const relevantFeedback = normalized.feedback.filter((entry) => {
    const entryKey = String(entry.animeKey || '');
    if (entryKey === key || entryKey === titleKey) return true;

    const traits = (entry.traits || []).map(lower).filter(Boolean);
    return traits.some((trait) => text.includes(trait));
  });

  const preferences = preferenceMap(normalized);
  let preferenceEvidenceCount = 0;

  if (preferences.get('prefer_dub')?.value === true && item.dubbed === true) {
    preferenceEvidenceCount += 1;
  }
  if (preferences.get('avoid_horror')?.value === true && text.includes('horror')) {
    preferenceEvidenceCount += 1;
  }
  if (
    preferences.get('exclude_recap_movies')?.value === true
    && (text.includes('recap') || (text.includes('summary') && text.includes('movie')))
  ) {
    preferenceEvidenceCount += 1;
  }

  return {
    feedbackCount: relevantFeedback.length,
    preferenceEvidenceCount
  };
}

const TRAIT_RULES = [
  ['dark', ['dark', 'bleak', 'violent', 'gore', 'horror', 'tragic']],
  ['romance', ['romance', 'romantic', 'love story']],
  ['comedy', ['comedy', 'funny', 'humor', 'lighthearted']],
  ['strategy', ['strategy', 'strategic', 'tactical', 'politic']],
  ['worldbuilding', ['worldbuilding', 'world building', 'kingdom', 'nation building']],
  ['found family', ['found family', 'crew', 'friendship', 'guild']],
  ['power progression', ['power progression', 'training', 'leveling', 'weak to strong']],
  ['mystery', ['mystery', 'thriller', 'suspense', 'mind game']],
  ['sports', ['sports', 'competition', 'tournament']]
];

export function inferFeedbackTraits(item = {}, reason = '') {
  const reasonText = lower(reason).replace(/[_-]+/g, ' ');
  const reasonTraits = TRAIT_RULES
    .filter(([, words]) => words.some((word) => reasonText.includes(word)))
    .map(([trait]) => trait);

  // A specific reason such as "too dark" should teach only that distinction,
  // not accidentally punish every broad genre attached to the title.
  if (reasonTraits.length) return [...new Set(reasonTraits)].slice(0, 8);
  if (reasonText) return [];

  const text = itemText(item);
  const inferred = TRAIT_RULES
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([trait]) => trait);

  return [...new Set([
    ...inferred,
    ...(item.genres || []).map(lower),
    ...(item.themes || []).map(lower)
  ].filter(Boolean))].slice(0, 8);
}

export function applyLearnedSignals(item = {}, state = {}) {
  const normalized = normalizeJoeAIState(state);
  const key = recommendationKey(item);
  const titleKey = `title:${normalizeJoeAIKey(item.officialTitle || item.title)}`;
  const direct = latestFeedbackByAnime(normalized).get(key)
    || latestFeedbackByAnime(normalized).get(titleKey)
    || latestFeedbackByAnime(normalized).get(normalizeJoeAIKey(item.officialTitle || item.title));
  const preferences = preferenceMap(normalized);
  const text = itemText(item);
  const episodes = Number(item.episodeCount || item.episodes || 0);
  let adjustment = 0;
  let excluded = false;
  const reasons = [];
  const warnings = [];

  if (direct?.action === 'good_pick' || direct?.action === 'accepted') {
    adjustment += 12;
    reasons.push('You previously marked this as a good JoeAI pick');
  }

  if (direct?.action === 'maybe_later') {
    adjustment -= 5;
    warnings.push('You previously said maybe later');
  }

  if (direct?.action === 'not_for_me' || direct?.action === 'already_seen') {
    excluded = true;
  }

  const negativeTraits = new Map();
  const positiveTraits = new Map();

  normalized.feedback.forEach((entry) => {
    const destination = ['not_for_me'].includes(entry.action) ? negativeTraits
      : ['good_pick', 'accepted'].includes(entry.action) ? positiveTraits
        : null;
    if (!destination) return;
    (entry.traits || []).map(lower).filter(Boolean).forEach((trait) => {
      destination.set(trait, (destination.get(trait) || 0) + 1);
    });
  });

  for (const [trait, count] of positiveTraits.entries()) {
    if (text.includes(trait)) {
      const points = Math.min(8, count * 2);
      adjustment += points;
      reasons.push(`Matches ${trait}, which your feedback has reinforced`);
    }
  }

  for (const [trait, count] of negativeTraits.entries()) {
    if (text.includes(trait)) {
      const points = Math.min(10, count * 2.5);
      adjustment -= points;
      warnings.push(`Includes ${trait}, which you have rejected before`);
    }
  }

  if (preferences.get('exclude_recap_movies')?.value === true) {
    const recapMovie = text.includes('recap') || (text.includes('summary') && text.includes('movie'));
    if (recapMovie) excluded = true;
  }

  if (preferences.get('avoid_horror')?.value === true && text.includes('horror')) {
    adjustment -= 18;
    warnings.push('You asked JoeAI to avoid horror');
  }

  if (preferences.get('prefer_dub')?.value === true && item.dubbed === true) {
    adjustment += 4;
    reasons.push('A dubbed option matches your saved preference');
  }

  const lengthWeight = Number(preferences.get('length_weight')?.value ?? 1);
  if (lengthWeight === 0 && episodes > 0) {
    warnings.push('Episode length is not being used because you told JoeAI it does not matter');
  }

  return {
    adjustment,
    excluded,
    reasons: [...new Set(reasons)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 3),
    directFeedback: direct || null,
    studioWeight: Number(preferences.get('studio_weight')?.value ?? 1),
    lengthWeight
  };
}

export function buildConfidenceReceipt(item = {}, {
  tasteMatch = 0,
  evidenceCount = 0,
  genomeTier = '',
  state = {}
} = {}) {
  const metadataChecks = [
    item.cover || item.imageUrl,
    item.synopsis || item.description,
    (item.genres || []).length,
    item.studio || (item.studios || []).length,
    item.year,
    item.episodeCount || item.episodes
  ];
  const metadataCompleteness = metadataChecks.filter(Boolean).length / metadataChecks.length;
  const tier = lower(genomeTier);
  const genomeConfidence = tier.includes('gold') ? 98
    : tier.includes('core') ? 90
      : tier.includes('enhanced') ? 84
        : tier.includes('generated') ? 68
          : 45;
  const dataConfidence = Math.round(
    Math.min(98, metadataCompleteness * 72 + genomeConfidence * 0.28)
  );
  const learningEvidence = relevantLearningEvidence(item, state);
  const personalEvidence = Math.min(
    100,
    evidenceCount * 12
      + Math.min(24, learningEvidence.feedbackCount * 4)
      + Math.min(12, learningEvidence.preferenceEvidenceCount * 6)
  );
  const predictionConfidence = Math.round(Math.max(
    35,
    Math.min(98, dataConfidence * 0.55 + personalEvidence * 0.3 + Number(tasteMatch || 0) * 0.15)
  ));

  return {
    tasteMatch: Math.round(Number(tasteMatch || 0)),
    dataConfidence,
    predictionConfidence,
    evidenceCount,
    genomeTier: genomeTier || 'Metadata only',
    relevantFeedbackCount: learningEvidence.feedbackCount,
    preferenceEvidenceCount: learningEvidence.preferenceEvidenceCount,
    receipts: [
      `${evidenceCount} personal taste signal${evidenceCount === 1 ? '' : 's'}`,
      `${Math.round(metadataCompleteness * 100)}% metadata coverage`,
      genomeTier ? `${genomeTier} Genome evidence` : 'No dedicated Genome card yet',
      learningEvidence.feedbackCount
        ? `${learningEvidence.feedbackCount} relevant feedback event${learningEvidence.feedbackCount === 1 ? '' : 's'}`
        : 'No title-relevant feedback yet',
      learningEvidence.preferenceEvidenceCount
        ? `${learningEvidence.preferenceEvidenceCount} explicit preference match${learningEvidence.preferenceEvidenceCount === 1 ? '' : 'es'}`
        : ''
    ]
      .filter(Boolean)
  };
}

export function parseJoeAITeaching(text = '') {
  const raw = clean(text);
  const value = lower(raw);

  const titleDistinction = raw.match(/^(.+?)\s+and\s+(.+?)\s+are\s+(?:different|not the same)(?:\s+(?:titles|shows|anime|series))?[.!]*$/i);
  if (titleDistinction?.[1] && titleDistinction?.[2]) {
    const titles = [titleDistinction[1].trim(), titleDistinction[2].trim()];
    const keyParts = titles.map(normalizeJoeAIKey).sort();
    return {
      kind: 'preference',
      preference: {
        key: `title_distinction:${keyParts.join(':')}`,
        value: titles,
        source: raw
      },
      response: `Remembered. ${titles[0]} and ${titles[1]} will be treated as distinct titles.`
    };
  }

  if (/\bi (?:do not|don't|dont) care about (?:the )?studio\b/.test(value)) {
    return {
      kind: 'preference',
      preference: { key: 'studio_weight', value: 0, source: raw },
      response: 'Got it. Studio will no longer affect your recommendation score.'
    };
  }

  if (/\blong anime (?:are|is) not (?:a )?problem\b|\bi (?:do not|don't|dont) mind long anime\b/.test(value)) {
    return {
      kind: 'preference',
      preference: { key: 'length_weight', value: 0, source: raw },
      response: 'Remembered. JoeAI will not penalize a recommendation just because it is long.'
    };
  }

  if (/\bi prefer dub(?:bed|s)?\b|\bi (?:mostly )?watch dub(?:bed|s)?\b/.test(value)) {
    return {
      kind: 'preference',
      preference: { key: 'prefer_dub', value: true, source: raw },
      response: 'Remembered. Dub availability is now a positive recommendation signal.'
    };
  }

  if (/\b(?:do not|don't|dont|never) recommend recap movies?\b/.test(value)) {
    return {
      kind: 'preference',
      preference: { key: 'exclude_recap_movies', value: true, source: raw },
      response: 'Remembered. JoeAI will exclude recap movies from recommendations.'
    };
  }

  if (/\b(?:avoid|do not recommend|don't recommend|dont recommend) horror\b/.test(value)) {
    return {
      kind: 'preference',
      preference: { key: 'avoid_horror', value: true, source: raw },
      response: 'Remembered. Horror will be strongly deprioritized.'
    };
  }

  const likedFor = raw.match(/^i\s+(?:really\s+)?(?:liked|loved)\s+(.+?)\s+(?:mostly\s+)?for\s+(.+?)[.!]*$/i);
  if (likedFor?.[1] && likedFor?.[2]) {
    return {
      kind: 'titleFeedback',
      title: likedFor[1].trim(),
      action: 'good_pick',
      reason: likedFor[2].trim(),
      response: `Remembered what worked for you about ${likedFor[1].trim()}.`
    };
  }

  const dislikedWithReason = raw.match(/^i\s+(?:did not|didn't|dont|don't)\s+like\s+(.+?)\s+because\s+(.+?)[.!]*$/i);
  const dislikedWithoutReason = raw.match(/^i\s+(?:did not|didn't|dont|don't)\s+like\s+(.+?)[.!]*$/i);
  const dislikedTitle = dislikedWithReason?.[1] || dislikedWithoutReason?.[1];
  const dislikedReason = dislikedWithReason?.[2] || '';
  if (dislikedTitle) {
    return {
      kind: 'titleFeedback',
      title: dislikedTitle.trim(),
      action: 'not_for_me',
      reason: dislikedReason.trim(),
      response: `Remembered. JoeAI will learn from why ${dislikedTitle.trim()} missed.`
    };
  }

  return null;
}

function contextTitle(context = {}, ordinal = '') {
  const items = context.lastRecommendations || [];
  const normalized = lower(ordinal);
  const indexMap = new Map([
    ['first', 0], ['1st', 0],
    ['second', 1], ['2nd', 1],
    ['third', 2], ['3rd', 2],
    ['fourth', 3], ['4th', 3],
    ['fifth', 4], ['5th', 4]
  ]);
  const index = normalized === 'last'
    ? items.length - 1
    : indexMap.get(normalized);
  const item = Number.isInteger(index) ? items[index] : null;
  return item?.officialTitle || item?.title || context.lastReferencedTitle || items[0]?.title || '';
}

export function resolveJoeAIFollowUp(text = '', context = {}) {
  const raw = clean(text);
  const ordinalPattern = '(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)';

  const implicitReject = raw.match(/^not\s+(.+?)\s*[—–-]\s*(.+)$/i);
  if (implicitReject) {
    return {
      text: `recommend ${implicitReject[2].trim()}`,
      implicitFeedback: {
        title: implicitReject[1].trim(),
        action: 'not_for_me',
        reason: implicitReject[2].trim()
      }
    };
  }

  const whyOrdinal = raw.match(new RegExp(`^why\\s+(?:the\\s+)?${ordinalPattern}\\s+(?:one|pick)?[?.!]*$`, 'i'));
  if (whyOrdinal) {
    const title = contextTitle(context, whyOrdinal[1]);
    if (title) return { text: `why did you recommend ${title}?`, referencedTitle: title };
  }

  if (/^why\s+(?:this|that|it|that one|this one)[?.!]*$/i.test(raw)) {
    const title = contextTitle(context);
    if (title) return { text: `why did you recommend ${title}?`, referencedTitle: title };
  }

  const addOrdinal = raw.match(new RegExp(`^(?:add|mark)\\s+(?:the\\s+)?${ordinalPattern}\\s+(?:one|pick)?(?:\\s+as\\s+(watching|completed|planned))?[?.!]*$`, 'i'));
  if (addOrdinal) {
    const title = contextTitle(context, addOrdinal[1]);
    if (title) return { text: `add ${title} as ${addOrdinal[2] || 'watching'}`, referencedTitle: title };
  }

  const addPronoun = raw.match(/^(?:add|mark)\s+(?:it|that|this|that one|this one)(?:\s+as\s+(watching|completed|planned))?[?.!]*$/i);
  if (addPronoun) {
    const title = contextTitle(context);
    if (title) return { text: `add ${title} as ${addPronoun[1] || 'watching'}`, referencedTitle: title };
  }

  if (/^(?:give me\s+)?more like (?:it|that|this|that one|this one)[?.!]*$/i.test(raw)) {
    const title = contextTitle(context);
    if (title) return { text: `recommend something like ${title}`, referencedTitle: title };
  }

  if (/^(?:something|someone)\s+else[?.!]*$/i.test(raw) || /^(?:another|different)\s+(?:one|pick)[?.!]*$/i.test(raw)) {
    return {
      text: context.lastRecommendationPrompt || context.lastPrompt || 'recommend something different',
      avoidRecent: true
    };
  }

  const lengthOnly = raw.match(/^(?:under|fewer\s+than|less\s+than|at\s+most|no\s+more\s+than|up\s+to)\s+\d+\s*(?:episodes?|eps?)[?.!]*$/i);
  if (lengthOnly) {
    const basePrompt = context.lastRecommendationPrompt || context.lastPrompt || 'recommend something';
    return {
      text: `${basePrompt} ${raw.replace(/[?.!]+$/g, '')}`,
      avoidRecent: true
    };
  }

  const exclusionOnly = raw.match(/^(?:no(?!\s+(?:more|less|fewer)\s+than)|without|avoid|exclude|nothing\s+with|nothing\s+that\s+has)\s+(.+?)[?.!]*$/i);
  if (exclusionOnly) {
    const exclude = promptExclusions(raw);
    const basePrompt = context.lastRecommendationPrompt || context.lastPrompt || 'recommend something';
    return {
      text: `${basePrompt} without ${exclusionOnly[1].trim()}`,
      constraints: {
        ...(context.lastConstraints || {}),
        exclude: [...new Set([...(context.lastConstraints?.exclude || []), ...exclude])]
      },
      avoidRecent: true
    };
  }

  const modifier = raw.match(/^(?:(?:give me|make it|make that|make them)\s+)?(?:something\s+)?(shorter|longer|darker|lighter|funnier|less bleak|more emotional|more fantasy|fantasy|more action|more comedy|less depressing)[?.!]*$/i);
  if (modifier) {
    const basePrompt = context.lastRecommendationPrompt || context.lastPrompt || 'recommend something';
    return {
      // Preserve the original source anchor. A follow-up like "darker" after
      // "something like Slime" should still be Slime-like, just darker.
      text: `${basePrompt} but ${modifier[1]}`,
      avoidRecent: true
    };
  }

  const exclusions = promptExclusions(raw);
  return {
    text: raw,
    constraints: exclusions.length
      ? {
          ...(context.lastConstraints || {}),
          exclude: [...new Set([...(context.lastConstraints?.exclude || []), ...exclusions])].slice(0, 8)
        }
      : undefined
  };
}

export function updateJoeAIConversationContext(result, prompt = '', current = {}) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const titleMatch = String(prompt).match(/(?:recommend|about|like|why)\s+(.+?)[?.!]*$/i);
  const isTastePatternExplanation = result?.type === 'genreDNAExplanation';

  const exclusions = promptExclusions(prompt);
  const recentRecommendationKeys = items.length
    ? [...new Set([
        ...(items.map(recommendationKey).filter(Boolean)),
        ...(current.recentRecommendationKeys || [])
      ])].slice(0, 48)
    : (current.recentRecommendationKeys || []);

  return {
    ...current,
    lastPrompt: prompt,
    lastRecommendationPrompt: items.length || result?.type === 'recommendations'
      ? prompt
      : (current.lastRecommendationPrompt || ''),
    lastRecommendations: items.length ? items.slice(0, 10) : (current.lastRecommendations || []),
    recentRecommendationKeys,
    lastConstraints: exclusions.length
      ? {
          ...(current.lastConstraints || {}),
          exclude: [...new Set([...(current.lastConstraints?.exclude || []), ...exclusions])].slice(0, 8)
        }
      : (current.lastConstraints || { exclude: [] }),
    lastReferencedTitle:
      result?.sourceTitle
      || (items.length === 1 ? items[0].officialTitle || items[0].title : '')
      || (!isTastePatternExplanation ? titleMatch?.[1]?.trim() : '')
      || current.lastReferencedTitle
      || ''
  };
}
