# Pool Turnering 🎱

En gratis app til pool-turneringer – fra fredagsturneringen med vennerne til klubaftenen.
Ingen login, ingen server: alt gemmes på telefonen, og appen virker også uden internet.

*A free pool tournament app. Danish and English. No sign-up, works offline.*

## Hvad kan den?

- **Fem spilformer**
  - **Alle mod alle** (én eller to gange) med valgfrit slutspil (top 2/4/8)
  - **Gruppespil** med 2–8 grupper, hvor de bedste fra hver gruppe går i slutspil. Første runde i slutspillet undgår så vidt muligt kampe mellem spillere fra samme gruppe.
  - **Schweizer system** – et fast antal runder, hvor man møder spillere med samme antal sejre og aldrig den samme to gange
  - **Knockout** med korrekt seedning og fri runde ("bye") til de bedste, når antallet ikke går op
  - **Dobbelt knockout**: man er først ude efter to nederlag; taberside med krydsning, grand finale og valgfri omkamp
  - Antallet af kampe vises, før man starter.
- **Live scoring**: tryk på vinderen af hver frame. Appen viser, hvem der breaker (på skift eller vinderen breaker), kan fortryde og fordeler kampene på flere borde.
- **"Næste kamp"**: foreslår kampe med spillere, der ikke er i gang, og som har ventet længst.
- **Stilling** med point, frame-difference, indbyrdes opgør, form og alle-mod-alle-matrix. I schweizer system afgøres pointlighed af Buchholz.
- **Statistik** pr. turnering (sejr %, frame %, sejrsstimer, break & runs, største sejr) og en **samlet spillerrangliste** på tværs af alle turneringer.
- **Live-deling** (når appen åbnes via Claude-linket): alle jeres telefoner ser den samme turnering, og resultater dukker op hos alle med det samme. Telefoner, der scorer hver sin kamp samtidig, overskriver ikke hinanden. Venner med kun læseadgang kan følge med.
- **Deling**: et flot resultatbillede (vinder, stilling og slutspil), stillingen som tekst til gruppechatten, eller hele turneringen som en kode/et link, som andre kan importere.
- **Kugleregnskab**: efter hver frame vælges, hvor mange kugler taberen havde tilbage (sorten for tidligt = alle). Kugle-differencen afgør ved lige point og frames.
- **Walkover og spillere, der trækker sig**: resterende kampe går til modstanderne; spillede kampe står ved magt, og det kan fortrydes.
- **Indbyrdes opgør** mellem to spillere på tværs af alle turneringer.
- **Telefon og computer**: på en pc får appen sidemenu, flere kolonner og et liggende poolbord. Tastatur under en kamp: ← / → frame, Backspace fortryd, R resultat, 0–7 kugler.
- Kampur, lyd ved frames (kan slås fra), fortryd ved sletning og skærmlæser-understøttelse.
- **Backup** af alle turneringer som kode eller fil.
- Lyst/mørkt tema, dansk/engelsk, og den kan installeres på hjemmeskærmen (PWA).

## Kør den lokalt

Der er intet build-trin. Server mappen med en vilkårlig webserver:

```sh
npm start          # python3 -m http.server 8080
# åbn http://localhost:8080
```

## Tests

```sh
npm test           # node --test, ingen afhængigheder
```

Testene dækker kampprogrammer, seedning, schweizer-parring, stilling og tiebreak (inkl. kugle-difference),
live scoring, walkover og spillere der trækker sig, indbyrdes opgør, live-delingens sammenfletning af
samtidige ændringer og konvertering af turneringer fra den første version af appen.

## Læg den online (GitHub Pages)

1. Gå til **Settings → Pages** på repoet, og vælg **Source: GitHub Actions**.
2. Merge til `main`. Workflowen `.github/workflows/pages.yml` kører testene og udgiver appen.
3. Appen ligger derefter på `https://<brugernavn>.github.io/<repo>/`.

## Struktur

| Fil | Indhold |
| --- | --- |
| `src/logic.js` | Al turneringslogik (rene funktioner, testet) |
| `src/app.js` | Skærme, navigation og live scoring |
| `src/store.js` | Lagring i `localStorage` og konvertering af gamle data |
| `src/share.js` | Turneringskoder (komprimeret JSON) og tekst til deling |
| `src/live.js` | Live-deling via Claude-artefaktets delte database |
| `src/card.js` | Resultatbilledet (tegnes på et canvas) |
| `src/i18n.js` | Tekster på dansk og engelsk |
| `styles.css` | Designet: UI-kittet fra Claude Design (afsnit 1–20) + appens layout |
| `design/pool-ui-kit.css` | Det originale UI-kit, uændret, som reference |
| `sw.js`, `manifest.webmanifest` | Offline-understøttelse og installation |
