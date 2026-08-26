const TV_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  ' '
]);

const CONTENT_FOCUS_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const TV_CARD_SELECTOR = '[data-tv-card="true"]';
const TV_SKIP_FOCUS_SELECTOR = '[data-tv-skip-focus="true"]';
const TV_LAYOUT_STORAGE_KEY = 'joeanime-tv-layout-v1';
const TV_CARD_CHILD_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[tabindex]'
].join(',');

let cleanupFocusManager = null;
let suppressedCardControls = new Map();
let suppressedTvSkipControls = new Map();
let promotedJoeAIMessages = new Map();
let lastContentFocus = null;
let touchDeviceSeen = false;
let pendingInitialHomeFocus = false;

function isVisibleFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.matches(':disabled, [aria-disabled="true"]')) return false;

  const naturallyFocusable = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
  if (!naturallyFocusable && element.tabIndex < 0) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isTextEntry(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function suppressNestedCardControls() {
  document.querySelectorAll(TV_CARD_SELECTOR).forEach((card) => {
    card.querySelectorAll(TV_CARD_CHILD_SELECTOR).forEach((control) => {
      if (!(control instanceof HTMLElement) || control === card || suppressedCardControls.has(control)) return;
      suppressedCardControls.set(control, control.getAttribute('tabindex'));
      control.setAttribute('tabindex', '-1');
    });
  });
}

function restoreNestedCardControls() {
  suppressedCardControls.forEach((previous, control) => {
    if (!control?.isConnected) return;
    if (previous === null) control.removeAttribute('tabindex');
    else control.setAttribute('tabindex', previous);
  });
  suppressedCardControls = new Map();
}

function suppressTvSkipFocusControls() {
  document.querySelectorAll(TV_SKIP_FOCUS_SELECTOR).forEach((control) => {
    if (!(control instanceof HTMLElement) || suppressedTvSkipControls.has(control)) return;
    suppressedTvSkipControls.set(control, control.getAttribute('tabindex'));
    control.setAttribute('tabindex', '-1');
  });
}

function restoreTvSkipFocusControls() {
  suppressedTvSkipControls.forEach((previous, control) => {
    if (!control?.isConnected) return;
    if (previous === null) control.removeAttribute('tabindex');
    else control.setAttribute('tabindex', previous);
  });
  suppressedTvSkipControls = new Map();
}

function promoteJoeAIMessageStops() {
  document.querySelectorAll('.joeAIConversation > .chat').forEach((message) => {
    if (!(message instanceof HTMLElement) || promotedJoeAIMessages.has(message)) return;
    promotedJoeAIMessages.set(message, message.getAttribute('tabindex'));
    message.setAttribute('tabindex', '0');
    message.setAttribute('data-tv-joeai-message', 'true');
  });
}

function restoreJoeAIMessageStops() {
  promotedJoeAIMessages.forEach((previous, message) => {
    if (!message?.isConnected) return;
    if (previous === null) message.removeAttribute('tabindex');
    else message.setAttribute('tabindex', previous);
    message.removeAttribute('data-tv-joeai-message');
  });
  promotedJoeAIMessages = new Map();
}

function joeAIMessageStops() {
  return Array.from(document.querySelectorAll('.joeAIConversation > .chat'))
    .filter(isVisibleFocusable);
}

function scrollJoeAIConversation(active, direction, isRepeat = false) {
  if (!(active instanceof HTMLElement)) return false;

  const joeAIPage = active.closest('.joeAICommandCenter');
  const chatShell = active.closest('.joeAIChatShell');
  if (!joeAIPage || !chatShell) return false;

  // When the user intentionally enters a text/select field, leave arrow keys
  // alone so editing and the TV keyboard keep their native behavior.
  if (isTextEntry(active)) return false;

  const composer = joeAIPage.querySelector('.joeAIComposer');
  const textarea = composer?.querySelector('textarea:not([disabled])');
  const pageHeight = Math.max(
    document.documentElement?.scrollHeight || 0,
    document.body?.scrollHeight || 0
  );
  const atBottom = (window.scrollY + window.innerHeight) >= (pageHeight - 18);

  // Once the answer has genuinely reached the bottom, Down should hand control
  // to the composer instead of repeatedly trying to scroll past the page end.
  if (
    direction === 'ArrowDown'
    && atBottom
    && textarea instanceof HTMLElement
  ) {
    textarea.focus({ preventScroll: true });
    textarea.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });
    return true;
  }

  // A single tap gets a comfortable smooth page step. Holding the D-pad uses
  // direct repeated movement so multiple smooth animations do not restart one
  // another and make the page crawl.
  const amount = isRepeat
    ? Math.max(185, Math.round(window.innerHeight * 0.24))
    : Math.max(240, Math.round(window.innerHeight * 0.42));

  window.scrollBy({
    top: direction === 'ArrowDown' ? amount : -amount,
    left: 0,
    behavior: isRepeat ? 'auto' : 'smooth'
  });

  window.setTimeout(updateCenteredJoeAIRecommendationCard, isRepeat ? 0 : 90);
  return true;
}

let joeAIActiveRecommendationCard = null;
let joeAIScrollFrame = 0;
const HOME_FOCUS_SHELVES = [
  '.homeV3Hero',
  '.homeDecisionContinue',
  '.homeDecisionReturning',
  '.homeDecisionMissed',
  '.homeDecisionServices',
  '.homeDecisionQuickPick'
];

function firstFocusableInHomeShelf(selector) {
  const shelf = document.querySelector(selector);
  if (!(shelf instanceof HTMLElement)) return null;
  return Array.from(shelf.querySelectorAll(CONTENT_FOCUS_SELECTOR)).find(isVisibleFocusable) || null;
}

function restoreHomeFocusAfterShelfRemoval(previousFocus) {
  if (
    !(previousFocus instanceof HTMLElement)
    || previousFocus.isConnected
    || !document.body?.classList.contains('tvLayoutMode')
    || !document.body?.classList.contains('tvInputMode')
  ) return false;

  const oldIndex = HOME_FOCUS_SHELVES.findIndex((selector) => previousFocus.closest(selector));
  if (oldIndex < 0) return false;

  for (let distance = 0; distance < HOME_FOCUS_SHELVES.length; distance += 1) {
    for (const index of [oldIndex + distance, oldIndex - distance]) {
      if (index < 0 || index >= HOME_FOCUS_SHELVES.length) continue;
      const target = firstFocusableInHomeShelf(HOME_FOCUS_SHELVES[index]);
      if (!(target instanceof HTMLElement)) continue;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      lastContentFocus = target;
      return true;
    }
  }

  return false;
}

