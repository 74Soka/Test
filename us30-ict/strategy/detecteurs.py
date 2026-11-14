"""Détecteurs ICT objectifs et causaux.

Règle d'or : une information calculée sur la bougie i n'est utilisable qu'à partir de la clôture de i.
Les swings (fractales) ne sont CONFIRMÉS que n bougies plus tard : un swing high en k est connu
à la clôture de k + n. Toutes les fonctions renvoient donc l'indice de confirmation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def atr(h: np.ndarray, l: np.ndarray, c: np.ndarray, n: int = 20) -> np.ndarray:
    """ATR simple (moyenne des true ranges) incluant la bougie courante (connue à sa clôture)."""
    pc = np.r_[c[0], c[:-1]]
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return pd.Series(tr).rolling(n, min_periods=n).mean().to_numpy()


def swings(h: np.ndarray, l: np.ndarray, n: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """Fractales de Williams d'ordre n.

    Renvoie deux tableaux booléens `sh`, `sl` indexés sur la bougie du SWING (k).
    Le swing en k n'est connu qu'à la clôture de k + n (l'appelant doit appliquer ce délai).
    Un sommet doit être strictement supérieur aux n bougies de chaque côté.
    """
    H, L = pd.Series(h), pd.Series(l)
    gauche_h = H.shift(1).rolling(n).max()
    droite_h = H[::-1].shift(1).rolling(n).max()[::-1]
    gauche_l = L.shift(1).rolling(n).min()
    droite_l = L[::-1].shift(1).rolling(n).min()[::-1]
    sh = ((H > gauche_h) & (H > droite_h)).to_numpy()
    sl = ((L < gauche_l) & (L < droite_l)).to_numpy()
    return sh, sl


def fvg(h: np.ndarray, l: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Fair Value Gaps à 3 bougies, indexés sur la 3e bougie (k), connus à sa clôture.

    Haussier en k : l[k] > h[k-2]  → zone [h[k-2], l[k]]
    Baissier en k : h[k] < l[k-2]  → zone [h[k], l[k-2]]
    Renvoie (bas_haussier, haut_haussier, bas_baissier, haut_baissier) ; NaN si pas de gap.
    """
    N = len(h)
    bh = np.full(N, np.nan); hh = np.full(N, np.nan)
    bb = np.full(N, np.nan); hb = np.full(N, np.nan)
    h2 = np.r_[np.nan, np.nan, h[:-2]]
    l2 = np.r_[np.nan, np.nan, l[:-2]]
    up = l > h2
    dn = h < l2
    bh[up], hh[up] = h2[up], l[up]
    bb[dn], hb[dn] = h[dn], l2[dn]
    return bh, hh, bb, hb


def niveaux_seance(df: pd.DataFrame) -> pd.DataFrame:
    """Niveaux de liquidité par jour de séance (connus AVANT leur utilisation).

    - pdh/pdl : plus haut / plus bas de la séance précédente (18:00 → 17:00 NY), connus dès 18:00 ;
    - asie_h/asie_l : range 20:00 → 00:00 NY, connu à minuit ;
    - londres_h/londres_l : range 02:00 → 05:00 NY, connu à 05:00 (utilisé seulement par NY) ;
    - open_minuit : ouverture de la bougie de 00:00 NY ; open_semaine : 1re bougie de la semaine ;
    - pdc/pdo : clôture et ouverture de la séance précédente (biais journalier).
    """
    g = df.groupby("seance")
    jour = pd.DataFrame({"h": g["h"].max(), "l": g["l"].min(), "o": g["o"].first(), "c": g["c"].last()})
    jour["pdh"], jour["pdl"] = jour["h"].shift(1), jour["l"].shift(1)
    jour["pdc"], jour["pdo"] = jour["c"].shift(1), jour["o"].shift(1)
    jour["pd_mid"] = (jour["pdh"] + jour["pdl"]) / 2

    t = df.index
    heure = t.hour + t.minute / 60
    asie = df[heure >= 20]  # 20:00-23:59 NY appartient déjà à la séance suivante (début 18:00)
    a = asie.groupby("seance").agg(asie_h=("h", "max"), asie_l=("l", "min"))
    lon = df[(heure >= 2) & (heure < 5)].groupby("seance").agg(londres_h=("h", "max"), londres_l=("l", "min"))
    minuit = df[(t.hour == 0) & (t.minute == 0)].groupby("seance")["o"].first().rename("open_minuit")

    sem = df["seance"].astype("datetime64[ns]")
    semaine = (sem - pd.to_timedelta(sem.dt.weekday, unit="D")).values  # lundi de la semaine de séance
    ow = df.groupby(semaine)["o"].first()
    open_sem = pd.Series(ow.reindex(semaine).values, index=df.index).groupby(df["seance"]).first().rename("open_semaine")

    res = jour.join([a, lon, minuit, open_sem])
    res.index = pd.to_datetime(res.index)
    return res
