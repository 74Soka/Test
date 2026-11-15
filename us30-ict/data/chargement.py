"""Construction et chargement des données US30 nettoyées (Parquet, heure de New York).

Étapes de construction (`python -m data.chargement --construire`) :
  1. décodage des fichiers bruts Dukascopy BID et ASK (data/raw/) ;
  2. suppression des bougies « de remplissage » : Dukascopy livre 1 440 minutes par jour même quand
     le marché est fermé (bougie plate, volume nul) ;
  3. jointure BID/ASK minute par minute, suppression des doublons, tri ;
  4. conversion de l'horodatage UTC → America/New_York (changements d'heure gérés par la base tz) ;
  5. ajout du « jour de séance » au sens futures CME : une séance commence à 18:00 NY la veille et
     finit à 17:00 NY (le lundi commence donc le dimanche à 18:00) ;
  6. écriture de data/processed/us30_m1.parquet et us30_m5.parquet + rapport qualité.

Convention : l'horodatage d'une bougie est son heure d'OUVERTURE ; la bougie n'est connue qu'à sa
clôture (horodatage + durée). Les prix OHLC « o,h,l,c » sont ceux du BID ; « ao,ah,al,ac » ceux de l'ASK.
"""
from __future__ import annotations

import argparse
import lzma
from pathlib import Path

import numpy as np
import pandas as pd

RACINE = Path(__file__).resolve().parent
BRUT = RACINE / "raw"
TRAITE = RACINE / "processed"
FUSEAU = "America/New_York"
ECHELLE_PRIX = 1000.0

_DT = np.dtype([("t", ">i4"), ("o", ">i4"), ("c", ">i4"), ("l", ">i4"), ("h", ">i4"), ("v", ">f4")])


def _lire_cote(cote: str, debut: str | None = None, fin: str | None = None) -> pd.DataFrame:
    morceaux = []
    for f in sorted((BRUT / cote).rglob("*.bi5")):
        # nom de fichier = date UTC « AAAA-MM-JJ » ; `fin` est exclue
        if (debut and f.stem < debut) or (fin and f.stem >= fin):
            continue
        contenu = f.read_bytes()
        if not contenu:
            continue
        a = np.frombuffer(lzma.decompress(contenu), _DT)
        if len(a) == 0:
            continue
        jour = np.datetime64(f.stem, "s")
        df = pd.DataFrame({
            "ts": jour + a["t"].astype("timedelta64[s]"),
            "o": a["o"] / ECHELLE_PRIX, "h": a["h"] / ECHELLE_PRIX,
            "l": a["l"] / ECHELLE_PRIX, "c": a["c"] / ECHELLE_PRIX,
            "v": a["v"].astype("float64"),
        })
        morceaux.append(df)
    return pd.concat(morceaux, ignore_index=True)


def construire(debut: str | None = None, fin: str | None = None, suffixe: str = "") -> dict:
    """`debut` incluse / `fin` exclue (AAAA-MM-JJ, UTC) : période d'étude figée.
    `suffixe` : écrit us30_m1{suffixe}.parquet… pour garder plusieurs périodes côte à côte."""
    bid = _lire_cote("BID", debut, fin)
    ask = _lire_cote("ASK", debut, fin).rename(columns={"o": "ao", "h": "ah", "l": "al", "c": "ac", "v": "av"})
    stats = {"lignes_bid_brutes": len(bid), "lignes_ask_brutes": len(ask)}

    # Bougies de remplissage : volume nul ET bougie plate
    rempl = (bid["v"] <= 0) & (bid["o"] == bid["h"]) & (bid["h"] == bid["l"]) & (bid["l"] == bid["c"])
    stats["bougies_remplissage_retirees"] = int(rempl.sum())
    bid = bid[~rempl]

    stats["doublons_bid"] = int(bid.duplicated("ts").sum())
    bid = bid.drop_duplicates("ts", keep="last")
    ask = ask.drop_duplicates("ts", keep="last")
    df = bid.merge(ask.drop(columns="av"), on="ts", how="left").sort_values("ts")
    stats["minutes_sans_ask"] = int(df["ac"].isna().sum())
    df = completer_spread(df)

    # Contrôles de cohérence
    incoherent = (df["h"] < df[["o", "c"]].max(axis=1)) | (df["l"] > df[["o", "c"]].min(axis=1))
    stats["bougies_incoherentes_retirees"] = int(incoherent.sum())
    df = df[~incoherent]
    df["spread"] = (df["ac"] - df["c"]).astype("float32")
    stats["spread_negatif"] = int((df["spread"] < 0).sum())

    df["ts"] = pd.to_datetime(df["ts"]).dt.tz_localize("UTC").dt.tz_convert(FUSEAU)
    df = df.set_index("ts")
    df = ajouter_seance(df)

    TRAITE.mkdir(parents=True, exist_ok=True)
    df.to_parquet(TRAITE / f"us30_m1{suffixe}.parquet")
    m5 = reechantillonner(df, "5min")
    m5.to_parquet(TRAITE / f"us30_m5{suffixe}.parquet")
    stats.update(qualite(df))
    pd.Series(stats).to_json(TRAITE / f"rapport_qualite{suffixe}.json", indent=1, force_ascii=False)
    return stats


