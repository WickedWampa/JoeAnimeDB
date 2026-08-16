// JoeAI result-card runtime polish.
// Browser-only enhancement layer: enriches missing result metadata, hides
// already-owned recommendation cards, and opens the existing DetailModal when
// a recommendation poster or title is clicked.

const RUNTIME_KEY = '__joeanimeJoeAIResultsRuntimeV1';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function titleFromCard(card) {
  return String(card?.querySelector('.joeaiRecBody h3')?.textContent || card?.querySelector('h3')?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function posterUrl(item = {}) {
  return item.cover || item.poster || item.posterUrl || item.imageUrl || item.image || '';
}

function episodeCount(item = {}) {
  const value = Number(item.episodeCount || item.episodes || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function studioName(item = {}) {
  const studio = item.studio || item.studios?.[0];
  return typeof studio === 'string' ? studio : studio?.name || '';
}

function cardLooksOwned(card) {
  if (!card) return false;
  if (card.querySelector('.joeaiOwnershipBadge.owned')) return true;
  const text = String(card.textContent || '').toLowerCase();
  return text.includes('already in library') || text.includes('update library entry');
}

function hideOwnedCards(root = document) {
  root.querySelectorAll?.('.joeaiRecCard').forEach((card) => {
    if (!cardLooksOwned(card)) return;
    card.dataset.joeaiOwnedFiltered = 'true';
    card.style.display = 'none';
  });

  root.querySelectorAll?.('.joeaiBulkSection').forEach((section) => {
    const heading = String(section.querySelector('h3')?.textContent || '').toLowerCase();
    const visibleCards = [...section.querySelectorAll('.joeaiRecCard')]
      .filter((card) => card.style.display !== 'none');
    if (heading.includes('already in your library') || !visibleCards.length) {
      section.style.display = 'none';
    }
  });
}

function addMetaSpan(meta, key, text) {
  if (!meta || !text || meta.querySelector(`[data-joeai-meta="${key}"]`)) return;
  const span = document.createElement('span');
  span.dataset.joeaiMeta = key;
  span.textContent = text;
  meta.appendChild(span);
}

function applyMetadataToCard(card, item = {}, getContentRating) {
  if (!card || !item) return;
  card.__joeaiMetadata = item;

  const poster = card.querySelector('.joeaiRecPoster');
  const image = posterUrl(item);
  if (poster && image && !poster.querySelector('img')) {
    poster.textContent = '';
    poster.classList.add('hasImage');
    const img = document.createElement('img');
    img.src = image;
    img.alt = `${item.officialTitle || item.title || titleFromCard(card)} poster`;
    img.loading = 'lazy';
    poster.appendChild(img);
  }

  const meta = card.querySelector('.joeaiRecMeta');
  if (meta) {
    meta.querySelectorAll('.contentRatingBadge.rating-unknown').forEach((node) => node.remove());
    [...meta.querySelectorAll('span')]
      .filter((node) => /metadata\s+(pending|loading)/i.test(node.textContent || ''))
      .forEach((node) => node.remove());

    if (item.year && ![...meta.children].some((node) => String(node.textContent).trim() === String(item.year))) {
      addMetaSpan(meta, 'year', String(item.year));
    }
    const episodes = episodeCount(item);
    if (episodes && ![...meta.children].some((node) => /\beps\b/i.test(node.textContent || ''))) {
      addMetaSpan(meta, 'episodes', `${episodes} eps`);
    }
    const studio = studioName(item);
    if (studio && ![...meta.children].some((node) => String(node.textContent || '').includes(studio))) {
      addMetaSpan(meta, 'studio', studio);
    }
    const score = item.communityScore || item.malScore;
    if (score && ![...meta.children].some((node) => /\b(?:MAL|Kitsu|Community)\b/i.test(node.textContent || ''))) {
      addMetaSpan(meta, 'score', `${item.metadataSource === 'kitsu' ? 'Kitsu' : 'Community'} ${score}`);
    }

    try {
      const rating = getContentRating?.(item);
      if (rating?.rating && rating.rating !== 'unknown' && !meta.querySelector('.contentRatingBadge')) {
        const badge = document.createElement('span');
        badge.className = `contentRatingBadge rating-${rating.rating}`;
        badge.title = rating.guide || 'Content rating';
        badge.textContent = rating.label;
        meta.appendChild(badge);
      }
    } catch {}
  }

  const title = card.querySelector('.joeaiRecBody h3') || card.querySelector('h3');
  if (title) {
    title.style.cursor = 'pointer';
    title.title = `Open ${titleFromCard(card)} details`;
  }
  const posterTarget = card.querySelector('.joeaiPosterWrap') || card.querySelector('.joeaiRecPoster');
  if (posterTarget) {
    posterTarget.style.cursor = 'pointer';
    posterTarget.title = `Open ${titleFromCard(card)} details`;
  }
}

function installRuntime() {
  if (!isBrowser() || window[RUNTIME_KEY]) return;
  window[RUNTIME_KEY] = true;

  const metadataCache = new Map();
  let servicesPromise = null;
  let modalRoot = null;
  let modalHost = null;

  function services() {
    if (!servicesPromise) {
      servicesPromise = Promise.all([
        import('../services/metadata'),
        import('../services/contentSafety'),
        import('../components/DetailModal'),
        import('react'),
        import('react-dom/client')
      ]).then(([metadata, contentSafety, detail, ReactModule, ReactDom]) => ({
        fetchMetadata: metadata.fetchMetadata,
        getContentRating: contentSafety.getContentRating,
        DetailModal: detail.DetailModal,
        React: ReactModule.default || ReactModule,
        createRoot: ReactDom.createRoot
      }));
    }
    return servicesPromise;
  }

  function fetchTitleMetadata(title) {
    const key = String(title || '').toLocaleLowerCase().trim();
    if (!key) return Promise.resolve(null);
    if (!metadataCache.has(key)) {
      metadataCache.set(key, services()
        .then(({ fetchMetadata }) => fetchMetadata({ title }))
        .catch((error) => {
          console.warn('[JoeAI Results] metadata lookup failed:', title, error);
          return null;
        }));
    }
    return metadataCache.get(key);
  }

  async function enrichCard(card) {
    if (!card || card.dataset.joeaiMetadataChecked === 'true' || cardLooksOwned(card)) return;
    card.dataset.joeaiMetadataChecked = 'true';
    const title = titleFromCard(card);
    if (!title) return;

    const hasImage = Boolean(card.querySelector('.joeaiRecPoster img'));
    const metaText = String(card.querySelector('.joeaiRecMeta')?.textContent || '');
    const usefulMetaCount = [
      /\b(?:19|20)\d{2}\b/.test(metaText),
      /\b\d+\s+eps\b/i.test(metaText),
      Boolean(metaText.replace(/content rating unknown|metadata pending/ig, '').trim())
    ].filter(Boolean).length;

    if (hasImage && usefulMetaCount >= 2 && !/content rating unknown|metadata pending/i.test(metaText)) {
      card.__joeaiMetadata = card.__joeaiMetadata || { title };
      const { getContentRating } = await services();
      applyMetadataToCard(card, card.__joeaiMetadata, getContentRating);
      return;
    }

    const item = await fetchTitleMetadata(title);
    if (!item || !card.isConnected) return;
    const { getContentRating } = await services();
    applyMetadataToCard(card, item, getContentRating);
  }

  function process(root = document) {
    hideOwnedCards(root);
    const cards = [...(root.querySelectorAll?.('.joeaiRecCard') || [])]
      .filter((card) => card.style.display !== 'none')
      .slice(-12);
    cards.forEach((card, index) => {
      window.setTimeout(() => void enrichCard(card), index * 120);
    });
  }

  async function openDetails(card) {
    const title = titleFromCard(card);
    if (!title) return;
    const existing = card.__joeaiMetadata || { title };
    const fetched = await fetchTitleMetadata(title);
    const item = {
      ...existing,
      ...(fetched || {}),
      id: fetched?.id || existing.id || `catalog-joeai-${slug(title)}`,
      title: fetched?.title || existing.title || title,
      officialTitle: fetched?.officialTitle || existing.officialTitle || title,
      catalogSource: fetched?.catalogSource || existing.catalogSource || 'joeai',
      status: ''
    };

    const { DetailModal, React, createRoot } = await services();
    if (!modalHost) {
      modalHost = document.createElement('div');
      modalHost.id = 'joeai-result-detail-modal-root';
      document.body.appendChild(modalHost);
      modalRoot = createRoot(modalHost);
    }

    const close = () => modalRoot?.render(React.createElement(React.Fragment, null));
    modalRoot.render(React.createElement(DetailModal, {
      anime: item,
      library: [],
      onClose: close,
      updateAnime: null,
      updateCatalogAnime: null,
      deleteAnime: null,
      navigationIndex: -1,
      navigationCount: 0
    }));
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const card = target.closest('.joeaiRecCard');
    if (!card || card.style.display === 'none') return;

    const clickedPoster = target.closest('.joeaiRecPoster, .joeaiPosterWrap');
    const clickedTitle = target.closest('.joeaiRecBody h3');
    if (!clickedPoster && !clickedTitle) return;
    if (target.closest('button, a, input, select, textarea') && !clickedTitle) return;

    event.preventDefault();
    event.stopPropagation();
    void openDetails(card);
  }, true);

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => mutation.addedNodes?.length);
    if (relevant) process(document);
  });

  const start = () => {
    process(document);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

installRuntime();

export {};
