# Travian Region News

Skrypt Tampermonkey, który przy wydarzeniach sojuszu w Travian dopisuje nazwę regionu przy współrzędnych osady. Skrypt działa na jednym świecie: `cw.x2.international.travian.com`.

Nazwa regionu jest pobierana na żywo z Traviana, więc zadziała też dla osady założonej tego samego dnia. Nie są potrzebne żadne pliki `map.sql`, projekt serwerowy ani klucze API.

## Co robi skrypt

Przy trzech typach wydarzeń sojuszu, w panelu bocznym oraz na pełnej liście wydarzeń, po linku współrzędnych dopisywana jest etykieta regionu. Skrypt rozpoznaje wyłącznie trzy polskie sformułowania:

- `założył(a) nową osadę`
- `podbił(a) osadę`
- `utracił(a) osadę`

Etykieta to separator `—` i klikalny link do regionu w formacie `/region/<id>`. Przykład: przy współrzędnych `(89|-97)` pojawi się `Sparta`. Etykieta dziedziczy typografię i kolor Traviana, nie ma własnej palety, tła, animacji ani placeholdera ładowania. Skrypt nie zmienia natywnego linku współrzędnych ani znaków wokół niego.

## Obsługiwany świat

Skrypt obejmuje dokładnie jeden wzorzec adresu:

```
https://cw.x2.international.travian.com/*
```

W metadanych Tampermonkey jest to jedyny wpis `@match`. Skrypt nie działa na innych światach ani domenach i nie deklaruje żadnego `@connect`.

## Instalacja

1. Zainstaluj rozszerzenie Tampermonkey w swojej przeglądarce.
2. Otwórz panel Tampermonkey i wybierz „Utwórz nowy skrypt" („Create a new script").
3. Usuń domyślny szablon.
4. Wklej całą zawartość pliku `travian-region-news.user.js` i zapisz skrypt (`Ctrl+S`).
   - Alternatywnie przeciągnij plik `travian-region-news.user.js` do okna przeglądarki i zatwierdź instalację w Tampermonkey.
5. Otwórz `https://cw.x2.international.travian.com/` i przejdź do widoku z wydarzeniami sojuszu. Etykiety regionów pojawią się po wczytaniu strony.

## Jak działa zapytanie

Skrypt wykonuje zapytanie w obrębie tego samego pochodzenia (same-origin):

- metoda: `POST`
- adres: `/api/v1/map/tile-details`
- ciało: JSON `{"x":..,"y":..}`
- nagłówki: `Accept: application/json` oraz `Content-Type: application/json; charset=UTF-8`
- `credentials: same-origin`

To dokładnie ten endpoint, którego używa mapa Traviana do pokazania szczegółów pola. Odpowiedź jest parsowana tylko po to, żeby odczytać `{regionId, regionName}` z linku `#village_info a[href^="/region/"]`. Nie ma tu `map.sql`, żadnych usług zewnętrznych ani kluczy API.

## Cache i limity

- Cache: 24 godziny w pamięci Tampermonkey. Klucz ma postać `origin:x|y`, a rekord `{v, regionId, regionName, fetchedAt}`.
- Maks. 2 równoległe zapytania.
- Odstęp między startami zapytań: co najmniej 300 ms.
- Maksymalnie 50 zapytań na jedno załadowanie strony.
- Limit czasu jednego zapytania: 10 s.
- Po odpowiedzi 401, 403 lub 429 skrypt wstrzymuje nowe zapytania na 15 minut (cooldown) i nie ponawia ich automatycznie.

## Prywatność i minimalizacja danych

Skrypt zapisuje wyłącznie `{regionId, regionName, fetchedAt}` (razem z wersją schematu `v`). Nie zapisuje danych graczy, sojuszu ani osad. Nie wysyła telemetrii i nie loguje odpowiedzi ani danych sesji. Domyślnie nie wypisuje nic do konsoli. Wszystkie zapytania idą tylko na `https://cw.x2.international.travian.com/*`.

## Zachowanie przy wylogowaniu lub zmianie znaczników

Jeśli jesteś wylogowany(a) albo Travian zmieni znaczniki (markup) strony, etykieta regionu się nie pojawi. Natywny DOM pozostaje bez zmian, a w konsoli nie ma błędów. Skrypt nie zmienia współrzędnych ani innych elementów strony.

## Aktualizacja i reinstalacja

Aby zaktualizować skrypt, zainstaluj ponownie nowszą wersję pliku `travian-region-news.user.js` w Tampermonkey (przez import pliku albo wklejenie zawartości do edytora). Tampermonkey nadpisze poprzednią wersję. Cache pozostaje w pamięci rozszerzenia i nie wymaga czyszczenia przy zwykłej aktualizacji.

## Odinstalowanie i czyszczenie cache

1. Otwórz panel Tampermonkey, znajdź „Travian Region News" i usuń skrypt.
2. Aby usunąć także dane skryptu (wpisy cache), usuń dane/pamięć dla tego skryptu w Tampermonkey (sekcja danych skryptu) albo wyczyść cache rozszerzenia.
3. Odśwież stronę Traviana. Etykiety regionów znikną, bo skrypt nie jest już aktywny.

## Rozwiązywanie problemów

1. Najpierw sprawdź odpowiedź endpointu `/api/v1/map/tile-details`. Otwórz narzędzia deweloperskie przeglądarki (zakładka Network), odśwież stronę i znajdź zapytanie `POST /api/v1/map/tile-details`. Upewnij się, że odpowiedź to JSON z polem `html`, które zawiera `#village_info a[href^="/region/"]`.
2. Jeśli endpoint zwraca poprawny region, a etykieta się nie pojawia, sprawdź, czy jesteś zalogowany(a) oraz czy wydarzenie należy do jednego z trzech obsługiwanych sformułowań.
3. Jeśli odpowiedź to 401, 403 lub 429, skrypt jest w cooldownie przez 15 minut. Odczekaj i odśwież stronę.
4. Uruchom testy fixtures w katalogu projektu:

```
npm ci && npm test && npm run check
```

> Uwaga: nie wklejaj ciasteczek ani tokenów do zgłoszeń, konsoli ani narzędzi deweloperskich. Skrypt nie potrzebuje ich do działania i nigdzie ich nie wysyła.

## Czego nie potrzebujesz

- Pliku `map.sql` ani danych mapy. Nie jest wymagany map.sql ani projekt serwerowy.
- Kluczy API ani usług zewnętrznych.
- Własnego serwera, SSH czy bazy danych.

Skrypt to pojedynczy plik `travian-region-news.user.js` bez kroku budowania i bez zależności runtime.
