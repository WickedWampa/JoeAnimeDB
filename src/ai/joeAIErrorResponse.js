export function friendlyJoeAIError(error, context = '') {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const detail = String(error?.message || error || '').toLowerCase();
  const metadataUnavailable = /fetch|network|metadata|kitsu|wikidata|timeout|offline|connection/.test(detail);
  const subject = String(context || '').trim();

  if (offline || metadataUnavailable) {
    return {
      type: 'text',
      text: [
        '🍜 JoeAI is still here, but anime metadata is unavailable right now.',
        '',
        subject ? `I could not finish “${subject}” without guessing.` : 'I stopped before guessing or changing the wrong title.',
        'Your library and personal data are safe. Try again when connected, use a known alternate title, or run Update Database later.'
      ].join('\n')
    };
  }

  return {
    type: 'text',
    text: [
      '🍜 I hit a snag and stopped safely.',
      '',
      subject ? `I could not finish “${subject}”.` : 'I could not finish that request.',
      'Nothing was changed. Please try once more; if it repeats, the console will have the technical details.'
    ].join('\n')
  };
}
