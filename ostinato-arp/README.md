# Ostinato Arp – Pattern-Arpeggiator für Logic Pro

Ein Arpeggiator, der **deine eigenen Noten-Motive** spielt und sie bei jedem Akkordwechsel automatisch mitnimmt.
Gedacht für Film-Ostinati im Stil von Zimmer: E-F-E-F-Pendel, 3-3-2-Drives, Triolen-Arpeggien.
Es wird zuverlässig mit Streichern, Bläsern und Holzbläsern abgestimmt, inklusive Velocity, CC-Dynamik, Keyswitches und Tonumfang.

| Datei | Wofür |
|---|---|
| `dist/OstinatoArp-Logic.js` | Das Plugin-Skript für Logics **Scripter** (MIDI FX) |
| `dist/Ostinato-Editor.html` | Browser-Editor: Piano-Roll, Velocity malen, MIDI-File-Import, Vorhören, Export |
| `src/` | Quellcode (`core.js` wird von Plugin und Editor gemeinsam genutzt) |
| `test/` | Automatische Tests (Logic-Scripter-Nachbildung + Browser-Test) |

Notennamen folgen überall der **Logic-Konvention: C3 = MIDI 60**.

---

## 1. In Logic installieren (einmalig, 2 Minuten)

1. Software-Instrument-Spur anlegen (z.B. Streicher-Library).
2. Im Kanalzug auf **MIDI FX › Scripter** klicken.
3. Im Scripter-Fenster **Open Script in Editor** wählen, den vorhandenen Text komplett löschen.
4. Inhalt von `dist/OstinatoArp-Logic.js` einfügen und **Run Script** drücken.
5. Oben im Plugin-Fenster **Speichern als …** → z.B. „Ostinato Arp“. Ab jetzt ist es in jedem Projekt über die Scripter-Presets verfügbar.

Das Skript und ein eingespieltes Pattern werden mit dem Projekt gespeichert.

## 2. Schnellstart

1. Im Plugin **Pattern** wählen, z.B. „Halbton-Pendel 16tel“.
2. Akkord auf dem Keyboard halten (Em). Es spielt E-F-E-F in 16teln, auch bei gestopptem Transport.
3. Akkord wechseln (Am). Das Motiv springt auf A-B♭-A-B♭.
4. **Akkordwechsel** auf „Nächster Schlag“ oder „Nächster Takt“ stellen, wenn Wechsel exakt auf der Zählzeit passieren sollen.

Die Zählzeit geht nicht verloren, wenn du den Akkord etwas zu spät greifst: Innerhalb der **Spät-Toleranz** (Standard 60 ms) wird die gerade gespielte Note sofort auf den neuen Akkord umgestellt.
Zwischen zwei Akkorden darfst du die Hände kurz heben (**Akkord-Haltezeit**, Standard 150 ms), ohne dass das Pattern abbricht.

## 3. Eigene Motive – drei Wege

### a) Einspielen direkt in Logic (Learn)

1. **Aufnahme** auf „● Aufnahme bereit“ stellen.
2. Motiv einspielen, z.B. E3 F3 E3 F3 … Deine Anschlagstärke wird übernommen.
   - Läuft der Transport, beginnt die Aufnahme am Taktanfang der ersten Note.
   - Steht der Transport, beginnt sie mit der ersten Note (Tempo = Projekttempo).
3. Nach **Aufnahme-Länge** Takten wird automatisch quantisiert (Standard: „Auto“ erkennt gerade Noten und Triolen) und gespeichert. Das Pattern „● Eigenes (Learn)“ ist aktiv.
4. Die Konsole (Scripter-Fenster unten) zeigt, welcher Grundton erkannt wurde, z.B. „E-Moll, Referenz E3“. Falls falsch, stellst du **Learn: Grundton / Tongeschlecht** ein.

**MIDI-File in Logic:** MIDI-Datei auf die Spur ziehen, im Piano-Roll von Logic bearbeiten (Oktave, Noten, Velocity), dann **Aufnahme bereit** und die Region abspielen. Das Plugin lernt sie mit.

### b) Im Browser-Editor (Piano-Roll, MIDI-Files)

`dist/Ostinato-Editor.html` im Browser öffnen (Doppelklick genügt).

