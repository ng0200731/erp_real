// Script: Fill blank profile images with dummy images
// Usage: node fill-blank-images.js

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DB_PATH = join(__dirname, 'data', 'tasks.db');
const IMAGE_DIR = join(__dirname, 'dummy image');

async function main() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Get all dummy images
  const imageFiles = readdirSync(IMAGE_DIR)
    .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
    .map(f => join(IMAGE_DIR, f));

  console.log(`Found ${imageFiles.length} dummy images`);

  // Get all quotations without profile images
  const blankQuotations = await db.all(
    `SELECT id, quotationSeq, outsourcingSeq, type FROM quotations WHERE profileImageBlob IS NULL ORDER BY id`
  );

  console.log(`Found ${blankQuotations.length} quotations without images`);

  if (blankQuotations.length === 0) {
    console.log('All quotations already have images. Nothing to do.');
    await db.close();
    return;
  }

  const stmt = await db.prepare(
    `UPDATE quotations SET profileImageBlob = ?, profileImageMime = ? WHERE id = ?`
  );

  let assigned = 0;
  for (let i = 0; i < blankQuotations.length; i++) {
    const q = blankQuotations[i];
    const imgPath = imageFiles[i % imageFiles.length];
    const ext = extname(imgPath).toLowerCase();

    let mime = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
    else if (ext === '.gif') mime = 'image/gif';
    else if (ext === '.webp') mime = 'image/webp';

    const imageBuffer = readFileSync(imgPath);
    const label = q.type === 'other'
      ? ('OS' + String(q.outsourcingSeq || q.id).padStart(6, '0'))
      : ('IP' + String(q.quotationSeq || q.id).padStart(6, '0'));

    await stmt.run(imageBuffer, mime, q.id);
    assigned++;
    console.log(`  [${assigned}/${blankQuotations.length}] ${label} <- ${imgPath.split(/[/\\]/).pop()} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
  }

  await stmt.finalize();
  await db.close();

  console.log(`\nDone! Assigned ${assigned} images.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
