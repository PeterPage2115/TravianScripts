# TravianScripts

Skrypty Tampermonkey do [Travian Legends](https://www.travian.com): dwa przerobione skrypty [adipiciu](https://github.com/adipiciu/Travian-scripts) (Wave Builder i Resource Bar Plus) oraz dwa własne. Wszystko pisane i testowane na świecie `cw.x2.international.travian.com`, język interfejsu: polski.

| Skrypt | Do czego | Plik |
|---|---|---|
| [Wave Builder (presets)](#wave-builder-presets) | budowanie fal ataków, presety i kolejki fal | `TravianWaveBuilder/TravianWaveBuilder.user.js` |
| [Resource Bar Plus (fork)](#resource-bar-plus-fork) | czasy surowców, menu, tabele prędkości, analizator bitwy | `TravianResourceBarPlus/TravianResourceBarPlus.user.js` |
| [Zboże oddziałów](#zboże-oddziałów) | suma zboża, ataku i obrony oddziałów w drodze i stacjonujących | `TravianCropCounter/incoming-crop.user.js` |
| [Region News](#region-news) | nazwa regionu przy wydarzeniach sojuszu | `TravianNewsAddon/travian-region-news.user.js` |

## Instalacja

1. Zainstaluj Tampermonkey (lub Violentmonkey).
2. Otwórz plik skryptu na GitHubie, kliknij **Raw**. Tampermonkey zaproponuje instalację. Można też wkleić zawartość pliku do nowego skryptu.
3. **Jeśli masz oryginalne skrypty adipiciu, wyłącz je**, żeby dwie wersje nie działały naraz.

Skrypty z forków mają wyłączone aktualizacje przez sieć (`@updateURL none`), więc menedżer nie nadpisze ich oryginałem. Nową wersję instalujesz ręcznie.

## Wave Builder (presets)

Fork [Travian wave builder 2.11](https://github.com/adipiciu/Travian-scripts/tree/main/TravianWaveBuilder) (wersja `2.11.1`). Działa na stronie *Miejsce zbiórki → Wyślij jednostki*.

- **Presety.** Zapisujesz jednostki, typ ataku i liczbę fal pod nazwą. Wybór presetu wypełnia formularz, a obok widać ikony jednostek.
- **Presety-kolejki.** Układasz fale ręcznie (np. fejk: pierwsza fala inna niż reszta, jedna w środku z koniem), klikasz „Zapisz kolejkę”. Potem wybierasz kolejkę, wpisujesz cel i jedno „+” dodaje wszystkie fale po kolei. Błąd przy którejś fali zatrzymuje całą kolejkę.
- **Podsumowanie wojska** pod przyciskiem „Wyślij”: ile dodasz, ile jest już w tabeli, ile jest w osadzie i ile zostanie. Brak wojska zaznaczony na czerwono.
- Większe przyciski `+ − ↑ ↓`.

Presety zapisują się w `localStorage` przeglądarki, osobno dla każdego serwera.

## Resource Bar Plus (fork)

Fork [Travian Resource bar plus 2.26.16](https://github.com/adipiciu/Travian-scripts/tree/main/TravianResourceBarPlus) (wersja `2.26.16.1`). Cała pierwotna funkcjonalność zostaje (przegląd osad, linki, notatki, wyszukiwanie sąsiadów i oaz, podsumowanie dla NPC). Zmieniony jest wygląd i kilka miejsc:

- **Czasy surowców** w jasnych zakładkach bezpośrednio pod polami surowców w górnym pasku (czas do pełnego magazynu, dla ujemnego zboża czas do zera).
- **Menu** (przegląd, ustawienia, notatki, M+, tryb dla oczu) jako okrągłe przyciski obok logo, przewijające się razem z paskiem.
- **Wspólny, pergaminowy wygląd** okien: ustawienia, przegląd, notatki, linki, dymki.
- **Analizator bitwy (ANALIZA)** pod tabelą Statystyki w raporcie: ranni w szpitalu, zrabowane surowce i udźwig, bilans surowców, wymiana strat. Jeśli gra pokazuje Statystyki, straty są brane z nich (obejmują też ukryte wojska). Gdy część wojsk obrońcy jest ukryta („?”) i Statystyk nie ma, wynik obrońcy jest oznaczony jako niepełny. Linki do zewnętrznych stron zniknęły z analizatora.
- **Tabele prędkości** (miejsce zbiórki, mapa, dymki): czytelniejsze, a artefakt prędkości przełączasz jednym kliknięciem przy tabeli. Wybór jest zapamiętany.
- **Siła wojska** w miejscu zbiórki (atak, obrona, utrzymanie, udźwig) w tym samym stylu.

## Zboże oddziałów

Własny skrypt. Na stronie miejsca zbiórki i w statystykach oddziałów sumuje **zboże, atak i obronę** oddziałów przychodzących i stacjonujących, ze wszystkich stron listy. Wartości jednostek bierze z własnej tabeli w pliku (osobna dla serwerów Community Week). Siła bohatera zależy od bohatera, więc liczone jest dla niego tylko utrzymanie.

## Region News

Własny skrypt, działa tylko na `cw.x2.international.travian.com`. Przy wydarzeniach sojuszu („założył(a) nową osadę”, „podbił(a) osadę”, „utracił(a) osadę”) dopisuje nazwę regionu przy współrzędnych. Dane pobiera same-origin z gry, bez zewnętrznych usług. Szczegóły, limity zapytań, cache i prywatność: [TravianNewsAddon/README.md](TravianNewsAddon/README.md). Są tam też testy (`npm test`, `npm run check`).

## Uwagi

- Skrypty czytają i przekształcają wyświetlane strony. Wave Builder wysyła ataki tak samo jak oryginał (te same żądania, jak przy ręcznym wysyłaniu). Sprawdź regulamin swojego świata, zanim użyjesz skryptów.
- Zmiany w forkach były sprawdzane składniowo (`node --check`) i ręcznie w grze. Niektóre elementy wyglądu mogą wymagać poprawek na innych rozdzielczościach i serwerach. Zgłaszaj w Issues.
- Obrazki z gry pochodzą z Traviana (Travian Games GmbH). Skrypty nie dołączają żadnych grafik.

## Licencja i podziękowania

Wave Builder i Resource Bar Plus pochodzą z kodu **adipiciu** ([Travian-scripts](https://github.com/adipiciu/Travian-scripts)), który bazuje na pracy **Serj_LV**. Oryginał jest na licencji **GPL v3**, więc ta sama licencja obowiązuje tutaj (plik [LICENSE](LICENSE)). Wszystkie zmiany są w historii commitów: pierwszy commit to nietknięty kod z upstreamu, kolejne to zmiany.
