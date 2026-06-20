// Remove all alert() calls from HTML files, preserving control flow.
// Processes LINE BY LINE (all alerts are single-line), so no cross-line matching.
// Files: public/index.html, public/supplier-portal.html, public/supplier-sampling.html

const fs = require('fs');
const path = require('path');

const files = [
  'public/index.html',
  'public/supplier-portal.html',
  'public/supplier-sampling.html'
];

// Match a full alert(...) statement on ONE line, allowing nested parens / template literals.
// Greedy up to the LAST ')' before optional ';' on the same line.
// [^\n] ensures we never cross a line boundary.
const ALERT_STMT = /alert\([^\n]*\);?/;

function transformLine(line) {
  if (!/alert\(/.test(line)) return line; // unchanged

  let out = line;
  // Capture leading indent
  const indent = out.match(/^\s*/)[0];

  // Pattern A: standalone if-cond with alert, no return  ->  e.g. "  if (dept) alert('...');"
  //            remove whole line (return empty)
  const stripped = out.trim();
  if (/^if \([^\n]+\) alert\([^\n]*\);$/.test(stripped)) {
    return ''; // drop line
  }

  // Pattern B: standalone alert  ->  e.g. "  alert('Quotation deleted successfully.');"
  if (/^alert\([^\n]*\);$/.test(stripped)) {
    return ''; // drop line
  }

  // Pattern C: standalone "return alert(...);"  ->  "return;"
  if (/^return alert\([^\n]*\);$/.test(stripped)) {
    return indent + 'return;';
  }

  // Pattern D: "if (...) return alert(...);"  ->  "if (...) return;"
  out = out.replace(/(if \([^\n]+\)) return alert\([^\n]*\);/, '$1 return;');

  // Pattern E: "{ alert(...); return; }"  ->  "{ return; }"
  out = out.replace(/\{ alert\([^\n]*\); return; \}/, '{ return; }');

  // Pattern F: "catch (err) { alert(...); }"  ->  "catch (err) {}"
  out = out.replace(/(catch \(\w+\)) \{ alert\([^\n]*\); \}/, '$1 {}');

  // Pattern G: leftover embedded alert(...) anywhere else on the line -> remove the alert token.
  // (keeps any surrounding structure intact)
  out = out.replace(ALERT_STMT, '');

  return out;
}

for (const file of files) {
  const filePath = path.join(__dirname, file);
  const original = fs.readFileSync(filePath, 'utf8');

  // Backup once
  if (!fs.existsSync(filePath + '.bak')) {
    fs.writeFileSync(filePath + '.bak', original);
  }

  const beforeLines = original.split('\n');
  const afterLines = beforeLines.map(transformLine);

  // Drop lines that became empty due to removal (only those that HAD an alert -> now '')
  // We keep original intentional blank lines (transformLine leaves them untouched).
  const outLines = [];
  for (let i = 0; i < beforeLines.length; i++) {
    const wasAlert = /alert\(/.test(beforeLines[i]);
    const transformed = afterLines[i];
    if (wasAlert && transformed === '') {
      continue; // remove the line entirely
    }
    outLines.push(transformed);
  }

  // Collapse 3+ consecutive blank lines to 2 (cleanup around removed lines)
  let content = outLines.join('\n');
  content = content.replace(/\n{3,}/g, '\n\n');

  fs.writeFileSync(filePath, content, 'utf8');

  const removedAlerts = beforeLines.filter(l => /alert\(/.test(l)).length;
  const remainingAlerts = (content.match(/alert\(/g) || []).length;
  console.log(`${file}: had ${removedAlerts} alert lines, ${remainingAlerts} remain after transform`);
}

console.log('\nDone. Backups written as *.bak (delete them once verified).');