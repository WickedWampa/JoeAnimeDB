const fs = require('fs');

const appFile = 'src/App.jsx';
const importLine = "import './styles/joeai-recommendations.css';";

let app = fs.readFileSync(appFile, 'utf8');

if (!app.includes(importLine)) {
  app = `${importLine}\n${app}`;
  fs.writeFileSync(appFile, app);
  console.log('Added JoeAI recommendation CSS import to src/App.jsx');
} else {
  console.log('JoeAI recommendation CSS import already exists.');
}
