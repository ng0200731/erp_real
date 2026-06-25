import fs from 'fs';
import path from 'path';
import { ok, summary } from './_helpers.js';

const html = fs.readFileSync(path.resolve('public/index.html'), 'utf8');

ok(html.includes('id="menuDocumentBtn"'), 'menu has menuDocumentBtn button');
ok(/class="submenu-btn"[^>]*>Document</.test(html) || html.includes('>Document</button>'), 'menu shows a Document label');
ok(html.includes('id="documentPanel"'), 'body has documentPanel');
ok(html.includes("ensureTab('document'"), "click handler calls ensureTab('document')");
ok(html.includes("activateTab('document')"), "click handler calls activateTab('document')");
ok(html.includes("'document':"), "tabHighlight has a 'document' entry");
ok(html.includes("id === 'document'"), "activateTab toggles documentPanel by id");
ok(html.includes('/shared/documentTemplates.js'), 'page imports /shared/documentTemplates.js');
ok(html.includes('selectDocType') || html.includes('initializeDocumentPanel'), 'page defines a document init/select function');

summary('24-document-menu-wiring');
