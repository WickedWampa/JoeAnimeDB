const fs=require('fs');
const f='src/pages/PlaceholderPages.jsx';
let t=fs.readFileSync(f,'utf8');
if(!t.includes("buildTonightsWatch")){
 t=t.replace("import { executeJoeAICommand } from '../ai/commandExecutor';",
             "import { executeJoeAICommand } from '../ai/commandExecutor';\nimport { buildTonightsWatch } from '../ai/tonightsWatch';");
}
if(!t.includes("const welcomeDashboard")){
 t=t.replace("const [log, setLog] = useState([]);",
`const [log, setLog] = useState([]);
const welcomeDashboard = buildTonightsWatch({ anime, catalog });`);
}
fs.writeFileSync(f,t);
console.log("Patched imports. Render welcomeDashboard where desired (top of Assistant page).");
