# Pool-turnering 🎱

En lille app til at holde styr på en pool-/billardturnering mellem venner.

## Sådan bruges den

Åbn `index.html` i en browser (virker fint på mobilen). Der er intet at installere.

1. **Opsætning** – skriv spillernes navne, og vælg regler (race to, point for sejr, slutspil).
2. **Kampe** – appen laver et kampprogram, hvor alle møder alle én gang. Med 7 spillere bliver det
   21 kampe fordelt på 7 runder, og i hver runde sidder én spiller over. Tryk på en kamp for at indtaste resultatet.
3. **Stilling** – tabellen opdateres automatisk. Ved pointlighed afgøres placeringen af
   frame-difference, derefter vundne frames og til sidst indbyrdes opgør. Nederst er en
   alle-mod-alle-oversigt.
4. **Slutspil** – top 4 spiller semifinaler (1 mod 4, 2 mod 3), finale og eventuelt bronzekamp.
   Man kan også vælge kun finale (top 2) eller slet intet slutspil.

Data gemmes i browseren på den enhed, I bruger. Under *Opsætning* kan I eksportere og importere en
backup-fil, hvis turneringen skal flyttes til en anden telefon.

## Læg den online (valgfrit)

Slå GitHub Pages til på repoet (Settings → Pages → deploy fra branchen), så kan alle åbne appen via et link.
Bemærk, at resultaterne stadig kun gemmes på den telefon, de bliver indtastet på – udnævn én "dommer".
