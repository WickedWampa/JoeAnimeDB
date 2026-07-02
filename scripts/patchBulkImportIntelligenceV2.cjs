const fs = require('fs');

const file = 'src/pages/LibraryPage.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(
`        const confident = Number(best.importConfidence || 0) >= 90;
        const clearWinner = !matches[1] || Number(best.importConfidence || 0) - Number(matches[1].importConfidence || 0) >= 8;

        if (!confident && !clearWinner) {
          review.push({ title: rawTitle, matches });
          continue;
        }`,
`        const confident = Number(best.importConfidence || 0) >= 90;
        const closeSecond = matches[1] && Number(best.importConfidence || 0) - Number(matches[1].importConfidence || 0) < 8;
        const weakMatch = !confident && Number(best.importConfidence || 0) < 82;

        if (closeSecond || weakMatch) {
          review.push({ title: rawTitle, matches });
          continue;
        }`
);

if (!text.includes('async function importReviewedMatch')) {
  text = text.replace(
`  const bulkTitles = parseBulkTitles(bulkText);`,
`  async function importReviewedMatch(reviewItem, match) {
    if (!match) return;

    const existing = findDuplicateAnime(allAnime, match);

    if (existing) {
      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        skipped: [
          ...current.skipped,
          {
            title: reviewItem.title,
            match: existing.title,
            reason: 'Already in library'
          }
        ]
      }));
      return;
    }

    const next = {
      ...match,
      id: animeIdFromTitle(match),
      status,
      favorite: false,
      rewatches: 0,
      finalRank: allAnime.length + (bulkSummary?.added?.length || 0) + 1,
      notes: 'Added from bulk import review.'
    };

    try {
      const saved = await updateAnime(next);
      const savedAnime = saved.anime || [];
      const added = savedAnime.find((item) => String(item.id) === String(next.id)) || next;

      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        added: [...current.added, added]
      }));

      setSelected?.(added);
    } catch (error) {
      console.warn('Review import failed:', reviewItem.title, error);

      setBulkSummary((current) => ({
        ...current,
        review: current.review.filter((item) => item.title !== reviewItem.title),
        failed: [
          ...current.failed,
          {
            title: reviewItem.title,
            reason: error.message || 'Review import failed'
          }
        ]
      }));
    }
  }

  const bulkTitles = parseBulkTitles(bulkText);`
  );
}

text = text.replace(
`                    {bulkSummary.review.map((item) => (
                      <p key={item.title}>⚠ {item.title} — use Single Search to choose the correct match</p>
                    ))}`,
`                    {bulkSummary.review.map((item) => (
                      <div className="bulkReviewCard" key={item.title}>
                        <h4>⚠ {item.title}</h4>
                        <p>Pick the correct match:</p>

                        <div className="bulkReviewMatches">
                          {(item.matches || []).slice(0, 4).map((match) => (
                            <button
                              type="button"
                              key={match.malId || match.title}
                              onClick={() => importReviewedMatch(item, match)}
                            >
                              <Poster anime={match} className="bulkReviewPoster" />
                              <span>
                                <strong>{match.title}</strong>
                                <small>
                                  {[
                                    match.importConfidence ? \`\${match.importConfidence}% \${match.importLabel || 'Match'}\` : null,
                                    match.year,
                                    match.type,
                                    match.episodeCount ? \`\${match.episodeCount} eps\` : null,
                                    match.studio
                                  ].filter(Boolean).join(' • ')}
                                </small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}`
);

fs.writeFileSync(file, text);
console.log('Bulk Import Intelligence V2 patched.');
