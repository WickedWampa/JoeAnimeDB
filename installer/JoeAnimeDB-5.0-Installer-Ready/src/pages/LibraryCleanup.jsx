import React, { useMemo, useState } from 'react';
import { Poster } from '../components/Poster';
import { findDuplicateGroups, mergeDuplicateGroup, scanLibraryIntegrity, suggestKeeper } from '../services/duplicateTools';

function itemSummary(item) {
  return [
    item.status,
    Number.isFinite(Number(item.joeScore)) ? `Joe ${item.joeScore}` : null,
    item.finalRank ? `#${item.finalRank}` : null,
    (item.malId || item.mal_id) ? `MAL ${(item.malId || item.mal_id)}` : null
  ].filter(Boolean).join(' • ');
}

function IssueCard({ icon, label, items, onPreview }) {
  return (
    <button type="button" className="integrityIssueCard" onClick={() => onPreview(label, items)} disabled={!items.length}>
      <span>{icon}</span>
      <strong>{items.length}</strong>
      <small>{label}</small>
    </button>
  );
}

export function LibraryCleanup({ anime = [], updateData, setSelected, syncMetadata, onBack }) {
  const report = useMemo(() => scanLibraryIntegrity(anime), [anime]);
  const groups = report.duplicates;
  const [keeperByGroup, setKeeperByGroup] = useState({});
  const [mergedCount, setMergedCount] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function saveGroups(groupsToMerge) {
    if (!updateData || !groupsToMerge.length) return;
    setBusy(true);
    setMessage('Merging duplicates safely...');

    try {
      const saved = await updateData((current) => {
        let nextAnime = [...(current.anime || anime)];

        groupsToMerge.forEach(({ group, keeperId }) => {
          const liveGroup = group.map((source) => nextAnime.find((item) => String(item.id) === String(source.id))).filter(Boolean);
          if (liveGroup.length < 2) return;
          const { merged, removeIds } = mergeDuplicateGroup(liveGroup, keeperId);
          nextAnime = nextAnime
            .filter((item) => !removeIds.some((id) => String(id) === String(item.id)))
            .map((item) => String(item.id) === String(merged.id) ? merged : item);
        });

        return { ...current, anime: nextAnime };
      });

      setMergedCount((count) => count + groupsToMerge.length);
      setMessage(`Merged ${groupsToMerge.length} duplicate group${groupsToMerge.length === 1 ? '' : 's'} without losing ratings, favorites, notes, or rewatches.`);
      const last = groupsToMerge.at(-1);
      if (last) {
        const keeperId = last.keeperId || suggestKeeper(last.group).id;
        setSelected?.((saved.anime || []).find((item) => String(item.id) === String(keeperId)) || null);
      }
    } catch (error) {
      setMessage(`Merge failed: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  }

  async function mergeGroup(group, groupIndex) {
    const suggested = suggestKeeper(group);
    await saveGroups([{ group, keeperId: keeperByGroup[groupIndex] || suggested.id }]);
  }

  async function mergeAllSafe() {
    if (!groups.length || busy) return;
    const confirmed = window.confirm(`Merge ${groups.length} duplicate group${groups.length === 1 ? '' : 's'}? JoeAnimeDB will preserve the best metadata plus ratings, favorites, notes, follows, and rewatches.`);
    if (!confirmed) return;
    await saveGroups(groups.map((group, index) => ({ group, keeperId: keeperByGroup[index] || suggestKeeper(group).id })));
  }

  function showPreview(label, items) {
    setPreview({ label, items: items.slice(0, 40) });
  }

  return (
    <section className="panel cleanupPage integrityPage">
      <header className="cleanupHero integrityHero">
        <div>
          <p className="eyebrow">JoeAI Library Maintenance</p>
          <h1>Library Integrity Scan</h1>
          <p>Find duplicates and incomplete metadata, then repair the library without losing personal history.</p>
        </div>
        <div className="integrityHeroActions">
          {onBack && <button type="button" className="secondary" onClick={onBack}>← Settings</button>}
          <button type="button" onClick={mergeAllSafe} disabled={!groups.length || busy}>Merge All Safe Duplicates</button>
          <button type="button" className="secondary" onClick={syncMetadata} disabled={busy}>Repair Missing Metadata</button>
        </div>
      </header>

      {message && <p className="integrityMessage">{message}</p>}

      <div className="cleanupStats integritySummary">
        <div><strong>{anime.length}</strong><span>Total titles</span></div>
        <div><strong>{groups.length}</strong><span>Duplicate groups</span></div>
        <div><strong>{report.issueCount}</strong><span>Issues detected</span></div>
        <div><strong>{mergedCount}</strong><span>Merged this session</span></div>
      </div>

      <div className="integrityIssueGrid">
        <IssueCard icon="🖼️" label="Missing artwork" items={report.missingArtwork} onPreview={showPreview} />
        <IssueCard icon="🏢" label="Missing studios" items={report.missingStudios} onPreview={showPreview} />
        <IssueCard icon="🎭" label="Missing genres" items={report.missingGenres} onPreview={showPreview} />
        <IssueCard icon="📺" label="Missing episode counts" items={report.missingEpisodes} onPreview={showPreview} />
        <IssueCard icon="⭐" label="Missing MAL scores" items={report.missingScores} onPreview={showPreview} />
        <IssueCard icon="🔗" label="Missing MAL IDs" items={report.missingMalIds} onPreview={showPreview} />
      </div>

      {preview && (
        <section className="integrityPreview">
          <div className="integrityPreviewHeader">
            <div><p className="eyebrow">Scan Results</p><h2>{preview.label}</h2></div>
            <button type="button" className="secondary" onClick={() => setPreview(null)}>Close</button>
          </div>
          <div className="integrityPreviewList">
            {preview.items.map((item) => (
              <button type="button" key={item.id} onClick={() => setSelected?.(item)}>
                <Poster anime={item} className="integrityMiniPoster" />
                <span><strong>{item.title}</strong><small>{itemSummary(item) || 'Open to inspect'}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!groups.length ? (
        <div className="cleanupEmpty"><h2>No duplicate groups found ✓</h2><p>The title identity scan did not find anything safe to merge.</p></div>
      ) : (
        <div className="cleanupGroups">
          <div className="integritySectionHeading"><p className="eyebrow">Duplicates</p><h2>Review before merging</h2></div>
          {groups.map((group, groupIndex) => {
            const suggested = suggestKeeper(group);
            const keeperId = keeperByGroup[groupIndex] || suggested.id;
            const keeper = group.find((item) => String(item.id) === String(keeperId)) || suggested;

            return (
              <article className="cleanupGroup" key={group.map((item) => item.id).join('-')}>
                <div className="cleanupGroupHeader">
                  <div><p className="eyebrow">Possible Duplicate</p><h2>{group.map((item) => item.title).join(' / ')}</h2></div>
                  <button type="button" onClick={() => mergeGroup(group, groupIndex)} disabled={busy}>Merge into {keeper.title}</button>
                </div>
                <div className="cleanupChoices">
                  {group.map((item) => (
                    <label key={item.id} className={String(keeperId) === String(item.id) ? 'selected' : ''}>
                      <input type="radio" name={`keeper-${groupIndex}`} checked={String(keeperId) === String(item.id)} onChange={() => setKeeperByGroup((current) => ({ ...current, [groupIndex]: item.id }))} />
                      <Poster anime={item} className="cleanupPoster" />
                      <span><strong>{item.title}</strong><small>{itemSummary(item) || 'No personal data yet'}</small><em>{String(keeperId) === String(item.id) ? 'Keeper' : 'Merged and removed'}</em></span>
                    </label>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