- **Zeichnen:** Klick setzt eine Note, Ziehen bestimmt die Länge. Rechtsklick löscht. Mit den Pfeiltasten verschiebst du Noten, mit Shift um eine Oktave.
- **Velocity** unten mit der Maus malen, oder Crescendo/Decrescendo/Humanize auf die Auswahl anwenden.
- **Raster** inklusive Triolen (1/8T, 1/16T).
- **MIDI-File importieren:** Spur wählen, Starttakt, Anzahl Takte und Oktave einstellen. Grundton und Tongeschlecht werden automatisch erkannt.
- **Vorhören** über eine Akkordfolge („Em C G D“) mit derselben Logik wie im Plugin.
- **Einspielen** per MIDI-Keyboard (Chrome/Edge) mit Vorzähler.
- **Code kopieren** und in Logic oben im Skript bei `USER_PATTERNS = [` einfügen, dann **Run Script**. Das Pattern erscheint mit ★ im Menü.

### c) Als Text eingeben

Oben im Skript (oder im Editor-Feld „Als Text eingeben“):

```js
var USER_PATTERNS = [
  { name: "Mein Ostinato", mode: "interval", ref: "E2", grid: "1/16",
    steps: "E2! F2 E2 F2 E2 F2 E2 F2 | E2! F2 E2 F2 (E2 F2 E2) F2" },
  { name: "Arp Triolen",  mode: "chord", grid: "1/8T", steps: "1! 2 3 4 3 2" },
];
```

| Zeichen | Bedeutung |
|---|---|
| `E2 F#3 Bb1` | Notennamen (C3 = 60) |
| `0 1 7 12 -5` | Intervall-Modus: Halbtöne über dem Grundton |
| `1 b2 3 5 8` | Skala-Modus: Stufen (1 = Grundton) |
| `1 2 3 4` | Akkordton-Modus: 1 = tiefster Akkordton (4 = Oktave bei Dreiklang) |
| `.` | Pause |
| `-` | vorige Note um einen Schritt verlängern |
| `(a b c)` | Gruppe teilt einen Schritt, z.B. Triole |
| `!` `?` | Akzent · leise (Ghost) |
| `'` `~` | staccato · legato |
| `@90` | Velocity 90 |
| `5+` `1-` | Oktave höher · tiefer |
| `\|` | Taktstrich (nur Optik) |

**Pattern als Code in Konsole** gibt jedes aktive Pattern (auch die mitgelieferten und das eingespielte) als einfügbaren Code aus. So kannst du es kopieren und abwandeln.

## 4. Wie das Motiv dem Akkord folgt (Modus)

| Modus | Verhalten | Gut für |
|---|---|---|
| **Intervall** | Motiv wird transponiert: E-F über Em → A-B♭ über Am | Zimmer-Ostinati, Bass-Pedale, chromatische Figuren |
| **Skala** | Stufen bleiben Stufen der Akkord-Skala: Moll-Figur passt sich an Dur an | melodische Figuren |
| **Akkordtöne** | 1. 2. 3. Akkordton des gespielten Voicings | klassische Arpeggien, Voicing bestimmt die Lage |

**Lage**: „Wie Pattern“ hält das Motiv in seiner Originallage (z.B. aus einem MIDI-File), mit kleinsten Sprüngen zwischen den Akkorden.
„Wie gespielt“ setzt es in die Lage deiner linken Hand. „Instrumentbereich“ sucht automatisch die Oktave, die am besten zum gewählten Instrument passt.
Die Einstellung **Auto** wählt sinnvoll je nach Pattern.

## 5. Streicher, Bläser, Holzbläser

- **Dynamik über CC statt Velocity:** Die meisten Orchester-Libraries (Spitfire, CSS, BBCSO, Berlin) steuern die Lautstärke über **CC1** (Modwheel) und den Anschlag über die Velocity. Standard: CC A reicht dein Modwheel durch.
  CC B kann z.B. **CC11 Expression** als **Crescendo** über 4 Takte fahren, oder als Swell/LFO.
- **Frei zuordnen:** Jeder Eingangs-CC lässt sich auf jeden Ausgangs-CC legen, mit Min/Max-Skalierung. Beispiel: CC1 → CC11, oder Velocity → CC1 („Note-Velocity“).
- **Velocity:** Aus dem Pattern (eingespielt oder gezeichnet), aus deinem Anschlag, beides multipliziert, oder fest. Dazu Min/Max-Bereich, Akzent-Stärke und Humanize.
- **Artikulation automatisch:** Kurze Noten (≤ „Kurz bis Länge“) senden die Kurz-Artikulation (Spiccato/Staccato), lange die Lang-Artikulation, Akzente optional eine eigene.
  Ausgabe als Keyswitch-Note, CC-Wert (z.B. UACC auf CC32) oder Programmwechsel. Gesendet wird nur bei einem Wechsel.
