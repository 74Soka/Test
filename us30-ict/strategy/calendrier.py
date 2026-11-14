"""Calendrier des annonces à fort impact (filtre « news »).

FOMC : dates officielles des communiqués de décision, relevées le 2026-11-14 sur
  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (+ pages historiques 2019 et 2020).
  Inclut les décisions d'urgence de mars 2020 (03-03, 03-15 un dimanche, 03-23).
  Exclus : communiqués qui ne sont pas des décisions de taux (2019-10-11 opérations repo,
  2020-03-31 facilité FIMA, 2020-08-27 et 2025-08-22 cadre de long terme).

CPI / NFP (publiés à 08:30 NY) : le site du BLS refuse les accès automatisés depuis cet environnement
  (« Access Denied »). On utilise donc deux approximations, documentées dans le rapport :
  1. NFP = premier vendredi du mois (règle usuelle, quelques exceptions ±1 semaine non captées) ;
  2. détecteur causal de « choc 08:30 » : si l'amplitude de la bougie M1 de 08:30 NY dépasse
     `multiple` × la médiane des 20 bougies de 08:30 précédentes, la journée est marquée « news ».
     Ce signal est connu à 08:31, avant toute entrée en killzone NY (entrées autorisées dès 08:35).
     Il capte CPI, NFP, PPI, ventes au détail… c'est-à-dire tous les chiffres qui font bouger le marché.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

FOMC = [
    "2019-01-30", "2019-03-20", "2019-05-01", "2019-06-19", "2019-07-31", "2019-09-18", "2019-10-30",
    "2019-12-11", "2020-01-29", "2020-03-03", "2020-03-15", "2020-03-23", "2020-04-29", "2020-06-10",
    "2020-07-29", "2020-09-16", "2020-11-05", "2020-12-16", "2021-01-27", "2021-03-17", "2021-04-28",
    "2021-06-16", "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15", "2022-01-26", "2022-03-16",
    "2022-05-04", "2022-06-15", "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14", "2023-02-01",
    "2023-03-22", "2023-05-03", "2023-06-14", "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
    "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07",
    "2024-12-18", "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17",
    "2025-10-29", "2025-12-10", "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29",
    "2026-09-16", "2026-10-28",
]
JOURS_FOMC = {dt.date.fromisoformat(d) for d in FOMC}


def premier_vendredi(jour: dt.date) -> bool:
    return jour.weekday() == 4 and jour.day <= 7


def jours_choc_0830(m1: pd.DataFrame, multiple: float = 3.0) -> set[dt.date]:
    """Jours où la bougie M1 de 08:30 NY est anormalement grande (annonce macro). Calcul causal."""
    b = m1.between_time("08:30", "08:30")
    amp = (b["h"] - b["l"]).astype(float)
    ref = amp.shift(1).rolling(20, min_periods=10).median()  # uniquement les jours précédents
    choc = amp > multiple * ref
    return {ts.date() for ts in choc[choc].index}


def jours_news(m1: pd.DataFrame, multiple: float = 3.0) -> dict[str, set[dt.date]]:
    """Ensembles de dates par type ; utilisés par la stratégie."""
    jours = {ts.date() for ts in m1.index.normalize().unique()}
    return {
        "fomc": JOURS_FOMC,
        "nfp": {j for j in jours if premier_vendredi(j)},
        "choc_0830": jours_choc_0830(m1, multiple),
    }


def resume(news: dict[str, set[dt.date]]) -> dict[str, int]:
    return {k: len(v) for k, v in news.items()}


__all__ = ["FOMC", "JOURS_FOMC", "jours_news", "jours_choc_0830", "premier_vendredi", "resume", "np"]
