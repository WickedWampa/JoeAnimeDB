const fs = require('fs');

const file = 'src/pages/LibraryPage.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('function resultDuplicate')) {
  text = text.replace(
    "async function addAnime() {",
    `function resultDuplicate(result) {
    return findDuplicateAnime(allAnime, result);
  }

  async function addAnime() {`
  );
}

text = text.replaceAll(
  `<button
                type="button"
                className="addAnimeResult"
                key={result.malId || result.title}
                onClick={() => chooseResult(result)}
              >`,
  `<button
                type="button"
                className={\`addAnimeResult \${resultDuplicate(result) ? 'alreadyOwned' : ''}\`}
                key={result.malId || result.title}
                onClick={() => chooseResult(result)}
              >`
);

text = text.replaceAll(
  `<span className={\`importLabel \${String(result.importLabel || 'Related').replace(/\\s+/g, '').toLowerCase()}\`}>
                    {result.importConfidence ? \`\${result.importConfidence}% · \` : ''}{result.importLabel || 'Related'}
                  </span>`,
  `<span className={\`importLabel \${String(result.importLabel || 'Related').replace(/\\s+/g, '').toLowerCase()}\`}>
                    {result.importConfidence ? \`\${result.importConfidence}% · \` : ''}{result.importLabel || 'Related'}
                  </span>
                  {resultDuplicate(result) && <span className="importOwnedBadge">✓ Already in Library</span>}`
);

text = text.replaceAll(
  `{[result.year, result.type, result.episodeCount ? \`\${result.episodeCount} eps\` : null, result.studio, result.communityScore ? \`⭐ \${result.communityScore}\` : null]
                      .filter(Boolean)
                      .join(' • ')}`,
  `{[
                      result.year,
                      result.type ? \`\${result.type === 'TV' ? '📺' : result.type === 'Movie' ? '🎞' : result.type === 'OVA' ? '💿' : '🎬'} \${result.type}\` : null,
                      result.episodeCount ? \`📚 \${result.episodeCount} eps\` : null,
                      result.studio ? \`🎭 \${result.studio}\` : null,
                      result.communityScore ? \`⭐ \${result.communityScore}\` : null
                    ].filter(Boolean).join(' • ')}`
);

fs.writeFileSync(file, text);
console.log('Patched importer result UX: duplicate badges and metadata icons.');