function joeAIRecommendationCards() {
  return Array.from(document.querySelectorAll(
    '.joeAICommandCenter .joeAIConversation .joeaiRecCard'
  )).filter((card) => {
    if (!(card instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  });
}

function clearJoeAIActiveRecommendationCard() {
  document.querySelectorAll('.tvJoeAIActiveCard').forEach((card) => {
    card.classList.remove('tvJoeAIActiveCard');
    card.removeAttribute('data-tv-active-recommendation');
  });
  joeAIActiveRecommendationCard = null;
}

function updateCenteredJoeAIRecommendationCard() {
  if (!document.body?.classList.contains('tvLayoutMode')) {
    clearJoeAIActiveRecommendationCard();
    return null;
  }

  const page = document.querySelector('.joeAICommandCenter');
  if (!page) {
    clearJoeAIActiveRecommendationCard();
    return null;
  }

  const cards = joeAIRecommendationCards();
  if (!cards.length) {
    clearJoeAIActiveRecommendationCard();
    return null;
  }

  const viewportCenterY = window.innerHeight * 0.52;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const card of cards) {
    const rect = card.getBoundingClientRect();

    // Only activate a card that is actually on-screen.
    if (rect.bottom < 72 || rect.top > window.innerHeight - 30) continue;

    const centerY = rect.top + (rect.height / 2);
    const distance = Math.abs(centerY - viewportCenterY);

    if (distance < bestDistance) {
      best = card;
      bestDistance = distance;
    }
  }

  if (!best) {
    clearJoeAIActiveRecommendationCard();
    return null;
  }

  if (joeAIActiveRecommendationCard !== best) {
    clearJoeAIActiveRecommendationCard();
    joeAIActiveRecommendationCard = best;
    best.classList.add('tvJoeAIActiveCard');
    best.setAttribute('data-tv-active-recommendation', 'true');
  }

  return best;
}

function scheduleJoeAIActiveCardUpdate() {
  if (joeAIScrollFrame) return;
  joeAIScrollFrame = window.requestAnimationFrame(() => {
    joeAIScrollFrame = 0;
    updateCenteredJoeAIRecommendationCard();
  });
}

function joeAIRecommendationActionButtons(card) {
  if (!(card instanceof HTMLElement)) return [];

  return Array.from(card.querySelectorAll(
    'button:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"])'
  )).filter((control) => {
    if (!(control instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(control);
    const rect = control.getBoundingClientRect();

    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  });
}

function moveJoeAIRecommendationAction(direction) {
  const card = (
    joeAIActiveRecommendationCard?.isConnected
      ? joeAIActiveRecommendationCard
      : updateCenteredJoeAIRecommendationCard()
  );

  if (!card) return false;

  const controls = joeAIRecommendationActionButtons(card);
  if (!controls.length) return true;

  const active = document.activeElement;
  const currentIndex = controls.indexOf(active);
  const delta = direction === 'ArrowRight' ? 1 : -1;

  let nextIndex;
  if (currentIndex < 0) {
    nextIndex = direction === 'ArrowRight' ? 0 : controls.length - 1;
  } else {
    nextIndex = Math.min(
      controls.length - 1,
      Math.max(0, currentIndex + delta)
    );
  }

  const next = controls[nextIndex];
  if (!(next instanceof HTMLElement)) return true;

  next.focus({ preventScroll: true });

  // Keep the recommendation card itself centered while its buttons are used.
  card.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function openActiveJoeAIRecommendation() {
  const card = (
    joeAIActiveRecommendationCard?.isConnected
      ? joeAIActiveRecommendationCard
      : updateCenteredJoeAIRecommendationCard()
  );

  if (!card) return false;

  const opener = card.querySelector(
    '.joeaiDetailTrigger, .joeaiLegacyPosterOpen, .joeaiTitleOpen'
  );

  if (!(opener instanceof HTMLElement)) return false;
  opener.click();
  return true;
}

function moveThroughJoeAIConversation(active, direction) {
  if (!(active instanceof HTMLElement)) return false;

  const chatShell = active.closest('.joeAIChatShell');
  if (!chatShell) return false;

  const messages = joeAIMessageStops();
  const activeMessage = active.closest('[data-tv-joeai-message="true"]');
  const starterButton = active.closest('.joeAIStarterChips button');
  const composer = chatShell.querySelector('.joeAIComposer');
  const textarea = composer?.querySelector('textarea:not([disabled])');

  if (direction === 'ArrowDown') {
    if (starterButton && messages.length) {
      messages[0].focus({ preventScroll: true });
      messages[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      return true;
    }

    if (activeMessage) {
      const index = messages.indexOf(activeMessage);
      const next = messages[index + 1];
      if (next) {
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return true;
      }

      if (textarea instanceof HTMLElement) {
        textarea.focus({ preventScroll: true });
        textarea.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return true;
      }
    }
  }

  if (direction === 'ArrowUp') {
    if (active.closest('.joeAIComposer') && messages.length) {
      const last = messages[messages.length - 1];
      last.focus({ preventScroll: true });
      last.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      return true;
    }

    if (activeMessage) {
      const index = messages.indexOf(activeMessage);
      const previous = messages[index - 1];
      if (previous) {
        previous.focus({ preventScroll: true });
        previous.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return true;
      }

      const chips = Array.from(chatShell.querySelectorAll('.joeAIStarterChips button'))
        .filter(isVisibleFocusable);
      const lastChip = chips[chips.length - 1];
      if (lastChip) {
        lastChip.focus({ preventScroll: true });
        lastChip.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return true;
      }
    }
  }

  return false;
}

function isTvCard(element) {
  return element instanceof HTMLElement && element.matches(TV_CARD_SELECTOR);
}

function findCardCandidate(active, direction) {
  const contentRoot = document.querySelector('.content');
  if (!contentRoot || !contentRoot.contains(active)) return null;

  const activeShelf = active.closest('.discoverShelf');
  const from = active.getBoundingClientRect();
  const fromCenterX = from.left + from.width / 2;
  const fromCenterY = from.top + from.height / 2;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of contentRoot.querySelectorAll(TV_CARD_SELECTOR)) {
    if (candidate === active || !isVisibleFocusable(candidate)) continue;

    const candidateShelf = candidate.closest('.discoverShelf');
    if ((direction === 'ArrowLeft' || direction === 'ArrowRight') && candidateShelf !== activeShelf) continue;
    if ((direction === 'ArrowUp' || direction === 'ArrowDown') && activeShelf && candidateShelf === activeShelf) continue;

    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = centerX - fromCenterX;
    const dy = centerY - fromCenterY;

    let primary;
    let cross;
    if (direction === 'ArrowRight') {
      if (dx <= 8) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else if (direction === 'ArrowLeft') {
      if (dx >= -8) continue;
      primary = -dx;
      cross = Math.abs(dy);
    } else if (direction === 'ArrowDown') {
      if (dy <= 8) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else {
      if (dy >= -8) continue;
      primary = -dy;
      cross = Math.abs(dx);
    }

    // Strongly prefer staying in the same shelf for Left/Right and the same
    // visual column for Up/Down. This turns a dense card full of controls into
    // a single TV navigation stop.
    const score = primary + (cross * 3.5);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function moveBetweenTvCards(active, direction) {
  const candidate = findCardCandidate(active, direction);
  if (!candidate) return false;

  candidate.focus({ preventScroll: true });

  // Home's focusin handler already performs one nearest-edge snap. Starting a
  // second centered smooth scroll here makes Android WebView queue competing
  // animations and causes remote input to feel delayed on TV emulators.
  if (active.closest('.homeDecisionHome') && candidate.closest('.homeDecisionHome')) {
    return true;
  }

  candidate.scrollIntoView({
    block: direction === 'ArrowUp' || direction === 'ArrowDown' ? 'center' : 'nearest',
    inline: 'nearest',
    behavior: 'smooth'
  });
  return true;
}


function settingsRoot() {
  return document.querySelector('.settingsPage');
}

function settingsFocusableControls() {
  const root = settingsRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll(CONTENT_FOCUS_SELECTOR)).filter(isVisibleFocusable);
}

function focusSettingsControlFromViewport(direction) {
  const controls = settingsFocusableControls();
  if (!controls.length) return false;

  const viewportAnchor = window.innerHeight * (direction === 'ArrowDown' ? 0.58 : 0.42);
  const candidates = controls
    .map((control) => {
      const rect = control.getBoundingClientRect();
      return {
        control,
        centerY: rect.top + rect.height / 2,
      };
    })
    .filter(({ centerY }) => direction === 'ArrowDown'
      ? centerY >= viewportAnchor - 12
      : centerY <= viewportAnchor + 12)
    .sort((a, b) => direction === 'ArrowDown'
      ? a.centerY - b.centerY
      : b.centerY - a.centerY);

  const target = candidates[0]?.control;
  if (!target) return false;

  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  return true;
}

function findSequentialSettingsCandidate(active, direction) {
  const controls = settingsFocusableControls();
  if (!controls.length) return null;

  let index = controls.indexOf(active);
  if (index < 0 && lastContentFocus) index = controls.indexOf(lastContentFocus);

  if (index >= 0) {
    const nextIndex = direction === 'ArrowDown' ? index + 1 : index - 1;
    return controls[nextIndex] || null;
  }

  return null;
}

function scrollSettingsPage(direction) {
  const amount = Math.max(260, Math.round(window.innerHeight * 0.62));
  window.scrollBy({
    top: direction === 'ArrowDown' ? amount : -amount,
    left: 0,
    behavior: 'smooth'
  });
}


function findSettingsDirectionalCandidate(active, direction) {
  if (!(active instanceof HTMLElement)) return null;

  const root = settingsRoot();
  if (!(root instanceof HTMLElement) || !root.contains(active)) return null;

  const controls = settingsFocusableControls();
  const from = active.getBoundingClientRect();
  const fromX = from.left + (from.width / 2);
  const fromY = from.top + (from.height / 2);

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of controls) {
    if (candidate === active) continue;

    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dx = centerX - fromX;
    const dy = centerY - fromY;

    let primary;
    let cross;

    if (direction === 'ArrowDown') {
      if (dy <= 10) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else if (direction === 'ArrowUp') {
      if (dy >= -10) continue;
      primary = -dy;
      cross = Math.abs(dx);
    } else if (direction === 'ArrowRight') {
      if (dx <= 10) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else if (direction === 'ArrowLeft') {
      if (dx >= -10) continue;
      primary = -dx;
      cross = Math.abs(dy);
    } else {
      continue;
    }

    // Settings is mostly rows/grids of controls. Strong cross-axis weighting
    // keeps the remote in the same visual row/column instead of wandering.
    const score = primary + (cross * 3.2);

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function focusSettingsTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });
  return true;
}

function moveInsideSettings(active, direction) {
  const root = settingsRoot();
  if (!(root instanceof HTMLElement) || !(active instanceof HTMLElement)) {
    return false;
  }

  // RIGHT from Settings in the sidebar intentionally enters the first real
  // Settings control instead of letting WebView choose an arbitrary target.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (active.textContent || '').trim().toLowerCase().includes('settings')
  ) {
    return focusSettingsTarget(settingsFocusableControls()[0] || null);
  }

  if (!root.contains(active) || isTextEntry(active)) {
    return false;
  }

  const candidate = findSettingsDirectionalCandidate(active, direction);
  if (candidate) {
    return focusSettingsTarget(candidate);
  }

  // Up/Down must never leak into the sidebar. If the next enabled control is
  // beyond the viewport, continue in document order or scroll the page first.
  if (direction === 'ArrowUp' || direction === 'ArrowDown') {
    const sequential = findSequentialSettingsCandidate(active, direction);
    if (sequential) {
      return focusSettingsTarget(sequential);
    }

    scrollSettingsPage(direction);
    window.setTimeout(() => focusSettingsControlFromViewport(direction), 170);
    return true;
  }

  // At the far right edge, stay in Settings rather than wrapping to Sidebar.
  if (direction === 'ArrowRight') {
    return true;
  }

  // ArrowLeft with no Settings candidate is intentionally left unhandled so
  // Sidebar.jsx can be used as the explicit escape back to the command rail.
  return false;
}


function aboutHelpRoot() {
  return document.querySelector('.aboutHelpPage');
}

function aboutHelpHeroTarget() {
  const hero = document.querySelector('.aboutHelpPage .aboutHelpHero');
  if (!(hero instanceof HTMLElement)) return null;

  if (!hero.hasAttribute('tabindex')) {
    hero.setAttribute('tabindex', '-1');
  }

  return hero;
}

function aboutHelpFocusableControls() {
  const root = aboutHelpRoot();
  if (!(root instanceof HTMLElement)) return [];

  return Array.from(
    root.querySelectorAll(
      'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"])'
    )
  ).filter(isVisibleFocusable);
}

function firstAboutHelpControl() {
  return aboutHelpFocusableControls()[0] || null;
}

function focusAboutHelpTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });

  const section = target.closest(
    '.aboutHelpHero, .aboutPanel, .aboutUpdatePanel, .aboutReleaseNotes, .aboutSupportPanel'
  );

  (section || target).scrollIntoView({
    block: section?.classList.contains('aboutHelpHero') ? 'start' : 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function findAboutHelpDirectionalCandidate(active, direction) {
  if (!(active instanceof HTMLElement)) return null;

  const root = aboutHelpRoot();
  if (!(root instanceof HTMLElement) || !root.contains(active)) return null;

  const controls = aboutHelpFocusableControls();
  const from = active.getBoundingClientRect();
  const fromX = from.left + (from.width / 2);
  const fromY = from.top + (from.height / 2);

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of controls) {
    if (candidate === active) continue;

    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dx = centerX - fromX;
    const dy = centerY - fromY;

    let primary;
    let cross;

    if (direction === 'ArrowDown') {
      if (dy <= 10) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else if (direction === 'ArrowUp') {
      if (dy >= -10) continue;
      primary = -dy;
      cross = Math.abs(dx);
    } else if (direction === 'ArrowRight') {
      if (dx <= 10) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else if (direction === 'ArrowLeft') {
      if (dx >= -10) continue;
      primary = -dx;
      cross = Math.abs(dy);
    } else {
      continue;
    }

    // About/Help is mostly paired cards and vertical button groups. Favor the
    // same visual row/column so remote movement follows the layout.
    const score = primary + (cross * 3.0);

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function moveInsideAboutHelp(active, direction) {
  const root = aboutHelpRoot();
  if (!(root instanceof HTMLElement) || !(active instanceof HTMLElement)) {
    return false;
  }

  // RIGHT from the About/Help sidebar entry first shows the hero.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (
      (active.textContent || '').trim().toLowerCase().includes('about')
      || (active.textContent || '').trim().toLowerCase().includes('help')
    )
  ) {
    return focusAboutHelpTarget(aboutHelpHeroTarget());
  }

  const hero = aboutHelpHeroTarget();

  // The informational hero is a TV navigation bridge.
  if (active === hero) {
    if (direction === 'ArrowDown' || direction === 'ArrowRight') {
      return focusAboutHelpTarget(firstAboutHelpControl());
    }

    if (direction === 'ArrowUp') {
      return focusAboutHelpTarget(hero);
    }

    // Left from hero is the explicit escape back to Sidebar.
    return false;
  }

  if (!root.contains(active) || isTextEntry(active)) {
    return false;
  }

  const candidate = findAboutHelpDirectionalCandidate(active, direction);
  if (candidate) {
    return focusAboutHelpTarget(candidate);
  }

  // Up from the highest actionable control returns to the hero.
  if (direction === 'ArrowUp') {
    return focusAboutHelpTarget(hero);
  }

  // Down/Right never leak into Sidebar at page edges.
  if (direction === 'ArrowDown' || direction === 'ArrowRight') {
    return focusAboutHelpTarget(active);
  }

  // Left with no About/Help candidate intentionally falls through so the
  // command rail remains reachable.
  return false;
}

function focusFirstContentControl() {
  const contentRoot = document.querySelector('.content');
  if (!contentRoot) return false;

  const firstFocusable = Array.from(contentRoot.querySelectorAll(CONTENT_FOCUS_SELECTOR))
    .find(isVisibleFocusable);

  if (!firstFocusable) return false;
  firstFocusable.focus({ preventScroll: true });
  firstFocusable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

function hasUsefulFocus() {
  const active = document.activeElement;
  return active instanceof HTMLElement
    && active !== document.body
    && active !== document.documentElement
    && isVisibleFocusable(active);
}

function horizontalGap(a, b) {
  if (b.right < a.left) return a.left - b.right;
  if (b.left > a.right) return b.left - a.right;
  return 0;
}

function findVerticalCandidate(active, direction) {
  const contentRoot = document.querySelector('.content');
  if (!contentRoot || !contentRoot.contains(active)) return null;

  const from = active.getBoundingClientRect();
  const fromCenterX = from.left + from.width / 2;
  const fromCenterY = from.top + from.height / 2;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of contentRoot.querySelectorAll(CONTENT_FOCUS_SELECTOR)) {
    if (candidate === active || !isVisibleFocusable(candidate)) continue;

    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaY = centerY - fromCenterY;

    if (direction === 'ArrowDown' && deltaY <= 8) continue;
    if (direction === 'ArrowUp' && deltaY >= -8) continue;

    const primaryGap = direction === 'ArrowDown'
      ? Math.max(0, rect.top - from.bottom)
      : Math.max(0, from.top - rect.bottom);
    const laneGap = horizontalGap(from, rect);
    const centerDrift = Math.abs(centerX - fromCenterX);

    // Prefer targets in the same visual column/rail, then the closest target
    // vertically. This is only a fallback when WebView leaves focus unmoved.
    const score = (primaryGap * 5) + (laneGap * 3) + centerDrift;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scheduleVerticalFallback(active, direction) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!active?.isConnected || document.activeElement !== active) return;

      let candidate = findVerticalCandidate(active, direction);
      const inSettings = Boolean(active.closest?.('.settingsPage'));

      // Settings contains several informational blocks where every visible
      // action may legitimately be disabled. If geometry cannot find a clean
      // target, continue through the next enabled control in document order.
      if (!candidate && inSettings) {
        candidate = findSequentialSettingsCandidate(active, direction);
      }

      if (candidate) {
        candidate.focus({ preventScroll: true });
        candidate.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'smooth'
        });
        return;
      }

      // Never strand the remote on a long Settings page just because the next
      // section is informational or has no enabled buttons. Scroll the page,
      // then pick up the next real control when one becomes available.
      if (inSettings) {
        scrollSettingsPage(direction);
        window.setTimeout(() => focusSettingsControlFromViewport(direction), 170);
      }
    });
  });
}

function isAndroidLandscape() {
  return /Android/i.test(navigator.userAgent || '')
    && window.innerWidth >= 720
    && window.innerWidth > window.innerHeight * 1.25;
}

function hasRememberedTvLayout() {
  try {
    return localStorage.getItem(TV_LAYOUT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberTvLayout() {
  try {
    localStorage.setItem(TV_LAYOUT_STORAGE_KEY, 'true');
  } catch {}
}

function forgetTvLayout() {
  try {
    localStorage.removeItem(TV_LAYOUT_STORAGE_KEY);
  } catch {}
}

function hasLivingRoomViewport() {
  const width = Math.max(window.innerWidth || 0, window.screen?.width || 0);
  const height = Math.max(window.innerHeight || 0, window.screen?.height || 0);
  const ratio = height > 0 ? width / height : 0;
  return width >= 960 && height >= 520 && ratio >= 1.68 && ratio <= 1.92;
}

function isLikelyAndroidTv() {
  if (!isAndroidLandscape()) return false;
  if (touchDeviceSeen) return false;

  const userAgent = navigator.userAgent || '';
  const explicitTvAgent = /Android TV|GoogleTV|Google TV|BRAVIA|SHIELD|AFT[A-Z0-9]*|ADT-|sdk_google_atv|sdk_google_tv|SmartTV|MiTV/i
    .test(userAgent);

  // Real Android TV devices and the TV emulator normally expose no touch
  // points. Phones/tablets do, so this keeps their landscape UI untouched.
  const noTouchInput = Number(navigator.maxTouchPoints || 0) === 0;

  return explicitTvAgent || noTouchInput || hasRememberedTvLayout() || hasLivingRoomViewport();
}

function updateTvLayoutMode() {
  const body = document.body;
  if (!body) return;

  // A real/likely Android TV should receive the TV stylesheet immediately,
  // before the first remote key. D-pad use remains a fallback signal for
  // unusual TV devices whose user agent/touch reporting is inaccurate.
  const shouldUseTvLayout = isLikelyAndroidTv()
    || (
      body.classList.contains('tvInputMode')
      && isAndroidLandscape()
    );

  body.classList.toggle('tvLayoutMode', shouldUseTvLayout);
}

export function primeTvLayoutMode() {
  updateTvLayoutMode();
}


function homeHeroActionTargets() {
  return Array.from(
    document.querySelectorAll('.homeV3HeroActions button:not([disabled])')
  ).filter(isVisibleFocusable);
}

function focusHomeHeroAction(target) {
  if (!(target instanceof HTMLElement)) return false;

  // Critical: do not scroll the document when focus enters the Home hero.
  // Android WebView otherwise tries to center the button and makes the hero
  // look like it jumped / got chopped in half.
  target.focus({ preventScroll: true });
  return true;
}

const TV_PAGE_HERO_SELECTOR = [
  '.homeV3Hero',
  '.libraryArchiveHeroLive',
  '.favoritesHero',
  '.discoverHero',
  '.followingHero',
  '.joeAIHero',
  '.analyticsLabHero',
  '.upcomingHero',
  '.settingsPageHeader',
  '.aboutHelpHero',
  '.cleanupHero'
].join(', ');

function revealFocusedPageHero(active, direction) {
  if (direction !== 'ArrowUp' || !(active instanceof HTMLElement)) return false;
  const hero = active.closest(TV_PAGE_HERO_SELECTOR);
  if (!(hero instanceof HTMLElement)) return false;

  active.focus({ preventScroll: true });
  hero.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
  return true;
}

function moveInsideHomeHero(active, direction) {
  if (!(active instanceof HTMLElement)) return false;

  const actions = homeHeroActionTargets();
  const first = actions[0] || null;
  const second = actions[1] || null;

  // Explicit entry from the Home sidebar item.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (active.textContent || '').trim().toLowerCase().includes('home')
  ) {
    return focusHomeHeroAction(first);
  }

  const index = actions.indexOf(active);
  if (index < 0) return false;

  if (direction === 'ArrowRight' && second && active === first) {
    return focusHomeHeroAction(second);
  }

  if (direction === 'ArrowLeft' && first && active === second) {
    return focusHomeHeroAction(first);
  }

  // Up from either hero action is a deliberate "show me the hero" command.
  // Keep focus stable, then reveal the hero from its top instead of allowing
  // Android WebView to center the button and leave the heading off-screen.
  if (direction === 'ArrowUp') {
    focusHomeHeroAction(active);
    const hero = active.closest('.homeV3Hero');
    if (hero instanceof HTMLElement) {
      hero.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    }
    return true;
  }

  return false;
}

function moveFromHomeHeroToContinueWatching(active, direction) {
  if (
    direction !== 'ArrowDown'
    || !(active instanceof HTMLElement)
    || !active.closest('.homeV3HeroActions')
  ) {
    return false;
  }

  const firstWatchingCard = [
    '.homeV3TvContinue [data-tv-card="true"]',
    '.homeDecisionReturning [data-tv-card="true"]',
    '.homeDecisionMissed [data-tv-card="true"]',
    '.homeDecisionServices [data-tv-card="true"]',
    '.homeDecisionQuickPick [data-tv-card="true"]'
  ]
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .find(isVisibleFocusable);

  if (!(firstWatchingCard instanceof HTMLElement)) return false;

  firstWatchingCard.focus({ preventScroll: true });

  return true;
}

function moveInsideHomeDecisionCard(active, direction) {
  if (!(active instanceof HTMLElement)) return false;

  const card = active.closest('.homeDecisionCard');
  if (!(card instanceof HTMLElement)) return false;

  const actions = Array.from(
    card.querySelectorAll('[data-tv-home-action="true"]:not([disabled])')
  ).filter(isVisibleFocusable);
  if (!actions.length) return false;

  if (active === card) {
    if (direction !== 'ArrowDown') return false;
    actions[0].focus({ preventScroll: true });
    return true;
  }

  const index = actions.indexOf(active);
  if (index < 0) return false;

  if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
    const offset = direction === 'ArrowRight' ? 1 : -1;
    const next = actions[index + offset];
    if (next instanceof HTMLElement) next.focus({ preventScroll: true });
    return true;
  }

  if (direction === 'ArrowUp') {
    const activeRect = active.getBoundingClientRect();
    const activeX = activeRect.left + (activeRect.width / 2);
    const previousRow = actions
      .filter((candidate) => candidate !== active)
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return {
          candidate,
          dy: activeRect.top - rect.top,
          dx: Math.abs((rect.left + (rect.width / 2)) - activeX)
        };
      })
      .filter(({ dy }) => dy > 4)
      .sort((a, b) => (a.dy + (a.dx * 2)) - (b.dy + (b.dx * 2)))[0]?.candidate;
    (previousRow || card).focus({ preventScroll: true });
    return true;
  }

  if (direction === 'ArrowDown') {
    const activeRect = active.getBoundingClientRect();
    const activeX = activeRect.left + (activeRect.width / 2);
    const nextRow = actions
      .filter((candidate) => candidate !== active)
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return {
          candidate,
          dy: rect.top - activeRect.top,
          dx: Math.abs((rect.left + (rect.width / 2)) - activeX)
        };
      })
      .filter(({ dy }) => dy > 4)
      .sort((a, b) => (a.dy + (a.dx * 2)) - (b.dy + (b.dx * 2)))[0]?.candidate;
    if (nextRow instanceof HTMLElement) {
      nextRow.focus({ preventScroll: true });
      return true;
    }

    moveBetweenTvCards(card, direction);
    return true;
  }

  return false;
}


