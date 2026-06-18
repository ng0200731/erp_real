import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0;
let fail = 0;

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL - ${msg}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

export function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL - ${msg}`);
  }
}

export function summary(name) {
  console.log(`\n${name}: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

export function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
  return path.join(dir, 'test.db');
}