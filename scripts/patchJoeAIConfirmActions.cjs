const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

// 1) Add pending action state after addingId.
if (!text.includes('const [pendingAction, setPendingAction]')) {
  text = text.replace(
    "  const [addingId, setAddingId] = useState('');",
    "  const [addingId, setAddingId] = useState('');\n  const [pendingAction, setPendingAction] = useState(null);"
  );
}

// 2) Rename existing bulkAddFromChat function to executeBulkAddFromChat.
text = text.replace(
  "  async function bulkAddFromChat(command) {",
  "  async function executeBulkAddFromChat(command) {"
);

// 3) Add confirmation card renderer.
if (!text.includes('function renderConfirmAction')) {
  text = text.replace(
`  function renderBulkResult(message, index) {`,
`  function renderConfirmAction(message, index) {
    const action = message.action;

    return (
      <div key={index} className="chat bot joeaiConfirmCard">
        <div className="joeaiConfirmHeader">
          <h2>{message.title}</h2>
          <p>{message.text}</p>
        </div>

        {action?.kind === 'bulkAdd' && (
          <div className="joeaiConfirmList">
            {action.titles.map((title) => (
              <span key={title}>✓ {title}</span>
            ))}
          </div>
        )}

        <div className="joeaiConfirmActions">
          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setLog((current) => [...current, { who: 'bot', type: 'text', text: 'Canceled. No changes made.' }]);
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary"
            onClick={async () => {
              if (!pendingAction) return;
              const nextAction = pendingAction;
              setPendingAction(null);

              if (nextAction.kind === 'bulkAdd') {
                await executeBulkAddFromChat(nextAction);
              }

              if (nextAction.kind === 'singleAdd') {
                await addAnimeToLibrary(nextAction);
              }
            }}
          >
            {message.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  function renderBulkResult(message, index) {`
  );
}

// 4) Render confirmation messages.
if (!text.includes("message.type === 'confirmAction'")) {
  text = text.replace(
`    if (message.type === 'bulkResult') {
      return renderBulkResult(message, index);
    }`,
`    if (message.type === 'confirmAction') {
      return renderConfirmAction(message, index);
    }

    if (message.type === 'bulkResult') {
      return renderBulkResult(message, index);
    }`
  );
}

// 5) Change bulk command handling to confirmation.
text = text.replace(
`    const bulkCommand = parseBulkAdd(q);
    if (bulkCommand) {
      await bulkAddFromChat(bulkCommand);
      return;
    }`,
`    const bulkCommand = parseBulkAdd(q);
    if (bulkCommand) {
      const action = { ...bulkCommand, kind: 'bulkAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to bulk import',
          text: \`I found \${bulkCommand.titles.length} title(s). I will add them as \${bulkCommand.status}, skip duplicates, and fetch metadata. Import these?\`,
          confirmLabel: 'Import Titles',
          action
        }
      ]);
      return;
    }`
);

// 6) Change single add handling to confirmation for brand-new actions.
text = text.replace(
`    const addCommand = parseSingleAdd(q);
    if (addCommand) {
      await addAnimeToLibrary(addCommand);
      return;
    }`,
`    const addCommand = parseSingleAdd(q);
    if (addCommand) {
      const action = { ...addCommand, kind: 'singleAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to update your library',
          text: \`I will add or update “\${addCommand.title}” as \${addCommand.status} and fetch metadata. Continue?\`,
          confirmLabel: 'Do It',
          action
        }
      ]);
      return;
    }`
);

fs.writeFileSync(file, text);
console.log('JoeAI now asks for confirmation before making library changes.');