function firstLibraryOrFavoritesContentTarget() {
  const selectors = [
    '.libraryPosterGrid [data-tv-card="true"]',
    '.libraryListPanel [data-tv-card="true"]',
    '.favoritesGrid [data-tv-card="true"]'
  ];

  for (const selector of selectors) {
    const target = Array.from(document.querySelectorAll(selector)).find(isVisibleFocusable);
    if (target instanceof HTMLElement) return target;
  }

  return null;
}

function focusLibraryOrFavoritesContent() {
  const target = firstLibraryOrFavoritesContentTarget();
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });
  return true;
}

function moveIntoLibraryOrFavoritesContent(active, direction) {
  if (!(active instanceof HTMLElement)) return false;

  const targetExists = Boolean(firstLibraryOrFavoritesContentTarget());
  if (!targetExists) return false;

  // RIGHT from the active Library/Favorites sidebar item should enter titles,
  // never jump to Poster/List/Search.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
  ) {
    const label = (active.textContent || '').trim().toLowerCase();
    if (label.includes('library') || label.includes('favorites')) {
      return focusLibraryOrFavoritesContent();
    }
  }

  // DOWN from any top Library/Favorites control should enter the title grid/list
  // instead of geometry sending focus back to the sidebar.
  if (
    direction === 'ArrowDown'
    && (
      active.closest('.topbar')
      || active.closest('.libraryToolbar')
      || active.closest('.libraryControls')
    )
  ) {
    return focusLibraryOrFavoritesContent();
  }

  return false;
}


