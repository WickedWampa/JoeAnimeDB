export function buildTonightsWatch({ anime = [], catalog = [] }) {
  const watching = anime.filter(a => (a.status || '').toLowerCase() === 'watching');

  const candidates = catalog.filter(c =>
    !anime.some(a =>
      (a.officialTitle || a.title).toLowerCase() ===
      (c.officialTitle || c.title).toLowerCase()
    )
  );

  const pick = candidates.sort((a,b)=>(b.score||0)-(a.score||0))[0];

  return {
    type: "dashboard",
    title: "🍜 Welcome back!",
    stats: [
      {label:"Library", value: anime.length},
      {label:"Watching", value: watching.length},
      {label:"Completed", value: anime.filter(a=>(a.status||'').toLowerCase()==='completed').length},
    ],
    tonight: pick ? {
      title: pick.title,
      reason: "Highest-rated unseen recommendation from your catalog."
    } : null
  };
}
