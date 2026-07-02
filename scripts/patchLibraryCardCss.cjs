const fs = require('fs');

const file = 'src/App.jsx';
const importLine = "import './styles/library-card-fix.css';";

let text = fs.readFileSync(file, 'utf8');

if (!text.includes(importLine)) {
  text = `${importLine}\n${text}`;
  fs.writeFileSync(file, text);
  console.log('Added library card CSS import.');
} else {
  console.log('Library card CSS import already exists.');
}
