const fs = require('fs');

const file = 'src/App.jsx';
let text = fs.readFileSync(file, 'utf8');

const importLine = "import './styles/add-anime.css';";
if (!text.includes(importLine)) {
  text = `${importLine}\n${text}`;
  fs.writeFileSync(file, text);
  console.log('Added add-anime.css import to App.jsx.');
} else {
  console.log('add-anime.css import already present.');
}
