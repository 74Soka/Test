#!/usr/bin/env bash
# Téléchargement complet, relançable à volonté (les fichiers déjà présents sont sautés) :
#   1) BID des 5 dernières années (du plus récent au plus ancien) ;
#   2) ASK un mercredi par semaine (sert à modéliser le spread des autres jours) ;
#   3) BID 2019 → fin 2021 ; 4) ASK complet si on a le temps.
cd "$(dirname "$0")/.."
FIN=${1:-2026-11-13}
lancer() { for passe in 1 2 3; do python3 -u -m data.telecharger_dukascopy --fin "$FIN" "$@" | tee -a data/raw/telechargement.log | tail -3 | grep -q "Échecs" || break; done; }
lancer --debut 2021-11-01 --cotes BID --recent-dabord
lancer --debut 2019-01-01 --cotes ASK --recent-dabord --mercredis
lancer --debut 2019-01-01 --cotes BID --recent-dabord
lancer --debut 2019-01-01 --cotes ASK --recent-dabord
