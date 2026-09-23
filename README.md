# Statistik Augsburg interaktiv – Neuauflage 2026

Nachbau von <https://statistikinteraktiv.augsburg.de/Interaktiv/> mit allen Ansichten, Zahlen und Grafiken des Originals
in einem modernen, dunkelgrünen Erscheinungsbild der Stadt Augsburg.

## Starten

```bash
node serve.js
```

Danach <http://localhost:8080> im Browser öffnen (anderer Port: `node serve.js 3000`).
Die Seite ist eine reine Browser-Anwendung ohne Build-Schritt; sie lädt die Daten aus `data/` und die Grafiken aus `img/`.
Jeder statische Webserver (Apache, nginx, IIS) kann den Ordner ebenfalls direkt ausliefern.

## Funktionen (wie im Original)

- **Ansicht**: Detailansicht, Zeitreihe, Innerstädtischer Vergleich
- **Gebietseinteilung**: Gesamtstadt, Stadtbezirke, Planungsräume, Sozialregionen, Altenhilfe, Sozialmonitoring, 'Stadtteile', Stadtregionen
- **Jahr**: 1999 bis 2025
- **Themenbereiche**: Übersicht / Altersgruppen, Migrationshintergrund, Familienstand, Indikatoren, Haushalte, Bevölkerungsbewegung, Beschäftigung, Bedarfsgemeinschaften
- **Adresssuche** (Straße + Hausnummer → Teilgebiet), Karte mit Hover, Alterspyramide mit Animation, innerstädtischer Vergleich mit Karte, Legende, Vergleichstabelle (Pins), Animation über die Jahre und Balkendiagramm
- Datenbeschreibung (Definitionen und Indikatorformeln), Links zur Beschreibung der Anwendung und zum Straßenverzeichnis

## Barrierefreiheit

- **Schaltfläche „Darstellung“** im Kopfbereich: Schriftgröße (normal / groß / sehr groß), Kontrast (Standard / Hoch)
  und Kartendarstellung (nur Farbe / Farbe und Muster). Die Einstellung wird im Browser gespeichert und gilt für alle Seiten.
- **Für farbfehlsichtige Nutzer**: Die Vergleichskarte kann zusätzlich schraffiert werden; Richtung und Dichte der Schraffur
  zeigen die Klasse. Die Farbklassen stehen unter der Karte als Text, alle Werte zusätzlich in der aufklappbaren Tabelle
  „Werte aller Teilgebiete“. Linien in Zeitreihen sind zusätzlich über Strichmuster unterscheidbar.
- **Für sehbehinderte Nutzer**: Die Seite läuft ohne waagerechtes Scrollen bis 400 Prozent Vergrößerung, alle Schriftgrößen
  sind relativ, der Kopfbereich löst sich bei geringer Fensterhöhe von der Oberkante.
- [`barrierefreiheit.html`](barrierefreiheit.html) enthält die Erklärung zur Barrierefreiheit nach BITV 2.0
  samt Meldemöglichkeit für Barrieren; [`leichte-sprache.html`](leichte-sprache.html) erklärt das Angebot in Leichter Sprache.
  In der Erklärung sind Kontaktdaten und Prüfdatum als Platzhalter markiert und vor einer Veröffentlichung zu ergänzen.

## Ordner

| Ordner / Datei | Inhalt |
| --- | --- |
| `index.html`, `css/style.css`, `js/app.js` | Anwendung |
| `js/a11y.js` | Darstellungseinstellungen (Schriftgröße, Kontrast, Kartenmuster) |
| `barrierefreiheit.html`, `leichte-sprache.html` | Erklärung zur Barrierefreiheit, Leichte Sprache |
| `data/areas.json`, `data/maps.json` | Gebietslisten, Menütexte, Kartenpolygone |
| `data/select/<Typ>/<Jahr>.json` | Übersichtstabellen aller Teilgebiete eines Jahres |
| `data/detail/<Typ>/<Id>.json` | Detailansicht eines Teilgebiets, alle Jahre |
| `data/zeitreihe/<Typ>/<Id>.json` | Zeitreihen eines Teilgebiets |
| `data/vergleich/<Typ>/<Jahr>.json` | Innerstädtischer Vergleich inkl. Kartenfarben je Merkmal |
| `data/adressen.json` | Straßen, Hausnummern und Zuordnung zu den Gebietseinteilungen |
| `data/beschreibung.html` | Datenbeschreibung |
| `img/` | Logo, Karten, Alterspyramiden, Choroplethen, Legenden |
| `tools/` | Scraper (`scrape.js`), Farbauslese (`colors.js`), Wiederaufnahme (`run-all.js`) |

## Daten aktualisieren

```bash
cd tools
npm install
node run-all.js
```

`run-all.js` führt alle Schritte nacheinander aus, überspringt vorhandene Dateien und wartet, falls der Server des
Amts für Statistik nicht erreichbar ist. Einzelne Schritte: `node scrape.js <areas|select|detail|zeitreihe|vergleich|adress|adressfix|images>`.

Quelle: Amt für Statistik und Stadtforschung der Stadt Augsburg. Nutzung der Daten nur mit Quellenangabe.
