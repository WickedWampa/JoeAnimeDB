const fs = require('fs');

const file = 'src/styles/add-anime.css';
const patch = '\n.importLabel {\n  display: inline-flex;\n  width: fit-content;\n  margin-bottom: 5px;\n  padding: 3px 8px;\n  border-radius: 999px;\n  border: 1px solid rgba(55, 234, 255, .25);\n  background: rgba(55, 234, 255, .10);\n  color: var(--cyan);\n  font-size: 11px;\n  font-weight: 1000;\n  text-transform: uppercase;\n  letter-spacing: .04em;\n}\n\n.importLabel.exactmatch {\n  border-color: rgba(255, 201, 40, .45);\n  background: rgba(255, 201, 40, .12);\n  color: var(--gold);\n}\n\n.importLabel.strongmatch {\n  border-color: rgba(18, 214, 111, .38);\n  background: rgba(18, 214, 111, .12);\n  color: #8dffbe;\n}\n\n.importLabel.sequel {\n  border-color: rgba(185, 132, 255, .38);\n  background: rgba(185, 132, 255, .12);\n  color: #d7bdff;\n}\n\n.importLabel.spinoff,\n.importLabel.related {\n  border-color: rgba(255, 255, 255, .14);\n  background: rgba(255, 255, 255, .06);\n  color: rgba(237, 247, 255, .72);\n}\n\n.importMeta {\n  line-height: 1.35;\n}\n';

let text = fs.readFileSync(file, 'utf8');
if (!text.includes('.importLabel')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
  console.log('Added importer polish styles.');
} else {
  console.log('Importer polish styles already present.');
}
