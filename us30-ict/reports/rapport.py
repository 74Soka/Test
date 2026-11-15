"""Génère reports/rapport.html à partir de reports/resultats/ (écrit par backtest/etude.py)
et des commentaires rédigés dans reports/commentaire.json.

Usage : python -m reports.rapport
Page autonome : données embarquées en JSON, graphiques Chart.js (cdnjs), thèmes clair/sombre.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

import numpy as np
import pandas as pd

ICI = Path(__file__).resolve().parent
RES = ICI / "resultats"

VARIANTES_TXT = {
    "V1": "Sweep + MSS, entrée au marché à la clôture du MSS, cible RR fixe",
    "V2": "Sweep + MSS, ordre limite au milieu (CE) du FVG du displacement, cible RR fixe",
    "V3": "V2 avec entrée OTE (70,5 % du dealing range) + filtre premium/discount vs open de minuit",
    "V4": "V3 + biais D1 (clôture de la veille vs milieu de son range) + cible = liquidité opposée + 50 % à 1R puis break-even",
}


def fr(x, d=2, signe=False, suf=""):
    """Nombre au format français."""
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    s = f"{x:+,.{d}f}" if signe else f"{x:,.{d}f}"
    return s.replace(",", "\u202f").replace(".", ",") + suf


def lire_json(nom):
    p = RES / nom
    return json.loads(p.read_text()) if p.exists() else {}


def courbe(tr: pd.DataFrame, pas=1):
    """Points (date ISO, R cumulés) pour la courbe d'equity."""
    if len(tr) == 0:
        return []
    t = tr.sort_values("t_sortie")
    cum = t["r"].cumsum().to_numpy()
    dates = pd.to_datetime(t["t_sortie"]).dt.strftime("%Y-%m-%d").to_numpy()
    depart = pd.to_datetime(t["t_entree"]).dt.strftime("%Y-%m-%d").iloc[0]
    return ([[depart, 0.0]] + [[dates[i], round(float(cum[i]), 2)] for i in range(0, len(t), pas)]
            + [[dates[-1], round(float(cum[-1]), 2)]])


def sous_eau(tr: pd.DataFrame, risque_pct: float):
    if len(tr) == 0:
        return []
    t = tr.sort_values("t_sortie")
    eq = np.cumprod(1 + risque_pct / 100 * t["r"].to_numpy())
    eq = np.r_[1.0, eq]
    dd = (eq / np.maximum.accumulate(eq) - 1)[1:] * 100
    dates = pd.to_datetime(t["t_sortie"]).dt.strftime("%Y-%m-%d").to_numpy()
    return [[dates[i], round(float(dd[i]), 2)] for i in range(len(t))]


def histogramme(x: np.ndarray, n=30):
    x = x[np.isfinite(x)]
    if len(x) == 0:
        return {"bords": [], "comptes": []}
    c, b = np.histogram(x, bins=n)
    return {"bords": [round(float(v), 3) for v in b], "comptes": [int(v) for v in c]}


def tableau_heatmap(df: pd.DataFrame, p1: str, p2: str, col: str, defaut1, defaut2) -> str:
    """Tableau HTML coloré (divergent bleu/rouge, gris à zéro) — lu en IS pour choisir, en OOS pour vérifier."""
    if df.empty or col not in df:
        return "<p class='muted'>Non disponible.</p>"
    piv = df.pivot(index=p1, columns=p2, values=col)
    nb = df.pivot(index=p1, columns=p2, values=col.replace("expectancy_R", "trades"))
    vmax = max(float(np.nanmax(np.abs(piv.to_numpy()))), 0.05)
    lignes = [f"<tr><th class='coin'>{html.escape(p1)} ↓ / {html.escape(p2)} →</th>" +
              "".join(f"<th>{fr(c, 1) if isinstance(c, float) else c}</th>" for c in piv.columns) + "</tr>"]
    for i in piv.index:
        cells = []
        for c in piv.columns:
            v = piv.loc[i, c]; n = nb.loc[i, c]
            if not np.isfinite(v):
                cells.append("<td>–</td>"); continue
            pct = min(75, int(abs(v) / vmax * 75))
            var = "--pos" if v > 0 else "--neg"
            defaut = " class='defaut'" if (i == defaut1 and c == defaut2) else ""
            cells.append(f"<td{defaut} style='background:color-mix(in oklab, var({var}) {pct}%, var(--mid))' "
                         f"title='{p1}={i}, {p2}={c} : {fr(v, 3, True)} R sur {int(n)} trades'>"
                         f"<b>{fr(v, 2, True)}</b><small>{int(n)}</small></td>")
        lignes.append(f"<tr><th>{fr(i, 1) if isinstance(i, float) else i}</th>{''.join(cells)}</tr>")
    return "<div class='defile'><table class='heat'>" + "".join(lignes) + "</table></div>"


