import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';
import { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';
import { ACTIVE_GENOME_REGISTRY, findGenomeCardByTitle } from './genome/genomeRegistry';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function title(card = {}) {
  return card.titles?.[0] || card.title || card.id || 'Unknown title';
}

function stripEndPunctuation(value = '') {
  return String(value || '').replace(/[?.!]+$/g, '').trim();
}

function extractSimilarityTitle(question = '') {
  const raw = String(question || '').trim();

  const patterns = [
    /similar\s+to\s+(.+?)[?.!]*$/i,
    /something\s+like\s+(.+?)[?.!]*$/i,
    /show\s+like\s+(.+?)[?.!]*$/i,
    /shows\s+like\s+(.+?)[?.!]*$/i,
    /anime\s+like\s+(.+?)[?.!]*$/i,
    /show\s+me\s+something\s+like\s+(.+?)[?.!]*$/i,
    /recommend\s+something\s+like\s+(.+?)[?.!]*$/i,
    /recommend\s+.+?\s+like\s+(.+?)[?.!]*$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return stripEndPunctuation(match[1]);
  }

  const lowered = raw.toLowerCase();
  const lastLike = lowered.lastIndexOf(' like ');
  if (lastLike !== -1) return stripEndPunctuation(raw.slice(lastLike + 6));

  return '';
}

function isBroadRecommendationRequest(question = '') {
  const q = norm(question);
  if (!q) return false;

  return (
    /\bwhat should i watch\b/i.test(question) ||
    /\bwhat to watch\b/i.test(question) ||
    /\bwatch next\b/i.test(question) ||
    /\bnext anime\b/i.test(question) ||
    /\brecommend(?: me)?(?: an| a)?(?: new)? anime\b/i.test(question) ||
    /\brecommend(?: me)? something\b/i.test(question) ||
    /\bwhat do you recommend\b/i.test(question) ||
    /\banything good\b/i.test(question) ||
    q === 'recommend' ||
    q === 'recommendations' ||
    q === 'what should i watch next'
  );
}

function extractDirectTitle(question = '') {
  const raw = stripEndPunctuation(question);
  if (!raw) return '';

  // Similarity and broad recommendation prompts are not title lookups.
  if (extractSimilarityTitle(raw)) return '';
  if (isBroadRecommendationRequest(raw)) return '';

  const patterns = [
    /^(?:please\s+)?recommend\s+(.+)$/i,
    /^(?:please\s+)?tell\s+me\s+about\s+(.+)$/i,
    /^(?:please\s+)?what\s+is\s+(.+)$/i,
    /^(?:please\s+)?what['’]?s\s+(.+)$/i,
    /^(?:please\s+)?should\s+i\s+watch\s+(.+)$/i,
    /^(?:please\s+)?why\s+should\s+i\s+watch\s+(.+)$/i,
    /^(?:please\s+)?about\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const candidate = stripEndPunctuation(match[1])
        .replace(/^(?:an?|the)\s+anime\s+/i, '')
        .replace(/\s+(?:anime|show|series)$/i, '')
        .trim();

      if (candidate && findGenomeCardByTitle(candidate)) return candidate;
      return '';
    }
  }

  // Plain title lookup: "slime", "re zero", "one piece".
  // Keep this conservative so broad prompts do not get swallowed by fuzzy title lookup.
  const wordCount = norm(raw).split(/\s+/).filter(Boolean).length;
  const hasCommandWords = /\b(recommend|watch|next|similar|like|something|what|should|anime|new)\b/i.test(raw);

  if (wordCount <= 8 && !hasCommandWords && findGenomeCardByTitle(raw)) {
    return raw;
  }

  return '';
}

function mentionedGenomeCard(question = '') {
  const q = norm(question);

  const candidates = ACTIVE_GENOME_REGISTRY
    .map((card) => {
      const names = [card.id, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);
      const best = names
        .map((name) => ({ name, clean: norm(name) }))
        .filter((entry) => entry.clean.length >= 4)
        .filter((entry) => q.includes(entry.clean))
        .sort((a, b) => b.clean.length - a.clean.length)[0];

      return best ? { card, matchLength: best.clean.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.matchLength - a.matchLength);

  return candidates[0]?.card || null;
}

function cardsFromIds(ids = []) {
  return ids
    .map((id) => findGenomeCardByTitle(id))
    .filter(Boolean);
}

function scoreRelatedCards(sourceCard) {
  const preferred = cardsFromIds(sourceCard.idealFollowUps || sourceCard.successors || []);

  const sourceText = norm([
    sourceCard.domain,
    sourceCard.subdomain,
    ...(sourceCard.viewerMotivations || []),
    ...(sourceCard.themes || []),
    ...(sourceCard.atmosphere || []),
    ...(sourceCard.emotionalProfile || [])
  ].join(' '));

  const fallback = ACTIVE_GENOME_REGISTRY
    .filter((card) => card.id !== sourceCard.id)
    .map((card) => {
      const cardText = norm([
        card.domain,
        card.subdomain,
        ...(card.viewerMotivations || []),
        ...(card.themes || []),
        ...(card.atmosphere || []),
        ...(card.emotionalProfile || [])
      ].join(' '));

      let score = 0;
      for (const token of sourceText.split(' ').filter((x) => x.length > 4)) {
        if (cardText.includes(token)) score += 1;
      }

      return { card, score };
    })
    .filter((entry) => entry.score > 1)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.card);

  const seen = new Set();
  return [...preferred, ...fallback]
    .filter((card) => {
      if (!card?.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
    .slice(0, 8);
}

function formatSimilarGenomeAnswer(sourceCard) {
  const sourceTitle = title(sourceCard);
  const related = scoreRelatedCards(sourceCard);

  const lines = [
    `🧬 JoeAI Genome Match: ${sourceTitle}`,
    '',
    sourceCard.signature || sourceCard.note || `${sourceTitle} has a Genome profile.`,
    ''
  ];

  if (sourceCard.viewerMotivations?.length) {
    lines.push('What you are probably chasing:');
    lines.push(sourceCard.viewerMotivations.slice(0, 6).map((item) => `• ${item}`).join('\n'));
    lines.push('');
  }

  if (!related.length) {
    lines.push('I have the source Genome Card, but I do not have enough related cards yet. Add more module cards or catalog entries and I will get smarter.');
    return lines.join('\n');
  }

  lines.push('Closest Genome follow-ups:');
  lines.push('');
  lines.push(related.map((card, index) => {
    const why = card.signature || card.coreFantasy || 'Strong Genome neighbor.';
    return `${index + 1}. ${title(card)}\n   • ${why}`;
  }).join('\n\n'));

  return lines.join('\n');
}

function formatTitleGenomeAnswer(card) {
  const name = title(card);
  const lines = [
    `🧬 JoeAI Knows: ${name}`,
    '',
    card.signature || card.note || `${name} has a Genome profile.`
  ];

  if (card.coreFantasy) {
    lines.push('', 'Core Fantasy:');
    lines.push(card.coreFantasy);
  }

  if (card.fantasyPillars?.length || card.rewardLoop?.length || card.viewerType?.length) {
    lines.push('', 'Viewer Fantasy:');
    if (card.fantasyPillars?.length) lines.push('• Pillars: ' + card.fantasyPillars.slice(0, 5).join(', '));
    if (card.rewardLoop?.length) lines.push('• Reward loop: ' + card.rewardLoop.slice(0, 5).join(' → '));
    if (card.viewerType?.length) lines.push('• Best for: ' + card.viewerType.slice(0, 5).join(', '));
  }

  if (card.viewerMotivations?.length) {
    lines.push('', 'Why someone would pick it:');
    lines.push(card.viewerMotivations.slice(0, 6).map((item) => `• ${item}`).join('\n'));
  }

  if (card.joeNote) {
    lines.push('', `Joe Note: ${card.joeNote}`);
  }

  if (card.idealFollowUps?.length) {
    const related = cardsFromIds(card.idealFollowUps).slice(0, 5);
    if (related.length) {
      lines.push('', 'If that sounds good, nearby picks are:');
      lines.push(related.map((item) => `• ${title(item)}`).join('\n'));
    }
  }

  return lines.join('\n');
}

export function routeJoeAIRecommendation(question = '', anime = [], catalog = []) {
  // 1. Similarity requests must stay similarity requests.
  //    "recommend something like slime" should recommend neighbors, not just explain Slime.
  const similarTitle = extractSimilarityTitle(question);
  if (similarTitle) {
    const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
    if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

    const sourceCard = findGenomeCardByTitle(similarTitle);
    if (sourceCard) return formatSimilarGenomeAnswer(sourceCard);
  }

  // 2. Broad recommendation prompts should fall back to the Anime Brain card picker
  //    in PlaceholderPages.jsx. Returning null here restores "what should I watch next".
  if (isBroadRecommendationRequest(question)) {
    return null;
  }

  // 3. Mood/vibe requests come before title lookup, so "dark anime" does not get
  //    swallowed by a fuzzy generated title match.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Direct known-title lookup. This is intentionally conservative.
  const directTitle = extractDirectTitle(question);
  if (directTitle) {
    const card = findGenomeCardByTitle(directTitle) || mentionedGenomeCard(directTitle);
    if (card) return formatTitleGenomeAnswer(card);
  }

  // 5. Existing Knowledge/Genome pipeline for remaining recommendation wording.
  const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
  if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

  return null;
}
