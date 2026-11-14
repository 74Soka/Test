"""Téléchargement des bougies M1 US30 (USA30.IDX/USD) depuis le flux public Dukascopy.

Format des fichiers : https://datafeed.dukascopy.com/datafeed/<SYMB>/<AAAA>/<MM-1>/<JJ>/<BID|ASK>_candles_min_1.bi5
  - compression LZMA ; enregistrements big-endian de 24 octets :
    int32 secondes depuis 00:00 UTC du jour, int32 open, close, low, high (prix * 1000), float32 volume.
  - le mois est indexé à partir de 0 (janvier = 00).

Les fichiers bruts sont mis en cache dans data/raw/ (non versionné). Relancer le script ne retélécharge
que ce qui manque. Les coupures réseau sont fréquentes : chaque fichier est réessayé avec attente croissante.

Usage :  python -m data.telecharger_dukascopy --debut 2019-01-01 --fin 2026-11-13 --cotes BID --recent-dabord
  Débit tenable : ~1 fichier / 2,5 s en séquentiel (plus vite, le serveur fait attendre puis coupe ; le parallélisme provoque des
  coupures). Prévoir plusieurs heures pour 8 ans ; on peut relancer à tout moment (cache).
"""
from __future__ import annotations

import argparse
import datetime as dt
import random
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

SYMBOLE = "USA30IDXUSD"
URL = "https://datafeed.dukascopy.com/datafeed/{s}/{a:04d}/{m:02d}/{j:02d}/{cote}_candles_min_1.bi5"
DOSSIER_BRUT = Path(__file__).resolve().parent / "raw"


def chemin_local(jour: dt.date, cote: str) -> Path:
    return DOSSIER_BRUT / cote / f"{jour:%Y}" / f"{jour:%Y-%m-%d}.bi5"


_local = threading.local()


class Cadence:
    """Pause adaptative (AIMD) : Dukascopy applique un quota ; au-delà, il fait attendre ~10 s puis
    coupe. On ralentit fortement dès qu'une réponse est lente ou échoue, on réaccélère doucement sinon."""

    def __init__(self, pause=4.0, mini=3.0, maxi=30.0):
        self.pause, self.mini, self.maxi = pause, mini, maxi
        self.verrou = threading.Lock()

    def attendre(self):
        time.sleep(self.pause)

    def succes(self, duree: float):
        with self.verrou:
            if duree > 2.0:
                self.pause = min(self.maxi, self.pause * 1.5)
            else:
                self.pause = max(self.mini, self.pause - 0.1)

    def echec(self):
        with self.verrou:
            self.pause = min(self.maxi, self.pause * 2)


CADENCE = Cadence()


def _session() -> requests.Session:
    """Une session HTTP persistante par fil (keep-alive : évite de rouvrir un tunnel à chaque fichier)."""
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
        _local.s.headers["User-Agent"] = "Mozilla/5.0"
    return _local.s


def telecharger_jour(jour: dt.date, cote: str, essais: int = 12) -> tuple[dt.date, str, str]:
    """Télécharge un fichier journalier ; renvoie (jour, côté, statut)."""
    cible = chemin_local(jour, cote)
    if cible.exists():
        return jour, cote, "cache"
    url = URL.format(s=SYMBOLE, a=jour.year, m=jour.month - 1, j=jour.day, cote=cote)
    for essai in range(essais):
        CADENCE.attendre()
        debut = time.time()
        try:
            rep = _session().get(url, timeout=40)
            if rep.status_code in (200, 404):
                CADENCE.succes(time.time() - debut)
                cible.parent.mkdir(parents=True, exist_ok=True)
                tmp = cible.with_suffix(".tmp")
                # fichier vide = jour sans cotation (férié, week-end) ou absent (404)
                tmp.write_bytes(rep.content if rep.status_code == 200 else b"")
                tmp.replace(cible)
                return jour, cote, "ok" if rep.status_code == 200 else "404"
            CADENCE.echec()  # 429 = trop de requêtes
        except Exception:  # coupure (le serveur fait attendre puis le proxy coupe)
            _local.__dict__.pop("s", None)
            CADENCE.echec()
            time.sleep(20 + 5 * random.random())
    return jour, cote, "echec"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--debut", default="2019-01-01")
    p.add_argument("--fin", default=dt.date.today().isoformat())
    p.add_argument("--fils", type=int, default=1)
    p.add_argument("--cotes", default="BID,ASK")
    p.add_argument("--recent-dabord", action="store_true", help="du plus récent au plus ancien")
    p.add_argument("--mercredis", action="store_true", help="seulement les mercredis (échantillon de spread)")
    a = p.parse_args()

    debut, fin = dt.date.fromisoformat(a.debut), dt.date.fromisoformat(a.fin)
    jours = [debut + dt.timedelta(d) for d in range((fin - debut).days + 1)]
    jours = [j for j in jours if j.weekday() != 5]  # pas de cotation le samedi (UTC)
    if a.mercredis:
        jours = [j for j in jours if j.weekday() == 2]
    if a.recent_dabord:
        jours = jours[::-1]
    taches = [(j, c) for c in a.cotes.split(",") for j in jours]  # BID complet d'abord, puis ASK
    print(f"{len(taches)} fichiers à vérifier/télécharger")

    compte: dict[str, int] = {}
    echecs = []
    with ThreadPoolExecutor(a.fils) as ex:
        futs = [ex.submit(telecharger_jour, j, c) for j, c in taches]
        for n, f in enumerate(as_completed(futs), 1):
            j, c, st = f.result()
            compte[st] = compte.get(st, 0) + 1
            if st == "echec":
                echecs.append((j, c))
            if n % 50 == 0:
                print(f"  {time.strftime('%H:%M:%S')} {n}/{len(taches)} {compte} pause={CADENCE.pause:.1f}s", flush=True)
    print("Terminé :", compte)
    if echecs:
        print("Échecs (relancer le script) :", echecs[:20], "…" if len(echecs) > 20 else "")


if __name__ == "__main__":
    main()
