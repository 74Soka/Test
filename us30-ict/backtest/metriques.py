"""Métriques de performance, courbe d'equity à risque fixe, règles prop firm, Monte Carlo."""
from __future__ import annotations

import numpy as np
import pandas as pd


def equity(trades: pd.DataFrame, risque_pct: float = 0.5, capital: float = 100_000.0) -> pd.Series:
    """Equity composée : chaque trade risque `risque_pct` % du capital courant (pas de martingale)."""
    r = trades["r"].to_numpy(float)
    eq = capital * np.cumprod(1 + risque_pct / 100 * r)
    return pd.Series(eq, index=trades["t_sortie"].to_numpy())


def drawdown(eq: pd.Series) -> tuple[float, pd.Timedelta]:
    """Drawdown max (en %) et plus longue durée sous un plus haut (en temps calendaire)."""
    pic = eq.cummax()
    dd = (eq / pic - 1).min() * 100
    sous = eq < pic
    duree, debut = pd.Timedelta(0), None
    for t, s in zip(eq.index, sous.to_numpy()):
        if s and debut is None:
            debut = t
        if not s and debut is not None:
            duree = max(duree, pd.Timestamp(t) - pd.Timestamp(debut)); debut = None
    if debut is not None:
        duree = max(duree, pd.Timestamp(eq.index[-1]) - pd.Timestamp(debut))
    return float(dd), duree


def serie_perdante(r: np.ndarray) -> int:
    m = c = 0
    for x in r:
        c = c + 1 if x < 0 else 0
        m = max(m, c)
    return m


def metriques(trades: pd.DataFrame, risque_pct: float = 0.5, capital: float = 100_000.0) -> dict:
    t = trades[trades["statut"] == "rempli"] if "statut" in trades else trades
    if len(t) == 0:
        return {"trades": 0}
    r = t["r"].to_numpy(float)
    eq = equity(t, risque_pct, capital)
    gains, pertes = r[r > 0], r[r < 0]
    dd, duree = drawdown(pd.concat([pd.Series([capital], index=[eq.index[0]]), eq]))
    # rendements quotidiens (jours de bourse avec ou sans trade) pour Sharpe/Sortino
    jour = pd.Series(risque_pct / 100 * r, index=pd.to_datetime(t["t_sortie"]).dt.date.values)
    quotid = jour.groupby(level=0).sum()
    tous = pd.bdate_range(min(quotid.index), max(quotid.index)).date
    quotid = quotid.reindex(tous, fill_value=0.0)
    sharpe = quotid.mean() / quotid.std() * np.sqrt(252) if quotid.std() > 0 else np.nan
    neg = quotid[quotid < 0]
    sortino = quotid.mean() / np.sqrt((neg ** 2).sum() / len(quotid)) * np.sqrt(252) if len(neg) else np.nan
    annees = max((pd.Timestamp(eq.index[-1]) - pd.Timestamp(eq.index[0])).days / 365.25, 1e-9)
    return {
        "trades": int(len(r)),
        "trades_par_an": len(r) / annees,
        "winrate_%": 100 * (r > 0).mean(),
        "gain_moyen_R": gains.mean() if len(gains) else 0.0,
        "perte_moyenne_R": pertes.mean() if len(pertes) else 0.0,
        "rr_moyen_realise": (gains.mean() / -pertes.mean()) if len(gains) and len(pertes) else np.nan,
        "profit_factor": gains.sum() / -pertes.sum() if len(pertes) else np.inf,
        "expectancy_R": r.mean(),
        "total_R": r.sum(),
        "erreur_type_R": r.std(ddof=1) / np.sqrt(len(r)) if len(r) > 1 else np.nan,
        "t_stat": r.mean() / (r.std(ddof=1) / np.sqrt(len(r))) if len(r) > 1 and r.std() > 0 else np.nan,
        "net_profit_%": (eq.iloc[-1] / capital - 1) * 100,
        "cagr_%": ((eq.iloc[-1] / capital) ** (1 / annees) - 1) * 100 if annees >= 0.5 else np.nan,
        "sharpe": sharpe, "sortino": sortino,
        "max_dd_%": dd, "duree_max_dd_jours": duree.days,
        "plus_longue_serie_perdante": serie_perdante(r),
    }


def regles_prop(trades: pd.DataFrame, risque_pct: float = 0.5, dd_jour_max: float = 5.0,
                dd_total_max: float = 10.0, capital: float = 100_000.0) -> dict:
    """Vérifie les limites type prop firm (perte quotidienne vs solde de début de jour, DD statique)."""
    t = trades[trades["statut"] == "rempli"] if "statut" in trades else trades
    if len(t) == 0:
        return {}
    eq = equity(t, risque_pct, capital)
    jours = pd.to_datetime(t["t_sortie"]).dt.date.values
    df = pd.DataFrame({"eq": eq.to_numpy(), "jour": jours})
    df["eq_avant"] = df["eq"].shift(1).fillna(capital)
    debut_jour = df.groupby("jour")["eq_avant"].first()
    min_jour = df.groupby("jour")["eq"].min()
    pire_jour = ((min_jour / debut_jour - 1) * 100).min()
    viol_jour = int(((min_jour / debut_jour - 1) * 100 <= -dd_jour_max).sum())
    viol_total = df.index[df["eq"] <= capital * (1 - dd_total_max / 100)]
    return {"pire_journee_%": float(pire_jour), "violations_dd_quotidien": viol_jour,
            "dd_total_franchi": bool(len(viol_total)),
            "date_premier_franchissement": str(jours[viol_total[0]]) if len(viol_total) else None}


def monte_carlo(r: np.ndarray, risque_pct: float = 0.5, n: int = 10_000, seuil_ruine_pct: float = 10.0,
                graine: int = 7, bootstrap: bool = False) -> dict:
    """Permutations (ou bootstrap) de l'ordre des trades → distribution du DD max et du résultat."""
    rng = np.random.default_rng(graine)
    r = np.asarray(r, float)
    k = risque_pct / 100
    dds, finaux = np.empty(n), np.empty(n)
    for i in range(n):
        x = rng.choice(r, len(r), replace=True) if bootstrap else rng.permutation(r)
        eq = np.cumprod(1 + k * x)
        eq = np.r_[1.0, eq]
        dds[i] = (eq / np.maximum.accumulate(eq) - 1).min() * 100
        finaux[i] = (eq[-1] - 1) * 100
    return {
        "dd_median_%": float(np.median(dds)), "dd_p95_%": float(np.percentile(dds, 5)),
        "dd_p99_%": float(np.percentile(dds, 1)),
        f"proba_dd_>{seuil_ruine_pct:g}%": float((dds <= -seuil_ruine_pct).mean() * 100),
        "proba_dd_>20%": float((dds <= -20).mean() * 100),
        "resultat_median_%": float(np.median(finaux)), "resultat_p5_%": float(np.percentile(finaux, 5)),
        "proba_perte_%": float((finaux < 0).mean() * 100),
        "_dds": dds, "_finaux": finaux,
    }
