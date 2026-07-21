export function buildGenomePrompt(metadata = {}, examples = []) {
  return [
    'You are generating a JoeAnimeDB Anime Genome Card.',
    'Return ONLY strict JSON. No markdown. No comments.',
    'The card is provisional and must be honest about uncertainty.',
    'Use anime-fan recommendation language, not encyclopedia language.',
    '',
    'Required fields: domain, subdomain, signature, coreFantasy, viewerMotivations, themes, emotionalProfile, atmosphere, vibes, accessibility, idealFollowUps, antiRecommendations, recommendationWeight, rewatchValue, whyFansLove, whoShouldWatch, whoShouldAvoid, joeNote.',
    'Vibes are 0-10 numbers. Only include meaningful vibes.',
    '',
    'Metadata:',
    JSON.stringify(metadata, null, 2),
    '',
    'Style examples:',
    JSON.stringify(examples, null, 2)
  ].join('\n');
}
