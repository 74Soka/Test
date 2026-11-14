"""Moteur d'exécution événementiel sur bougies M1 BID/ASK réelles (Dukascopy).

Hypothèses (volontairement prudentes) :
  - un ordre n'est exécutable qu'à partir de la première minute qui OUVRE après la clôture du signal ;
  - achat exécuté à l'ASK, vente au BID ; le stop d'un achat se déclenche quand le BID touche le stop,
    celui d'une vente quand l'ASK le touche. Le spread est celui mesuré minute par minute, × `mult_spread` ;
  - ordre au marché et stop : + `slippage` points défavorables ; cible (ordre limite) : pas de slippage ;
  - ordre limite rempli au prix limite (jamais d'amélioration de prix), annulé si la cible est atteinte
    avant le remplissage ou à expiration ;
  - si stop et cible sont touchés dans la même minute → on compte le STOP ;
  - sur la minute de remplissage d'un ordre limite, seul le stop est testé (pas la cible) ;
  - gap à l'ouverture au-delà du stop → sortie à l'ouverture (moins le slippage) ;
  - `commission` en points par aller-retour, retirée en R ;
  - une seule position à la fois ; un seul trade (rempli) par killzone et par jour ;
  - clôture forcée à l'heure de sortie (15:55 NY par défaut).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from strategy.ict import Ordre


@dataclass
class Couts:
    mult_spread: float = 1.0
    slippage: float = 1.0      # points, ordres au marché et stops
    commission: float = 0.0    # points par aller-retour (CFD indices : généralement inclus dans le spread)

    @staticmethod
    def scenario(nom: str) -> "Couts":
        return {"sans": Couts(0.0, 0.0, 0.0), "realiste": Couts(1.0, 1.0, 0.0),
                "double": Couts(2.0, 2.0, 0.5)}[nom]


class Marche:
    """Tableaux numpy M1 prêts pour la simulation."""

    def __init__(self, m1: pd.DataFrame):
        self.t = m1.index.asi8 if hasattr(m1.index, "asi8") else m1.index.view("int64")
        self.t = np.asarray(m1.index.tz_convert("UTC").tz_localize(None).values.astype("datetime64[ns]").astype("int64"))
        self.o, self.h, self.l, self.c = (m1[k].to_numpy(float) for k in ("o", "h", "l", "c"))
        self.so = (m1["ao"] - m1["o"]).to_numpy(float).clip(0)
        self.sh = (m1["ah"] - m1["h"]).to_numpy(float).clip(0)
        self.sl = (m1["al"] - m1["l"]).to_numpy(float).clip(0)
        self.sc = (m1["ac"] - m1["c"]).to_numpy(float).clip(0)

    def i(self, ts: pd.Timestamp) -> int:
        return int(np.searchsorted(self.t, ts.tz_convert("UTC").tz_localize(None).value))


def _premier(masque: np.ndarray) -> int:
    """Indice du premier True, ou -1."""
    k = int(np.argmax(masque)) if len(masque) else 0
    return k if len(masque) and masque[k] else -1


def simuler(ordres: list[Ordre], mk: Marche, couts: Couts) -> pd.DataFrame:
    m, slip = couts.mult_spread, couts.slippage
    res = []
    occupe_jusqua = -1            # indice M1 jusqu'auquel une position/ordre est actif
    kz_remplies: set = set()
    for od in ordres:
        cle = (od.seance, od.kz)
        if cle in kz_remplies:
            continue
        i0 = mk.i(od.t_signal)
        if i0 >= len(mk.t) or i0 <= occupe_jusqua:
            continue
        if mk.t[i0] - od.t_signal.tz_convert("UTC").tz_localize(None).value > 10 * 60e9:
            continue                                   # trou de données juste après le signal
        i_exp = mk.i(od.expiration)
        i_out = min(mk.i(od.sortie_temps), len(mk.t) - 1)
        if i0 >= i_out:
            continue
        s = od.sens
        ask_o = mk.o + m * mk.so; ask_h = None  # calculés à la demande sur les tranches
        # ----- entrée
        if od.type == "marche":
            f = i0
            entree = (mk.o[f] + m * mk.so[f] + slip) if s > 0 else (mk.o[f] - slip)
            debut_gestion = f
        else:
            sl_ = slice(i0, max(i_exp, i0 + 1))
            if s > 0:
                rempli = (mk.l[sl_] + m * mk.sl[sl_]) <= od.prix
                annule = mk.h[sl_] >= od.tp
            else:
                rempli = mk.h[sl_] >= od.prix
                annule = (mk.l[sl_] + m * mk.sl[sl_]) <= od.tp
            kf, ka = _premier(rempli), _premier(annule)
            if kf < 0 or (0 <= ka < kf):
                fin = i0 + (ka if ka >= 0 else (sl_.stop - i0))
                occupe_jusqua = fin
                res.append(dict(t_signal=od.t_signal, kz=od.kz, sens=s, statut="non_rempli",
                                variante_meta=od.meta.get("niveau")))
                continue
            f = i0 + kf
            entree = od.prix
            debut_gestion = f + 1
        risque = abs(entree - od.sl)
        if (s > 0 and entree <= od.sl) or (s < 0 and entree >= od.sl) or risque <= 0:
            continue
        tp = od.tp if np.isfinite(od.tp) else entree + s * od.rr * risque

        # ----- gestion : fenêtre [f, i_out)
        w = slice(f, i_out)
        bid_l, bid_h, bid_o = mk.l[w], mk.h[w], mk.o[w]
        ask_l, ask_h, ask_o = mk.l[w] + m * mk.sl[w], mk.h[w] + m * mk.sh[w], mk.o[w] + m * mk.so[w]
        decal = debut_gestion - f   # 0 (marché) ou 1 (limite : pas de cible sur la minute de remplissage)
        if s > 0:
            touche_sl = bid_l <= od.sl
            touche_tp = bid_h >= tp
            touche_1r = bid_h >= entree + risque
        else:
            touche_sl = ask_h >= od.sl
            touche_tp = ask_l <= tp
            touche_1r = ask_l <= entree - risque
        touche_tp = touche_tp.copy(); touche_tp[:decal] = False
        touche_1r = touche_1r.copy(); touche_1r[:decal] = False

        def prix_stop(k, niveau):
            if s > 0:
                return min(niveau, bid_o[k]) - slip
            return max(niveau, ask_o[k]) + slip

        def sortie_temps():
            k = i_out - f
            if f + k >= len(mk.t):
                k = len(mk.t) - 1 - f
            px = (mk.o[f + k] - slip) if s > 0 else (mk.o[f + k] + m * mk.so[f + k] + slip)
            return f + k, px

        a, b = _premier(touche_sl), _premier(touche_tp)
        morceaux = []  # (fraction, prix_sortie, raison, indice)
        if od.gestion == "be_partiel":
            b1 = _premier(touche_1r)
            if b1 >= 0 and (a < 0 or b1 < a):
                morceaux.append((0.5, entree + s * risque, "partiel_1R", f + b1))
                # reste : stop au break-even à partir de la minute suivante
                if s > 0:
                    touche_be = bid_l <= entree
                else:
                    touche_be = ask_h >= entree
                touche_be = touche_be.copy(); touche_be[:b1 + 1] = False
                tp2 = touche_tp.copy(); tp2[:b1] = False
                a2, b2 = _premier(touche_be), _premier(tp2)
                if a2 >= 0 and (b2 < 0 or a2 <= b2):
                    morceaux.append((0.5, prix_stop(a2, entree), "break_even", f + a2))
                elif b2 >= 0:
                    morceaux.append((0.5, tp, "cible", f + b2))
                else:
                    k, px = sortie_temps(); morceaux.append((0.5, px, "temps", k))
        if not morceaux:
            if a >= 0 and (b < 0 or a <= b):
                morceaux.append((1.0, prix_stop(a, od.sl), "stop", f + a))
            elif b >= 0:
                morceaux.append((1.0, tp, "cible", f + b))
            else:
                k, px = sortie_temps(); morceaux.append((1.0, px, "temps", k))

        r = sum(fr * s * (px - entree) for fr, px, _, _ in morceaux) / risque - couts.commission / risque
        i_fin = max(k for *_, k in morceaux)
        occupe_jusqua = i_fin
        kz_remplies.add(cle)
        res.append(dict(
            t_signal=od.t_signal, t_entree=pd.Timestamp(mk.t[f], tz="UTC"),
            t_sortie=pd.Timestamp(mk.t[i_fin], tz="UTC"), kz=od.kz, sens=s, statut="rempli",
            type=od.type, entree=entree, sl=od.sl, tp=tp, rr_vise=abs(tp - entree) / risque,
            risque_pts=risque, raison=morceaux[-1][2], r=r, niveau=od.meta.get("niveau"),
            atr=od.meta.get("atr"),
        ))
    df = pd.DataFrame(res)
    if len(df) and "t_entree" in df:
        for col in ("t_entree", "t_sortie"):
            df[col] = pd.to_datetime(df[col]).dt.tz_convert("America/New_York")
    return df
