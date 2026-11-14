"""Point d'entrée commun : données → ordres → exécution → trades.

    from backtest.executer import Contexte
    ctx = Contexte.charger()
    trades = ctx.backtest({"variante": "V2", "rr": 2}, couts="realiste")
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from backtest.moteur import Couts, Marche, simuler
from data.chargement import charger
from strategy.calendrier import jours_news
from strategy.ict import generer_ordres


@dataclass
class Contexte:
    m1: pd.DataFrame
    m5: pd.DataFrame
    marche: Marche
    news: dict

    @classmethod
    def charger(cls, debut: str | None = None, fin: str | None = None) -> "Contexte":
        m1, m5 = charger("m1"), charger("m5")
        if debut or fin:
            m1, m5 = m1.loc[debut:fin], m5.loc[debut:fin]
        return cls(m1, m5, Marche(m1), jours_news(m1))

    def ordres(self, params: dict):
        return generer_ordres(self.m5, params, self.news)

    def backtest(self, params: dict, couts: str | Couts = "realiste", ordres=None) -> pd.DataFrame:
        c = Couts.scenario(couts) if isinstance(couts, str) else couts
        od = ordres if ordres is not None else self.ordres(params)
        tr = simuler(od, self.marche, c)
        if len(tr):
            tr = tr[tr["statut"] == "rempli"].reset_index(drop=True)
        return tr
