# US30 × ICT — backtest systématique

Projet de recherche quantitative indépendant de l'application « Frais et Français » (aucun lien avec le
code Next.js du dépôt). Objectif : coder de façon **objective** les concepts ICT (killzones, sweep de
liquidité, MSS avec displacement, FVG, OTE) sur l'US30, puis les backtester honnêtement.

Le rapport final (logique, résultats IS/OOS, robustesse, verdict) est dans `reports/rapport.html`.

## Arborescence

```
data/
  telecharger_dukascopy.py   téléchargement M1 BID/ASK Dukascopy (cache data/raw/, relançable)
  chargement.py              décodage → nettoyage → heure de New York → Parquet M1 et M5
strategy/
  detecteurs.py              ATR, swings (fractales confirmées avec délai), FVG, niveaux de séance
  ict.py                     générateur de setups (4 variantes) → ordres
  calendrier.py              filtre news : FOMC officiel, NFP (1er vendredi), détecteur de choc 08:30
backtest/
  moteur.py                  exécution sur M1 BID/ASK réels : spread, slippage, limites, BE partiel
  metriques.py               métriques, equity à risque fixe, règles prop firm, Monte Carlo
  executer.py                données → ordres → trades
  etude.py                   étude complète (variantes, IS/OOS, heatmaps, walk-forward, MC, placebo)
reports/
  rapport.py                 génère reports/rapport.html (+ graphiques) depuis reports/resultats/
scripts/
  telecharger_tout.sh        enchaîne les téléchargements (BID récent → ASK échantillon → reste)
```

## Relancer

```bash
cd us30-ict
pip install pandas numpy pyarrow requests
./scripts/telecharger_tout.sh               # plusieurs heures (quota Dukascopy ~1 fichier / 3-4 s)
python -m data.chargement --construire      # → data/processed/us30_m1.parquet, us30_m5.parquet
python -m backtest.etude                    # → reports/resultats/
python -m reports.rapport                   # → reports/rapport.html
```

Utilisation dans du code :

```python
from backtest.executer import Contexte
from backtest.metriques import metriques
ctx = Contexte.charger()
trades = ctx.backtest({"variante": "V2", "rr": 2.0}, couts="realiste")   # "sans" | "realiste" | "double"
print(metriques(trades, risque_pct=0.5))
```

## Données

- Source : flux public Dukascopy `USA30IDXUSD` (CFD Dow Jones), bougies M1 BID et ASK.
- Heure : tout est converti en `America/New_York` (heure d'été gérée). Jour de séance = 18:00 → 17:00 NY.
- Nettoyage : suppression des bougies de remplissage (marché fermé), doublons, bougies incohérentes.
  Rapport : `data/processed/rapport_qualite.json`.
- Spread : réel (ASK − BID) minute par minute quand le fichier ASK est disponible ; sinon médiane
  observée de la même année et de la même demi-heure (colonne `ask_estime`).
- Limites : CFD d'un courtier (pas le future YM ni l'indice cash) ; volumes Dukascopy non représentatifs ;
  le spread Dukascopy (≈ 2,5 pts en séance NY, ≈ 4 pts à Londres) peut différer de votre courtier.

## Règles anti-biais

- Une bougie n'est connue qu'à sa clôture ; une fractale d'ordre n n'est connue que n bougies plus tard.
- Les niveaux (PDH/PDL, Asie, Londres, open de minuit) ne sont utilisés qu'une fois complets.
- Exécution sur la minute qui suit le signal, achat à l'ASK / vente au BID, stop prioritaire en cas
  d'ambiguïté dans une même minute, ordres limite sans amélioration de prix.
