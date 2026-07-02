const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('function renderHelpCard')) {
  text = text.replace(
`  function renderConfirmAction(message, index) {`,
`  function renderHelpCard(message, index) {
    return (
      <div key={index} className="chat bot joeaiHelpCard">
        <div className="joeaiHelpHero">
          <h2>{message.title}</h2>
          <p>{message.subtitle}</p>
        </div>

        <div className="joeaiHelpGrid">
          {(message.sections || []).map((section) => (
            <section key={section.title} className="joeaiHelpSection">
              <h3><span>{section.icon}</span>{section.title}</h3>
              <div>
                {(section.items || []).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setText(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {message.footer && <p className="joeaiHelpFooter">{message.footer}</p>}
      </div>
    );
  }

  function renderConfirmAction(message, index) {`
  );
}

if (!text.includes("message.type === 'helpCard'")) {
  text = text.replace(
`    if (message.type === 'confirmAction') {`,
`    if (message.type === 'helpCard') {
      return renderHelpCard(message, index);
    }

    if (message.type === 'confirmAction') {`
  );
}

fs.writeFileSync(file, text);
console.log('Patched Assistant UI to render rich JoeAI help cards.');
