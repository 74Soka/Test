"""Test final sur une période JAMAIS VUE : janvier 2019 → octobre 2021.

Ces données ont été téléchargées après l'étude principale (nov. 2021 → nov. 2026) et n'ont servi à
régler aucun paramètre. On applique les réglages par défaut, sans rien modifier.

Critères fixés AVANT d'exécuter ce script (écrits ici et dans le commit) :
  - V1 (variante retenue) : l'échec est confirmé si l'espérance avec coûts réalistes est ≤ 0.
  - V4 (seule variante positive, mais sur 23 trades) : elle « mérite un second regard » seulement si
    son espérance reste > +0,2 R avec coûts réalistes ET > 0 avec coûts doublés. Sinon, l'idée est close.
  - Les autres variantes sont rapportées pour information.

Données préparées par :  python -m data.chargement --construire --debut 2019-01-01 --fin 2021-11-01 --suffixe _2019
Lancement :              python -m backtest.test_2019
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from backtest.etude import SORTIE, RISQUE_PCT, placebo
from backtest.executer import Contexte
from backtest.metriques import metriques


def main():
    ctx = Contexte.charger(suffixe="_2019")
    periode = (ctx.m1.index[0], ctx.m1.index[-1])
    lignes = []
    for v in ("V1", "V2", "V3", "V4"):
        od = ctx.ordres({"variante": v})
        for c in ("sans", "realiste", "double"):
            tr = ctx.backtest({"variante": v}, couts=c, ordres=od)
            m = metriques(tr, RISQUE_PCT, periode=periode) if len(tr) else {"trades": 0}
            lignes.append({"variante": v, "couts": c, **m})
            if c == "realiste":
                tr.to_parquet(SORTIE / f"trades_2019_{v}_realiste.parquet")
    tab = pd.DataFrame(lignes)
    tab.to_csv(SORTIE / "test_2019_variantes.csv", index=False)
    print(tab[["variante", "couts", "trades", "winrate_%", "expectancy_R", "profit_factor", "t_stat",
               "max_dd_%"]].round(3).to_string())

    pla = placebo(ctx, ctx.ordres({"variante": "V1"}), n=200)
    np.save(SORTIE / "test_2019_placebo_V1.npy", pla)
    e = lambda v, c: float(tab[(tab.variante == v) & (tab.couts == c)]["expectancy_R"].iloc[0])
    v1 = e("V1", "realiste")
    res = {
        "debut": str(periode[0]), "fin": str(periode[1]),
        "V1_esp_realiste_R": v1, "V1_echec_confirme": v1 <= 0,
        "V4_esp_realiste_R": e("V4", "realiste"), "V4_esp_double_R": e("V4", "double"),
        "V4_trades": int(tab[(tab.variante == "V4") & (tab.couts == "realiste")]["trades"].iloc[0]),
        "V4_second_regard": e("V4", "realiste") > 0.2 and e("V4", "double") > 0,
        "placebo_moyenne_R": float(np.nanmean(pla)), "placebo_p95_R": float(np.nanpercentile(pla, 95)),
        "V1_rang_percentile_placebo": float((pla < v1).mean() * 100),
    }
    (SORTIE / "test_2019.json").write_text(json.dumps(res, indent=1, ensure_ascii=False, default=float))
    print(json.dumps(res, indent=1, ensure_ascii=False, default=float))


if __name__ == "__main__":
    main()
