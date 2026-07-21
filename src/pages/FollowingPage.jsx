import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Search, CalendarClock, Radio, Radar, RefreshCw, Sparkles, Flag, CalendarDays, Tv } from 'lucide-react';
import { Poster } from '../components/Poster';
import { fetchKitsuFollowingSnapshot } from '../services/kitsuProvider';
import '../styles/following.css';

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function knownReleaseText(item = {}) {
  if (item.airedFrom) return item.airedFrom;
  if (item.year) return String(item.year);
  if (item.status) return item.status;
  return 'Release information not available yet';
}

const FOLLOWING_AUTO_CHECK_MS = 6 * 60 * 60 * 1000;
const FOLLOWING_NOTIFICATIONS_ENABLED_KEY = 'joeanime-following-notifications-enabled';
const MAX_FOLLOWING_EVENTS_PER_TITLE = 20;

function normalizedStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();

  if (['tba', 'unreleased', 'upcoming', 'not yet released'].includes(status)) return 'upcoming';
  if (['current', 'airing', 'currently airing'].includes(status)) return 'current';
  if (['finished', 'complete', 'completed', 'finished airing'].includes(status)) return 'finished';

  return status || 'unknown';
}

function eventFor(type, item, details = {}) {
  const titles = {
    started_airing: 'Started Airing',
    finished_airing: 'Finished Airing',
    release_date_changed: 'Release Date Changed',
    episode_count_changed: 'Episode Count Updated',
    status_changed: 'Status Changed'
  };

  return {
    id: `following-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: titles[type] || 'Following Update',
    animeTitle: titleOf(item),
    createdAt: new Date().toISOString(),
    read: false,
    ...details
  };
}

function detectFollowingEvents(item = {}, snapshot = {}) {
  const previous = item.followingSnapshot || {};
  const hasBaseline = Boolean(item.followingLastCheckedAt || previous.checkedAt);
  if (!hasBaseline) return [];

  const oldStatus = normalizedStatus(previous.status || item.lastKnownStatus || item.status);
  const nextStatus = normalizedStatus(snapshot.status);
  const oldDate = previous.startDate || item.lastKnownStartDate || item.airedFrom || item.startDate || '';
  const nextDate = snapshot.startDate || snapshot.airedFrom || '';
  const oldEpisodes = Number(previous.episodeCount || item.lastKnownEpisodeCount || item.episodeCount || item.episodes || 0);
  const nextEpisodes = Number(snapshot.episodeCount || snapshot.episodes || 0);

  const events = [];

  if (oldStatus === 'upcoming' && nextStatus === 'current') {
    events.push(eventFor('started_airing', item, {
      message: `${titleOf(item)} has started airing.`,
      previousStatus: oldStatus,
      nextStatus
    }));
  } else if (oldStatus === 'current' && nextStatus === 'finished') {
    events.push(eventFor('finished_airing', item, {
      message: `${titleOf(item)} has finished airing.`,
      previousStatus: oldStatus,
      nextStatus
    }));
  } else if (oldStatus !== 'unknown' && nextStatus !== 'unknown' && oldStatus !== nextStatus) {
    events.push(eventFor('status_changed', item, {
      message: `${titleOf(item)} changed from ${oldStatus} to ${nextStatus}.`,
      previousStatus: oldStatus,
      nextStatus
    }));
  }

  if (oldDate && nextDate && oldDate !== nextDate) {
    events.push(eventFor('release_date_changed', item, {
      message: `${titleOf(item)} moved from ${oldDate} to ${nextDate}.`,
      previousDate: oldDate,
      nextDate
    }));
  }

  if (oldEpisodes > 0 && nextEpisodes > 0 && oldEpisodes !== nextEpisodes) {
    events.push(eventFor('episode_count_changed', item, {
      message: `${titleOf(item)} changed from ${oldEpisodes} to ${nextEpisodes} episodes.`,
      previousEpisodeCount: oldEpisodes,
      nextEpisodeCount: nextEpisodes
    }));
  }

  return events;
}

function eventIcon(type) {
  if (type === 'started_airing') return <Sparkles />;
  if (type === 'finished_airing') return <Flag />;
  if (type === 'release_date_changed') return <CalendarDays />;
  if (type === 'episode_count_changed') return <Tv />;
  return <Bell />;
}


function notificationIsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

async function ensureNotificationPermission({ request = false } = {}) {
  if (!notificationIsSupported()) return 'unsupported';

  if (window.Notification.permission === 'granted') return 'granted';
  if (window.Notification.permission === 'denied') return 'denied';
  if (!request) return 'default';

  try {
    return await window.Notification.requestPermission();
  } catch (error) {
    console.warn('Notification permission request failed.', error);
    return 'default';
  }
}

function desktopNotificationText(event = {}) {
  if (event.type === 'started_airing') {
    return `${event.animeTitle} has started airing.`;
  }

  if (event.type === 'finished_airing') {
    return `${event.animeTitle} has finished airing.`;
  }

  if (event.type === 'release_date_changed') {
    return event.nextDate
      ? `New release date: ${event.nextDate}`
      : event.message;
  }

  if (event.type === 'episode_count_changed') {
    return event.nextEpisodeCount
      ? `Episode count updated to ${event.nextEpisodeCount}.`
      : event.message;
  }

  return event.message || `${event.animeTitle} has a new release update.`;
}

function sendDesktopNotification(event = {}, item = {}) {
  if (!notificationIsSupported() || window.Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new window.Notification(
      `${event.title}: ${event.animeTitle}`,
      {
        body: desktopNotificationText(event),
        icon: item.cover || undefined,
        tag: event.id,
        silent: false
      }
    );

    notification.onclick = () => {
      window.focus?.();
      notification.close();
    };

    return true;
  } catch (error) {
    console.warn('Desktop notification failed.', error);
    return false;
  }
}

export function FollowingPage({ catalog = [], setSelected, updateCatalogAnime }) {
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(() =>
    notificationIsSupported() ? window.Notification.permission : 'unsupported'
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    localStorage.getItem(FOLLOWING_NOTIFICATIONS_ENABLED_KEY) !== 'false'
  );
  const autoCheckStarted = useRef(false);
  const startupSummaryShown = useRef(false);

  const followed = useMemo(() => {
    const clean = query.trim().toLowerCase();

    return (catalog || [])
      .filter((item) => Boolean(item.followed))
      .filter((item) => {
        if (!clean) return true;
        return [
          titleOf(item),
          item.studio,
          ...(item.genres || [])
        ].filter(Boolean).join(' ').toLowerCase().includes(clean);
      })
      .sort((a, b) =>
        String(b.followedAt || '').localeCompare(String(a.followedAt || '')) ||
        titleOf(a).localeCompare(titleOf(b))
      );
  }, [catalog, query]);

  const followingEvents = useMemo(() => (
    followed
      .flatMap((item) =>
        (item.followingEvents || []).map((event) => ({
          ...event,
          catalogId: item.id,
          anime: item
        }))
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  ), [followed]);

  const unreadEvents = followingEvents.filter((event) => !event.read);

  async function checkFollowingNow({ automatic = false } = {}) {
    if (checking || !updateCatalogAnime || !followed.length) return;

    const permission = await ensureNotificationPermission({
      request: !automatic && notificationsEnabled
    });
    setNotificationPermission(permission);

    setChecking(true);
    setCheckMessage(
      automatic
        ? 'JoeAI is quietly checking followed anime...'
        : `Checking ${followed.length} followed title${followed.length === 1 ? '' : 's'}...`
    );

    let changedTitles = 0;
    let newEvents = 0;
    let failed = 0;

    for (let index = 0; index < followed.length; index += 1) {
      const item = followed[index];

      if (!automatic) {
        setCheckMessage(`Checking ${index + 1}/${followed.length}: ${titleOf(item)}`);
      }

      try {
        const snapshot = await fetchKitsuFollowingSnapshot(item);
        const detectedEvents = detectFollowingEvents(item, snapshot);
        const checkedAt = snapshot.checkedAt || new Date().toISOString();

        const events = detectedEvents.map((event) => {
          const notified = notificationsEnabled
            ? sendDesktopNotification(event, item)
            : false;

          return notified
            ? {
                ...event,
                notifiedAt: new Date().toISOString()
              }
            : event;
        });

        const previousEvents = item.followingEvents || [];

        await updateCatalogAnime({
          ...item,
          kitsuId: snapshot.kitsuId || item.kitsuId,
          status: snapshot.status || item.status,
          startDate: snapshot.startDate || item.startDate || '',
          airedFrom: snapshot.airedFrom || snapshot.startDate || item.airedFrom || '',
          airedTo: snapshot.airedTo || item.airedTo || '',
          episodeCount: snapshot.episodeCount || item.episodeCount || item.episodes || 0,
          episodes: snapshot.episodes || snapshot.episodeCount || item.episodes || item.episodeCount || 0,
          cover: snapshot.cover || item.cover || '',
          synopsis: snapshot.synopsis || item.synopsis || '',
          lastKnownStatus: snapshot.status || item.lastKnownStatus || item.status || '',
          lastKnownStartDate: snapshot.startDate || snapshot.airedFrom || item.lastKnownStartDate || '',
          lastKnownEpisodeCount: snapshot.episodeCount || snapshot.episodes || item.lastKnownEpisodeCount || 0,
          followingSnapshot: snapshot,
          followingLastCheckedAt: checkedAt,
          followingCheckError: '',
          followingEvents: [...events, ...previousEvents].slice(0, MAX_FOLLOWING_EVENTS_PER_TITLE),
          listUpdatedAt: checkedAt
        });

        if (events.length) {
          changedTitles += 1;
          newEvents += events.length;
        }
      } catch (error) {
        failed += 1;

        await updateCatalogAnime({
          ...item,
          followingLastCheckedAt: new Date().toISOString(),
          followingCheckError: error?.message || String(error),
          listUpdatedAt: new Date().toISOString()
        });

        console.warn('Following check failed:', titleOf(item), error);
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    if (newEvents) {
      setCheckMessage(
        `Watch check complete — ${newEvents} new update${newEvents === 1 ? '' : 's'} across ${changedTitles} title${changedTitles === 1 ? '' : 's'}.`
      );
    } else if (failed) {
      setCheckMessage(
        `Watch check complete — no new changes. ${failed} title${failed === 1 ? '' : 's'} could not be checked.`
      );
    } else {
      setCheckMessage('Watch check complete — no new release changes.');
    }

    setChecking(false);
  }

  useEffect(() => {
    if (autoCheckStarted.current || !followed.length) return;

    const mostRecentCheck = Math.max(
      0,
      ...followed.map((item) => new Date(item.followingLastCheckedAt || 0).getTime() || 0)
    );

    if (Date.now() - mostRecentCheck < FOLLOWING_AUTO_CHECK_MS) return;

    autoCheckStarted.current = true;
    void checkFollowingNow({ automatic: true });
  }, [followed.length]);


  useEffect(() => {
    if (
      startupSummaryShown.current ||
      !notificationsEnabled ||
      notificationPermission !== 'granted' ||
      !unreadEvents.length
    ) {
      return;
    }

    startupSummaryShown.current = true;

    try {
      const notification = new window.Notification(
        unreadEvents.length === 1
          ? '1 Following update'
          : `${unreadEvents.length} Following updates`,
        {
          body:
            unreadEvents.length === 1
              ? `${unreadEvents[0].animeTitle}: ${unreadEvents[0].title}`
              : `${unreadEvents.slice(0, 3).map((event) => event.animeTitle).join(', ')}${unreadEvents.length > 3 ? ' and more' : ''}`,
          tag: 'joeanime-following-summary',
          silent: true
        }
      );

      notification.onclick = () => {
        window.focus?.();
        notification.close();
      };
    } catch (error) {
      console.warn('Following startup summary notification failed.', error);
    }
  }, [notificationsEnabled, notificationPermission, unreadEvents.length]);

  async function markEventRead(event) {
    const item = event.anime;
    if (!item) return;

    await updateCatalogAnime?.({
      ...item,
      followingEvents: (item.followingEvents || []).map((entry) =>
        entry.id === event.id ? { ...entry, read: true } : entry
      ),
      listUpdatedAt: new Date().toISOString()
    });
  }

  async function toggleNotifications() {
    if (notificationsEnabled) {
      localStorage.setItem(FOLLOWING_NOTIFICATIONS_ENABLED_KEY, 'false');
      setNotificationsEnabled(false);
      setCheckMessage('JoeAnimeDB Following notifications are turned off.');
      return;
    }

    const permission = await ensureNotificationPermission({ request: true });
    setNotificationPermission(permission);

    if (permission === 'granted') {
      localStorage.setItem(FOLLOWING_NOTIFICATIONS_ENABLED_KEY, 'true');
      setNotificationsEnabled(true);
      setCheckMessage('JoeAnimeDB Following notifications are turned on.');
    } else if (permission === 'denied') {
      setNotificationsEnabled(false);
      localStorage.setItem(FOLLOWING_NOTIFICATIONS_ENABLED_KEY, 'false');
      setCheckMessage('Windows notifications are blocked. Enable them in system or app notification settings.');
    } else if (permission === 'unsupported') {
      setNotificationsEnabled(false);
      localStorage.setItem(FOLLOWING_NOTIFICATIONS_ENABLED_KEY, 'false');
      setCheckMessage('Desktop notifications are not supported in this build.');
    }
  }


  async function markAllRead() {
    const itemsWithUnread = followed.filter((item) =>
      (item.followingEvents || []).some((event) => !event.read)
    );

    for (const item of itemsWithUnread) {
      await updateCatalogAnime?.({
        ...item,
        followingEvents: (item.followingEvents || []).map((event) => ({
          ...event,
          read: true
        })),
        listUpdatedAt: new Date().toISOString()
      });
    }

    setCheckMessage('All Following updates marked as read.');
  }

  async function unfollow(item) {
    await updateCatalogAnime?.({
      ...item,
      followed: false,
      followedAt: '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <section className="followingPage">
      <header className="followingHero">
        <div className="followingHeroContent">
          <p>JoeAI Watch Network</p>
          <h1><Bell /> Release Watch</h1>
          <span>
            JoeAI is watching the horizon for new episodes, trailers, announcements, and release updates.
          </span>

          <div className="followingHeroStats" aria-label="Release watch status">
            <div>
              <Radio />
              <strong>{followed.length}</strong>
              <small>Being Watched</small>
            </div>
            <div>
              <Radar />
              <strong>{checking ? 'Checking' : 'Online'}</strong>
              <small>Watch Network</small>
            </div>
            <div>
              <Bell />
              <strong>{unreadEvents.length}</strong>
              <small>New Updates</small>
            </div>
          </div>

          <div className="followingHeroActions">
            <button
              type="button"
              className="followingCheckButton"
              onClick={() => checkFollowingNow()}
              disabled={checking || !followed.length}
            >
              <RefreshCw className={checking ? 'spinning' : ''} />
              {checking ? 'Checking Releases...' : 'Check Followed Anime'}
            </button>

            <button
              type="button"
              className={`followingNotifyButton ${notificationsEnabled && notificationPermission === 'granted' ? 'is-on' : 'is-off'}`}
              onClick={toggleNotifications}
              aria-pressed={notificationsEnabled && notificationPermission === 'granted'}
            >
              <Bell />
              {notificationsEnabled && notificationPermission === 'granted'
                ? 'Windows Notifications On'
                : 'Windows Notifications Off'}
            </button>
          </div>
          {checkMessage ? <p className="followingCheckMessage">{checkMessage}</p> : null}
        </div>
      </header>

      <label className="followingSearch">
        <Search />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search followed titles..."
        />
      </label>

      {followingEvents.length ? (
        <section className="followingUpdates">
          <div className="followingUpdatesHeader">
            <div>
              <p>Watch Network Events</p>
              <h2>Following Updates</h2>
            </div>
            <div className="followingUpdatesHeaderActions">
              <span>{unreadEvents.length} unread</span>
              {unreadEvents.length ? (
                <button type="button" onClick={markAllRead}>
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>

          <div className="followingUpdatesList">
            {followingEvents.slice(0, 12).map((event) => (
              <button
                type="button"
                key={event.id}
                className={event.read ? 'read' : ''}
                onClick={() => {
                  markEventRead(event);
                  setSelected?.(event.anime);
                }}
              >
                {eventIcon(event.type)}
                <span>
                  <strong>{event.title}: {event.animeTitle}</strong>
                  <small>{event.message}</small>
                </span>
                <time>{new Date(event.createdAt).toLocaleString()}</time>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {followed.length ? (
        <div className="followingGrid">
          {followed.map((item) => (
            <article key={item.id || item.malId || item.title} className="followingCard">
              <button type="button" onClick={() => setSelected?.(item)}>
                <Poster anime={item} className="followingPoster" />
              </button>

              <div>
                <p className="followingStatus"><CalendarClock /> {knownReleaseText(item)}</p>
                <h2>{titleOf(item)}</h2>
                <span>{item.studio || 'Studio not available'}</span>
                <small>{(item.genres || []).slice(0, 3).join(' • ')}</small>
                <small className={item.followingCheckError ? 'followingCheckError' : 'followingLastChecked'}>
                  {item.followingCheckError
                    ? `Check failed: ${item.followingCheckError}`
                    : item.followingLastCheckedAt
                      ? `Last checked ${new Date(item.followingLastCheckedAt).toLocaleString()}`
                      : 'Waiting for first release check'}
                </small>

                <div className="followingActions">
                  <button type="button" onClick={() => setSelected?.(item)}>View Details</button>
                  <button type="button" className="danger" onClick={() => unfollow(item)}>Unfollow</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="followingEmpty">
          <Bell />
          <h2>No followed anime yet</h2>
          <p>Open Discover and click 🔔 Follow on any upcoming or interesting title.</p>
        </section>
      )}
    </section>
  );
}
