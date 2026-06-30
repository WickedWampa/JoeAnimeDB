import React, { useMemo, useState } from 'react';
import { initials } from '../utils/animeUtils';

function getPosterSources(anime) {
  return [
    anime?.cover,
    anime?.poster,
    anime?.posterUrl,
    anime?.image,
    anime?.imageUrl,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    anime?.images?.webp?.large_image_url,
    anime?.images?.webp?.image_url
  ].filter(Boolean);
}

export function Poster({ anime, className = 'poster' }) {
  const sources = useMemo(() => getPosterSources(anime), [anime]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];

  function handleImageError() {
    setSourceIndex((current) => current + 1);
  }

  return (
    <div className={`${className}${src ? ' hasImage' : ''}`}>
      {src ? (
        <img src={src} alt={`${anime.title} poster`} loading="lazy" onError={handleImageError} />
      ) : (
        <span>{initials(anime.title)}</span>
      )}
    </div>
  );
}
