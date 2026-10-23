# TravianScripts

Skrypty Tampermonkey do [Travian Legends](https://www.travian.com): dwa rozwijane tu forki (Wave Builder i Resource Bar Plus, oparte na kodzie adipiciu, patrz [Licencja i podziękowania](#licencja-i-podziękowania)) oraz dwa własne skrypty. Wszystko pisane i testowane na świecie `cw.x2.international.travian.com`, język interfejsu: polski.

| Skrypt | Do czego | Instalacja |
|---|---|---|
| [Wave Builder (presets)](#wave-builder-presets) | budowanie fal ataków, presety i kolejki fal | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianWaveBuilder/TravianWaveBuilder.user.js) |
| [Resource Bar Plus (fork)](#resource-bar-plus-fork) | czasy surowców, menu, tabele prędkości, analizator bitwy | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianResourceBarPlus/TravianResourceBarPlus.user.js) |
| [Zboże oddziałów](#zboże-oddziałów) | suma zboża, ataku i obrony oddziałów w drodze i stacjonujących | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianCropCounter/incoming-crop.user.js) |
| [Region News](#region-news) | nazwa regionu przy wydarzeniach sojuszu | [zainstaluj](https://raw.githubusercontent.com/PeterPage2115/TravianScripts/main/TravianNewsAddon/travian-region-news.user.js) |

## Instalacja i aktualizacje

1. Zainstaluj Tampermonkey (lub Violentmonkey).
2. Kliknij „zainstaluj” przy wybranym skrypcie w tabeli wyżej. Tampermonkey pokaże ekran instalacji, wystarczy potwierdzić.
3. **Jeśli masz oryginalne skrypty adipiciu, wyłącz je albo usuń**, żeby dwie wersje nie działały naraz.

Wave Builder, Resource Bar Plus i Zboże oddziałów **aktualizują się z tego repozytorium**: Tampermonkey sprawdza plik na gałęzi `main` i zaproponuje nową wersję, gdy numer `@version` jest wyższy. Domyślnie sprawdza raz na dobę, a ręcznie możesz wymusić sprawdzenie w panelu Tampermonkey. Region News nie ma automatycznych aktualizacji (celowo nie łączy się z niczym poza grą), więc nową wersję instalujesz ponownie z linku.

## Wave Builder (presets)

Fork skryptu *Travian wave builder* (wersja bazowa 2.11). Działa na stronie *Miejsce zbiórki → Wyślij jednostki*.

- **Presety.** Zapisujesz jednostki, typ ataku i liczbę fal pod nazwą. Wybór presetu wypełnia formularz, a obok widać ikony jednostek.
- **Presety-kolejki.** Układasz fale ręcznie (np. fejk: pierwsza fala inna niż reszta, jedna w środku z koniem), klikasz „Zapisz kolejkę”. Potem wybierasz kolejkę, wpisujesz cel i jedno „+” dodaje wszystkie fale po kolei. Błąd przy którejś fali zatrzymuje całą kolejkę.
- **Podsumowanie wojska** pod przyciskiem „Wyślij”: ile dodasz, ile jest już w tabeli, ile jest w osadzie i ile zostanie. Brak wojska zaznaczony na czerwono.
- Większe przyciski `+ − ↑ ↓`.

Presety zapisują się w `localStorage` przeglądarki, osobno dla każdego serwera.

## Resource Bar Plus (fork)

Fork skryptu *Travian Resource bar plus* (wersja bazowa 2.26.16). Cała pierwotna funkcjonalność zostaje (przegląd osad, linki, notatki, wyszukiwanie sąsiadów i oaz, podsumowanie dla NPC). Zmieniony jest wygląd i kilka miejsc:

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
- Zmiany w forkach były sprawdzane składniowo (`node --check`) i ręcznie w grze. Niektóre elementy wyglądu mogą wymagać poprawek na innych rozdzielczościach i serwerach. Zgłaszaj w [Issues](https://github.com/PeterPage2115/TravianScripts/issues).
- Grafiki z gry pochodzą z Traviana (Travian Games GmbH). Skrypty nie dołączają żadnych własnych grafik.

## Licencja i podziękowania

Wave Builder i Resource Bar Plus są **forkami skryptów adipiciu** z repozytorium [adipiciu/Travian-scripts](https://github.com/adipiciu/Travian-scripts), które bazują na pracy **Serj_LV**. Autorstwo oryginału jest zachowane w nagłówkach skryptów (`@author`). Oryginał jest na licencji **GPL v3**, więc ta sama licencja obowiązuje tutaj (plik [LICENSE](LICENSE)). Wszystkie zmiany są w historii commitów: pierwszy commit to nietknięty kod z upstreamu, kolejne to nasze zmiany, więc `git diff` względem niego pokazuje dokładnie, co zostało zmienione.

Przycisk „Donate” w ustawieniach Resource Bar Plus prowadzi do oryginalnego autora.
