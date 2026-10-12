// Browser-Test für den Editor (Chromium via Playwright): node test/editor.e2e.mjs [screenshot-ordner]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const C = require('../src/core.js');
const file = fileURLToPath(new URL('../dist/Ostinato-Editor.html', import.meta.url));
const shots = process.argv[2];

const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, colorScheme: scheme });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + file);
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: `${shots}/editor-${scheme}.png`, fullPage: true });
  if (scheme === 'dark') { check(errors.length === 0, 'keine JS-Fehler (dunkel) ' + errors.join('; ')); await page.close(); continue; }

  check(errors.length === 0, 'keine JS-Fehler ' + errors.join('; '));
  check(await page.textContent('#scount') === '18', 'Beispiel-Pattern geladen');
  check((await page.textContent('#sref')).startsWith('E-Moll'), 'Referenz erkannt: ' + await page.textContent('#sref'));
  const code = await page.inputValue('#code');
  const def = eval('(' + code.replace(/,\s*$/, '') + ')');
  check(C.compileDef(def).notes.length === 18, 'Export-Code ist gültiges Pattern');

  // Note mit dem Stift zeichnen
  const box = await page.locator('#scroller').boundingBox();
  const st = await page.evaluate(() => ({ top: document.getElementById('scroller').scrollTop }));
  const y = box.y + (127 - 64) * 14 - st.top + 7;  // E3
  await page.mouse.click(box.x + 52 + 110 * 0.1, y);
  check(await page.textContent('#scount') === '19', 'Note gezeichnet');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Control+z');
  check(await page.textContent('#scount') === '18', 'Rückgängig');

  // Text-Eingabe im Akkordton-Modus
  await page.selectOption('#pmode', 'chord');
  await page.fill('#steps', '1! 2 3 4 3 2 (1 2 3) 4');
  await page.fill('#sref2', 'C3');
  await page.click('#sapply');
  check(await page.textContent('#scount') === '10', 'Text übernommen: ' + await page.textContent('#stepmsg'));

  // MIDI-Import: Datei im Browser erzeugen und hochladen
  const mid = C.toCode; void mid;
  const bytes = await page.evaluate(() => Array.from(window.__ostinato.writeMidi(
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.02, 4.5].map((p, i) => ({ pos: p + 4, len: 0.4, pitch: [55, 59, 62, 67][i % 4], vel: 90 })), 100, 'Strings')));
  await page.setInputFiles('#file', { name: 'strings.mid', mimeType: 'audio/midi', buffer: Buffer.from(bytes) });
  await page.waitForTimeout(200);
  check((await page.textContent('#midimsg')).includes('1 Spur'), 'MIDI gelesen: ' + await page.textContent('#midimsg'));
  check(await page.inputValue('#mstart') === '2', 'Starttakt vorgeschlagen');
  await page.click('#mimport');
  check(await page.textContent('#scount') === '10', 'MIDI importiert (2 Takte): ' + await page.textContent('#scount'));
  check((await page.textContent('#sref')).startsWith('G-Dur'), 'G-Dur erkannt: ' + await page.textContent('#sref'));

  // Vorhören startet ohne Fehler
  await page.click('#play');
  await page.waitForTimeout(400);
  check((await page.textContent('#play')).includes('Stopp'), 'Wiedergabe läuft ' + await page.textContent('#playmsg'));
  await page.click('#play');

  // Handy-Breite: kein horizontales Scrollen
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(100);
  const ow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ow <= 0, 'kein horizontales Scrollen bei 400px (' + ow + ')');
  if (shots) await page.screenshot({ path: `${shots}/editor-phone.png`, fullPage: false });
  check(errors.length === 0, 'keine JS-Fehler am Ende ' + errors.join('; '));
  await page.close();
}
await browser.close();
if (fails.length) { console.log(fails.length + ' Fehler'); process.exit(1); }
console.log('Editor-Test bestanden');
