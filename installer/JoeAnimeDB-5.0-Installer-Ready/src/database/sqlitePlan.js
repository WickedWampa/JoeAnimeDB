export const sqlitePlan = {
  version: '4.3',
  status: 'Repository layer ready; SQLite can replace localStorage without rewriting the UI.',
  nextTables: [
    'anime',
    'anime_genres',
    'user_status',
    'user_ratings',
    'user_notes',
    'tags',
    'anime_tags',
    'watch_sessions'
  ],
  migrationSteps: [
    'Keep React components talking only to animeRepository.',
    'Export current localStorage JSON as a safety backup.',
    'Create SQLite schema.',
    'Import seed anime into SQLite.',
    'Move watch status, ratings, notes, favorites, and tags into user tables.',
    'Replace animeRepository internals with SQLite calls.'
  ]
};
