// Builds ui.html from src/ui.html by inlining pdf-lib, so the plugin works offline
// and can declare "no network access" in manifest.json.
import { readFileSync, writeFileSync } from 'node:fs';

const lib = readFileSync('node_modules/pdf-lib/dist/pdf-lib.min.js', 'utf8')
  .replace(/<\/script/gi, '<\\/script'); // never close the inline <script> early
const src = readFileSync('src/ui.html', 'utf8');

if (!src.includes('/*PDF_LIB*/')) throw new Error('Placeholder /*PDF_LIB*/ not found in src/ui.html');
writeFileSync('ui.html', src.replace('/*PDF_LIB*/', () => lib));
console.log(`ui.html written (${(Buffer.byteLength(lib) / 1024).toFixed(0)} KB of pdf-lib inlined)`);
