// Baut die auslieferbaren Dateien:
//   dist/OstinatoArp-Logic.js   -> in Logic: MIDI FX > Scripter > Script-Editor, alles einfügen, "Run Script"
//   dist/Ostinato-Editor.html   -> im Browser öffnen (Piano-Roll, MIDI-Import, Export)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\nif \(typeof module[^\n]*\n?/, '\n');
const core = strip(read('./src/core.js'));
const patterns = strip(read('./src/patterns.js'));

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });

const script = read('./src/scripter.js')
  .replace('/*__CORE__*/', () => core)
  .replace('/*__PATTERNS__*/', () => patterns);
writeFileSync(new URL('./dist/OstinatoArp-Logic.js', import.meta.url), script);
console.log('dist/OstinatoArp-Logic.js', script.length, 'Zeichen');

if (existsSync(new URL('./src/editor.html', import.meta.url))) {
  const html = read('./src/editor.html')
    .replace('/*__CORE__*/', () => core)
    .replace('/*__PATTERNS__*/', () => patterns)
    .replace('/*__SCRIPT__*/', () => 'var LOGIC_SCRIPT = ' + JSON.stringify(script).replace(/<\//g, '<\\/') + ';');
  // Lokale Datei: vollständiges Dokument. Mit --fragment <pfad> zusätzlich die Version ohne Gerüst (für das Web-Artifact).
  const full = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
  writeFileSync(new URL('./dist/Ostinato-Editor.html', import.meta.url), full);
  console.log('dist/Ostinato-Editor.html', full.length, 'Zeichen');
  const i = process.argv.indexOf('--fragment');
  if (i > 0 && process.argv[i + 1]) writeFileSync(process.argv[i + 1], html);
}
