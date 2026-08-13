import React from 'react';
import { Home, Library, Compass, BarChart3, Settings, Sparkles, CalendarDays, RefreshCw, Heart, Bell, CircleHelp } from 'lucide-react';

function NavButton({ icon, label, id, view, setView, badge, featured = false }) {
  const isActive = view === id;

  return (
    <button
      className={`${isActive ? 'active' : ''}${featured ? ' featured' : ''}`.trim()}
      onClick={() => setView(id)}
      aria-current={isActive ? 'page' : undefined}
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
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brandEyebrow">Your anime command center</span>
        <strong>JOE<span>ANIME</span>DB</strong>
        <small><i aria-hidden="true" /> Powered by JoeAI</small>
      </div>

      <nav>
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
        <button className="syncSide" onClick={syncMetadata}>
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
