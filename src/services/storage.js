export const STORAGE_KEY = 'joeanime-db-4';

export function loadData(seed) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : seed;
  } catch {
    return seed;
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

export function exportBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `JoeAnimeDB-4-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}


export function exportLibraryList(data = {}) {
  const exportedAt = new Date();
  const titles = sortedAnime(data)
    .map((item) => String(item.officialTitle || item.title || '').trim())
    .filter(Boolean);

  downloadText(
    `JoeAnimeDB-library-list-${exportedAt.toISOString().slice(0, 10)}.txt`,
    [
      'JoeAnimeDB Library List',
      `Exported: ${exportedAt.toLocaleString()}`,
      `Total titles: ${titles.length}`,
      '',
      ...titles.map((title, index) => `${index + 1}. ${title}`)
    ].join('\n')
  );

  return titles.length;
}


function sortedAnime(data = {}) {
  return (Array.isArray(data?.anime) ? data.anime : [])
    .slice()
    .sort((a,b)=>(a.officialTitle||a.title||'').localeCompare((b.officialTitle||b.title||'')));
}

export function exportRankedLibraryList(data = {}) {
  const rows = sortedAnime(data).map((a,i)=>
    `${i+1}. ${a.officialTitle||a.title} | Score: ${a.joeScore ?? a.score ?? a.rating ?? "-"} | Status: ${a.status ?? "-"}`
  );
  downloadText("JoeAnimeDB-ranked-library.txt",
    ["JoeAnimeDB Ranked Library","",...rows].join("\n"));
}

export function exportLibraryCsv(data = {}) {
  const rows = [
    "Title,Score,Status,Year,Genres",
    ...sortedAnime(data).map(a=>[
      `"${(a.officialTitle||a.title||"").replace(/"/g,'""')}"`,
      a.joeScore ?? a.score ?? a.rating ?? "",
      a.status ?? "",
      a.year ?? "",
      `"${(a.genres||[]).join("; ")}"`
    ].join(","))
  ];
  downloadText("JoeAnimeDB-library.csv", rows.join("\n"));
}

function downloadText(filename, text){
  const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