- **Tonumfang:** Violinen, Bratschen, Celli, Kontrabässe, Horn, Trompete, Posaune, Tuba, Flöte, Piccolo, Oboe, Klarinette, Fagott, Harfe, Klavier oder ein eigener Bereich. Töne außerhalb werden oktaviert.
- **Legato-Libraries:** Mit Notenlänge ≥ 100 % und „Legato-Überlappung“ (z.B. 20 ms) überlappen die Noten, damit die Legato-Übergänge der Library greifen.

Tipp: Für ein Ensemble mehrere Spuren (Violinen, Celli, Kontrabässe) mit je eigenem Ostinato Arp anlegen und gemeinsam aufnehmen (Track-Stack oder mehrere Spuren aufnahmebereit).

## 6. Alle Regler

| Gruppe | Regler |
|---|---|
| Pattern | Pattern, Modus, Akkordtöne aus, Lage, Oktave, Transponieren, Richtung (vorwärts/rückwärts/Ping-Pong/gespiegelt), Oktav-Dopplung |
| Rhythmus | Tempo-Faktor (½×, 1×, 2×), Swing (1/16 oder 1/8), Notenlänge, Legato-Überlappung, Wahrscheinlichkeit, Pattern-Start (taktsynchron/Neustart), Akkordwechsel (sofort/1/16/Schlag/Takt), Spät-Toleranz, Akkord-Haltezeit, Latch |
| Velocity | Quelle, fester Wert, Min, Max, Akzent-Stärke, Humanize Velocity, Humanize Timing |
| Dynamik / CC | 2 Spuren mit Ziel-CC, Quelle (durchreichen, Note-Velocity, Akkord-Anschlag, fest, Crescendo, Decrescendo, Swell, LFO), Eingangs-CC, Min, Max, Dauer · Kurven-Neustart · Andere CCs durchlassen |
| Artikulation | Modus, Ausgabeart, CC-Nummer, Werte für Lang/Kurz/Akzent, Kurz-Schwelle |
| Instrument | Instrumentbereich, eigener Bereich, Ausgabe-Kanal, Akkord mitspielen, Pattern-Wahl per Taste (12 Tasten wählen die ersten 12 Patterns) |
| Harmonie | Grundton-Erkennung (auto / tiefste Note), Einzelton gilt als Moll/Dur, Moll-Skala, Dur-Skala, Akkorde in Konsole |
| Aufnahme | Aufnahme, Start, Länge, Quantisierung, Learn-Modus, Learn-Grundton, Learn-Tongeschlecht, Pattern als Code ausgeben |

## 7. Grenzen (ehrlich)

- Logics Scripter kann **keine Dateien lesen** und hat **keine eigene Piano-Roll**. Darum gibt es den Browser-Editor und den Learn-Weg über eine MIDI-Region.
- Das eingespielte Learn-Pattern speichert bis **96 Noten / 32 Beats** im Projekt. Längere Patterns als Code einfügen, dort gibt es keine Grenze.
- Bei gestopptem Transport läuft das Plugin frei (zum Ausprobieren). Das Timing ist dort etwas weniger exakt als bei laufendem Transport.
- Das eingespielte Pattern liegt in rund 190 unsichtbaren Plugin-Parametern, damit es mit dem Projekt gespeichert wird. Apple dokumentiert keine Obergrenze für die Parameterzahl im Scripter. Sollte Logic hier Probleme machen, lässt sich `MAX_NOTES` im Skript verkleinern.
- Getestet wurde gegen eine **Nachbildung** der Scripter-Umgebung (siehe `test/`), noch nicht in einem echten Logic. Bitte Rückmeldung, falls etwas anders reagiert.

## Entwicklung

```bash
npm test                      # baut dist/ und testet Kern + Plugin
node test/editor.e2e.mjs      # Browser-Test des Editors (benötigt Playwright/Chromium)
```

Später für Cubase und andere DAWs: `src/core.js` (Akkord-Erkennung, Parser, Umsetzung) ist host-unabhängig und kann in ein VST3/AU-Plugin übernommen werden.
