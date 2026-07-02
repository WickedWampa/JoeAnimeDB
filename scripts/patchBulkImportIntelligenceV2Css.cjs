const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.readFileSync(file, 'utf8');

const patch = `
/* Bulk Import Intelligence V2 */
.bulkReviewCard {
  border: 1px solid rgba(255, 201, 40, .22);
  border-radius: 16px;
  padding: 12px;
  margin-top: 10px;
  background: rgba(255, 201, 40, .045);
}

.bulkReviewCard h4 {
  margin: 0 0 4px;
  color: var(--gold);
  font-size: 17px;
}

.bulkReviewCard p {
  margin: 0 0 10px;
  color: var(--muted);
}

.bulkReviewMatches {
  display: grid;
  gap: 9px;
}

.bulkReviewMatches button {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 10px;
  align-items: center;
  width: 100%;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.18);
  color: var(--text);
  border-radius: 14px;
  padding: 8px;
  cursor: pointer;
  text-align: left;
}

.bulkReviewMatches button:hover {
  border-color: rgba(55,234,255,.38);
  background: rgba(55,234,255,.07);
}

.bulkReviewPoster {
  position: relative;
  width: 52px;
  height: 70px;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(55,234,255,.18), rgba(255,92,200,.16));
}

.bulkReviewPoster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bulkReviewMatches strong,
.bulkReviewMatches small {
  display: block;
}

.bulkReviewMatches small {
  margin-top: 4px;
  color: var(--muted);
  line-height: 1.35;
}
`;

if (!text.includes('Bulk Import Intelligence V2')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
}

console.log('Bulk Import Intelligence V2 styles patched.');
