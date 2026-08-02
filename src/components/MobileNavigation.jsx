import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleHelp,
  Compass,
  Heart,
  Home,
  Library,
  Menu,
  Settings,
  Sparkles,
  X
} from 'lucide-react';

const PRIMARY_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'assistant', label: 'JoeAI', icon: Sparkles },
  { id: 'discover', label: 'Discover', icon: Compass }
];

const MORE_ITEMS = [
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'following', label: 'Following', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About / Help', icon: CircleHelp }
];

function MobileNavButton({ item, active, badge, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={active ? 'active' : ''}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="mobileNavIcon">
        <Icon size={21} strokeWidth={2.3} />
        {Number(badge || 0) > 0 && <b>{badge}</b>}
      </span>
      <span>{item.label}</span>
    </button>
  );
}

export function MobileNavigation({ view, setView, followingCount = 0 }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) => item.id === view);

  useEffect(() => setMoreOpen(false), [view]);

  function navigate(id) {
    setMoreOpen(false);
    setView(id);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  return (
    <>
      {moreOpen && (
        <div className="mobileMoreBackdrop" onClick={() => setMoreOpen(false)}>
          <section
            className="mobileMoreSheet"
            aria-label="More JoeAnimeDB pages"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>More</strong>
                <small>JoeAnimeDB</small>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={22} />
              </button>
            </header>
            <div className="mobileMoreGrid">
              {MORE_ITEMS.map((item) => (
                <MobileNavButton
                  key={item.id}
                  item={item}
                  active={view === item.id}
                  badge={item.id === 'following' ? followingCount : 0}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <nav className="mobileBottomNav" aria-label="Primary navigation">
        {PRIMARY_ITEMS.map((item) => (
          <MobileNavButton
            key={item.id}
            item={item}
            active={view === item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
        <MobileNavButton
          item={{ id: 'more', label: 'More', icon: Menu }}
          active={moreOpen || moreActive}
          onClick={() => setMoreOpen(true)}
        />
      </nav>
    </>
  );
}
