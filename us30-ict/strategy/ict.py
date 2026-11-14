"""Générateur de setups ICT sur M5 (signaux) → liste d'ordres exécutés ensuite sur M1 par le moteur.

Logique commune (toutes variantes) pour une killzone donnée :
  1. Liquidité : niveaux « intacts » au début de la killzone (non touchés depuis leur formation) :
       Londres : PDH/PDL, haut/bas Asie ; NY AM : + haut/bas Londres ; NY PM : + haut/bas NY AM.
       (option `liq_egaux` : equal highs/lows = 2 swings confirmés à moins de 0,1×ATR l'un de l'autre)
  2. Sweep (raid) : une bougie M5 de la killzone dépasse un niveau intact (achat-side → setup vendeur).
     L'extrême du sweep est suivi tant que le setup est vivant.
  3. MSS : dans les `max_barres_mss` bougies suivantes, une bougie CLÔTURE au-delà du dernier swing
     confirmé (fractale d'ordre n, connue n bougies après) qui a précédé l'extrême, avec displacement :
     au moins une bougie de la jambe extrême → cassure avec corps ≥ `disp_atr` × ATR(20) (ATR au sweep)
     et corps ≥ 50 % de son amplitude.
     Une cassure sans displacement annule le setup.
     Le sweep doit avoir lieu DANS la killzone ; le MSS peut suivre jusqu'à `max_barres_mss` bougies après.
  4. Entrée selon la variante (voir VARIANTES). Stop au-delà de l'extrême du sweep (+ `buffer_sl` pts).
     Ordre limite valable `attente_max` bougies M5 après le signal.

Le signal n'existe qu'à la CLÔTURE de la bougie MSS (horodatage + 5 min) : le moteur ne peut exécuter
qu'à partir de la minute suivante.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .detecteurs import atr, fvg, niveaux_seance, swings

KILLZONES = {  # (début, fin) heure NY ; la killzone Londres ne déborde pas sur NY
    "londres": (dt.time(2, 0), dt.time(5, 0)),
    "ny_am": (dt.time(8, 30), dt.time(11, 0)),
    "ny_pm": (dt.time(13, 30), dt.time(16, 0)),
}

VARIANTES = {
    "V1": "Sweep + MSS, entrée au marché à la clôture du MSS, cible RR fixe",
    "V2": "Sweep + MSS, entrée limite dans le FVG du displacement (CE), cible RR fixe",
    "V3": "V2 en OTE : limite à 70,5 % du dealing range + filtre premium/discount vs open de minuit",
    "V4": "V3 + biais D1 + cible = liquidité opposée + sortie partielle 50 % à 1R et break-even",
}

DEFAUTS = dict(
    variante="V2", killzones=("londres", "ny_am"), n_swing=2, disp_atr=1.0, corps_min=0.5,
    max_barres_mss=12, rr=2.0, buffer_sl=2.0, stop_min=10.0, stop_max_atr=8.0, fvg_min_atr=0.1,
    entree_fvg="ce", attente_max=12, filtre_news=True, choc_multiple=3.0, liq_egaux=False,
    biais=None, cible="rr", gestion="aucune", heure_sortie=dt.time(15, 55), sortie_londres=dt.time(11, 0), rr_min_liq=1.5, rr_max_liq=5.0,
)


DERNIERES_STATS: dict = {}  # entonnoir de détection du dernier appel (diagnostic)


@dataclass
class Ordre:
    t_signal: pd.Timestamp      # clôture de la bougie M5 du MSS (premier instant exécutable)
    sens: int                   # +1 achat, -1 vente
    type: str                   # "marche" | "limite"
    prix: float                 # prix limite (NaN si marché)
    sl: float
    tp: float                   # NaN → calculé par le moteur depuis rr et le prix réel d'entrée
    rr: float
    expiration: pd.Timestamp    # annulation si non exécuté
    sortie_temps: pd.Timestamp  # clôture forcée
    kz: str
    seance: pd.Timestamp
    gestion: str
    meta: dict = field(default_factory=dict)


def _seances_news(m5: pd.DataFrame, news: dict | None) -> set:
    if not news:
        return set()
    return set().union(*news.values())


def generer_ordres(m5: pd.DataFrame, params: dict, news: dict | None = None) -> list[Ordre]:
    P = {**DEFAUTS, **params}
    o, h, l, c = (m5[k].to_numpy(float) for k in ("o", "h", "l", "c"))
    idx = m5.index
    N = len(m5)
    A = atr(h, l, c, 20)
    sh, sl_ = swings(h, l, P["n_swing"])
    n = P["n_swing"]
    fbh, fhh, fbb, fhb = fvg(h, l)
    niv = niveaux_seance(m5)
    seance_arr = m5["seance"].to_numpy()
    minutes = (idx.hour * 60 + idx.minute).to_numpy()

    # Swings confirmés : indice de confirmation k+n → valeur du swing
    conf_sh = np.full(N, np.nan); conf_sl = np.full(N, np.nan)
    ksh = np.where(sh)[0]; ksl = np.where(sl_)[0]
    conf_sh[ksh[ksh + n < N] + n] = h[ksh[ksh + n < N]]
    conf_sl[ksl[ksl + n < N] + n] = l[ksl[ksl + n < N]]
    # dernier swing confirmé connu à chaque bougie (valeur et indice du swing)
    dern_sh = pd.Series(conf_sh).ffill().to_numpy()
    dern_sl = pd.Series(conf_sl).ffill().to_numpy()
    k_sh = np.full(N, np.nan); k_sh[ksh[ksh + n < N] + n] = ksh[ksh + n < N]
    k_sl = np.full(N, np.nan); k_sl[ksl[ksl + n < N] + n] = ksl[ksl + n < N]
    dern_ksh = pd.Series(k_sh).ffill().to_numpy()
    dern_ksl = pd.Series(k_sl).ffill().to_numpy()

    jours_news = news or {}
    P["_stats"] = STATS = {}
    DERNIERES_STATS.clear()
    ordres: list[Ordre] = []
    debut_seance = {}
    seances_uniques, premiers = np.unique(seance_arr, return_index=True)
    for s, p in zip(seances_uniques, premiers):
        debut_seance[s] = p

    for kz in P["killzones"]:
        t0, t1 = KILLZONES[kz]
        m0, m1_ = t0.hour * 60 + t0.minute, t1.hour * 60 + t1.minute
        dans_kz = (minutes >= m0) & (minutes < m1_)
        pos = np.where(dans_kz)[0]
        if len(pos) == 0:
            continue
        # regrouper les indices par séance
        coupures = np.where(np.diff(seance_arr[pos]) != np.timedelta64(0))[0] + 1
        for bloc in np.split(pos, coupures):
            s = seance_arr[bloc[0]]
            ts_s = pd.Timestamp(s)
            jour = ts_s.date()
            if ts_s not in niv.index:
                continue
            nv = niv.loc[ts_s]
            if P["filtre_news"] and kz != "londres":
                if (jour in jours_news.get("fomc", set()) or jour in jours_news.get("nfp", set())
                        or jour in jours_news.get("choc_0830", set())):
                    continue
            ordres += _scanner_killzone(P, kz, bloc, idx, o, h, l, c, A, dern_sh, dern_sl,
                                        dern_ksh, dern_ksl, fbh, fhh, fbb, fhb, nv, debut_seance[s],
                                        sh, sl_, n)
    ordres.sort(key=lambda x: x.t_signal)
    DERNIERES_STATS.update(STATS, ordres=len(ordres))
    return ordres


def _niveaux_intacts(kz, nv, idx, h, l, i_debut_seance, i_kz):
    """Niveaux non touchés entre leur formation et le début de la killzone (sinon déjà « pris »)."""
    hauts, bas = {}, {}
    def ok_haut(nom, v, i_ref):
        if np.isfinite(v) and (i_ref >= i_kz or h[i_ref:i_kz].max(initial=-np.inf) < v):
            hauts[nom] = v
    def ok_bas(nom, v, i_ref):
        if np.isfinite(v) and (i_ref >= i_kz or l[i_ref:i_kz].min(initial=np.inf) > v):
            bas[nom] = v
    t_kz = idx[i_kz]
    # position de minuit / 05:00 / 11:00 de la séance (recherche dans l'index)
    def i_heure(hh, mm):
        cible = t_kz.normalize() + pd.Timedelta(hours=hh, minutes=mm)
        return int(idx.searchsorted(cible))
    ok_haut("PDH", nv["pdh"], i_debut_seance); ok_bas("PDL", nv["pdl"], i_debut_seance)
    ok_haut("ASIE_H", nv["asie_h"], i_heure(0, 0)); ok_bas("ASIE_L", nv["asie_l"], i_heure(0, 0))
    if kz in ("ny_am", "ny_pm"):
        ok_haut("LONDRES_H", nv["londres_h"], i_heure(5, 0)); ok_bas("LONDRES_L", nv["londres_l"], i_heure(5, 0))
    if kz == "ny_pm":
        a, b = i_heure(8, 30), i_heure(11, 0)
        if b > a:
            ok_haut("NYAM_H", h[a:b].max(), b); ok_bas("NYAM_L", l[a:b].min(), b)
    return hauts, bas


def _egaux(sh, sl_, h, l, A, i_kz, n, fen=288):
    """Equal highs/lows : paires de swings confirmés avant la killzone, écart < 0,1 ATR."""
    a = max(0, i_kz - fen)
    tol = 0.1 * A[i_kz - 1] if np.isfinite(A[i_kz - 1]) else 0
    res_h, res_l = {}, {}
    kh = [k for k in np.where(sh[a:i_kz - n])[0] + a]
    kl = [k for k in np.where(sl_[a:i_kz - n])[0] + a]
    for liste, src, dest, sens in ((kh, h, res_h, 1), (kl, l, res_l, -1)):
        for x in range(len(liste) - 1):
            for y in range(x + 1, len(liste)):
                if abs(src[liste[x]] - src[liste[y]]) <= tol:
                    v = max(src[liste[x]], src[liste[y]]) if sens > 0 else min(src[liste[x]], src[liste[y]])
                    apres = src[liste[y] + 1:i_kz]
                    if sens > 0 and (len(apres) == 0 or apres.max() < v):
                        dest[f"EQH_{liste[y]}"] = v
                    if sens < 0 and (len(apres) == 0 or apres.min() > v):
                        dest[f"EQL_{liste[y]}"] = v
    return res_h, res_l


def _scanner_killzone(P, kz, bloc, idx, o, h, l, c, A, dern_sh, dern_sl, dern_ksh, dern_ksl,
                      fbh, fhh, fbb, fhb, nv, i_debut_seance, sh, sl_, n):
    i_kz = bloc[0]
    if i_kz < 30:
        return []
    hauts, bas = _niveaux_intacts(kz, nv, idx, h, l, i_debut_seance, i_kz)
    if P["liq_egaux"]:
        eh, el = _egaux(sh, sl_, h, l, A, i_kz, n)
        hauts.update(eh); bas.update(el)
    fin_kz = idx[bloc[-1]] + pd.Timedelta(minutes=5)
    hs = P["sortie_londres"] if kz == "londres" else P["heure_sortie"]  # Londres : clôture à 11:00 NY
    sortie = idx[i_kz].normalize() + pd.Timedelta(hours=hs.hour, minutes=hs.minute)
    ordres = []
    # état par sens : setup vendeur (sweep d'un haut) et acheteur (sweep d'un bas)
    etat = {-1: None, +1: None}
    st = P["_stats"]
    st["killzones"] = st.get("killzones", 0) + 1
    st["niveaux_intacts"] = st.get("niveaux_intacts", 0) + len(hauts) + len(bas)
    def compter(cle):
        st[cle] = st.get(cle, 0) + 1
    # prolongation : un sweep pris DANS la killzone peut donner son MSS jusqu'à max_barres_mss après
    dernier = bloc[-1]
    ext_fin = min(dernier + P["max_barres_mss"], len(h) - 1)
    while ext_fin > dernier and idx[ext_fin] - idx[dernier] > pd.Timedelta(minutes=5 * P["max_barres_mss"]):
        ext_fin -= 1
    balayage = list(bloc) + list(range(dernier + 1, ext_fin + 1))
    for j in balayage:
        if j > dernier:            # hors killzone : plus de nouveau sweep
            hauts, bas = {}, {}
            if etat[-1] is None and etat[+1] is None:
                break
        # --- mise à jour / détection des sweeps
        for nom, v in list(hauts.items()):
            if h[j] > v:
                del hauts[nom]
                if etat[-1] is None:
                    compter("sweeps")
                    etat[-1] = dict(i=j, ext=h[j], i_ext=j, niveau=nom, val=v)
        for nom, v in list(bas.items()):
            if l[j] < v:
                del bas[nom]
                if etat[+1] is None:
                    compter("sweeps")
                    etat[+1] = dict(i=j, ext=l[j], i_ext=j, niveau=nom, val=v)
        for sens in (-1, +1):
            e = etat[sens]
            if e is None:
                continue
            if j - e["i"] > P["max_barres_mss"]:
                compter("expires_sans_mss")
                etat[sens] = None
                continue
            if sens == -1 and h[j] > e["ext"]:
                e["ext"], e["i_ext"] = h[j], j
            if sens == +1 and l[j] < e["ext"]:
                e["ext"], e["i_ext"] = l[j], j
            # niveau de structure : dernier swing opposé confirmé ET formé avant l'extrême
            if sens == -1:
                k = dern_ksl[j]; niveau_mss = dern_sl[j]
            else:
                k = dern_ksh[j]; niveau_mss = dern_sh[j]
            if not np.isfinite(k) or k >= e["i_ext"]:
                # le dernier swing connu est postérieur à l'extrême : on garde celui retenu au départ
                niveau_mss = e.get("mss")
                if niveau_mss is None:
                    continue
            else:
                e["mss"] = niveau_mss
            if j == e["i_ext"]:
                continue
            casse = c[j] < niveau_mss if sens == -1 else c[j] > niveau_mss
            if not casse:
                continue
            # displacement : au moins une bougie de la jambe (extrême → cassure) dans le bon sens,
            # corps ≥ disp_atr × ATR (ATR figé à la bougie du sweep) et corps ≥ corps_min × amplitude
            ref_atr = A[e["i"] - 1]
            jambe = slice(e["i_ext"] + 1, j + 1)
            corps = (c[jambe] - o[jambe]) * sens
            amp = h[jambe] - l[jambe]
            fort = (corps >= P["disp_atr"] * ref_atr) & (corps >= P["corps_min"] * np.maximum(amp, 1e-9))
            if not (np.isfinite(ref_atr) and fort.any()):
                compter("mss_sans_displacement")
                etat[sens] = None   # cassure sans displacement : setup annulé
                continue
            compter("mss_valides")
            od = _construire_ordre(P, kz, sens, e, j, idx, o, h, l, c, A, fbh, fhh, fbb, fhb, nv,
                                   hauts, bas, fin_kz, sortie)
            etat[sens] = None
            if od is not None:
                ordres.append(od)
            else:
                compter("rejet_construction")
    return ordres


def _construire_ordre(P, kz, sens, e, j, idx, o, h, l, c, A, fbh, fhh, fbb, fhb, nv, hauts, bas,
                      fin_kz, sortie):
    v = P["variante"]
    t_signal = idx[j] + pd.Timedelta(minutes=5)
    sl = e["ext"] + P["buffer_sl"] if sens == -1 else e["ext"] - P["buffer_sl"]
    # dealing range : de l'extrême du sweep à l'extrême opposé du displacement (jusqu'au MSS inclus)
    seg = slice(e["i_ext"], j + 1)
    autre = l[seg].min() if sens == -1 else h[seg].max()
    meta = dict(niveau=e["niveau"], ext=float(e["ext"]), i_sweep=int(e["i"]), atr=float(A[e["i"] - 1]),
                close_mss=float(c[j]))

    # FVG du displacement : le plus récent formé entre l'extrême et le MSS, taille minimale
    zone = None
    for k in range(j, e["i_ext"] + 1, -1):
        bas_z, haut_z = (fbb[k], fhb[k]) if sens == -1 else (fbh[k], fhh[k])
        if np.isfinite(bas_z) and (haut_z - bas_z) >= P["fvg_min_atr"] * A[j - 1]:
            zone = (bas_z, haut_z)
            break

    if v == "V1":
        type_, prix = "marche", np.nan
        entree_estimee = c[j]
    elif v == "V2":
        if zone is None:
            return None
        type_ = "limite"
        prix = (zone[0] + zone[1]) / 2 if P["entree_fvg"] == "ce" else (zone[0] if sens == -1 else zone[1])
        entree_estimee = prix
    elif v in ("V3", "V4"):
        if zone is None:
            return None
        type_ = "limite"
        rng = e["ext"] - autre if sens == -1 else autre - e["ext"]
        prix = autre + 0.705 * rng if sens == -1 else autre - 0.705 * rng
        entree_estimee = prix
        om = nv["open_minuit"]
        if kz != "londres" or np.isfinite(om):
            # premium/discount journalier : vendre au-dessus de l'open de minuit, acheter en dessous
            if np.isfinite(om) and ((sens == -1 and prix <= om) or (sens == +1 and prix >= om)):
                return None
        if v == "V4":
            biais = np.sign(nv["pdc"] - nv["pd_mid"])
            if biais != sens:
                return None
    else:
        raise ValueError(v)

    risque = abs(entree_estimee - sl)
    if not np.isfinite(risque) or risque < P["stop_min"] or risque > P["stop_max_atr"] * A[j - 1]:
        return None
    if (sens == -1 and entree_estimee >= sl) or (sens == +1 and entree_estimee <= sl):
        return None

    rr, tp = P["rr"], np.nan
    gestion = P["gestion"]
    if v == "V4" or P["cible"] == "liquidite":
        # cible = pool de liquidité opposé intact le plus proche donnant au moins rr_min_liq
        pools = sorted(bas.values(), reverse=True) if sens == -1 else sorted(hauts.values())
        for pv in pools + [nv["pdl"] if sens == -1 else nv["pdh"]]:
            if not np.isfinite(pv):
                continue
            r_mult = (entree_estimee - pv) / risque if sens == -1 else (pv - entree_estimee) / risque
            if r_mult >= P["rr_min_liq"]:
                rr = min(r_mult, P["rr_max_liq"])
                break
        else:
            rr = P["rr"]
        if v == "V4" and P["gestion"] == "aucune":
            gestion = "be_partiel"
    if type_ == "limite":
        tp = prix - rr * risque if sens == -1 else prix + rr * risque

    expiration = (min(t_signal + pd.Timedelta(minutes=5 * P["attente_max"]), sortie) if type_ == "limite"
                  else t_signal + pd.Timedelta(minutes=2))
    return Ordre(t_signal, sens, type_, float(prix), float(sl), float(tp), float(rr), expiration,
                 sortie, kz, pd.Timestamp(idx[j].normalize()), gestion, meta)