function firstDiscoverCardInShelf(shelf) {
  if (!(shelf instanceof HTMLElement)) return null;

  return Array.from(
    shelf.querySelectorAll('.discoverRail [data-tv-card="true"]')
  ).find(isVisibleFocusable) || null;
}

function focusDiscoverCard(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });

  const shelf = target.closest('.discoverShelf');
  if (shelf instanceof HTMLElement) {
    shelf.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });
  } else {
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });
  }

  return true;
}

function firstVisibleDiscoverShelfCard() {
  const shelves = Array.from(document.querySelectorAll('.discoverShelf'));

  for (const shelf of shelves) {
    if (!(shelf instanceof HTMLElement)) continue;
    const rect = shelf.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const card = firstDiscoverCardInShelf(shelf);
    if (card) return card;
  }

  return null;
}

function focusDiscoverShelfViewAll(shelf) {
  if (!(shelf instanceof HTMLElement)) return false;

  const viewAll = Array.from(
    shelf.querySelectorAll('.discoverShelfActions button')
  ).find((button) => {
    if (!(button instanceof HTMLElement) || !isVisibleFocusable(button)) return false;
    return (button.textContent || '').trim().toLowerCase().includes('view all');
  });

  const fallback = Array.from(
    shelf.querySelectorAll('.discoverShelfActions button')
  ).find(isVisibleFocusable);

  const target = viewAll || fallback;
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });
  shelf.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function discoverActionBarButtons(bar) {
  if (!(bar instanceof HTMLElement)) return [];

  const buttons = [];

  for (const child of Array.from(bar.children)) {
    if (!(child instanceof HTMLElement)) continue;

    if (child.matches('button') && isVisibleFocusable(child)) {
      buttons.push(child);
      continue;
    }

    if (child.classList.contains('discoverSurpriseControl')) {
      const surpriseButton = Array.from(child.children)
        .find((candidate) => candidate instanceof HTMLElement
          && candidate.matches('button')
          && isVisibleFocusable(candidate));

      if (surpriseButton instanceof HTMLElement) {
        buttons.push(surpriseButton);
      }
    }
  }

  return buttons;
}

