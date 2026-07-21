import React from 'react';
import { Search } from 'lucide-react';

export function SearchBar({ query, setQuery, view, setView }) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (view === 'dashboard') setView('library');
        }}
        placeholder="Search anime, studio, genre..."
      />
    </label>
  );
}
