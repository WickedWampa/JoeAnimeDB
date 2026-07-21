// Sprint 5 Phase 2: Genome Relationship Graph
// This is the curated relationship layer on top of Anime Genome.
// It tells JoeAI which recommendations are direct successors, spiritual cousins,
// weak thematic cousins, and hard avoids.

export const GENOME_GRAPH_VERSION = '0.1.0';

export const GENOME_RELATIONSHIPS = {
  'initial-d': {
    direct: [
      { id: 'mf-ghost', weight: 0.98, reason: 'Direct successor to Initial D’s street-racing philosophy.' },
      { id: 'wangan-midnight', weight: 0.92, reason: 'Same late-night car obsession, but highway racing instead of mountain passes.' },
      { id: 'capeta', weight: 0.84, reason: 'Racing progression and technical growth without generic sports noise.' },
      { id: 'overtake', weight: 0.78, reason: 'Motorsport pressure and racing ambition with a more emotional modern angle.' },
      { id: 'redline', weight: 0.74, reason: 'Not grounded, but pure racing adrenaline and speed worship.' }
    ],
    thematic: [
      { id: 'megalo-box', weight: 0.62, reason: 'Different sport, but similar quiet underdog grit and let-the-skill-talk attitude.' },
      { id: 'hajime-no-ippo', weight: 0.58, reason: 'Training, rivalry, technical growth, and earned confidence.' },
      { id: 'blue-lock', weight: 0.42, reason: 'Shares obsession with becoming the best, but the domain is soccer, not racing.' }
    ],
    avoid: [
      { id: 'yuri-on-ice', penalty: 0.75, reason: 'Figure skating is not street racing. Legendary blooper #0001.' },
      { id: 'haikyuu', penalty: 0.45, reason: 'Great sports anime, wrong domain for Initial D.' },
      { id: 'kuroko-no-basket', penalty: 0.45, reason: 'Competition overlap, but not the same viewing experience.' }
    ]
  },

  'dorohedoro': {
    direct: [
      { id: 'chainsaw-man', weight: 0.95, reason: 'Violent, funny, gross, sad, and completely unhinged.' },
      { id: 'golden-kamuy', weight: 0.9, reason: 'Different setting, but the same violent adult-weirdo chaos.' },
      { id: 'blood-blockade-battlefront', weight: 0.84, reason: 'Urban monster chaos with style and a killer soundtrack.' },
      { id: 'hells-paradise', weight: 0.8, reason: 'Body-horror fantasy survival with dangerous mystery.' },
      { id: 'made-in-abyss', weight: 0.74, reason: 'Less funny, but nails strange-world horror and dark exploration.' }
    ],
    thematic: [
      { id: 'berserk', weight: 0.66, reason: 'Matches brutality and dark fantasy, but lacks Dorohedoro’s comedy.' },
      { id: 'black-lagoon', weight: 0.58, reason: 'Adult criminals, grime, violence, and moral grayness.' },
      { id: 'akudama-drive', weight: 0.56, reason: 'Criminal chaos and flashy violence, but less lived-in worldbuilding.' }
    ],
    avoid: [
      { id: 'fairy-tail', penalty: 0.55, reason: 'Too clean and friendship-fantasy for the Dorohedoro itch.' },
      { id: 'frieren', penalty: 0.35, reason: 'Excellent fantasy, totally different emotional speed.' }
    ]
  },

  'bleach': {
    direct: [
      { id: 'jujutsu-kaisen', weight: 0.92, reason: 'Modern curses, brutal fights, and supernatural combat with style.' },
      { id: 'black-clover', weight: 0.82, reason: 'Long-form shonen power climb with rivalry and big hype.' },
      { id: 'yu-yu-hakusho', weight: 0.78, reason: 'Classic supernatural combat energy and tournament roots.' },
      { id: 'demon-slayer', weight: 0.72, reason: 'Sword combat, demons, emotion, and spectacle.' },
      { id: 'hells-paradise', weight: 0.68, reason: 'Darker supernatural combat with strange enemies and stylish violence.' }
    ],
    thematic: [
      { id: 'chainsaw-man', weight: 0.6, reason: 'Supernatural action with edge, but much messier and meaner.' },
      { id: 'soul-eater', weight: 0.58, reason: 'Stylized supernatural weapon-school energy.' }
    ],
    avoid: [
      { id: 'initial-d', penalty: 0.8, reason: 'Cool factor overlap only. Totally different domain.' },
      { id: 'yuri-on-ice', penalty: 0.8, reason: 'Absolutely not a Bleach follow-up.' }
    ]
  },

  'frieren': {
    direct: [
      { id: 'violet-evergarden', weight: 0.9, reason: 'Beautiful, reflective, emotional healing through quiet moments.' },
      { id: 'ancient-magus-bride', weight: 0.82, reason: 'Slow magical healing, folklore, loneliness, and strange beauty.' },
      { id: 'spice-and-wolf', weight: 0.72, reason: 'Warm travel fantasy with conversation, companionship, and patience.' },
      { id: 'mushoku-tensei', weight: 0.66, reason: 'Rich fantasy worldbuilding and long emotional growth, but much messier.' },
      { id: 'made-in-abyss', weight: 0.56, reason: 'Beautiful fantasy exploration, but far darker and more disturbing.' }
    ],
    thematic: [
      { id: 'march-comes-in-like-a-lion', weight: 0.62, reason: 'Different genre, but similar quiet healing and emotional patience.' },
      { id: 'your-lie-in-april', weight: 0.5, reason: 'Emotional weight and grief, but much more romance/music drama.' }
    ],
    avoid: [
      { id: 'dorohedoro', penalty: 0.55, reason: 'Both are fantasy, but the emotional experience is wildly different.' },
      { id: 'one-punch-man', penalty: 0.4, reason: 'Wrong energy if the user wants Frieren’s reflective quiet.' }
    ]
  }
};

export function getGenomeRelationships(genomeId = '') {
  return GENOME_RELATIONSHIPS[genomeId] || null;
}

export function relationshipFor(sourceId = '', candidateId = '') {
  const graph = getGenomeRelationships(sourceId);
  if (!graph) return null;

  for (const bucket of ['direct', 'thematic', 'avoid']) {
    const found = (graph[bucket] || []).find((entry) => entry.id === candidateId);
    if (found) return { type: bucket, ...found };
  }

  return null;
}
