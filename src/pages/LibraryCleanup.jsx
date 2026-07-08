import React, { useMemo, useState } from 'react';
import { Poster } from '../components/Poster';
import {
  findDuplicateGroups,
  mergeDuplicateGroup,
  suggestKeeper
} from '../services/duplicateTools';

function itemSummary(item) {
  return [
    item.status,
    item.joeScore ? `Joe ${item.joeScore}` : null,
    item.finalRank ? `#${item.finalRank}` : null,
    item.malId ? `MAL ID ${item.malId}` : null
  ].filter(Boolean).join(' • ');
}

export function LibraryCleanup({ anime = [], updateData, setSelected }) {
  const groups = useMemo(() => findDuplicateGroups(anime), [anime]);
  const [keeperByGroup, setKeeperByGroup] = useState({});
  const [mergedCount, setMergedCount] = useState(0);

  async function mergeGroup(group, groupIndex) {
    if (!updateData) return;

    const suggested = suggestKeeper(group);
    const keeperId = keeperByGroup[groupIndex] || suggested.id;
    const { merged, removeIds } = mergeDuplicateGroup(group, keeperId);

    const nextAnime = anime
      .filter((item) => !removeIds.includes(item.id))
      .map((item) => String(item.id) === String(merged.id) ? merged : item);

    const saved = await updateData((current) => ({
      ...current,
      anime: nextAnime
    }));

    const refreshed = (saved.anime || nextAnime).find((item) => String(item.id) === String(merged.id)) || merged;
    setMergedCount((count) => count + 1);
    setSelected?.(refreshed);
  }

  return (
    <section className="panel cleanupPage">
      <div className="cleanupHero">
        <p className="eyebrow">Library Maintenance</p>
        <h1>🧹 Library Cleanup</h1>
        <p>Find duplicate entries, pick the keeper, preserve your personal data, and merge metadata safely.</p>
      </div>

      <div className="cleanupStats">
        <div>
          <strong>{anime.length}</strong>
          <span>Total titles</span>
        </div>
        <div>
          <strong>{groups.length}</strong>
          <span>Duplicate groups</span>
        </div>
        <div>
          <strong>{mergedCount}</strong>
          <span>Merged this session</span>
        </div>
      </div>

      {!groups.length ? (
        <div className="cleanupEmpty">
          <h2>Looks clean 🍜</h2>
          <p>No likely duplicate groups found.</p>
        </div>
      ) : (
        <div className="cleanupGroups">
          {groups.map((group, groupIndex) => {
            const suggested = suggestKeeper(group);
            const keeperId = keeperByGroup[groupIndex] || suggested.id;
            const keeper = group.find((item) => String(item.id) === String(keeperId)) || suggested;

            return (
              <article className="cleanupGroup" key={group.map((item) => item.id).join('-')}>
                <div className="cleanupGroupHeader">
                  <div>
                    <p className="eyebrow">Possible Duplicate</p>
                    <h2>{group.map((item) => item.title).join(' / ')}</h2>
                  </div>
                  <button type="button" onClick={() => mergeGroup(group, groupIndex)}>
                    Merge into {keeper.title}
                  </button>
                </div>

                <div className="cleanupChoices">
                  {group.map((item) => (
                    <label key={item.id} className={String(keeperId) === String(item.id) ? 'selected' : ''}>
                      <input
                        type="radio"
                        name={`keeper-${groupIndex}`}
                        checked={String(keeperId) === String(item.id)}
                        onChange={() => setKeeperByGroup((current) => ({ ...current, [groupIndex]: item.id }))}
                      />

                      <Poster anime={item} className="cleanupPoster" />

                      <span>
                        <strong>{item.title}</strong>
                        <small>{itemSummary(item) || 'No personal data yet'}</small>
                        <em>{String(keeperId) === String(item.id) ? 'Keeper' : 'Will be merged/removed'}</em>
                      </span>
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
