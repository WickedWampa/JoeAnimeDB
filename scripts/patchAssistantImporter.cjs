const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("import { importAnimeByTitle } from '../services/animeImporter';")) {
  text = text.replace(
    "import { fetchMetadata } from '../services/metadata';",
    "import { fetchMetadata } from '../services/metadata'; import { importAnimeByTitle } from '../services/animeImporter';"
  );
}

if (!text.includes('importAnimeByTitle({ title: input.title')) {
  const oldBlock = `const catalogMatch = findCatalogTitle(input.title); const base = catalogMatch || { title: input.title }; const id = 'anime-' + animeId(base); setAddingId(id); try { const draft = { ...base, id, status: input.status || 'Watching', favorite: false, rewatches: 0, finalRank: anime.length + 1, joeScore: base.joeScore || '', notes: base.notes || 'Added from JoeAI.', addedFrom: 'JoeAI' }; const enriched = await fetchMetadata(draft); await updateAnime(enriched); setLog((current) => [ ...current, { who: 'bot', type: 'text', text: 'Added ' + (enriched.officialTitle || enriched.title) + ' to your library as ' + draft.status + ' and fetched metadata.' } ]); } catch (error) {`;

  const newBlock = `setAddingId(input.title); try { const result = await importAnimeByTitle({ title: input.title, status: input.status || 'Watching', library: anime }); if (result.duplicate) { setLog((current) => [ ...current, { who: 'bot', type: 'text', text: result.duplicate.title + ' is already in your library as ' + (result.duplicate.status || 'saved') + '. No duplicate added.' } ]); return; } const nextAnime = { ...result.candidate, finalRank: anime.length + 1, addedFrom: 'JoeAI' }; await updateAnime(nextAnime); setLog((current) => [ ...current, { who: 'bot', type: 'text', text: 'Added ' + (nextAnime.officialTitle || nextAnime.title) + ' to your library as ' + nextAnime.status + ' and fetched metadata.' } ]); } catch (error) {`;

  if (text.includes(oldBlock)) {
    text = text.replace(oldBlock, newBlock);
  } else {
    console.warn('Could not find old Assistant add block. Assistant may already be different.');
  }
}

fs.writeFileSync(file, text);
console.log('Patched Assistant to use importer search/filter path.');
