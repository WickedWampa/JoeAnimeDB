import React from 'react';
import { Home, Library, Compass, BarChart3, Settings, Sparkles, CalendarDays, RefreshCw, Heart, Bell, CircleHelp } from 'lucide-react';

function NavButton({ icon, label, id, view, setView, badge }) {
  return (
    <button className={view === id ? 'active' : ''} onClick={() => setView(id)}>
      {icon}
      <span>{label}</span>
      {Number(badge || 0) > 0 && <b className="navBadge">{badge}</b>}
    </button>
  );
}

export function Sidebar({ view, setView, syncMetadata, followingCount = 0 }) {
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
        <NavButton icon={<CalendarDays />} label="Upcoming" id="upcoming" view={view} setView={setView} />

        <NavButton icon={<Settings />} label="Settings" id="settings" view={view} setView={setView} />
        <NavButton icon={<CircleHelp />} label="About / Help" id="about" view={view} setView={setView} />
      </nav>

      <button className="syncSide" onClick={syncMetadata}><RefreshCw size={16} /> Update Database</button>
    </aside>
  );
}
