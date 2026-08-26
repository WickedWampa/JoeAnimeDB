import {
  getCachedWhereToWatch,
  getWatchmodeProviderCacheSnapshot
} from './watchmodeService';
import {
  getCachedKitsuStreamingLinks,
  getKitsuStreamingCacheSnapshot
} from './kitsuStreamingService';

export function getCachedStreamingAvailability(item, {
  region,
  allowStale = true,
  watchmodeCacheSnapshot,
  kitsuCacheSnapshot
} = {}) {
  const watchmode = getCachedWhereToWatch(item, {
    region,
    allowStale,
    cacheSnapshot: watchmodeCacheSnapshot || getWatchmodeProviderCacheSnapshot()
  });
  if (watchmode?.status === 'ready' && watchmode.providers?.length) {
    return {
      ...watchmode,
      source: 'watchmode',
      regional: true
    };
  }

  return getCachedKitsuStreamingLinks(item, {
    allowStale,
    cacheSnapshot: kitsuCacheSnapshot || getKitsuStreamingCacheSnapshot()
  });
}
