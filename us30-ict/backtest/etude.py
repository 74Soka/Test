"""Étude complète : variantes, IS/OOS, coûts, sensibilité, walk-forward, Monte Carlo, ventilations, placebo.

Usage : python -m backtest.etude [--rapide]
Écrit tous les résultats dans reports/resultats/ (CSV/JSON/Parquet), lus ensuite par reports/rapport.py.

Méthode anti-surapprentissage :
  - les paramètres par défaut (strategy/ict.py:DEFAUTS) ont été fixés a priori (valeurs ICT usuelles),
    AVANT de regarder les résultats ; ils ne sont pas réoptimisés sur l'échantillon OOS ;
  - la période est coupée chronologiquement : 70 % in-sample (IS), 30 % out-of-sample (OOS) ;
  - le choix entre variantes et la lecture des heatmaps se font sur l'IS uniquement ;
  - walk-forward : fenêtres glissantes 24 mois d'apprentissage / 6 mois de test, le meilleur jeu de
    paramètres de la grille (espérance en R, ≥ 30 trades) est appliqué aux 6 mois suivants.
"""
from __future__ import annotations

import argparse
import itertools
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np
import pandas as pd

from backtest.executer import Contexte
from backtest.metriques import metriques, monte_carlo, regles_prop
from backtest.moteur import Couts, simuler
from strategy import ict
from strategy.ict import Ordre

SORTIE = Path(__file__).resolve().parents[1] / "reports" / "resultats"
RISQUE_PCT = 0.5
CTX: Contexte | None = None  # partagé par fork avec les processus de calcul


def _init():
    global CTX
    if CTX is None:
        CTX = Contexte.charger()


def _run(args):
    params, couts = args
    _init()
    od = CTX.ordres(params)
    stats = dict(ict.DERNIERES_STATS)
    tr = CTX.backtest(params, couts, ordres=od)
    return params, couts, tr, stats


def executer_lot(jobs, processus=4):
    if processus <= 1:
        return [_run(j) for j in jobs]
    with mp.get_context("fork").Pool(processus) as pool:
        return pool.map(_run, jobs, chunksize=1)


def date_coupure(ctx: Contexte, frac=0.7) -> pd.Timestamp:
    t0, t1 = ctx.m1.index[0], ctx.m1.index[-1]
    return (t0 + (t1 - t0) * frac).normalize()


def couper(tr: pd.DataFrame, coupure) -> tuple[pd.DataFrame, pd.DataFrame]:
    if len(tr) == 0:
        return tr, tr
    return tr[tr["t_entree"] < coupure], tr[tr["t_entree"] >= coupure]


PERIODES: dict = {}  # "total"/"IS"/"OOS" → (début, fin), renseigné dans main()


def resume(tr, prefixe=""):
    per = PERIODES.get(prefixe.rstrip("_") or "total")
    m = metriques(tr, RISQUE_PCT, periode=per) if len(tr) else {"trades": 0}
    return {f"{prefixe}{k}": v for k, v in m.items()}


# ---------------------------------------------------------------- ventilations
def regime_volatilite(ctx: Contexte) -> pd.Series:
    """Régime de volatilité par séance, CAUSAL : amplitude moyenne des 20 séances précédentes rapportée
    à sa médiane glissante sur 250 séances → terciles basse / moyenne / haute."""
    j = ctx.m5.groupby("seance").agg(h=("h", "max"), l=("l", "min"), c=("c", "last"))
    amp = ((j["h"] - j["l"]) / j["c"]).shift(1).rolling(20, min_periods=10).mean()
    rel = amp / amp.rolling(250, min_periods=60).median()
    reg = pd.cut(rel, [-np.inf, 0.85, 1.15, np.inf], labels=["basse", "moyenne", "haute"])
    reg.index = pd.to_datetime(reg.index)
    return reg


