// Sprint 5: JoeAI Personality Engine
// Genome-first recommendation formatter.
// Priority:
// 1. Anime Genome Card
// 2. Knowledge Base intro
// 3. Legacy Personality Preset
// 4. Anime DNA fallback

import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';
import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';
const PROFILE_PRESETS = {
  dorohedoro: {
    hook: 'There really is not much like Dorohedoro. It is dirty, violent, hilarious, gross, and somehow weirdly lovable.',
    chase: 'what you are chasing is probably the chaos: grimy worldbuilding, lunatic characters, black comedy, and violence that feels completely unhinged',
    strongestMatches: {
      'chainsaw man': 'If you have not watched Chainsaw Man, stop browsing and start there. Same “what the hell am I watching?” energy, but sadder and sharper.',
      'golden kamuy': 'Golden Kamuy is probably closer than it looks. Not fantasy, but absolutely packed with violent weirdos, bizarre comedy, and adult chaos.',
      'blood blockade battlefront': 'Blood Blockade Battlefront gives you the urban monster chaos and style, but with a cleaner, jazzier vibe.',
      berserk: 'Berserk matches the darkness and violence, but not the comedy. Go in for brutality, not Dorohedoro’s weird fun.',
      'made in abyss': 'Made in Abyss is not funny like Dorohedoro, but it nails that “this world is horrifying and I need to know more” feeling.',
      'hells paradise': 'Hell’s Paradise has the body-horror island, weird powers, and violent fantasy angle. Less funny, but a strong vibe match.'
    },
    dontRecommend: [
      'I would not reach for clean heroic fantasy here.',
      'Traditional shonen can match the fights, but usually misses the grime and weird humor.',
      'Berserk 2016 is a trap. If you go Berserk, do the better adaptations or manga.'
    ]
  },
  bleach: {
    hook: 'Bleach is about style, swagger, supernatural powers, emotional loyalty, and characters who look cool standing still.',
    chase: 'what you are probably chasing is stylish supernatural action with big power growth, iconic characters, and hype battles',
    strongestMatches: {
      'jujutsu kaisen': 'Jujutsu Kaisen is the cleanest modern answer: curses, style, brutal fights, and that cool supernatural battle-school energy.',
      'black clover': 'Black Clover scratches the long-form shonen growth itch: loud, hype, friendship-heavy, and power-climb focused.',
      'demon slayer': 'Demon Slayer is simpler than Bleach, but the sword fights, demons, and emotional stakes make it an easy match.',
      'hells paradise': 'Hell’s Paradise is darker and more violent, but it has the supernatural combat and weird enemy designs.',
      'chainsaw man': 'Chainsaw Man is messier and meaner than Bleach, but if you want supernatural action with edge, it works.'
    },
    dontRecommend: [
      'If you want Bleach specifically, avoid slow slice-of-life recommendations.',
      'Do not start with random side movies unless you already know the main cast.'
    ]
  },
  frieren: {
    hook: 'Frieren is not hype because of battles. It is hype because quiet moments suddenly matter.',
    chase: 'what you are chasing is melancholy fantasy, emotional reflection, beautiful travel, and characters healing over time',
    strongestMatches: {
      'mushoku tensei': 'Mushoku Tensei has bigger drama and more mess, but it shares serious fantasy worldbuilding and long emotional growth.',
      'made in abyss': 'Made in Abyss shares the beautiful adventure angle, but it is much more disturbing.',
      'violet evergarden': 'Violet Evergarden is the emotional nuke option. Less fantasy adventure, more tears.',
      'the ancient magus bride': 'Ancient Magus Bride is slower, magical, and emotional in a similar quiet-fantasy lane.'
    },
    dontRecommend: [
      'Do not pick nonstop battle shonen if what you loved was Frieren’s quiet emotional weight.',
      'If you are tired, Frieren-adjacent shows work better than high-chaos action.'
    ]
  }
};
function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function presetFor(anime = {}) {
  const title = norm(`${anime.title || ''} ${anime.officialTitle || ''}`);
  for (const [needle, profile] of Object.entries(PROFILE_PRESETS)) {
    if (title.includes(needle)) return profile;
  }
  return null;
}

function titleKey(anime = {}) {
  return norm(anime.title || anime.officialTitle || '');
}
function starLine(score = 0) {
  if (score >= 0.82) return '★★★★★';
  if (score >= 0.72) return '★★★★☆';
  if (score >= 0.62) return '★★★☆☆';
  return '★★☆☆☆';
}

function meta(item = {}) {
  return [
    item.year,
    item.studio,
    item.episodeCount ? `${item.episodeCount} eps` : null,
    item.communityScore ? `MAL ${item.communityScore}` : null
  ].filter(Boolean).join(' · ');
}

