# Pool Turnering 🎱

En gratis app til pool-turneringer – fra fredagsturneringen med vennerne til klubaftenen.
Ingen login, ingen server: alt gemmes på telefonen, og appen virker også uden internet.

*A free pool tournament app. Danish and English. No sign-up, works offline.*

## Hvad kan den?

- **Fire spilformer**
  - **Alle mod alle** (én eller to gange) med valgfrit slutspil (top 2/4/8)
  - **Gruppespil** med 2–8 grupper, hvor de bedste fra hver gruppe går i slutspil. Første runde i slutspillet undgår så vidt muligt kampe mellem spillere fra samme gruppe.
  - **Schweizer system** – et fast antal runder, hvor man møder spillere med samme antal sejre og aldrig den samme to gange
  - **Knockout** med korrekt seedning og fri runde ("bye") til de bedste, når antallet ikke går op
  - Antallet af kampe vises, før man starter.
- **Live scoring**: tryk på vinderen af hver frame. Appen viser, hvem der breaker (på skift eller vinderen breaker), kan fortryde og fordeler kampene på flere borde.
- **"Næste kamp"**: foreslår kampe med spillere, der ikke er i gang, og som har ventet længst.
- **Stilling** med point, frame-difference, indbyrdes opgør, form og alle-mod-alle-matrix. I schweizer system afgøres pointlighed af Buchholz.
- **Statistik** pr. turnering (sejr %, frame %, sejrsstimer, break & runs, største sejr) og en **samlet spillerrangliste** på tværs af alle turneringer.
- **Deling**: stillingen som tekst til gruppechatten, eller hele turneringen som en kode/et link, som andre kan importere.
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

Testene dækker kampprogrammer, seedning, schweizer-parring, stilling og tiebreak, live scoring og
konvertering af turneringer fra den første version af appen.

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
| `src/i18n.js` | Tekster på dansk og engelsk |
| `styles.css` | Designet: UI-kittet fra Claude Design (afsnit 1–20) + appens layout |
| `design/pool-ui-kit.css` | Det originale UI-kit, uændret, som reference |
| `sw.js`, `manifest.webmanifest` | Offline-understøttelse og installation |
