// Sprint 4 Phase 6: JoeAI Anime Knowledge Engine
// This is the culture/vibe layer: why people love an anime, not just metadata.

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const ANIME_KNOWLEDGE = {
  'initial d': {
    aliases: ['initial d first stage', 'initial d'],
    core: 'Initial D is not really about cars. It is about mastery, quiet confidence, obsession, and letting skill do the talking.',
    chase: 'late-night racing, eurobeat, underdog growth, rival battles, technical improvement, mountain-road tension',
    fanLove: [
      'Takumi barely flexes — he just gets better',
      'the soundtrack turns every race into a boss fight',
      'each rival teaches a different lesson',
      'the tension comes from skill, not superpowers',
      'it makes driving feel like martial arts'
    ],
    bestMatches: {
      'mf ghost': 'The obvious next stop. Same racing DNA, newer setting, and it directly follows the Initial D world.',
      'wangan midnight': 'More highway racing than mountain racing, but it has the same car obsession and late-night danger.',
      redline: 'Not grounded like Initial D, but if you want pure racing adrenaline, Redline is insanity with an engine.',
      capeta: 'Younger and more grounded, but it understands racing as obsession and self-improvement.',
      overtake: 'More modern and character-drama focused, but still about motorsport pressure and growth.',
      'megalo box': 'Not racing, but it has the same quiet underdog cool — skill, grit, and proving yourself without speeches.',
      'blue lock': 'Different sport, but it matches the obsession with becoming the best and crushing rivals.'
    },
    avoid: [
      'Generic sports anime may match competition but miss the lonely late-night mood.',
      'Big battle shonen can match hype but not the technical mastery.',
      'If the cars and eurobeat are the hook, start with MF Ghost or Wangan Midnight before branching out.'
    ]
  },
  dorohedoro: {
    aliases: ['dorohedoro'],
    core: 'Dorohedoro is dirty, violent, hilarious, grotesque, and somehow lovable. It feels like punk fantasy in a filthy alley.',
    chase: 'chaotic worlds, adult weirdos, black comedy, body horror, violent fantasy, grimy worldbuilding',
    fanLove: [
      'every character feels like a lunatic but still weirdly human',
      'the world feels disgusting and alive',
      'the comedy and gore should not work together, but they do',
      'the mystery keeps pulling you deeper',
      'there is almost nothing else with the same texture'
    ],
    bestMatches: {
      'chainsaw man': 'Best modern cousin. Violent, funny, gross, sad, and completely unhinged.',
      'golden kamuy': 'Not fantasy, but absolutely the same “violent weirdos doing insane things” energy.',
      'blood blockade battlefront': 'Urban monster chaos with style and a killer soundtrack.',
      'made in abyss': 'Less funny, more horrifying, but the world keeps getting stranger and darker.',
      berserk: 'Matches the brutality and dark fantasy, but not the comedy. Go in for pain, not jokes.',
      'hells paradise': 'Violent fantasy body-horror island with strange powers and a dangerous mystery.'
    },
    avoid: [
      'Clean heroic fantasy will probably not scratch this itch.',
      'Traditional shonen may match fights but miss the grime and black comedy.',
      'Berserk 2016 specifically is not the move.'
    ]
  },
  bleach: {
    aliases: ['bleach', 'bleach tybw', 'bleach thousand year blood war'],
    core: 'Bleach is style, swords, supernatural swagger, huge power reveals, and characters who look cool just standing there.',
    chase: 'bankai reveals, stylish fights, supernatural powers, massive cast, memorable villains, emotional loyalty',
    fanLove: [
      'the drip is undefeated',
      'power reveals feel like events',
      'villains are memorable',
      'the music and style carry huge hype',
      'it makes supernatural battles feel cool first and logical second'
    ],
    bestMatches: {
      'jujutsu kaisen': 'The clean modern answer: curses, style, brutal fights, and supernatural combat with teeth.',
      'black clover': 'Long-form shonen growth and hype power climbing.',
      'demon slayer': 'Sword fights, demons, emotion, and clean spectacle.',
      'hells paradise': 'Darker, stranger supernatural combat with stylish violence.',
      'chainsaw man': 'Messier and meaner, but scratches the supernatural action edge.'
    },
    avoid: [
      'Slow slice-of-life will not hit the Bleach button.',
      'Random side movies are not where to start.',
      'If you want Bleach specifically, prioritize style and power systems over pure genre tags.'
    ]
  }
};

export function findKnowledgeProfile(animeOrTitle = '') {
  const text = typeof animeOrTitle === 'string'
    ? norm(animeOrTitle)
    : norm(`${animeOrTitle.title || ''} ${animeOrTitle.officialTitle || ''}`);

  for (const [key, profile] of Object.entries(ANIME_KNOWLEDGE)) {
    if (text.includes(key)) return { key, profile };
    if ((profile.aliases || []).some((alias) => text.includes(norm(alias)))) return { key, profile };
  }

  return null;
}

export function knowledgeOpinionFor(source, candidate) {
  const found = findKnowledgeProfile(source);
  if (!found) return null;

  const candidateText = norm(`${candidate.title || ''} ${candidate.officialTitle || ''}`);
  for (const [key, opinion] of Object.entries(found.profile.bestMatches || {})) {
    if (candidateText.includes(norm(key)) || norm(key).includes(candidateText)) return opinion;
  }

  return null;
}

export function buildKnowledgeIntro(source) {
  const found = findKnowledgeProfile(source);
  if (!found) return null;

  const { profile } = found;

  return [
    `🧠 JoeAI Knowledge Mode: ${source.title}`,
    '',
    profile.core,
    '',
    `What you are probably chasing: ${profile.chase}.`,
    '',
    'Why fans love it:',
    profile.fanLove.map((item) => `• ${item}`).join('\n')
  ].join('\n');
}

export function buildKnowledgeWarnings(source) {
  const found = findKnowledgeProfile(source);
  if (!found || !found.profile.avoid?.length) return '';

  return [
    'JoeAI warning label:',
    '',
    found.profile.avoid.map((item) => `• ${item}`).join('\n')
  ].join('\n');
}
