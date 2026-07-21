import { getAnimeStudios } from '../utils/metadataAdapters';

// Sprint 4 Phase 1: Library Intelligence
// Pure functions only. No React. No database writes.

const norm = (v = '') => String(v ?? '').trim();
const low = (v = '') => norm(v).toLowerCase();

function joeScore(anime = {}) {
  const n = Number(anime.joeScore ?? anime.rating ?? anime.score);
  return Number.isFinite(n) ? n : null;
}

function malScore(anime = {}) {
  const n = Number(anime.communityScore ?? anime.malScore ?? anime.mal);
  return Number.isFinite(n) ? n : null;
}

function episodes(anime = {}) {
  const n = Number(anime.episodeCount ?? anime.episodes);
  return Number.isFinite(n) ? n : 0;
}

function countBy(values = []) {
  const map = new Map();
  values.filter(Boolean).map(norm).filter(Boolean).forEach((v) => map.set(v, (map.get(v) || 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function line(item = {}, extra = '') {
  const bits = [];
  const j = joeScore(item);
  const m = malScore(item);
  const eps = episodes(item);

  if (j !== null) bits.push(`Joe ${j.toFixed(1)}`);
  if (m !== null) bits.push(`MAL ${m}`);
  const studio = getAnimeStudios(item)[0];
  if (studio) bits.push(studio);
  if (eps) bits.push(`${eps} eps`);
  if (extra) bits.push(extra);

  return `• ${item.title}${bits.length ? ` — ${bits.join(' · ')}` : ''}`;
}

function formatList(items = [], mapper = (x) => `• ${x}`) {
  return items.length ? items.map(mapper).join('\n') : 'Nothing found.';
}

function statusMatches(anime = [], status = '') {
  const s = low(status);
  return anime.filter((item) => low(item.status) === s || low(item.status).includes(s));
}

function byStudio(anime = [], studio = '') {
  const s = low(studio);
  return anime.filter((item) => getAnimeStudios(item).some((studio) => low(studio).includes(s)));
}

function byGenre(anime = [], genre = '') {
  const g = low(genre);
  return anime.filter((item) => (item.genres || []).some((x) => low(x).includes(g)));
}

export function getLibraryStats(anime = [], catalog = []) {
  const rated = anime.filter((item) => joeScore(item) !== null);
  const malRated = anime.filter((item) => malScore(item) !== null);
  const totalEpisodes = anime.reduce((sum, item) => sum + episodes(item), 0);

  return {
    total: anime.length,
    catalogTotal: catalog.length,
    completed: statusMatches(anime, 'completed').length,
    watching: statusMatches(anime, 'watching').length,
    dropped: statusMatches(anime, 'dropped').length,
    onHold: anime.filter((item) => low(item.status).includes('hold')).length,
    favorites: anime.filter((item) => item.favorite).length,
    rated: rated.length,
    unrated: anime.length - rated.length,
    episodes: totalEpisodes,
    minutes: totalEpisodes * 24,
    hours: (totalEpisodes * 24) / 60,
    days: (totalEpisodes * 24) / 60 / 24,
    avgJoe: rated.length ? rated.reduce((sum, item) => sum + joeScore(item), 0) / rated.length : null,
    avgMal: malRated.length ? malRated.reduce((sum, item) => sum + malScore(item), 0) / malRated.length : null,
    topGenres: countBy(anime.flatMap((item) => item.genres || [])),
    topStudios: countBy(anime.flatMap((item) => getAnimeStudios(item))),
    topYears: countBy(anime.map((item) => item.year).filter(Boolean))
  };
}

export function answerLibraryOverview(anime = [], catalog = []) {
  const s = getLibraryStats(anime, catalog);

  return [
    '🧠 Library Intelligence Overview',
    '',
    `• ${s.total} titles in your library`,
    `• ${s.completed} completed`,
    `• ${s.watching} watching`,
    `• ${s.favorites} favorites`,
    `• ${s.unrated} unrated`,
    `• ${s.episodes.toLocaleString()} episodes tracked`,
    `• About ${Math.round(s.hours).toLocaleString()} hours / ${s.days.toFixed(1)} days watched`,
    s.avgJoe !== null ? `• Average Joe score: ${s.avgJoe.toFixed(2)}` : '• Average Joe score: not enough ratings yet',
    s.avgMal !== null ? `• Average MAL score: ${s.avgMal.toFixed(2)}` : '• Average MAL score: not enough metadata yet',
    s.topGenres[0] ? `• Top genre: ${s.topGenres[0][0]} (${s.topGenres[0][1]})` : '',
    s.topStudios[0] ? `• Top studio: ${s.topStudios[0][0]} (${s.topStudios[0][1]})` : ''
  ].filter(Boolean).join('\n');
}

export function answerLibraryQuestion(question = '', anime = [], catalog = []) {
  const q = low(question);

  if (!q) return null;

  if (q.includes('library intelligence') || q.includes('library overview') || q.includes('anime dna') || q.includes('analyze my library') || q.includes('analyze my anime') || q.includes('explain my library')) {
    return answerLibraryOverview(anime, catalog);
  }

  if (q.includes('watch time') || q.includes('how much anime') || q.includes('how many hours') || q.includes('how many days')) {
    const s = getLibraryStats(anime, catalog);
    return ['⏱️ Watch time estimate:', '', `• ${s.episodes.toLocaleString()} episodes`, `• ${s.minutes.toLocaleString()} minutes`, `• ${Math.round(s.hours).toLocaleString()} hours`, `• ${s.days.toFixed(1)} days`, '', 'Estimate uses 24 minutes per episode.'].join('\n');
  }

  if (q.includes('top genre') || q.includes('favorite genre') || q.includes('strongest genre')) {
    const genres = getLibraryStats(anime, catalog).topGenres.slice(0, 10);
    return ['🏷️ Your top genres:', '', formatList(genres, ([name, count], i) => `${i + 1}. ${name} — ${count}`)].join('\n');
  }

  if (q.includes('top studio') || q.includes('favorite studio') || q.includes('studio do i watch')) {
    const studios = getLibraryStats(anime, catalog).topStudios.slice(0, 10);
    return ['🏢 Your top studios:', '', formatList(studios, ([name, count], i) => `${i + 1}. ${name} — ${count}`)].join('\n');
  }

  if (q.includes('unrated') || q.includes('not rated')) {
    return ['⭐ Unrated anime:', '', formatList(anime.filter((item) => joeScore(item) === null).slice(0, 25), line)].join('\n');
  }

  if (q.includes('favorite') && !q.includes('genre') && !q.includes('studio')) {
    return ['❤️ Favorites:', '', formatList(anime.filter((item) => item.favorite).slice(0, 25), line)].join('\n');
  }

  if (q.includes('random pick') || q.includes('pick something') || q.includes('surprise me')) {
    if (!anime.length) return 'Your library is empty.';
    return ['🎲 Random pick:', '', line(anime[Math.floor(Math.random() * anime.length)])].join('\n');
  }

  if (q.includes('dropped')) return ['📚 Dropped anime:', '', formatList(statusMatches(anime, 'dropped').slice(0, 25), line)].join('\n');
  if (q.includes('on hold') || q.includes('paused')) return ['📚 On Hold anime:', '', formatList(anime.filter((item) => low(item.status).includes('hold')).slice(0, 25), line)].join('\n');
  if (q.includes('completed') || q.includes('finished')) return ['📚 Completed anime:', '', formatList(statusMatches(anime, 'completed').slice(0, 25), line)].join('\n');
  if (q.includes('watching')) return ['📚 Watching anime:', '', formatList(statusMatches(anime, 'watching').slice(0, 25), line)].join('\n');

  const studioMatch = question.match(/(?:show me|list|what do i have|everything|all)\s+(?:from|by)\s+(.+?)[?.!]*$/i);
  if (studioMatch?.[1]) {
    const studio = norm(studioMatch[1]);
    return [`🏢 ${studio} in your library:`, '', formatList(byStudio(anime, studio).slice(0, 25), line)].join('\n');
  }

  const genreMatch = question.match(/(?:show me|list|everything|all)\s+(.+?)\s+anime[?.!]*$/i);
  if (genreMatch?.[1]) {
    const genre = norm(genreMatch[1]);
    return [`🏷️ ${genre} anime in your library:`, '', formatList(byGenre(anime, genre).slice(0, 25), line)].join('\n');
  }

  if (q.includes('highest rated') || q.includes('highest-rated') || q.includes('best rated')) {
    const genre = question.match(/(?:highest rated|highest-rated|best rated)\s+(.+?)\s+anime/i)?.[1];
    let pool = genre ? byGenre(anime, genre) : anime;
    const ranked = pool.map((item) => ({ item, score: joeScore(item) })).filter((x) => x.score !== null).sort((a, b) => b.score - a.score).slice(0, 10);

    if (ranked.length) {
      return [`⭐ Your highest-rated${genre ? ` ${genre}` : ''} anime:`, '', formatList(ranked, ({ item, score }, i) => `${i + 1}. ${item.title} — Joe ${score.toFixed(1)}`)].join('\n');
    }

    const malRanked = pool.map((item) => ({ item, score: malScore(item) })).filter((x) => x.score !== null).sort((a, b) => b.score - a.score).slice(0, 10);
    return [`⭐ Highest-rated${genre ? ` ${genre}` : ''} anime by MAL metadata:`, '', formatList(malRanked, ({ item, score }, i) => `${i + 1}. ${item.title} — MAL ${score}`)].join('\n');
  }

  return null;
}
