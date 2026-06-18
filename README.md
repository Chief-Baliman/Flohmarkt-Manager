# ChiefCards Flohmarkt Manager v1.1

Statische GitHub-Pages-App mit Firebase Authentication und Firebase Realtime Database.

## Upload zu GitHub Pages

1. ZIP entpacken.
2. Alle Dateien in ein GitHub-Repository hochladen.
3. In GitHub unter Settings > Pages als Source den Branch auswählen.
4. Firebase Rules aus ChatGPT in Realtime Database > Regeln einfügen.
5. App öffnen und mit `chiefbaliman@gmail.com` plus Passwort einloggen.

## Datenstruktur

Die App nutzt ausschließlich diesen Root-Knoten:

```text
flohmarktManager
```

Bestehende Bereiche wie `queueTracker`, `quiztScoreboard`, `gradingTracker`, `offerTracker`, `pullCounter` und weitere werden nicht beschrieben.

## Enthalten

- Firebase Login
- Realtime-Synchronisierung für mehrere Geräte
- Lokaler Cache
- PWA mit Offline-App-Shell
- Produktverwaltung
- Preisliste
- Flohmarkt-Verkaufsmodus
- Barcode-Scan per Browser BarcodeDetector
- Manuelle Barcode-Eingabe
- Fuzzy-Suche
- Verkaufsprotokoll
- Bestandsübersicht
- CSV Import und Export
- JSON Backup und Import

## Hinweis zum Barcode-Scan

Der Kamera-Scan nutzt die moderne Browser-API `BarcodeDetector`. Sie funktioniert besonders gut in Chrome auf Android. Auf iOS kann die Unterstützung je nach Safari-Version fehlen. Dafür gibt es die manuelle Barcode-Eingabe und die schnelle Produktsuche.

## Shopify

Version 1.1 schreibt keine Bestände zu Shopify zurück. Die Architektur ist vorbereitet, um später Shopify-Daten als Quelle zu importieren oder Produkte zu verknüpfen.
