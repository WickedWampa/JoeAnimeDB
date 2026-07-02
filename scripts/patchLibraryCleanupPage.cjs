const fs = require('fs');

function patchApp() {
  const file = 'src/App.jsx';
  let text = fs.readFileSync(file, 'utf8');

  const cssImport = "import './styles/library-cleanup.css';";
  if (!text.includes(cssImport)) {
    text = `${cssImport}\n${text}`;
  }

  if (!text.includes("import { LibraryCleanup } from './pages/LibraryCleanup';")) {
    text = text.replace(
      "import { LibraryPage } from './pages/LibraryPage';",
      "import { LibraryPage } from './pages/LibraryPage'; import { LibraryCleanup } from './pages/LibraryCleanup';"
    );
  }

  if (!text.includes('updateData,')) {
    text = text.replace(
      'syncMetadata, updateAnime',
      'syncMetadata, updateData, updateAnime'
    );
  }

  if (!text.includes("view === 'cleanup'")) {
    text = text.replace(
      "{view === 'settings' && <SettingsPage />}",
      "{view === 'cleanup' && <LibraryCleanup anime={anime} updateData={updateData} setSelected={setSelected} />} {view === 'settings' && <SettingsPage />}"
    );
  }

  fs.writeFileSync(file, text);
}

function patchSidebar() {
  const file = 'src/components/Sidebar.jsx';
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes('Wrench')) {
    text = text.replace(
      'Palette } from',
      'Palette, Wrench } from'
    );
  }

  if (!text.includes('Library Cleanup')) {
    text = text.replace(
      'label="Settings" id="settings"',
      'label="Library Cleanup" id="cleanup" view={view} setView={setView} /> <NavButton icon={<Wrench size={21} />} label="Settings" id="settings"'
    );
  }

  fs.writeFileSync(file, text);
}

function removeInlineDuplicateToolFromLibrary() {
  const file = 'src/pages/LibraryPage.jsx';
  let text = fs.readFileSync(file, 'utf8');

  // Hide the experimental inline duplicate tool if it exists.
  text = text.replace(
    /{canAddAnime && \(\s*<DuplicateMergeTool[\s\S]*?\/>\s*\)}/,
    ''
  );

  fs.writeFileSync(file, text);
}

patchApp();
patchSidebar();
removeInlineDuplicateToolFromLibrary();

console.log('Added standalone Library Cleanup page and removed inline Library duplicate tool.');