function listLines(items = [], max = 6) {
  return items.slice(0, max).map((item) => `• ${item}`).join('\n');
}
function buildGenomeIntro(source = {}) {
  const card = findGenomeCard(source);
  if (!card) return null;

  const title = card.titles?.[0] || source.title || source.officialTitle || 'that anime';

  const parts = [
    `🧬 JoeAI Genome Analysis: ${title}`,
    '',
    card.signature || card.note || `${title} has a Genome profile.`
  ];
  const chasing = card.viewerMotivations || card.chasing || [];
  if (chasing.length) {
    parts.push('', 'What you are probably chasing:');
    parts.push(listLines(chasing, 6));
  }

  const whyFansLove = card.whyFansLove || [];
  if (whyFansLove.length) {
    parts.push('', 'Why fans love it:');
    parts.push(listLines(whyFansLove, 4));
  }

  const themes = card.themes || [];
  if (themes.length) {
    parts.push('', `Core themes: ${themes.slice(0, 6).join(', ')}.`);
  }
  if (card.accessibility) {
    parts.push('', `Accessibility: ${card.accessibility}`);
  }

  return parts.join('\n');
}

function opinionFor(sourceProfile, candidate, fallbackReasons = [], score = 0, source = {}) {
  const key = titleKey(candidate);
  const knowledgeOpinion = knowledgeOpinionFor(source, candidate);
  if (knowledgeOpinion) return knowledgeOpinion;

  const exact = sourceProfile?.strongestMatches?.[key];
  if (exact) return exact;
  const title = candidate.title || 'This one';
  const reasons = fallbackReasons.slice(0, 5).join(', ').toLowerCase();

  if (reasons.includes('direct curated') || reasons.includes('curated successor')) {
    return `${title} is one of the strongest curated follow-ups for this vibe.`;
  }

  if (reasons.includes('identity') || reasons.includes('consciousness')) {
    return `${title} fits because it plays in the same identity/philosophy space.`;
  }
  if (reasons.includes('war') || reasons.includes('military')) {
    return `${title} fits more through war, systems, and emotional pressure than surface genre.`;
  }

  if (reasons.includes('chaos') || reasons.includes('weird')) {
    return `${title} is worth a look because it carries some of that weird, unpredictable energy.`;
  }
  if (reasons.includes('darkness') || reasons.includes('violence')) {
    return `${title} matches more on the dark/violent side than the comedy side. Good pick if you want heavier material.`;
  }

  if (reasons.includes('worldbuilding')) {
    return `${title} is here mostly for the worldbuilding. Different flavor, but it should scratch part of the itch.`;
  }

  if (score >= 0.75) {
    return `${title} is a strong overall vibe match, even if it gets there in a different way.`;
  }
  return `${title} has some overlap, but I would treat it as a maybe rather than a perfect follow-up.`;
}

function formatOpinionEntry(sourceProfile, entry, index, source) {
  const { item, match, reasons } = entry;
  const info = meta(item);
  const stars = starLine(match);

  const opinion = opinionFor(sourceProfile, item, reasons || [], match, source);
  return [
    `${index + 1}. ${item.title} — ${stars} ${Math.round(match * 100)}%${info ? ` (${info})` : ''}`,
    `   • ${opinion}`,
    reasons?.length ? `   • Match notes: ${reasons.slice(0, 4).join(', ')}.` : ''
  ].filter(Boolean).join('\n');
}

export function buildPersonalityRecommendationText({ source, inLibrary = [], discoveries = [] }) {
  const profile = presetFor(source);
  const title = source.title || source.officialTitle || 'that anime';
  const genomeIntro = buildGenomeIntro(source);
  const knowledgeIntro = buildKnowledgeIntro(source);
  const intro = genomeIntro
    ? [genomeIntro]
    : knowledgeIntro
      ? [knowledgeIntro]
      : profile
        ? [
            `🎭 JoeAI Opinion Mode: ${title}`,
            '',
            profile.hook,
            '',
            `Translation: ${profile.chase}.`
          ]
        : [
            `🧬 JoeAI DNA Fallback: ${title}`,
            '',
            `I do not have a Genome Card or handcrafted profile for ${title} yet, so I’m using Anime DNA plus your library patterns.`,
            ''
          ];
  const parts = [...intro, ''];

  if (inLibrary.length) {
    parts.push('From your library, I would look at:');
    parts.push('');
    parts.push(inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\n\n'));
    parts.push('');
  }
  if (discoveries.length) {
    parts.push('New discoveries I would consider:');
    parts.push('');
    parts.push(discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\n\n'));
    parts.push('');
  }
  const knowledgeWarnings = buildKnowledgeWarnings(source);
  if (knowledgeWarnings) {
    parts.push(knowledgeWarnings);
  } else if (profile?.dontRecommend?.length && !genomeIntro) {
    parts.push('JoeAI warning label:');
    parts.push('');
    parts.push(profile.dontRecommend.map((line) => `• ${line}`).join('\n'));
  }

  return parts.filter((part) => part !== '').join('\n');
}