function nearestActionButtonInDirection(active, direction) {
  if (!(active instanceof HTMLElement)) return null;

  const bar = active.closest('.discoverTvActionBar');
  if (!(bar instanceof HTMLElement)) return null;

  const buttons = discoverActionBarButtons(bar);
  if (!buttons.length) return null;

  const from = active.getBoundingClientRect();
  const fromCenterX = from.left + (from.width / 2);
  const fromCenterY = from.top + (from.height / 2);

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const button of buttons) {
    if (button === active) continue;

    const rect = button.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dy = centerY - fromCenterY;

    if (direction === 'ArrowDown' && dy <= 12) continue;
    if (direction === 'ArrowUp' && dy >= -12) continue;

    const vertical = Math.abs(dy);
    const horizontal = Math.abs(centerX - fromCenterX);
    const score = vertical + (horizontal * 2.2);

    if (score < bestScore) {
      best = button;
      bestScore = score;
    }
  }

  return best;
}

function focusDiscoverActionButton(button) {
  if (!(button instanceof HTMLElement)) return false;

  button.focus({ preventScroll: true });

  const bar = button.closest('.discoverTvActionBar');
  if (bar instanceof HTMLElement) {
    bar.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });
  }

  return true;
}

function moveIntoDiscoverShelfCards(active, direction) {
  if (
    !(active instanceof HTMLElement)
    || !document.querySelector('.discoverPage')
  ) {
    return false;
  }

  const actionBar = active.closest('.discoverTvActionBar');

  // TV action bar is two rows. First-row Down goes to the matching control
  // in row two. Second-row Up goes back to row one. Only Down from the bottom
  // row enters the first recommendation shelf.
  if (actionBar && (direction === 'ArrowDown' || direction === 'ArrowUp')) {
    const nextAction = nearestActionButtonInDirection(active, direction);

    if (nextAction) {
      return focusDiscoverActionButton(nextAction);
    }

    if (direction === 'ArrowDown') {
      return focusDiscoverCard(firstVisibleDiscoverShelfCard());
    }

    const hero = document.querySelector('.discoverPage .discoverHero');
    if (hero instanceof HTMLElement) {
      hero.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    }
    return true;
  }

  // Shelf controls belong to their own shelf. DOWN from View All / arrows
  // goes directly into that shelf instead of letting geometry pick Sidebar.
  const shelfActions = active.closest('.discoverShelfActions');
  if (direction === 'ArrowDown' && shelfActions) {
    const shelf = shelfActions.closest('.discoverShelf');
    return focusDiscoverCard(firstDiscoverCardInShelf(shelf));
  }

  // Shelves are one horizontal row on TV. UP from any poster should return
  // to View All so users can intentionally reach the shelf header controls.
  const shelfCard = active.closest('.discoverShelf .discoverRail [data-tv-card="true"]');
  if (direction === 'ArrowUp' && shelfCard) {
    const shelf = shelfCard.closest('.discoverShelf');
    return focusDiscoverShelfViewAll(shelf);
  }

  return false;
}


function discoverCatalogPrimaryControl() {
  const control = document.querySelector(
    '.discoverCatalogModal .discoverCatalogCollectionSelect'
  );
  return isVisibleFocusable(control) ? control : null;
}

function discoverCatalogCards() {
  return Array.from(
    document.querySelectorAll('.discoverCatalogGrid [data-tv-card="true"]')
  ).filter(isVisibleFocusable);
}

function firstDiscoverCatalogCard() {
  return discoverCatalogCards()[0] || null;
}

function isFirstDiscoverCatalogRow(card) {
  if (!(card instanceof HTMLElement)) return false;

  const cards = discoverCatalogCards();
  if (!cards.length) return false;

  const minTop = Math.min(
    ...cards.map((item) => item.getBoundingClientRect().top)
  );

  return card.getBoundingClientRect().top <= minTop + 12;
}

