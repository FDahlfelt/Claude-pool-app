# Sitefinder – find virksomheder uden hjemmeside

Et kort, der viser virksomheder i nærheden uden en registreret hjemmeside (inspireret af sitefliper.com/find).
Siden viser kun oplysninger – der kan ikke bygges hjemmesider herfra.

## Funktioner
- Kort (Leaflet + OpenStreetMap) med farvede markører: **rød** = ingen hjemmeside, **lilla** = kun social profil, **grøn** = har hjemmeside
- Søg efter by/adresse eller brug "Nær mig" (din placering)
- "Søg i dette område", når du flytter kortet
- Filtre: branche, hjemmesidestatus, navn, har telefon/e-mail, kun gemte
- Tællere: uden hjemmeside / kun social profil / i alt på kortet
- Liste sorteret efter afstand og et detaljepanel med adresse, telefon, e-mail, åbningstider, sociale medier og CVR
- Genveje: kontrollér hjemmeside på Google, Google Maps, rutevejledning, CVR-søgning
- Gem virksomheder (gemmes lokalt i browseren), kopiér oplysninger, eksportér til CSV

## Data
Virksomhedsdata hentes live fra OpenStreetMap via Overpass API, og adressesøgning bruger Nominatim. Der kræves ingen API-nøgle.
"Uden registreret hjemmeside" betyder, at OpenStreetMap ikke har en hjemmeside registreret – kontrollér altid selv.

## Kør lokalt
Ren statisk side – ingen build:

```sh
python3 -m http.server 8000
# åbn http://localhost:8000
```

Kan hostes gratis på fx GitHub Pages, Netlify eller Vercel.
