const fs = require('fs');

const file = 'src/pages/LibraryPage.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('lastBulkAddedIds')) {
  text = text.replace(
    "  const [bulkSummary, setBulkSummary] = useState(null);",
    "  const [bulkSummary, setBulkSummary] = useState(null);\n  const [lastBulkAddedIds, setLastBulkAddedIds] = useState([]);"
  );
}

if (!text.includes('async function undoLastBulkImport')) {
  text = text.replace(
    "  async function bulkImport() {",
    `  async function undoLastBulkImport() {
    if (!lastBulkAddedIds.length) return;
    if (!confirm(\`Remove \${lastBulkAddedIds.length} anime added by the last bulk import?\`)) return;

    for (const id of lastBulkAddedIds) {
      const item = allAnime.find((animeItem) => String(animeItem.id) === String(id));
      if (item) {
        await updateAnime({ ...item, _deleteMe: true });
      }
    }

    setMessage('Undo requested. If titles remain, use Remove From Library from details.');
  }

  async function bulkImport() {`
  );
}

text = text.replace(
  "    const added = [];",
  "    const added = [];\n    const addedIds = [];"
);

text = text.replace(
  "        added.push(next);",
  "        added.push(next);\n        addedIds.push(next.id);"
);

text = text.replace(
  "    setBulkSummary({ added, skipped, review, failed });",
  "    setLastBulkAddedIds(addedIds);\n    setBulkSummary({ added, skipped, review, failed });"
);

text = text.replace(
  "<h3>Import Summary</h3>",
  "<h3>🎉 Import Complete</h3>"
);

text = text.replace(
  "{bulkSummary.added.map((item) => <p key={item.id}>✓ {item.title}</p>)}",
  `{bulkSummary.added.map((item) => (
                      <button className="bulkResultRow" type="button" key={item.id} onClick={() => setSelected?.(item)}>
                        <span>✓ {item.title}</span>
                        <small>{[item.year, item.studio, item.episodeCount ? \`\${item.episodeCount} eps\` : null].filter(Boolean).join(' • ')}</small>
                        <b>Open</b>
                      </button>
                    ))}`
);

text = text.replace(
  "{bulkSummary.skipped.map((item) => <p key={item.title}>✓ {item.title} → {item.match}</p>)}",
  "{bulkSummary.skipped.map((item) => <p key={item.title}>✓ {item.title} → {item.match}</p>)}"
);

if (!text.includes('bulkSummaryActions')) {
  text = text.replace(
    `<div className="bulkSummaryStats">
                  <span>Added: {bulkSummary.added.length}</span>
                  <span>Skipped: {bulkSummary.skipped.length}</span>
                  <span>Needs review: {bulkSummary.review.length}</span>
                  <span>Failed: {bulkSummary.failed.length}</span>
                </div>`,
    `<div className="bulkSummaryStats">
                  <span>Added: {bulkSummary.added.length}</span>
                  <span>Skipped: {bulkSummary.skipped.length}</span>
                  <span>Needs review: {bulkSummary.review.length}</span>
                  <span>Failed: {bulkSummary.failed.length}</span>
                </div>

                <div className="bulkSummaryActions">
                  <button type="button" onClick={onClose}>Go To Library</button>
                </div>`
  );
}

fs.writeFileSync(file, text);
console.log('Bulk import summary polish added.');