function moveInsideDiscoverCatalog(active, direction) {
  if (!(active instanceof HTMLElement)) return false;

  const modal = active.closest('.discoverCatalogModal')
    || document.querySelector('.discoverCatalogModal');

  if (!(modal instanceof HTMLElement)) return false;

  // Toolbar DOWN always enters the results instead of opening Search,
  // jumping to Close, or leaking out of the modal.
  if (
    direction === 'ArrowDown'
    && active.closest('.discoverCatalogToolbar')
  ) {
    return focusDiscoverCard(firstDiscoverCatalogCard());
  }

  // From the first row, UP returns to the collection dropdown so the modal
  // has a predictable top-to-results navigation loop.
  if (
    direction === 'ArrowUp'
    && active.matches('[data-tv-card="true"]')
    && active.closest('.discoverCatalogGrid')
    && isFirstDiscoverCatalogRow(active)
  ) {
    const primary = discoverCatalogPrimaryControl();
    if (!(primary instanceof HTMLElement)) return false;

    primary.focus({ preventScroll: true });
    primary.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth'
    });
    return true;
  }

  return false;
}


function nearestDiscoverShelfCardAbove(active) {
  if (!(active instanceof HTMLElement)) return null;

  const activeRect = active.getBoundingClientRect();
  const activeCenterX = activeRect.left + (activeRect.width / 2);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const cards = Array.from(
    document.querySelectorAll('.discoverShelf .discoverRail [data-tv-card="true"]')
  ).filter(isVisibleFocusable);

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);

    // Only consider shelf cards physically above the collection controls.
    if (rect.bottom > activeRect.top + 16) continue;

    const vertical = activeRect.top - rect.bottom;
    const horizontal = Math.abs(centerX - activeCenterX);
    const score = vertical + (horizontal * 1.8);

    if (score < bestScore) {
      best = card;
      bestScore = score;
    }
  }

  return best;
}

function moveUpFromDiscoverCollections(active, direction) {
  if (
    direction !== 'ArrowUp'
    || !(active instanceof HTMLElement)
    || !active.closest('.discoverCollections')
  ) {
    return false;
  }

  const card = nearestDiscoverShelfCardAbove(active);
  return focusDiscoverCard(card);
}


function nearestDiscoverShelfFromDailyPick(active, direction) {
  if (!(active instanceof HTMLElement)) return null;

  const dailyPick = active.closest('.dailyPickHero');
  if (!(dailyPick instanceof HTMLElement)) return null;

  const pickRect = dailyPick.getBoundingClientRect();
  let bestShelf = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const shelf of document.querySelectorAll('.discoverShelf')) {
    if (!(shelf instanceof HTMLElement)) continue;

    const rect = shelf.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    let distance;

    if (direction === 'ArrowUp') {
      if (rect.bottom > pickRect.top + 16) continue;
      distance = pickRect.top - rect.bottom;
    } else if (direction === 'ArrowDown') {
      if (rect.top < pickRect.bottom - 16) continue;
      distance = rect.top - pickRect.bottom;
    } else {
      continue;
    }

    if (distance < bestDistance) {
      bestShelf = shelf;
      bestDistance = distance;
    }
  }

  return bestShelf;
}

function moveFromDailyPickToShelf(active, direction) {
  if (
    !(active instanceof HTMLElement)
    || !active.closest('.dailyPickActions')
    || (direction !== 'ArrowUp' && direction !== 'ArrowDown')
  ) {
    return false;
  }

  const shelf = nearestDiscoverShelfFromDailyPick(active, direction);
  if (!(shelf instanceof HTMLElement)) return false;

  return focusDiscoverCard(firstDiscoverCardInShelf(shelf));
}


function followingHeroPrimaryControl() {
  const controls = [
    document.querySelector('.followingPage .followingCheckButton'),
    document.querySelector('.followingPage .followingNotifyButton'),
    document.querySelector('.followingPage .followingNotificationsOn')
  ];

  return controls.find(isVisibleFocusable) || null;
}

function firstFollowingUpdateTarget() {
  return Array.from(
    document.querySelectorAll('.followingPage .followingUpdatesList > button')
  ).find(isVisibleFocusable) || null;
}

function firstFollowingCardTarget() {
  return Array.from(
    document.querySelectorAll('.followingPage .followingCard > button')
  ).find(isVisibleFocusable) || null;
}

function firstFollowingContentTarget() {
  return firstFollowingUpdateTarget() || firstFollowingCardTarget();
}

function focusFollowingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });

  const section = target.closest('.followingUpdates, .followingCard, .followingHero');
  (section || target).scrollIntoView({
    block: section?.classList.contains('followingHero') ? 'start' : 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function isFirstFollowingContentTarget(active) {
  if (!(active instanceof HTMLElement)) return false;
  return active === firstFollowingContentTarget();
}

function moveInsideFollowing(active, direction) {
  if (!(active instanceof HTMLElement) || !document.querySelector('.followingPage')) {
    return false;
  }

  // RIGHT from Following in the sidebar intentionally enters the page at the
  // primary release-check action rather than letting geometry pick a random box.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (active.textContent || '').trim().toLowerCase().includes('following')
  ) {
    return focusFollowingTarget(followingHeroPrimaryControl() || firstFollowingContentTarget());
  }

  // Hero actions are the gateway into Following content. DOWN always enters
  // the first update if one exists, otherwise the first followed title.
  if (
    direction === 'ArrowDown'
    && active.closest('.followingHeroActions')
  ) {
    return focusFollowingTarget(firstFollowingContentTarget());
  }

  // UP from the first content item returns to the release-check action instead
  // of bouncing sideways into the sidebar.
  if (
    direction === 'ArrowUp'
    && isFirstFollowingContentTarget(active)
  ) {
    return focusFollowingTarget(followingHeroPrimaryControl());
  }

  // If Following Updates are present, DOWN from the final update enters the
  // followed-title list instead of leaking to unrelated navigation.
  if (direction === 'ArrowDown' && active.closest('.followingUpdatesList')) {
    const updates = Array.from(
      document.querySelectorAll('.followingPage .followingUpdatesList > button')
    ).filter(isVisibleFocusable);
    const card = firstFollowingCardTarget();

    if (updates.length && active === updates[updates.length - 1] && card) {
      return focusFollowingTarget(card);
    }
  }

  return false;
}


function firstAnalyticsSignalTarget() {
  return Array.from(
    document.querySelectorAll('.analyticsLabPage .analyticsDataRow')
  ).find(isVisibleFocusable) || null;
}

function analyticsResultCards() {
  return Array.from(
    document.querySelectorAll('.analyticsLabPage .analyticsCardGrid [data-tv-card="true"]')
  ).filter(isVisibleFocusable);
}

function firstAnalyticsResultCard() {
  return analyticsResultCards()[0] || null;
}

function analyticsResultsSortControl() {
  const select = document.querySelector('.analyticsLabPage .analyticsResultsToolbar select');
  return isVisibleFocusable(select) ? select : null;
}


function analyticsHeroTarget() {
  const hero = document.querySelector('.analyticsLabPage .analyticsLabHero');
  if (!(hero instanceof HTMLElement)) return null;

  if (!hero.hasAttribute('tabindex')) {
    hero.setAttribute('tabindex', '-1');
  }

  return hero;
}

function focusAnalyticsTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });

  const section = target.closest(
    '.analyticsDataPanel, .analyticsSignalResults'
  );

  (section || target).scrollIntoView({
    block: target.classList.contains('analyticsLabHero') ? 'start' : 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function isFirstAnalyticsResultRow(active) {
  if (!(active instanceof HTMLElement)) return false;

  const cards = analyticsResultCards();
  if (!cards.length || !cards.includes(active)) return false;

  const minTop = Math.min(...cards.map((card) => card.getBoundingClientRect().top));
  return active.getBoundingClientRect().top <= minTop + 12;
}

function moveInsideAnalytics(active, direction) {
  if (!(active instanceof HTMLElement) || !document.querySelector('.analyticsLabPage')) {
    return false;
  }

  // Analytics hero is informational, not a D-pad stop. RIGHT from Sidebar
  // enters the first Studio DNA signal immediately.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (active.textContent || '').trim().toLowerCase().includes('analytics')
  ) {
    return focusAnalyticsTarget(firstAnalyticsSignalTarget());
  }

  // UP from the first Studio DNA row returns to the Analytics hero so the
  // user can revisit the top of the page without leaking into Sidebar/Home.
  if (
    direction === 'ArrowUp'
    && active === firstAnalyticsSignalTarget()
  ) {
    return focusAnalyticsTarget(analyticsHeroTarget());
  }

  // The hero is a TV-only navigation bridge: DOWN re-enters Studio DNA.
  // UP stays at the top; LEFT remains the intentional route back to Sidebar.
  if (active === analyticsHeroTarget()) {
    if (direction === 'ArrowDown') {
      return focusAnalyticsTarget(firstAnalyticsSignalTarget());
    }

    if (direction === 'ArrowUp') {
      return focusAnalyticsTarget(active);
    }
  }

  // Selecting a studio/genre opens and scrolls the interactive result browser.
  // The next DOWN enters the actual title cards instead of bouncing elsewhere.
  if (
    direction === 'ArrowDown'
    && active.classList.contains('analyticsDataRow')
    && active.classList.contains('active')
    && document.querySelector('.analyticsSignalResults.isOpen')
  ) {
    return focusAnalyticsTarget(firstAnalyticsResultCard());
  }

  // Search/sort are optional result controls. DOWN from either goes directly
  // into the six-across result cards.
  if (
    direction === 'ArrowDown'
    && active.closest('.analyticsResultsToolbar')
  ) {
    return focusAnalyticsTarget(firstAnalyticsResultCard());
  }

  // UP from the first result-card row returns to Your Rank (not Search), so the
  // on-screen keyboard is only reached intentionally with Left.
  if (
    direction === 'ArrowUp'
    && active.matches('[data-tv-card="true"]')
    && active.closest('.analyticsCardGrid')
    && isFirstAnalyticsResultRow(active)
  ) {
    return focusAnalyticsTarget(analyticsResultsSortControl());
  }

  return false;
}


function upcomingHeroTarget() {
  const hero = document.querySelector('.upcomingPage .upcomingHero');
  if (!(hero instanceof HTMLElement)) return null;

  if (!hero.hasAttribute('tabindex')) {
    hero.setAttribute('tabindex', '-1');
  }

  return hero;
}

function upcomingToolbarTarget() {
  const activeTab = document.querySelector('.upcomingPage .upcomingTabs button.active');
  if (isVisibleFocusable(activeTab)) return activeTab;

  return Array.from(
    document.querySelectorAll('.upcomingPage .upcomingTabs button')
  ).find(isVisibleFocusable) || null;
}

function upcomingPosterTargets() {
  return Array.from(
    document.querySelectorAll('.upcomingPage .upcomingGrid .upcomingPoster')
  ).filter(isVisibleFocusable);
}

function firstUpcomingPosterTarget() {
  return upcomingPosterTargets()[0] || null;
}

function isFirstUpcomingPosterRow(active) {
  if (!(active instanceof HTMLElement)) return false;

  const posters = upcomingPosterTargets();
  if (!posters.includes(active) || !posters.length) return false;

  const minTop = Math.min(...posters.map((poster) => poster.getBoundingClientRect().top));
  return active.getBoundingClientRect().top <= minTop + 12;
}


function nearestUpcomingPosterVertically(active, direction) {
  if (!(active instanceof HTMLElement)) return null;
  if (direction !== 'ArrowUp' && direction !== 'ArrowDown') return null;

  const posters = upcomingPosterTargets();
  if (!posters.includes(active)) return null;

  const from = active.getBoundingClientRect();
  const fromX = from.left + (from.width / 2);
  const fromY = from.top + (from.height / 2);

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const poster of posters) {
    if (poster === active) continue;

    const rect = poster.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dy = centerY - fromY;

    if (direction === 'ArrowDown' && dy <= 18) continue;
    if (direction === 'ArrowUp' && dy >= -18) continue;

    // Strong horizontal weighting keeps Up/Down in the same visual column.
    const vertical = Math.abs(dy);
    const horizontal = Math.abs(centerX - fromX);
    const score = vertical + (horizontal * 3.25);

    if (score < bestScore) {
      best = poster;
      bestScore = score;
    }
  }

  return best;
}

function focusUpcomingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  target.focus({ preventScroll: true });

  const section = target.closest('.upcomingHero, .upcomingToolbar, .upcomingCard');
  (section || target).scrollIntoView({
    block: section?.classList.contains('upcomingHero') ? 'start' : 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });

  return true;
}

function moveInsideUpcoming(active, direction) {
  if (!(active instanceof HTMLElement) || !document.querySelector('.upcomingPage')) {
    return false;
  }

  // RIGHT from the Upcoming sidebar entry lands on the selected release tab.
  if (
    direction === 'ArrowRight'
    && active.closest('.sidebar')
    && active.matches('button')
    && (active.textContent || '').trim().toLowerCase().includes('upcoming')
  ) {
    return focusUpcomingTarget(upcomingToolbarTarget());
  }

  // UP from any top toolbar control revisits the hero.
  if (
    direction === 'ArrowUp'
    && active.closest('.upcomingToolbar')
  ) {
    return focusUpcomingTarget(upcomingHeroTarget());
  }

  // DOWN from hero returns to the active release tab.
  if (active === upcomingHeroTarget()) {
    if (direction === 'ArrowDown') {
      return focusUpcomingTarget(upcomingToolbarTarget());
    }

    if (direction === 'ArrowUp') {
      return focusUpcomingTarget(active);
    }
  }

  // DOWN from any release tab / Refresh / Search enters titles directly.
  if (
    direction === 'ArrowDown'
    && active.closest('.upcomingToolbar')
  ) {
    return focusUpcomingTarget(firstUpcomingPosterTarget());
  }

  // Upcoming cards are a real six-column TV grid. Vertical navigation stays
  // inside the grid and preserves the visual column instead of letting generic
  // geometry jump sideways to Update Database in the sidebar.
  if (active.classList.contains('upcomingPoster')) {
    if (direction === 'ArrowUp' && isFirstUpcomingPosterRow(active)) {
      return focusUpcomingTarget(upcomingToolbarTarget());
    }

    if (direction === 'ArrowUp' || direction === 'ArrowDown') {
      const nextPoster = nearestUpcomingPosterVertically(active, direction);

      if (nextPoster) {
        return focusUpcomingTarget(nextPoster);
      }

      // At the bottom edge, consume DOWN and keep focus on the current title.
      // This prevents the sidebar's Update Database button becoming a fallback.
      if (direction === 'ArrowDown') {
        return focusUpcomingTarget(active);
      }
    }
  }

  return false;
}

/**
 * Adds a lightweight input-mode layer for Android TV / keyboard navigation.
 * WebView keeps its normal spatial-navigation behavior. When WebView cannot
 * find a vertical target, a geometry-based fallback moves focus to the nearest
 * sensible control below/above it. Android landscape builds also get a compact
 * TV layout after D-pad navigation is detected.
 */
