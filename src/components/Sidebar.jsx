import React from 'react';
import { Home, Library, Compass, BarChart3, Settings, Sparkles, CalendarDays, RefreshCw, Heart, Palette, Bell } from 'lucide-react';

const THEMES = [
  { id: 'neon', label: 'Neon' },
  { id: 'sakura', label: 'Sakura' },
  { id: 'vapor', label: 'Vapor' },
  { id: 'ramen', label: 'Ramen' },
  { id: 'inferno', label: 'Inferno' },
  { id: 'amoled', label: 'AMOLED' }
];

function NavButton({ icon, label, id, view, setView, badge }) {
  return (
    <button className={view === id ? 'active' : ''} onClick={() => setView(id)}>
      {icon}
      <span>{label}</span>
      {Number(badge || 0) > 0 && <b className="navBadge">{badge}</b>}
    </button>
  );
}

export function Sidebar({ view, setView, syncMetadata, theme, setTheme, newUserMode, followingCount = 0 }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <strong>JOE<span>ANIME</span>DB</strong>
        <small>Powered by JoeAI</small>
      </div>

      <nav>
        <NavButton icon={<Home />} label="Home" id="dashboard" view={view} setView={setView} />
        <NavButton icon={<Sparkles />} label="JoeAI" id="assistant" view={view} setView={setView} />

        <NavButton icon={<Library />} label="Library" id="library" view={view} setView={setView} />
        <NavButton icon={<Heart />} label="Favorites" id="favorites" view={view} setView={setView} />
        <NavButton icon={<Compass />} label="Discover" id="discover" view={view} setView={setView} />
        <NavButton icon={<Bell />} label="Following" id="following" view={view} setView={setView} badge={followingCount} />

        <NavButton icon={<BarChart3 />} label="Analytics" id="analytics" view={view} setView={setView} />
        <NavButton icon={<CalendarDays />} label="Timeline" id="timeline" view={view} setView={setView} />

        <NavButton icon={<Settings />} label="Settings" id="settings" view={view} setView={setView} />
      </nav>

      <section className="themePicker" aria-label="Theme picker">
        <div className="themeTitle"><Palette size={16} /> Theme</div>
        <div className="themeButtons">
          {THEMES.map((option) => (
            <button
              key={option.id}
              className={theme === option.id ? 'active' : ''}
              type="button"
              onClick={() => setTheme(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <button className="syncSide" onClick={syncMetadata}><RefreshCw size={16} /> Update Database</button>
    </aside>
  );
}
