# TravianScripts

Skrypty Tampermonkey do [Travian Legends](https://www.travian.com) autorstwa PeterPage: dwa rozwijane tu forki skryptów adipiciu (Wave Builder i Resource Bar+, patrz [Licencja i podziękowania](#licencja-i-podziękowania)) oraz dwa własne skrypty. Wszystko pisane i testowane na świecie `cw.x2.international.travian.com`, język interfejsu: polski.

| Skrypt | Do czego | Instalacja |
|---|---|---|
| [Travian Wave Builder](#travian-wave-builder) | budowanie fal ataków, presety i kolejki fal | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianWaveBuilder/TravianWaveBuilder.user.js) |
| [Travian Resource Bar+](#travian-resource-bar) | czasy surowców, menu, tabele prędkości, analizator bitwy | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianResourceBarPlus/TravianResourceBarPlus.user.js) |
| [Travian Troop Totals](#travian-troop-totals) | suma zboża, ataku i obrony oddziałów w drodze i stacjonujących | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianCropCounter/incoming-crop.user.js) |
| [Travian Region News](#travian-region-news) | nazwa regionu przy wydarzeniach sojuszu | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianNewsAddon/travian-region-news.user.js) |

## Instalacja i aktualizacje

1. Zainstaluj Tampermonkey (lub Violentmonkey).
2. Kliknij „zainstaluj” przy wybranym skrypcie w tabeli wyżej. Tampermonkey pokaże ekran instalacji, wystarczy potwierdzić.
3. **Jeśli masz oryginalne skrypty adipiciu albo starsze wersje stąd, usuń je**, żeby dwie wersje nie działały naraz.

Wave Builder, Resource Bar+ i Troop Totals **aktualizują się z tego repozytorium**: Tampermonkey sprawdza plik na gałęzi `main` i zaproponuje nową wersję, gdy numer `@version` jest wyższy. Domyślnie sprawdza raz na dobę, a ręcznie możesz wymusić sprawdzenie w panelu Tampermonkey. Region News nie ma automatycznych aktualizacji (celowo nie łączy się z niczym poza grą), więc nową wersję instalujesz ponownie z linku.

## Travian Wave Builder

Fork skryptu *Travian wave builder* 2.11 (adipiciu). Działa na stronie *Miejsce zbiórki → Wyślij jednostki*.

- **Presety.** Zapisujesz jednostki, typ ataku i liczbę fal pod nazwą. Wybór presetu wypełnia formularz, a obok widać ikony jednostek.
- **Presety-kolejki.** Układasz fale ręcznie (np. fejk: pierwsza fala inna niż reszta, jedna w środku z koniem), klikasz „Zapisz kolejkę”. Potem wybierasz kolejkę, wpisujesz cel i jedno „+” dodaje wszystkie fale po kolei. Błąd przy którejś fali zatrzymuje całą kolejkę.
- **Podsumowanie wojska** pod przyciskiem „Wyślij”: ile dodasz, ile jest już w tabeli, ile jest w osadzie i ile zostanie. Brak wojska zaznaczony na czerwono.
- **Eksport i import presetów.** „Eksport” daje tekst z wybranym presetem (albo wszystkimi, gdy żaden nie jest wybrany), który można wysłać innym, np. na Discordzie. „Import” wczytuje taki tekst. Cały sojusz może mieć te same kolejki fejków bez układania ich ręcznie.
- Większe przyciski `+ − ↑ ↓`.
- Interfejs po polsku (gdy gra jest po polsku) albo po angielsku.

Presety zapisują się w `localStorage` przeglądarki, osobno dla każdego serwera.

## Travian Resource Bar+

Fork skryptu *Travian Resource bar plus* 2.26.16 (adipiciu). Cała pierwotna funkcjonalność zostaje (przegląd osad, linki, notatki, wyszukiwanie sąsiadów i oaz, podsumowanie dla NPC). Zmieniony jest wygląd i kilka miejsc:

- **Czasy surowców** w jasnych zakładkach bezpośrednio pod polami surowców w górnym pasku (czas do pełnego magazynu, dla ujemnego zboża czas do zera).
- **Menu** (przegląd, ustawienia, notatki, M+, tryb dla oczu) jako okrągłe przyciski obok logo, przewijające się razem z paskiem.
- **Wspólny, pergaminowy wygląd** okien: ustawienia, przegląd, notatki, linki, dymki.
- **Analizator bitwy (ANALIZA)** pod tabelą Statystyki w raporcie: ranni w szpitalu, zrabowane surowce i udźwig, bilans surowców, wymiana strat. Jeśli gra pokazuje Statystyki, straty są brane z nich (obejmują też ukryte wojska). Gdy część wojsk obrońcy jest ukryta („?”) i Statystyk nie ma, wynik obrońcy jest oznaczony jako niepełny. Linki do zewnętrznych stron zniknęły z analizatora.
- **Tabele prędkości** (miejsce zbiórki, mapa, dymki): czytelniejsze, a artefakt prędkości przełączasz jednym kliknięciem przy tabeli. Wybór jest zapamiętany.
- **Siła wojska** w miejscu zbiórki (atak, obrona, utrzymanie, udźwig) w tym samym stylu.

## Travian Troop Totals

Własny skrypt. Na stronie miejsca zbiórki i w statystykach oddziałów sumuje **zboże, atak i obronę** oddziałów przychodzących i stacjonujących, ze wszystkich stron listy. Wartości jednostek bierze z własnej tabeli w pliku (osobna dla serwerów Community Week). Siła bohatera zależy od bohatera, więc liczone jest dla niego tylko utrzymanie.

## Travian Region News

Własny skrypt, działa tylko na `cw.x2.international.travian.com`. Przy wydarzeniach sojuszu („założył(a) nową osadę”, „podbił(a) osadę”, „utracił(a) osadę”) dopisuje nazwę regionu przy współrzędnych. Dane pobiera same-origin z gry, bez zewnętrznych usług. Szczegóły, limity zapytań, cache i prywatność: [TravianNewsAddon/README.md](TravianNewsAddon/README.md). Są tam też testy (`npm test`, `npm run check`).

## Uwagi

- Skrypty czytają i przekształcają wyświetlane strony. **Wave Builder wysyła kilka ataków jednym kliknięciem** (te same żądania co przy ręcznym wysyłaniu, w odstępach podanych w polu „Odstęp”). Zanim go użyjesz, sprawdź w grze „Zasady gry” swojego świata, czy takie narzędzia są dozwolone. Używasz na własne ryzyko.
- Zmiany w forkach były sprawdzane składniowo (`node --check`) i ręcznie w grze. Niektóre elementy wyglądu mogą wymagać poprawek na innych rozdzielczościach i serwerach. Zgłaszaj w [Issues](https://github.com/PeterPage2115/TravianScripts/issues).
- Grafiki z gry pochodzą z Traviana (Travian Games GmbH). Skrypty nie dołączają żadnych własnych grafik.

## Rozwój

Każda zmiana w skrypcie musi podnieść jego `@version`, inaczej Tampermonkey nie zaproponuje aktualizacji. Pilnuje tego hook w `.githooks/pre-commit`. Po sklonowaniu repo włącz go raz:

```bash
git config core.hooksPath .githooks
```

Commit ze zmienionym `*.user.js` bez wyższej wersji zostanie odrzucony. Gdy zmiana celowo nie ma trafić do użytkowników, użyj `git commit --no-verify`.

## Licencja i podziękowania

Całe repozytorium jest na licencji **GPL-3.0-or-later** (plik [LICENSE](LICENSE)).

Travian Wave Builder i Travian Resource Bar+ są **forkami skryptów adipiciu** z repozytorium [adipiciu/Travian-scripts](https://github.com/adipiciu/Travian-scripts), które bazują na pracy **Serj_LV**. Oryginały są na licencji GPL v3, a ich autorzy są wymienieni w nagłówkach skryptów (`@author`). Wszystkie zmiany są w historii commitów: pierwszy commit to nietknięty kod z upstreamu, kolejne to zmiany w forku, więc `git diff` względem niego pokazuje dokładnie, co zostało zmienione.
