import React from 'react';
import { Home, Library, Trophy, BarChart3, Settings, Sparkles, Swords, Network, CalendarDays, RefreshCw, Heart, Palette } from 'lucide-react';

const THEMES = [
  { id: 'neon', label: 'Neon' },
  { id: 'sakura', label: 'Sakura' },
  { id: 'vapor', label: 'Vapor' },
  { id: 'ramen', label: 'Ramen' },
  { id: 'inferno', label: 'Inferno' },
  { id: 'amoled', label: 'AMOLED' }
];

function NavButton({ icon, label, id, view, setView }) {
  return (
    <button className={view === id ? 'active' : ''} onClick={() => setView(id)}>
      {icon}
      {label}
    </button>
  );
}

export function Sidebar({ view, setView, syncMetadata, theme, setTheme }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <strong>JOE<span>ANIME</span>DB</strong>
        <small>Remember Every Anime</small>
      </div>

      <nav>
        <NavButton icon={<Home />} label="Dashboard" id="dashboard" view={view} setView={setView} />
        <NavButton icon={<Library />} label="Library" id="library" view={view} setView={setView} />
        <NavButton icon={<Heart />} label="Favorites" id="favorites" view={view} setView={setView} />
        <NavButton icon={<Trophy />} label="Rankings" id="rankings" view={view} setView={setView} />
        <NavButton icon={<Network />} label="Anime Universe" id="universe" view={view} setView={setView} />
        <NavButton icon={<Sparkles />} label="Assistant" id="assistant" view={view} setView={setView} />
        <NavButton icon={<BarChart3 />} label="Analytics" id="analytics" view={view} setView={setView} />
        <NavButton icon={<CalendarDays />} label="Timeline" id="timeline" view={view} setView={setView} />
        <NavButton icon={<Swords />} label="Bleach Shrine" id="bleach" view={view} setView={setView} />
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