def tableau(df: pd.DataFrame, colonnes: dict, formats: dict | None = None, classe="") -> str:
    formats = formats or {}
    tete = "".join(f"<th>{html.escape(v)}</th>" for v in colonnes.values())
    corps = []
    for _, r in df.iterrows():
        cells = []
        for k in colonnes:
            v = r.get(k)
            f = formats.get(k)
            txt = f(v) if f else (html.escape(str(v)) if v is not None else "–")
            cells.append(f"<td>{txt}</td>")
        corps.append("<tr>" + "".join(cells) + "</tr>")
    return f"<div class='defile'><table class='{classe}'><thead><tr>{tete}</tr></thead><tbody>{''.join(corps)}</tbody></table></div>"


def liste(items):
    return "<ul>" + "".join(f"<li>{x}</li>" for x in items) + "</ul>"


def main():
    info = lire_json("synthese.json")
    com = json.loads((ICI / "commentaire.json").read_text())
    qual = lire_json("qualite_donnees.json")
    ret = info["variante_retenue_sur_IS"]
    risque = info.get("risque_pct", 0.5)
    coupure = info["coupure_is_oos"]
    var = pd.read_csv(RES / "variantes.csv")

    tr = {c: pd.read_parquet(RES / f"trades_{ret}_{c}.parquet") for c in ("sans", "realiste", "double")}
    t = tr["realiste"]
    is_ = t[pd.to_datetime(t["t_entree"]).dt.strftime("%Y-%m-%d") < coupure]
    oos = t[pd.to_datetime(t["t_entree"]).dt.strftime("%Y-%m-%d") >= coupure]
    lig = var[(var["variante"] == ret) & (var["couts"] == "realiste")].iloc[0]

    # ---------- tableau des variantes
    rows = []
    for v in ["V1", "V2", "V3", "V4"]:
        for c, lib in (("realiste", "réalistes"), ("double", "doublés"), ("sans", "aucun")):
            x = var[(var["variante"] == v) & (var["couts"] == c)]
            if len(x):
                x = x.iloc[0]
                rows.append({"v": v if c == "realiste" else "", "c": lib, "n": x.get("trades"),
                             "wr": x.get("winrate_%"), "e": x.get("expectancy_R"), "pf": x.get("profit_factor"),
                             "dd": x.get("max_dd_%"), "ise": x.get("IS_expectancy_R"), "isn": x.get("IS_trades"),
                             "oose": x.get("OOS_expectancy_R"), "oosn": x.get("OOS_trades"), "t": x.get("t_stat")})
    for v in ["V1", "V2", "V3", "V4"]:
        x = var[(var["variante"] == f"{v}+PM")]
        if len(x):
            x = x.iloc[0]
            rows.append({"v": f"{v} + NY PM", "c": "réalistes", "n": x.get("trades"), "wr": x.get("winrate_%"),
                         "e": x.get("expectancy_R"), "pf": x.get("profit_factor"), "dd": x.get("max_dd_%"),
                         "ise": x.get("IS_expectancy_R"), "isn": x.get("IS_trades"),
                         "oose": x.get("OOS_expectancy_R"), "oosn": x.get("OOS_trades"), "t": x.get("t_stat")})
    f_int = lambda v: fr(v, 0) if v is not None and np.isfinite(v) else "–"
    tab_var = tableau(pd.DataFrame(rows), {
        "v": "Variante", "c": "Coûts", "n": "Trades", "wr": "Gagnants %", "e": "Espérance (R)", "pf": "Profit factor",
        "dd": "DD max %", "isn": "Trades IS", "ise": "Esp. IS (R)", "oosn": "Trades OOS", "oose": "Esp. OOS (R)", "t": "t-stat"},
        {"n": f_int, "wr": lambda v: fr(v, 1), "e": lambda v: fr(v, 3, True), "pf": lambda v: fr(v, 2),
         "dd": lambda v: fr(v, 1), "isn": f_int, "ise": lambda v: fr(v, 3, True), "oosn": f_int,
         "oose": lambda v: fr(v, 3, True), "t": lambda v: fr(v, 2, True)}, "num")

    # ---------- heatmaps
    heat = []
    titres = {"disp_rr": ("Displacement (× ATR) × objectif en R", "disp_atr", "rr", 1.0, 2.0),
              "swing_mss": ("Ordre des fractales × délai max sweep → MSS (bougies M5)", "n_swing", "max_barres_mss", 2, 12),
              "attente_buffer": ("Attente max de l'ordre limite (bougies M5) × marge du stop (pts)", "attente_max", "buffer_sl", 12, 2.0)}
    for nom, (titre, p1, p2, d1, d2) in titres.items():
        f = RES / f"grille_{nom}.csv"
        if not f.exists():
            continue
        g = pd.read_csv(f)
        heat.append(f"<h3>{titre}</h3><div class='duo'><div><p class='leg'>In-sample (période de choix)</p>"
                    f"{tableau_heatmap(g, p1, p2, 'IS_expectancy_R', d1, d2)}</div><div><p class='leg'>Out-of-sample (vérification)</p>"
                    f"{tableau_heatmap(g, p1, p2, 'OOS_expectancy_R', d1, d2)}</div></div>")

    # ---------- walk-forward
    f_wf = RES / "walk_forward_fenetres.csv"
    fen = pd.read_csv(f_wf) if f_wf.exists() and f_wf.stat().st_size > 2 else pd.DataFrame()
    wf = pd.read_parquet(RES / "trades_walk_forward.parquet") if (RES / "trades_walk_forward.parquet").exists() else pd.DataFrame()
    tab_wf = tableau(fen, {"debut_test": "Début test", "fin_test": "Fin test", "params": "Paramètres choisis",
                           "esp_apprentissage_R": "Esp. apprentissage (R)", "trades_test": "Trades test",
                           "esp_test_R": "Esp. test (R)"},
                     {"esp_apprentissage_R": lambda v: fr(v, 3, True), "esp_test_R": lambda v: fr(v, 3, True),
                      "trades_test": f_int,
                      "params": lambda v: html.escape(str(v).replace("'disp_atr'", "disp").replace("'n_swing'", "n").replace("'rr'", "rr"))}, "num") if len(fen) else ""

    # ---------- ventilations
    vent = {}
    for cle in ("annee", "kz", "jour", "volatilite", "sens_txt", "niveau", "raison"):
        f = RES / f"ventilation_{cle}.csv"
        if f.exists():
            d = pd.read_csv(f)
            ordre = {"jour": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Sunday"],
                     "volatilite": ["basse", "moyenne", "haute"], "kz": ["londres", "ny_am", "ny_pm"]}.get(cle)
            if ordre:
                d = d.set_index(d.columns[0]).reindex([o for o in ordre if o in set(d[d.columns[0]])]).reset_index()
            noms = {"Monday": "lundi", "Tuesday": "mardi", "Wednesday": "mercredi", "Thursday": "jeudi",
                    "Friday": "vendredi", "Sunday": "dimanche", "londres": "Londres", "ny_am": "NY AM", "ny_pm": "NY PM"}
            vent[cle] = {"lab": [noms.get(str(x), str(x)) for x in d.iloc[:, 0]],
                         "e": [round(float(x), 3) for x in d["expectancy_R"]], "n": [int(x) for x in d["trades"]],
                         "wr": [round(float(x), 1) for x in d["winrate_%"]]}

    # ---------- Monte Carlo et placebo
    mc = info.get("monte_carlo", {})
    dd_tot = np.load(RES / "mc_dd_total.npy") if (RES / "mc_dd_total.npy").exists() else np.array([])
    fin_boot = np.load(RES / "mcb_final_total.npy") if (RES / "mcb_final_total.npy").exists() else np.array([])
    pla = np.load(RES / "placebo_V1.npy") if (RES / "placebo_V1.npy").exists() else np.array([])
    dd_reel = float(lig.get("max_dd_%", np.nan))

    donnees = {
        "equity": {k: courbe(v) for k, v in tr.items()},
        "wf": courbe(wf) if len(wf) else [],
        "dd": sous_eau(t, risque),
        "coupure": coupure,
        "variantes": {"lab": ["V1", "V2", "V3", "V4"],
                      "is": [float(var[(var.variante == v) & (var.couts == "realiste")]["IS_expectancy_R"].fillna(0).iloc[0]) for v in ["V1", "V2", "V3", "V4"]],
                      "oos": [float(var[(var.variante == v) & (var.couts == "realiste")]["OOS_expectancy_R"].fillna(0).iloc[0]) for v in ["V1", "V2", "V3", "V4"]]},
        "mc_dd": histogramme(dd_tot), "dd_reel": dd_reel,
        "mc_fin": histogramme(fin_boot),
        "placebo": histogramme(pla, 25), "placebo_v1": info.get("placebo_V1", {}).get("esp_V1_R"),
        "vent": vent,
    }

    def m(k, d=2, signe=False, suf=""):
        return fr(lig.get(k), d, signe, suf)

    tuiles = [("Trades (total)", m("trades", 0)), ("Espérance OOS", m("OOS_expectancy_R", 3, True, " R")),
              ("Espérance IS", m("IS_expectancy_R", 3, True, " R")), ("Profit factor", m("profit_factor")),
              ("Gagnants", m("winrate_%", 1, suf=" %")), ("DD max (0,5 %/trade)", m("max_dd_%", 1, suf=" %"))]
    tuiles_html = "".join(f"<div class='tuile'><span>{a}</span><b>{b}</b></div>" for a, b in tuiles)

    metr = [("Profit net (0,5 %/trade, composé)", m("net_profit_%", 1, True, " %")),
            ("CAGR", m("cagr_%", 2, True, " %")), ("Trades par an", m("trades_par_an", 0)),
            ("Gagnants", m("winrate_%", 1, suf=" %")), ("Gain moyen", m("gain_moyen_R", 2, True, " R")),
            ("Perte moyenne", m("perte_moyenne_R", 2, True, " R")), ("RR moyen réalisé", m("rr_moyen_realise")),
            ("Profit factor", m("profit_factor")), ("Espérance", m("expectancy_R", 3, True, " R")),
            ("Écart-type de l'espérance", m("erreur_type_R", 3, suf=" R")), ("t-stat", m("t_stat", 2, True)),
            ("Sharpe (annualisé, quotidien)", m("sharpe")), ("Sortino", m("sortino")),
            ("Drawdown max", m("max_dd_%", 1, suf=" %")), ("Durée max du drawdown", m("duree_max_dd_jours", 0, suf=" jours")),
            ("Plus longue série perdante", m("plus_longue_serie_perdante", 0, suf=" trades"))]
    metr_html = "<dl class='metr'>" + "".join(f"<div><dt>{a}</dt><dd>{b}</dd></div>" for a, b in metr) + "</dl>"

    mc_t = mc.get("total", {}).get("permutation", {}); mc_b = mc.get("total", {}).get("bootstrap", {})
    mc_o = mc.get("OOS", {}).get("permutation", {})
    mc_html = "<dl class='metr'>" + "".join(f"<div><dt>{a}</dt><dd>{b}</dd></div>" for a, b in [
        ("DD max médian (ordre des trades mélangé)", fr(mc_t.get("dd_median_%"), 1, suf=" %")),
        ("DD max, pire 5 %", fr(mc_t.get("dd_p95_%"), 1, suf=" %")),
        ("DD max, pire 1 %", fr(mc_t.get("dd_p99_%"), 1, suf=" %")),
        ("Probabilité de DD > 10 % (limite prop firm)", fr(mc_t.get("proba_dd_>10%"), 1, suf=" %")),
        ("Probabilité de DD > 20 %", fr(mc_t.get("proba_dd_>20%"), 1, suf=" %")),
        ("Résultat médian (bootstrap)", fr(mc_b.get("resultat_median_%"), 1, True, " %")),
        ("Probabilité de finir en perte (bootstrap)", fr(mc_b.get("proba_perte_%"), 1, suf=" %")),
        ("Probabilité de DD > 10 % sur l'OOS seul", fr(mc_o.get("proba_dd_>10%"), 1, suf=" %")),
    ]) + "</dl>"

    prop = info.get("prop_firm", {})
    prop_html = "<dl class='metr'>" + "".join(
        f"<div><dt>Risque {k.replace('.', ',')} par trade</dt><dd>pire journée {fr(v.get('pire_journee_%'), 2, suf=' %')} · "
        f"{'limite de 10 % franchie le ' + str(v.get('date_premier_franchissement')) if v.get('dd_total_franchi') else 'limite de 10 % jamais franchie'}"
        f" · {v.get('violations_dd_quotidien', 0)} violation(s) de la limite quotidienne de 5 %</dd></div>"
        for k, v in prop.items()) + "</dl>"

    wfm = info.get("walk_forward", {})
    pl = info.get("placebo_V1", {})
    defs = info.get("defauts", {})
    params_html = "<dl class='metr petit'>" + "".join(
        f"<div><dt>{html.escape(k)}</dt><dd>{html.escape(str(v))}</dd></div>" for k, v in defs.items()) + "</dl>"
    variantes_html = "<dl class='variantes'>" + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in VARIANTES_TXT.items()) + "</dl>"

    q = qual
    qual_html = "<dl class='metr'>" + "".join(f"<div><dt>{a}</dt><dd>{b}</dd></div>" for a, b in [
        ("Période", f"{str(q.get('premiere_minute', info['debut']))[:10]} → {str(q.get('derniere_minute', info['fin']))[:10]}"),
        ("Bougies M1 utiles", fr(q.get("minutes"), 0)), ("Jours de séance", fr(q.get("jours_de_seance"), 0)),
        ("Bougies de remplissage retirées (marché fermé)", fr(q.get("bougies_remplissage_retirees"), 0)),
        ("Doublons / bougies incohérentes", f"{q.get('doublons_bid', 0)} / {q.get('bougies_incoherentes_retirees', 0)}"),
        ("Minutes au spread estimé (pas de fichier ASK)", fr(q.get("minutes_sans_ask"), 0)),
        ("Trous > 5 min hors pause", fr(q.get("trous_>5min_hors_pause"), 0)),
        ("Spread médian NY 9:30-11:00", fr(q.get("spread_median_NY_9h30_11h_pts"), 2, suf=" pts")),
        ("Spread médian Londres 2:00-5:00", fr(q.get("spread_median_Londres_2h_5h_pts"), 2, suf=" pts")),
    ]) + "</dl>"

    gabarit = (ICI / "gabarit.html").read_text()
    remplacements = {
        "{{VERDICT_ETIQUETTE}}": com["verdict_etiquette"], "{{VERDICT_CLASSE}}": com["verdict_classe"],
        "{{VERDICT_PHRASE}}": com["verdict_phrase"], "{{RESUME}}": liste(com["resume"]),
        "{{PERIODE}}": f"{info['debut'][:10]} → {info['fin'][:10]}", "{{COUPURE}}": coupure,
        "{{RETENUE}}": ret, "{{RETENUE_TXT}}": VARIANTES_TXT.get(ret, ret), "{{TUILES}}": tuiles_html,
        "{{QUALITE}}": qual_html, "{{DONNEES_TXT}}": liste(com["donnees"]), "{{LOGIQUE}}": liste(com["logique"]),
        "{{VARIANTES}}": variantes_html, "{{TAB_VARIANTES}}": tab_var, "{{LECTURE_VARIANTES}}": liste(com["lecture_variantes"]),
        "{{METRIQUES}}": metr_html, "{{HEATMAPS}}": "".join(heat), "{{LECTURE_HEAT}}": liste(com["lecture_heatmaps"]),
        "{{TAB_WF}}": tab_wf, "{{WF_RESUME}}": f"{fr(wfm.get('trades'), 0)} trades hors échantillon, espérance {fr(wfm.get('expectancy_R'), 3, True)} R, profit factor {fr(wfm.get('profit_factor'))}, DD max {fr(wfm.get('max_dd_%'), 1)} %",
        "{{MC}}": mc_html, "{{PLACEBO_TXT}}": f"Espérance V1 : {fr(pl.get('esp_V1_R'), 3, True)} R ; placebo : moyenne {fr(pl.get('placebo_moyenne_R'), 3, True)} R, 95e centile {fr(pl.get('placebo_p95_R'), 3, True)} R. V1 bat {fr(pl.get('rang_percentile_V1'), 0)} % des tirages au hasard.",
        "{{LECTURE_ROBUSTESSE}}": liste(com["lecture_robustesse"]), "{{PROP}}": prop_html,
        "{{LECTURE_VENTIL}}": liste(com["lecture_ventilations"]),
        "{{LIMITES}}": liste(com["limites"]), "{{AMELIORATIONS}}": liste(com["ameliorations"]),
        "{{PAPER}}": liste(com["paper_trading"]), "{{PARAMS}}": params_html,
        "{{DONNEES_JSON}}": json.dumps(donnees, ensure_ascii=False, separators=(",", ":")),
        "{{RISQUE}}": fr(risque, 1),
    }
    for k, v in remplacements.items():
        gabarit = gabarit.replace(k, str(v))
    (ICI / "rapport.html").write_text(gabarit)
    print("rapport écrit :", ICI / "rapport.html", f"({len(gabarit) // 1024} Ko)")


if __name__ == "__main__":
    main()
