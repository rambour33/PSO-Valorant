# Collection de scènes OBS — PSO Stack 03

`PSO-Stack03-scenes.json` contient une scène par overlay PSO (sources navigateur 1920×1080 sur `http://localhost:3004`).

## Importer
1. OBS → menu **Collection de scènes** → **Importer**.
2. Bouton **…** → choisir `PSO-Stack03-scenes.json` → cocher la ligne → **Importer**.
3. Menu **Collection de scènes** → **PSO Stack 03**.

Le serveur PSO doit tourner sur le port 3004 (`start.bat`).

## À compléter dans OBS
- **Caméra station 01 / 02** : ajouter la caméra **sous** l'overlay.
- **Timeout caster** : caméra des casters sous l'overlay à x 64, y 176 (1280×720). Le chat PSO est intégré.
- **In game** : ajouter la capture du jeu **sous** le scoreboard.

## Taille en 1080p
Les widgets seuls dans leur scène (prochain match, lineups, casters, timer, sponsors) sont agrandis
et centrés grâce au paramètre `?fit=` de l'URL (`fit=1` = 86 % de l'écran, `fit=0.6` = 60 %).
Le chat utilise `?scale=2` (taille de police ×2). Sans ces paramètres, les overlays gardent leur
taille d'origine pour être posés par-dessus le jeu. Le bracket s'agrandit tout seul pour remplir l'écran.
