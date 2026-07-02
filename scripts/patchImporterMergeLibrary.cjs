const fs = require('fs');

const file = 'src/pages/LibraryPage.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('mergeAnimeMetadata')) {
  text = text.replace(
    "searchAnimeCandidates\n} from '../services/animeImporter';",
    "searchAnimeCandidates,\n  mergeAnimeMetadata\n} from '../services/animeImporter';"
  );
}

if (!text.includes('async function upgradeExistingAnime')) {
  text = text.replace(
    "async function addAnime() {",
    `async function upgradeExistingAnime() {
    if (!selectedResult || !duplicate) return;

    setWorking(true);
    setMessage('Updating existing library entry...');

    try {
      const merged = mergeAnimeMetadata(duplicate, selectedResult, status);
      const saved = await updateAnime(merged);
      const savedAnime = saved.anime || [];
      const updated = savedAnime.find((item) => String(item.id) === String(merged.id)) || merged;

      setMessage('Updated existing entry!');
      setSelected?.(updated);
      onClose();
    } catch (error) {
      console.warn('Add Anime upgrade failed:', selectedResult.title, error);
      setMessage('Could not update the existing entry yet. Check the console.');
    } finally {
      setWorking(false);
    }
  }

  async function addAnime() {`
  );
}

text = text.replaceAll(
  `<button type="button" onClick={() => setSelected?.(duplicate)}>Open Existing</button>
                  <button type="button" onClick={onClose}>Cancel</button>`,
  `<button type="button" onClick={upgradeExistingAnime} disabled={working}>
                    {working ? 'Updating...' : 'Update Existing Entry'}
                  </button>
                  <button type="button" onClick={() => setSelected?.(duplicate)}>Open Existing</button>
                  <button type="button" onClick={onClose}>Cancel</button>`
);

text = text.replaceAll(
  "setMessage(existing ? 'Already in your library.' : 'Ready to add.');",
  "setMessage(existing ? 'Already in your library. You can update the existing entry with this metadata.' : 'Ready to add.');"
);

fs.writeFileSync(file, text);
console.log('Patched Add Anime to upgrade shorthand duplicates instead of adding dupes.');
