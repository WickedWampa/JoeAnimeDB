import React, { useEffect, useMemo, useState } from 'react';
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

export function Poster({ anime, className = 'poster', mode = 'fill', loading = 'lazy', onLoad }) {
  const sources = useMemo(() => getPosterSources(anime), [anime]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  function handleImageError() {
    setSourceIndex((current) => current + 1);
  }

  const classes = [
    className,
    mode === 'thumb' ? 'posterThumb' : '',
    mode === 'library' ? 'posterLibrary' : '',
    src ? 'hasImage' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={mode === 'library' && src ? { '--library-poster-backdrop': `url("${src}")` } : undefined}>
      {src ? (
        <img
          src={src}
          alt={`${anime.title} poster`}
          loading={loading}
          decoding="async"
          onLoad={onLoad}
          onError={handleImageError}
          style={mode === 'library'
            ? {
                objectFit: 'contain',
                objectPosition: 'center top',
                width: '100%',
                height: '100%'
              }
            : undefined}
        />
      ) : (
        <span>{initials(anime.title)}</span>
      )}
    </div>
  );
}
