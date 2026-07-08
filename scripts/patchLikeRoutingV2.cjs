const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());
const parserFile = path.join(root, 'src', 'ai', 'intentParser.js');
let text = fs.readFileSync(parserFile, 'utf8');

// Put this immediately after raw/lower are created so "like X" never falls into generic recommendations.
if (!text.includes('SPRINT4_SIMILARITY_GUARD')) {
  text = text.replace(
`  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);`,
`  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);

  // SPRINT4_SIMILARITY_GUARD
  // "I want to watch something like Dorohedoro" must route to Anime DNA similarity,
  // not the older generic recommendation card.
  if (/\\b(like|similar to|something like|anime like|show like|shows like)\\b/i.test(raw)) {
    return { kind: 'question', text: raw };
  }`
  );
}

const simFile = path.join(root, 'src', 'ai', 'similarityEngine.js');
if (fs.existsSync(simFile)) {
  let sim = fs.readFileSync(simFile, 'utf8');

  // Make extraction more forgiving and always grab the title after the LAST "like" / "similar to".
  if (!sim.includes('SPRINT4_EXTRACT_SIMILAR_TITLE_V2')) {
    sim = sim.replace(
`export function maybeSimilarRecommendation(question = '', anime = [], catalog = []) {
  const patterns = [
    /(?:like|similar to|something like)\\s+(.+?)[?.!]*$/i,
    /(?:recommend|watch)\\s+(?:something|a show|an anime)?\\s*(?:like|similar to)\\s+(.+?)[?.!]*$/i,
    /i want to watch (?:a show|an anime|something)?\\s*(?:like|similar to)\\s+(.+?)[?.!]*$/i
  ];

  for (const pattern of patterns) {
    const match = String(question).match(pattern);
    if (match?.[1]) {
      const title = match[1].trim();
      return recommendSimilarTo({ query: title, anime, catalog }).text;
    }
  }

  return null;
}`,
`export function maybeSimilarRecommendation(question = '', anime = [], catalog = []) {
  // SPRINT4_EXTRACT_SIMILAR_TITLE_V2
  const raw = String(question || '').trim();

  const similarTo = raw.match(/similar\\s+to\\s+(.+?)[?.!]*$/i);
  if (similarTo?.[1]) {
    return recommendSimilarTo({ query: similarTo[1].trim(), anime, catalog }).text;
  }

  const lastLike = raw.toLowerCase().lastIndexOf(' like ');
  if (lastLike !== -1) {
    const title = raw.slice(lastLike + 6).replace(/[?.!]+$/g, '').trim();
    if (title) return recommendSimilarTo({ query: title, anime, catalog }).text;
  }

  const somethingLike = raw.match(/something\\s+like\\s+(.+?)[?.!]*$/i);
  if (somethingLike?.[1]) {
    return recommendSimilarTo({ query: somethingLike[1].trim(), anime, catalog }).text;
  }

  return null;
}`
    );
  }

  fs.writeFileSync(simFile, sim);
}

fs.writeFileSync(parserFile, text);
console.log('Like/similar routing V2 applied.');
console.log('Restart dev server, then test: I want to watch something like Dorohedoro');
