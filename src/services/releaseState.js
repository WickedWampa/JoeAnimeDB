const CURRENT_STATUSES = new Set(['current', 'airing', 'currently airing']);
const UPCOMING_STATUSES = new Set(['tba', 'unreleased', 'upcoming', 'not yet released']);
const FINISHED_STATUSES = new Set(['finished', 'complete', 'completed', 'finished airing']);

function parsedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedStatus(item = {}) {
  return String(item.status || item.releaseStatus || '').trim().toLowerCase();
}

function hasDelayedRelease(item = {}, now = new Date()) {
  const status = normalizedStatus(item);
  if (item.releaseDelayed || /delay|postpon/.test(status)) return true;

  const latestMove = (item.followingEvents || []).find(
    (event) => event?.type === 'release_date_changed'
  );
  const previousDate = parsedDate(latestMove?.previousDate);
  const nextDate = parsedDate(latestMove?.nextDate);

  return Boolean(
    previousDate &&
    nextDate &&
    nextDate > previousDate &&
    nextDate > now
  );
}

export function formatReleaseDate(value = '') {
  const date = parsedDate(value);
  if (!date) return 'Date TBA';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function classifyAnimeRelease(item = {}, nowValue = new Date()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const status = normalizedStatus(item);
  const startDate = parsedDate(item.startDate || item.airedFrom);
  const endDate = parsedDate(item.endDate || item.airedTo);
  const delayed = hasDelayedRelease(item, now);

  if (delayed) {
    return {
      key: 'delayed',
      label: 'Delayed',
      dateText: formatReleaseDate(startDate),
      startDate
    };
  }

  if (
    (CURRENT_STATUSES.has(status) && (!startDate || startDate <= now)) ||
    (
      item.discoverBucket === 'current' &&
      (!startDate || startDate <= now) &&
      (!endDate || endDate >= now)
    )
  ) {
    return {
      key: 'airing',
      label: 'Airing Now',
      dateText: startDate ? `Started ${formatReleaseDate(startDate)}` : 'Airing now',
      startDate
    };
  }

  if (startDate && startDate > now) {
    return {
      key: 'upcoming',
      label: 'Upcoming',
      dateText: formatReleaseDate(startDate),
      startDate
    };
  }

  if (
    UPCOMING_STATUSES.has(status) ||
    item.discoverBucket === 'upcoming'
  ) {
    return {
      key: 'tba',
      label: 'Date TBA',
      dateText: 'Date TBA',
      startDate: null
    };
  }

  if (FINISHED_STATUSES.has(status) || (endDate && endDate < now)) {
    return {
      key: 'finished',
      label: 'Finished',
      dateText: endDate ? `Ended ${formatReleaseDate(endDate)}` : 'Finished',
      startDate
    };
  }

  return {
    key: 'tba',
    label: 'Date TBA',
    dateText: startDate ? formatReleaseDate(startDate) : 'Date TBA',
    startDate
  };
}