def ventiler(tr: pd.DataFrame, reg: pd.Series) -> dict[str, pd.DataFrame]:
    if len(tr) == 0:
        return {}
    t = tr.copy()
    t["annee"] = t["t_entree"].dt.year
    t["jour"] = t["t_entree"].dt.day_name(locale=None)
    t["seance"] = pd.to_datetime(t["t_entree"].dt.date)
    t["volatilite"] = t["seance"].map(reg).astype(str)
    t["sens_txt"] = np.where(t["sens"] > 0, "achat", "vente")
    out = {}
    for cle in ("annee", "kz", "jour", "volatilite", "sens_txt", "niveau", "raison"):
        g = t.groupby(cle)["r"]
        out[cle] = pd.DataFrame({"trades": g.size(), "winrate_%": g.apply(lambda x: 100 * (x > 0).mean()),
                                 "expectancy_R": g.mean(), "total_R": g.sum(),
                                 "pf": g.apply(lambda x: x[x > 0].sum() / max(-x[x < 0].sum(), 1e-9))})
    return out


# ---------------------------------------------------------------- placebo
def placebo(ctx: Contexte, ordres: list[Ordre], n: int = 200, graine: int = 11) -> np.ndarray:
    """Mêmes instants d'entrée, même distance de stop, même RR, mêmes coûts — mais SENS ALÉATOIRE.
    Si la logique ICT a un avantage, son espérance doit dépasser nettement cette distribution."""
    rng = np.random.default_rng(graine)
    base = [o for o in ordres if o.type == "marche"]
    res = []
    couts = Couts.scenario("realiste")
    for _ in range(n):
        nv = []
        for o in base:
            d = abs(o.meta["close_mss"] - o.sl)
            s = int(rng.choice([-1, 1]))
            nv.append(Ordre(o.t_signal, s, "marche", np.nan, o.meta["close_mss"] - s * d, np.nan, o.rr,
                            o.expiration, o.sortie_temps, o.kz, o.seance, o.gestion, o.meta))
        tr = simuler(nv, ctx.marche, couts)
        tr = tr[tr["statut"] == "rempli"] if len(tr) else tr
        res.append(tr["r"].mean() if len(tr) else np.nan)
    return np.array(res)


