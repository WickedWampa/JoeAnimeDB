export function createNewUserDemoDatabase() {
  return {
    engine: 'new-user-mode',
    path: 'Temporary demo library — not saved to SQLite',
    anime: [],
    catalog: [],
    newUserMode: true
  };
}
