# Dienstplan Sarah

Arbeitszeitplaner fürs iPhone: pro Woche den Dienst wählen, VZ‑Blöcke und Termine eintragen und sofort sehen, wie viele Stunden vom 39‑h‑Soll erreicht sind.

Die App ist eine Web‑App ohne App Store. Sie läuft offline, alle Daten bleiben auf dem iPhone.

## Auf dem iPhone installieren

1. Den Link zur App in **Safari** öffnen (nicht in Chrome oder aus einer Messenger‑Vorschau).
2. Unten auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** wählen und mit **Hinzufügen** bestätigen.
4. Die App ab jetzt immer über das Symbol auf dem Home‑Bildschirm öffnen.

Wichtig: Nur über das Home‑Bildschirm‑Symbol behält Safari die Daten dauerhaft. Wird die App nur als Safari‑Tab genutzt, kann iOS die Daten nach sieben Tagen ohne Nutzung löschen.

## Bedienung

- **Woche**: Mit den Pfeilen oder Wischen zwischen Kalenderwochen wechseln. Tagespillen Mo–Fr antippen, um den Tag zu sehen. Die feine Linie unter jeder Pille zeigt Dienst (schwarz), VZ (orange) und Termine (grün).
- **Dienst der Woche**: Zeile in der Stundenkarte antippen und F1, F2, F4, M1, S1 oder S2 wählen. Teilzeit‑ und Vertretungsdienste sind eingeklappt.
- **Tag bearbeiten**: Wochentag‑Überschrift oder Dienstkarte antippen. Dort einen anderen Dienst nur für diesen Tag setzen, Vertretung wählen oder Frei, Urlaub, Krank, Feiertag eintragen.
- **VZ und Termine**: Über „+ VZ“, „+ Termin“ oder den schwarzen Plus‑Knopf oben rechts. Eintrag antippen zum Ändern oder Löschen.
- **Termine**: Regelmäßige Termine als Serie anlegen (z. B. Dienstbesprechung montags). Ausnahmen: „Entfällt“ oder „Zusätzlich“.
- **Übersicht**: Alle Wochen mit Dienst und Stunden, dazu der Saldo über die abgeschlossenen Wochen. Saldo‑Karte antippen, um den Stand von der Stempeluhr zu übernehmen. Die App rechnet dann ab diesem Tag weiter.
- **Einstellungen**: Soll‑Stunden, Anrechnung von Urlaub und Krankheit, Pause abziehen, Stundenanzeige (6,25 h oder 6:15 h), Dienste bearbeiten, Backup.

## Backup

Einstellungen → **Backup exportieren** öffnet den Teilen‑Dialog. Die Datei zum Beispiel in „Dateien“, iCloud Drive oder per Nachricht an sich selbst sichern. **Backup importieren** spielt so eine Datei wieder ein.

## Für Tim: Betrieb und Änderungen

- Reines HTML, CSS und JavaScript, kein Build‑Schritt. Dateien: `index.html`, `css/styles.css`, `js/data.js` (Daten), `js/calc.js` (Rechenlogik), `js/ui.js` (Oberfläche), `sw.js` (Offline‑Cache), `manifest.webmanifest`, `icons/`.
- Nach jeder Änderung in `sw.js` die Zeile `const VERSION = 'v1.0.0'` hochzählen. Die App zeigt dann beim nächsten Start „Neue Version verfügbar“.
- Lokal testen: im Projektordner `python3 -m http.server 8000` starten und auf dem iPhone im selben WLAN `http://<Mac-IP>:8000` öffnen. Für den Service Worker braucht es HTTPS oder `localhost`.
- Hosting: GitHub Pages (Branch `main`, Ordner `/`). Umzug auf einen anderen Server: den Ordner kopieren, HTTPS ist Pflicht.
- Datenschicht: `js/data.js` kapselt Laden, Speichern, Export und Import. Ein späteres Backend ersetzt nur diese vier Funktionen.
- Die Scans und Bildschirmfotos im Projektordner sind per `.gitignore` ausgeschlossen und gehören nicht ins öffentliche Repo.
