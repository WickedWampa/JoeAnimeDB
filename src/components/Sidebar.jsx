import React, { useEffect, useRef } from 'react';
import { Home, Library, Compass, BarChart3, Settings, Sparkles, CalendarDays, RefreshCw, Heart, Bell, CircleHelp } from 'lucide-react';

const CONTENT_FOCUS_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function isVisibleFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isTextEditingControl(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function hasFocusableCandidateToLeft(activeElement, contentRoot) {
  if (!(activeElement instanceof HTMLElement) || !contentRoot) return false;

  const activeRect = activeElement.getBoundingClientRect();
  if (!activeRect.width || !activeRect.height) return false;

  const activeCenterY = activeRect.top + (activeRect.height / 2);

  return Array.from(contentRoot.querySelectorAll(CONTENT_FOCUS_SELECTOR)).some((candidate) => {
    if (candidate === activeElement || !isVisibleFocusable(candidate)) return false;

    const rect = candidate.getBoundingClientRect();
    const candidateCenterY = rect.top + (rect.height / 2);
    const verticalOverlap = Math.min(activeRect.bottom, rect.bottom) - Math.max(activeRect.top, rect.top);
    const closeEnoughVertically = Math.abs(candidateCenterY - activeCenterY) <= Math.max(56, activeRect.height * 1.5);
    const isActuallyLeft = rect.right <= activeRect.left + 4;

    return isActuallyLeft && (verticalOverlap > 0 || closeEnoughVertically);
  });
}

function NavButton({ icon, label, id, view, setView, badge, featured = false }) {
  const isActive = view === id;

  return (
    <button
      type="button"
      className={`${isActive ? 'active' : ''}${featured ? ' featured' : ''}`.trim()}
      onClick={() => setView(id)}
      aria-current={isActive ? 'page' : undefined}
      data-tv-sidebar-item="true"
      data-tv-view={id}
    >
      <span className="sidebarNavIcon" aria-hidden="true">{icon}</span>
      <span className="sidebarNavLabel">{label}</span>
      {Number(badge || 0) > 0 && <b className="navBadge">{badge}</b>}
    </button>
  );
}

function NavSection({ label, children }) {
  return (
    <section className="sidebarNavSection" aria-label={label}>
      <p className="sidebarNavHeading">{label}</p>
      <div className="sidebarNavItems">{children}</div>
    </section>
  );
}

export function Sidebar({ view, setView, syncMetadata, followingCount = 0 }) {
  const sidebarRef = useRef(null);
  const lastContentFocusRef = useRef(null);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return undefined;

    function getSidebarItems() {
      return Array.from(sidebar.querySelectorAll('[data-tv-sidebar-item="true"]'))
        .filter(isVisibleFocusable);
    }

    function focusSidebarEntry() {
      const items = getSidebarItems();
      if (!items.length) return false;

      const activeViewButton = items.find((item) => item.dataset.tvView === view);
      const target = activeViewButton || items[0];
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
      return true;
    }

    function focusContent() {
      const contentRoot = document.querySelector('.content');
      if (!contentRoot) return false;

      const remembered = lastContentFocusRef.current;
      if (remembered?.isConnected && contentRoot.contains(remembered) && isVisibleFocusable(remembered)) {
        remembered.focus({ preventScroll: true });
        remembered.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
      }

      // On TV, entering Library-style pages from the sidebar should land on
      // the content itself, not immediately focus Search and open the keyboard.
      // Search remains reachable by pressing Up from the first card row.
      const prefersCardEntry = ['library', 'favorites', 'rankings'].includes(view);
      const preferredCard = prefersCardEntry
        ? Array.from(contentRoot.querySelectorAll('[data-tv-card="true"]')).find(isVisibleFocusable)
        : null;

      const firstFocusable = preferredCard || Array.from(
        contentRoot.querySelectorAll(CONTENT_FOCUS_SELECTOR)
      ).find(isVisibleFocusable);

      if (!firstFocusable) return false;
      firstFocusable.focus({ preventScroll: true });
      firstFocusable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      lastContentFocusRef.current = firstFocusable;
      return true;
    }

    function handleFocusIn(event) {
      const target = event.target;
      const contentRoot = document.querySelector('.content');
      if (target instanceof HTMLElement && contentRoot?.contains(target) && isVisibleFocusable(target)) {
        lastContentFocusRef.current = target;
      }
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const active = document.activeElement;
      const sidebarHasFocus = active instanceof HTMLElement && sidebar.contains(active);

      if (sidebarHasFocus) {
        const items = getSidebarItems();
        const index = items.indexOf(active);

        if (event.key === 'ArrowUp' && index > 0) {
          event.preventDefault();
          items[index - 1].focus({ preventScroll: true });
          items[index - 1].scrollIntoView({ block: 'nearest' });
          return;
        }

        if (event.key === 'ArrowDown' && index >= 0 && index < items.length - 1) {
          event.preventDefault();
          items[index + 1].focus({ preventScroll: true });
          items[index + 1].scrollIntoView({ block: 'nearest' });
          return;
        }

        if (event.key === 'ArrowRight') {
          if (focusContent()) event.preventDefault();
        }

        return;
      }

      if (event.key !== 'ArrowLeft' || isTextEditingControl(active)) return;

      const contentRoot = document.querySelector('.content');
      if (!contentRoot || sidebar.offsetParent === null) return;

      // Do not pull focus out of dialogs, onboarding, update prompts, or any
      // other overlay sitting outside the main page content.
      if (!(active instanceof HTMLElement) || !contentRoot.contains(active)) return;

      // Let WebView/browser spatial navigation keep handling normal movement
      // within a row. We only bridge to the command rail when there is no
      // sensible visible control remaining to the left.
      if (hasFocusableCandidateToLeft(active, contentRoot)) return;
      lastContentFocusRef.current = active;

      if (focusSidebarEntry()) event.preventDefault();
    }

    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [view]);

  return (
    <aside ref={sidebarRef} className="sidebar" aria-label="JoeAnimeDB navigation">
      <div className="brand">
        <span className="brandEyebrow">Your anime command center</span>
        <strong>JOE<span>ANIME</span>DB</strong>
        <small><i aria-hidden="true" /> Powered by JoeAI</small>
      </div>

      <nav aria-label="Main navigation">
        <NavSection label="Command">
          <NavButton icon={<Home />} label="Home" id="dashboard" view={view} setView={setView} />
          <NavButton icon={<Sparkles />} label="JoeAI" id="assistant" view={view} setView={setView} featured />
        </NavSection>

        <NavSection label="Your Anime">
          <NavButton icon={<Library />} label="Library" id="library" view={view} setView={setView} />
          <NavButton icon={<Heart />} label="Favorites" id="favorites" view={view} setView={setView} />
          <NavButton icon={<Compass />} label="Discover" id="discover" view={view} setView={setView} />
          <NavButton icon={<Bell />} label="Following" id="following" view={view} setView={setView} badge={followingCount} />
          <NavButton icon={<BarChart3 />} label="Analytics" id="analytics" view={view} setView={setView} />
          <NavButton icon={<CalendarDays />} label="Upcoming" id="upcoming" view={view} setView={setView} />
        </NavSection>

        <NavSection label="System">
          <NavButton icon={<Settings />} label="Settings" id="settings" view={view} setView={setView} />
          <NavButton icon={<CircleHelp />} label="About / Help" id="about" view={view} setView={setView} />
        </NavSection>
      </nav>

      <div className="sidebarFooter">
        <button
          type="button"
          className="syncSide"
          onClick={syncMetadata}
          data-tv-sidebar-item="true"
          data-tv-view="database-update"
        >
          <span className="sidebarSyncIcon" aria-hidden="true"><RefreshCw size={16} /></span>
          <span>
            <strong>Update Database</strong>
            <small><i aria-hidden="true" /> Metadata services ready</small>
          </span>
        </button>
      </div>
    </aside>
  );
}