# ---------------------------------------------------------------- walk-forward
def walk_forward(resultats_grille: list[tuple[dict, pd.DataFrame]], debut, fin,
                 train_mois=24, test_mois=6, min_trades=30) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Sélection par fenêtre glissante sur des backtests déjà calculés (pas de fuite : chaque choix ne
    voit que les trades sortis avant le début de la fenêtre de test)."""
    fenetres, morceaux = [], []
    t = pd.Timestamp(debut).tz_convert("America/New_York") + pd.DateOffset(months=train_mois)
    fin = pd.Timestamp(fin).tz_convert("America/New_York")
    while t < fin:
        a, b = t - pd.DateOffset(months=train_mois), min(t + pd.DateOffset(months=test_mois), fin)
        meilleur, score = None, -np.inf
        for params, tr in resultats_grille:
            if len(tr) == 0:
                continue
            app = tr[(tr["t_entree"] >= a) & (tr["t_sortie"] < t)]
            if len(app) >= min_trades and app["r"].mean() > score:
                meilleur, score = (params, tr), app["r"].mean()
        if meilleur is not None:
            params, tr = meilleur
            test = tr[(tr["t_entree"] >= t) & (tr["t_entree"] < b)]
            morceaux.append(test.assign(fenetre=str(t.date())))
            fenetres.append({"debut_test": str(t.date()), "fin_test": str(b.date()),
                             "params": {k: v for k, v in params.items() if k != "variante"},
                             "esp_apprentissage_R": score, "trades_test": len(test),
                             "esp_test_R": test["r"].mean() if len(test) else np.nan})
        t = b
    oos = pd.concat(morceaux, ignore_index=True) if morceaux else pd.DataFrame()
    return pd.DataFrame(fenetres), oos


# ---------------------------------------------------------------- programme principal
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapide", action="store_true", help="grilles réduites (test)")
    ap.add_argument("--processus", type=int, default=4)
    a = ap.parse_args()
    SORTIE.mkdir(parents=True, exist_ok=True)
    debut_chrono = time.time()
    global CTX
    CTX = Contexte.charger()
    ctx = CTX
    coupure = date_coupure(ctx)
    d0, d1 = ctx.m1.index[0], ctx.m1.index[-1]
    PERIODES.update(total=(d0, d1), IS=(d0, coupure), OOS=(coupure, d1))
    info = {"debut": str(ctx.m1.index[0]), "fin": str(ctx.m1.index[-1]), "coupure_is_oos": str(coupure.date()),
            "risque_pct": RISQUE_PCT, "defauts": {k: str(v) for k, v in ict.DEFAUTS.items()}}
    print("Période", info["debut"], "→", info["fin"], "| coupure IS/OOS", info["coupure_is_oos"], flush=True)

    # 1) variantes × coûts
    variantes = ["V1", "V2", "V3", "V4"]
    jobs = [({"variante": v}, c) for v in variantes for c in ("sans", "realiste", "double")]
    jobs += [({"variante": v, "killzones": ("londres", "ny_am", "ny_pm")}, "realiste") for v in variantes]
    res = executer_lot(jobs, a.processus)
    lignes, trades_var = [], {}
    for params, couts, tr, stats in res:
        kz = "+PM" if "ny_pm" in params.get("killzones", ()) else ""
        nom = params["variante"] + kz
        is_, oos = couper(tr, coupure)
        ligne = {"variante": nom, "couts": couts, **{f"f_{k}": v for k, v in stats.items()},
                 **resume(tr), **resume(is_, "IS_"), **resume(oos, "OOS_")}
        lignes.append(ligne)
        tr.to_parquet(SORTIE / f"trades_{nom}_{couts}.parquet")
        trades_var[(nom, couts)] = tr
    tab = pd.DataFrame(lignes)
    tab.to_csv(SORTIE / "variantes.csv", index=False)
    cols = ["variante", "couts", "trades", "winrate_%", "expectancy_R", "profit_factor", "max_dd_%",
            "IS_trades", "IS_expectancy_R", "OOS_trades", "OOS_expectancy_R"]
    print(tab[[c for c in cols if c in tab]].round(3).to_string(), flush=True)

    # Variante retenue : la meilleure espérance IS (coûts réalistes) parmi V1..V4 — choix fait sur l'IS seul
    rea = tab[(tab["couts"] == "realiste") & (~tab["variante"].str.contains("PM"))]
    retenue = rea.sort_values("IS_expectancy_R", ascending=False)["variante"].iloc[0]
    info["variante_retenue_sur_IS"] = retenue
    print("Variante retenue (sur IS) :", retenue, flush=True)

    # 2) sensibilité (heatmaps) sur la variante retenue — calculée sur toute la période, lue en IS et OOS
    grilles = {
        "disp_rr": ("disp_atr", [0.6, 0.8, 1.0, 1.2, 1.5], "rr", [1.5, 2.0, 2.5, 3.0, 4.0]),
        "swing_mss": ("n_swing", [1, 2, 3, 4], "max_barres_mss", [6, 9, 12, 18, 24]),
    }
    if retenue != "V1":
        grilles["attente_buffer"] = ("attente_max", [4, 8, 12, 24], "buffer_sl", [0.0, 2.0, 5.0, 10.0])
    if a.rapide:
        grilles = {k: (p1, v1[::2], p2, v2[::2]) for k, (p1, v1, p2, v2) in grilles.items()}
    for nom, (p1, v1, p2, v2) in grilles.items():
        jobs = [({"variante": retenue, p1: x, p2: y}, "realiste") for x in v1 for y in v2]
        res = executer_lot(jobs, a.processus)
        lignes = []
        for params, _, tr, _ in res:
            is_, oos = couper(tr, coupure)
            lignes.append({p1: params[p1], p2: params[p2], **resume(is_, "IS_"), **resume(oos, "OOS_")})
        pd.DataFrame(lignes).to_csv(SORTIE / f"grille_{nom}.csv", index=False)
        print("grille", nom, "ok", flush=True)

    # 3) walk-forward sur une grille de 18 jeux de paramètres
    combos = list(itertools.product([0.8, 1.0, 1.2], [1.5, 2.0, 3.0], [2, 3]))
    jobs = [({"variante": retenue, "disp_atr": d, "rr": r, "n_swing": n}, "realiste") for d, r, n in combos]
    res = executer_lot(jobs, a.processus)
    fen, wf = walk_forward([(p, tr) for p, _, tr, _ in res], ctx.m1.index[0], ctx.m1.index[-1])
    fen.to_csv(SORTIE / "walk_forward_fenetres.csv", index=False)
    if len(wf):
        wf.to_parquet(SORTIE / "trades_walk_forward.parquet")
    info["walk_forward"] = metriques(wf, RISQUE_PCT, periode=(pd.Timestamp(fen["debut_test"].iloc[0]), d1.tz_localize(None))) if len(wf) else {}
    print("walk-forward :", {k: round(v, 3) if isinstance(v, float) else v for k, v in info["walk_forward"].items()}, flush=True)

    # 4) Monte Carlo, prop firm, ventilations, placebo sur la variante retenue (paramètres par défaut)
    tr = trades_var[(retenue, "realiste")]
    is_, oos = couper(tr, coupure)
    mc = {}
    for nom, x in (("total", tr), ("OOS", oos)):
        if len(x) > 10:
            m = monte_carlo(x["r"].to_numpy(), RISQUE_PCT)
            np.save(SORTIE / f"mc_dd_{nom}.npy", m.pop("_dds")); np.save(SORTIE / f"mc_final_{nom}.npy", m.pop("_finaux"))
            m_boot = monte_carlo(x["r"].to_numpy(), RISQUE_PCT, bootstrap=True)
            np.save(SORTIE / f"mcb_final_{nom}.npy", m_boot.pop("_finaux")); m_boot.pop("_dds")
            mc[nom] = {"permutation": m, "bootstrap": m_boot}
    info["monte_carlo"] = mc
    info["prop_firm"] = {f"{r}%": regles_prop(tr, r) for r in (0.5, 1.0)}
    reg = regime_volatilite(ctx)
    for cle, df in ventiler(tr, reg).items():
        df.to_csv(SORTIE / f"ventilation_{cle}.csv")
    od_v1 = ctx.ordres({"variante": "V1"})
    pla = placebo(ctx, od_v1, n=40 if a.rapide else 200)
    np.save(SORTIE / "placebo_V1.npy", pla)
    v1 = trades_var[("V1", "realiste")]
    info["placebo_V1"] = {"esp_V1_R": float(v1["r"].mean()) if len(v1) else None,
                          "placebo_moyenne_R": float(np.nanmean(pla)), "placebo_p95_R": float(np.nanpercentile(pla, 95)),
                          "rang_percentile_V1": float((pla < v1["r"].mean()).mean() * 100) if len(v1) else None}
    q = Path(__file__).resolve().parents[1] / "data" / "processed" / "rapport_qualite.json"
    if q.exists():
        (SORTIE / "qualite_donnees.json").write_text(q.read_text())
    info["duree_s"] = round(time.time() - debut_chrono)
    (SORTIE / "synthese.json").write_text(json.dumps(info, indent=1, ensure_ascii=False, default=float))
    print(json.dumps({k: v for k, v in info.items() if k != "defauts"}, indent=1, ensure_ascii=False, default=float))


if __name__ == "__main__":
    main()