def completer_spread(df: pd.DataFrame) -> pd.DataFrame:
    """Minutes sans ASK : spread estimé = médiane observée la même année, à la même demi-heure
    (heure de NEW YORK, pour suivre la séance malgré les changements d'heure).

    À défaut (année sans échantillon), médiane de la même demi-heure toutes années confondues.
    Colonne `ask_estime` = True. Avec l'échantillon ASK du mercredi, chaque année a ses propres médianes.
    """
    ts = pd.to_datetime(df["ts"]).dt.tz_localize("UTC").dt.tz_convert(FUSEAU)
    cle_an = ts.dt.year
    cle_h = ts.dt.hour * 2 + ts.dt.minute // 30
    sp = df["ac"] - df["c"]
    obs = sp.notna()
    df["ask_estime"] = ~obs
    if obs.all():
        return df
    med_an = sp[obs].groupby([cle_an[obs], cle_h[obs]]).median()
    med_h = sp[obs].groupby(cle_h[obs]).median()
    manq = ~obs
    est = pd.Series(list(zip(cle_an[manq], cle_h[manq])), index=df.index[manq]).map(med_an)
    est = est.fillna(cle_h[manq].map(med_h)).fillna(sp[obs].median())
    for b, a in (("o", "ao"), ("h", "ah"), ("l", "al"), ("c", "ac")):
        df.loc[manq, a] = df.loc[manq, b] + est
    return df


def ajouter_seance(df: pd.DataFrame) -> pd.DataFrame:
    """Jour de séance futures : les minutes à partir de 18:00 NY appartiennent au jour suivant."""
    idx = df.index
    jour = idx.normalize().tz_localize(None)
    apres_18h = idx.hour >= 18
    df["seance"] = (jour + pd.to_timedelta(apres_18h.astype(int), unit="D")).values.astype("datetime64[D]")
    return df


def reechantillonner(df: pd.DataFrame, regle: str) -> pd.DataFrame:
    """Agrège M1 → M5/M15/H1… (bougies horodatées à l'ouverture, alignées sur l'heure de NY)."""
    agg = {"o": "first", "h": "max", "l": "min", "c": "last", "v": "sum",
           "ao": "first", "ah": "max", "al": "min", "ac": "last", "spread": "mean"}
    r = df.resample(regle, label="left", closed="left").agg(agg).dropna(subset=["o"])
    return ajouter_seance(r)


def qualite(df: pd.DataFrame) -> dict:
    """Trous de cotation en dehors de la pause quotidienne (17:00-18:00 NY) et du week-end."""
    t = df.index
    ecart = pd.Series(t[1:] - t[:-1], index=t[1:])
    trous = ecart[ecart > pd.Timedelta(minutes=5)]
    # trous « normaux » : pause quotidienne et week-end
    h = trous.index.hour
    anormaux = trous[~((h == 18) | (h == 17)) & (trous < pd.Timedelta(hours=40))]
    par_an = df.groupby(df.index.year).size()
    return {
        "premiere_minute": str(t[0]), "derniere_minute": str(t[-1]), "minutes": len(df),
        "jours_de_seance": int(df["seance"].nunique()),
        "trous_>5min_hors_pause": int(len(anormaux)),
        "plus_long_trou_hors_pause_min": float(anormaux.max().total_seconds() / 60) if len(anormaux) else 0.0,
        "minutes_par_annee": {int(k): int(v) for k, v in par_an.items()},
        "spread_median_pts": float(df["spread"].median()),
        "spread_median_NY_9h30_11h_pts": float(df.between_time("09:30", "10:59")["spread"].median()),
        "spread_median_Londres_2h_5h_pts": float(df.between_time("02:00", "04:59")["spread"].median()),
    }


def charger(tf: str = "m1", suffixe: str = "") -> pd.DataFrame:
    """Charge le Parquet nettoyé (tf = 'm1' ou 'm5')."""
    return pd.read_parquet(TRAITE / f"us30_{tf}{suffixe}.parquet")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--construire", action="store_true")
    p.add_argument("--debut", default=None, help="première date UTC incluse, ex. 2021-11-01")
    p.add_argument("--fin", default=None, help="date UTC exclue, ex. 2021-11-01")
    p.add_argument("--suffixe", default="", help="suffixe des fichiers produits, ex. _2019")
    a = p.parse_args()
    if a.construire:
        import json
        print(json.dumps(construire(a.debut, a.fin, a.suffixe), indent=1, ensure_ascii=False, default=str))