export function initializeTvFocusManager() {
  if (cleanupFocusManager) return cleanupFocusManager;

  // Apply TV layout at startup rather than waiting for the first D-pad event.
  // Repeat after initial layout because Android WebView viewport dimensions can
  // settle one frame after React mounts.
  updateTvLayoutMode();
  window.requestAnimationFrame(updateTvLayoutMode);
  window.setTimeout(updateTvLayoutMode, 80);
  const focusMutationObserver = new MutationObserver(() => {
    if (pendingInitialHomeFocus && !hasUsefulFocus()) {
      window.requestAnimationFrame(() => {
        if (focusFirstContentControl()) pendingInitialHomeFocus = false;
      });
    }
    if (!lastContentFocus || lastContentFocus.isConnected) return;
    window.requestAnimationFrame(() => restoreHomeFocusAfterShelfRemoval(lastContentFocus));
  });
  focusMutationObserver.observe(document.getElementById('root') || document.body, {
    childList: true,
    subtree: true
  });

  function enableTvInputMode() {
    document.body?.classList.add('tvInputMode');
    if (isAndroidLandscape()) rememberTvLayout();
    updateTvLayoutMode();

    if (document.body?.classList.contains('tvLayoutMode')) {
      suppressNestedCardControls();
      suppressTvSkipFocusControls();

      // JoeAI conversation blocks are reading content on TV, not D-pad cards.
      document.querySelectorAll('[data-tv-joeai-message="true"]').forEach((message) => {
        if (!(message instanceof HTMLElement)) return;
        message.removeAttribute('data-tv-joeai-message');
        message.removeAttribute('tabindex');
      });
    }
  }

  function disableTvInputMode(event) {
    if (event?.type === 'touchstart' || event?.pointerType === 'touch') {
      touchDeviceSeen = true;
      forgetTvLayout();
    }
    document.body?.classList.remove('tvInputMode');

    // Re-evaluate after pointer/touch input. This protects landscape Android
    // phones/tablets while keeping genuine no-touch Android TV devices in TV UI.
    updateTvLayoutMode();

    restoreNestedCardControls();
    restoreTvSkipFocusControls();
    restoreJoeAIMessageStops();
  }

  function handleKeyDown(event) {
    if (!TV_NAV_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;

    enableTvInputMode();

    const active = document.activeElement;

    // DetailModal owns its complete D-pad graph. Do not let the global
    // geometry fallback overwrite the target selected by the modal handler.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && active instanceof HTMLElement
      && active.closest('[data-tv-detail-modal="true"]')
      && event.key.startsWith('Arrow')
    ) {
      return;
    }

    const joeAIPageVisible = Boolean(document.querySelector('.joeAICommandCenter'));
    const activeInSidebar = active instanceof HTMLElement && Boolean(active.closest('.sidebar'));
    const activeInJoeAI = active instanceof HTMLElement && Boolean(active.closest('.joeAICommandCenter'));

    // Every page hero follows the same TV contract: one UP from a focused
    // hero control reveals the hero from its top without changing focus.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && revealFocusedPageHero(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Home hero entry + horizontal movement are deterministic and deliberately
    // do not scroll the document. This prevents Android WebView from centering
    // the focused hero button and visually chopping the hero.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideHomeHero(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Home hero DOWN enters Continue Watching.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveFromHomeHeroToContinueWatching(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Home decision cards expose their actions as a compact remote-friendly
    // row. DOWN enters the row, Left/Right moves across it, and DOWN at the
    // bottom continues to the next Home shelf.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideHomeDecisionCard(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Library/Favorites use deterministic TV entry. Sidebar RIGHT and topbar
    // DOWN go straight into the first visible title card/row.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveIntoLibraryOrFavoritesContent(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Discover also uses deterministic vertical entry. Its action bar and
    // shelf header controls always route DOWN into title cards, never Sidebar.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveIntoDiscoverShelfCards(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // The full catalog modal has its own TV loop: toolbar DOWN enters the
    // catalog cards; first-row UP returns to the primary collection dropdown.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideDiscoverCatalog(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Bottom-up Discover navigation is deterministic too. UP from Browse
    // Studios/Genres controls returns to the nearest shelf card above instead
    // of leaking sideways into the sidebar.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveUpFromDiscoverCollections(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // The Daily Pick is a bridge between Discover shelves. Up/Down from any
    // action button moves into the adjacent shelf instead of escaping Sidebar.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveFromDailyPickToShelf(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Following has its own TV entry/exit routes so its compact hero and title
    // list never leak vertically back into Sidebar geometry.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideFollowing(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Analytics skips its informational hero/coverage dashboard and gives the
    // Studio/Genre explorer plus six-across results deterministic TV routes.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideAnalytics(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Upcoming uses a compact one-row toolbar and deterministic hero/title
    // navigation so vertical D-pad moves never leak back into Sidebar.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideUpcoming(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Settings must be handled before WebView spatial navigation. Otherwise
    // Android can decide a sidebar control is geometrically closer than the
    // next Settings control and throw focus out of the page.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideSettings(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // About/Help also gets a hard TV focus boundary. Its paired cards and
    // utility buttons stay inside the page until Left intentionally exits.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && moveInsideAboutHelp(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // JoeAI recommendations use viewport selection on TV. The card nearest the
    // middle of the screen is highlighted; Left/Right moves through that card's
    // action controls instead of changing recommendations or snapping to card #1.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && joeAIPageVisible
      && !activeInSidebar
      && !isTextEntry(active)
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && moveJoeAIRecommendationAction(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // OK/Enter opens the recommendation currently highlighted in the viewport.
    // Existing focused buttons keep their normal Enter behavior.
    if (
      document.body?.classList.contains('tvLayoutMode')
      && joeAIPageVisible
      && activeInJoeAI
      && !active?.matches?.('button, a, input, textarea, select, [role="button"]')
      && (event.key === 'Enter' || event.key === ' ')
      && openActiveJoeAIRecommendation()
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key.startsWith('Arrow') && hasUsefulFocus()) {
      if (
        document.body?.classList.contains('tvLayoutMode')
        && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        && scrollJoeAIConversation(active, event.key, event.repeat)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isTvCard(active) && document.body?.classList.contains('tvLayoutMode')) {
        if (moveBetweenTvCards(active, event.key)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.key === 'ArrowRight') {
          // At the end of a shelf, stay on the last card instead of wandering
          // into tiny shelf/header controls.
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        // ArrowLeft with no card to the left is deliberately left alone so
        // Sidebar.jsx can bridge into the command rail. Up/Down can likewise
        // fall back to normal page navigation when there is no other TV card.
        return;
      }

      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        && active instanceof HTMLElement
        && !active.closest('.sidebar')
        && !isTextEntry(active)
      ) {
        scheduleVerticalFallback(active, event.key);
      }
      return;
    }

    if (!event.key.startsWith('Arrow')) return;

    // Settings can contain a run of disabled controls (for example an empty
    // JoeAI Memory Manager). If focus drops out there, resume from the current
    // viewport instead of jumping back to the first control at the top.
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      && settingsRoot()
    ) {
      if (focusSettingsControlFromViewport(event.key)) {
        event.preventDefault();
        return;
      }

      scrollSettingsPage(event.key);
      event.preventDefault();
      return;
    }

    // If a page opens with focus nowhere useful, give WebView a real starting
    // point. ArrowLeft is left alone so Sidebar.jsx can bridge straight into
    // the command rail when appropriate.
    if (event.key !== 'ArrowLeft') {
      if (focusFirstContentControl()) pendingInitialHomeFocus = false;
      else pendingInitialHomeFocus = true;
      event.preventDefault();
    }
  }

  function handleFocusIn(event) {
    if (!document.body?.classList.contains('tvInputMode')) return;
    const target = event.target;
    if (!isVisibleFocusable(target)) return;

    if (target instanceof HTMLElement && target.closest('.content')) {
      lastContentFocus = target;
    }

    requestAnimationFrame(() => {
      if (!target.isConnected) return;

      // JoeAI Pick of the Day is one feature card on TV. When any of its
      // buttons receives focus, center the whole card instead of letting the
      // browser minimally scroll just that button into view and clip the hero.
      if (
        document.body?.classList.contains('tvLayoutMode')
        && target instanceof HTMLElement
      ) {
        const dailyPick = target.closest('.dailyPickHero');
        if (dailyPick instanceof HTMLElement) {
          dailyPick.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'smooth'
          });
          return;
        }
      }

      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('scroll', scheduleJoeAIActiveCardUpdate, { passive: true });
  window.addEventListener('resize', updateTvLayoutMode);
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('pointerdown', disableTvInputMode, true);
  document.addEventListener('touchstart', disableTvInputMode, true);

  cleanupFocusManager = () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    focusMutationObserver.disconnect();
    window.removeEventListener('scroll', scheduleJoeAIActiveCardUpdate);
    window.removeEventListener('resize', updateTvLayoutMode);
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('pointerdown', disableTvInputMode, true);
    document.removeEventListener('touchstart', disableTvInputMode, true);
    restoreNestedCardControls();
    restoreTvSkipFocusControls();
    restoreJoeAIMessageStops();
    clearJoeAIActiveRecommendationCard();
    if (joeAIScrollFrame) {
      window.cancelAnimationFrame(joeAIScrollFrame);
      joeAIScrollFrame = 0;
    }
    document.body?.classList.remove('tvLayoutMode');
    lastContentFocus = null;
    pendingInitialHomeFocus = false;
    cleanupFocusManager = null;
  };

  return cleanupFocusManager;
}
