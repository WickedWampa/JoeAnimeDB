const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

// Upgrade JoeAI bulk import response from plain text to structured result cards.
const oldAnswerBlock = `    const answer = [
      '🍜 Bulk import complete.',
      '',
      \`Added: \${added.length}\`,
      \`Skipped duplicates: \${skipped.length}\`,
      \`Failed: \${failed.length}\`,
      '',
      added.length ? 'Added:\\n' + added.map((title) => \`✓ \${title}\`).join('\\n') : '',
      skipped.length ? '\\nSkipped:\\n' + skipped.map((title) => \`• \${title}\`).join('\\n') : '',
      failed.length ? '\\nFailed:\\n' + failed.map((title) => \`✗ \${title}\`).join('\\n') : ''
    ].filter(Boolean).join('\\n');

    setLog((current) => [...current, { who: 'bot', type: 'text', text: answer }]);`;

const newAnswerBlock = `    setLog((current) => [
      ...current,
      {
        who: 'bot',
        type: 'bulkResult',
        title: '🍜 Bulk import complete',
        added,
        skipped,
        failed
      }
    ]);`;

if (text.includes(oldAnswerBlock)) {
  text = text.replace(oldAnswerBlock, newAnswerBlock);
} else {
  console.warn('Could not find exact bulk answer block. Skipping response upgrade.');
}

// Add bulk result renderer.
if (!text.includes('function renderBulkResult')) {
  text = text.replace(
`  function renderMessage(message, index) {`,
`  function renderBulkResult(message, index) {
    return (
      <div key={index} className="chat bot joeaiBulkResult">
        <div className="joeaiBulkHeader">
          <h2>{message.title}</h2>
          <div className="joeaiBulkStats">
            <span>Added: {message.added?.length || 0}</span>
            <span>Already in Library: {message.skipped?.length || 0}</span>
            <span>Failed: {message.failed?.length || 0}</span>
          </div>
        </div>

        {message.added?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Added</h3>
            {message.added.map((title) => (
              <div className="joeaiBulkRow added" key={title}>
                <span>✓</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.skipped?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Already in Library</h3>
            {message.skipped.map((title) => (
              <div className="joeaiBulkRow skipped" key={title}>
                <span>↪</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.failed?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Needs Attention</h3>
            {message.failed.map((title) => (
              <div className="joeaiBulkRow failed" key={title}>
                <span>!</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  function renderMessage(message, index) {`
  );
}

// Wire renderMessage to bulkResult.
if (!text.includes("message.type === 'bulkResult'")) {
  text = text.replace(
`    if (message.type === 'recommendations') {`,
`    if (message.type === 'bulkResult') {
      return renderBulkResult(message, index);
    }

    if (message.type === 'recommendations') {`
  );
}

// Make skipped text more human if the local skipped push still says "title → dup".
text = text.replace(
`          skipped.push(\`\${title} → \${result.duplicate.title}\`);`,
`          skipped.push(\`\${title} is already in your library as \${result.duplicate.title}\`);`
);

fs.writeFileSync(file, text);
console.log('JoeAI bulk result cards patched.');
