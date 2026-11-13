# Stack 03 — Pack OBS (1920×1080)

Tout est en pages HTML à brancher dans OBS. Un panneau de contrôle (dock) pilote toutes les scènes en direct.

## 0. Lancement — intégré à PSO Valorant
Le pack Stack 03 tourne **dans le serveur PSO Valorant** : un seul serveur, un seul `start.bat`, un seul port (3003). Tout ce qui est Stack 03 vit sous `http://localhost:3003/stack03/`.

1. Installer Node.js (https://nodejs.org) une seule fois.
2. Double-cliquer sur le **`start.bat` de PSO Valorant** (à la racine du dépôt). Laisser la fenêtre ouverte pendant le live.
3. Régie Stack 03 : onglet **Stack 03** de la régie PSO (`http://localhost:3003/control`), ou directement `http://localhost:3003/stack03/control` (à mettre en dock OBS).
4. Dans OBS, les sources navigateur pointent vers `http://localhost:3003/stack03/xxx` (ex. `http://localhost:3003/stack03/pickban?station=1`). La liste complète, prête à copier, est sur `http://localhost:3003/stack03/overlays` et dans l'onglet **Liens équipes** de la régie Stack 03.
5. Onglet **Liens équipes** : un lien par équipe (`/stack03/equipe/…`), valable toute la journée. L'envoyer au capitaine (Discord, SMS). L'équipe y voit **ses 3 matchs de poules**, puis sa demi-finale (dès que les poules sont finies) et sa finale. **Chaque match a son propre pick & ban** (équipe qui commence tirée au sort), jouable à l'avance. Quand la régie *Charge* un match sur une station, la station reprend son pick & ban : l'overlay l'affiche et la suite se joue en direct.
   - Le tableau *Pick & ban des matchs* (même onglet) montre l'état de chaque veto : *Tirage*, *Verrouiller / Ouvrir*, *Vider*.
   - Les équipes doivent être sur le même réseau (wifi de la salle) : vérifier que l'adresse en haut de l'onglet est bien l'IP du PC régie. Pour des équipes à distance, mettre une adresse publique (tunnel type Cloudflare Tunnel / ngrok).
   - *Verrouiller les liens équipes* (onglet Station) met le veto en pause ; *Tirage au sort* choisit l'équipe qui commence.
   - Le côté d'une map pick est choisi par l'adversaire, celui du decider par l'équipe qui a commencé. La régie peut toujours corriger à la main dans le tableau du veto.
   - *Régénérer* invalide un lien (fuite, mauvais destinataire).
6. Régie depuis un autre PC : utiliser le lien `…/stack03/control?key=…` affiché dans la console (et dans l'onglet Liens). Sans la clé, les autres appareils sont en lecture seule.

Les données Stack 03 (équipes, scores, veto, liens) sont enregistrées dans `stack03/data/` (jamais envoyé sur GitHub) et survivent à un redémarrage. Pour reprendre un tournoi en cours depuis l'ancien dossier `obs`, copier ses `data/state.json` et `data/links.json` dans `stack03/data/`. Les données PSO (scoreboard, veto PSO, bracket PSO…) restent séparées.

Une map absente de `stack03/assets/maps/` est prise automatiquement dans les splashs de PSO (`public/maps/<map>-splash.png`).

## Son des stations (RØDECaster)
Le son de chaque PC joueur passe par un fader de la RØDECaster, puis le mix de la table part dans le live :
```
Station 01 ─HDMI─▶ DeckLink entrée 1 ─[Windows : Écouter ce périphérique]─▶ Virtual A ─▶ fader de la table ┐
Station 02 ─HDMI─▶ DeckLink entrée 4 ─[Windows : Écouter ce périphérique]─▶ Virtual B ─▶ fader de la table ┤
                                                         mix de la table ─▶ « System (RØDECaster) » ─▶ OBS audio global « Mic/Aux » ─▶ live
```
- Dans OBS, « pov 1 » et « pov 2 » sont **muets** (image seule) avec un *Délai de rendu* de 60 ms pour rester calés sur le son. Ne pas les réactiver : leur son partirait en direct dans le live, sans passer par les faders.
- Le mix de la table entre dans OBS par **Paramètres > Audio > Audio micro/auxiliaire = System (RØDECaster)** : un périphérique global, donc présent dans toutes les scènes. C'est la seule source audio du live. N'ajoute pas en plus une capture de « System (RØDECaster) » dans les scènes : le son serait doublé.
- Le son HDMI n'arrive que si OBS est ouvert (c'est lui qui capture les entrées DeckLink).
- **Après un redémarrage du PC**, Windows désactive parfois les périphériques virtuels de la RØDECaster (plus de « System », « Virtual A/B » dans OBS). Double-cliquer **`outils\reparer-son-rodecaster.bat`** : il relance l'utilitaire RØDE, réactive les périphériques et remet le routage des stations. Le faire avant d'ouvrir OBS, ou relancer OBS ensuite.
- Sur chaque PC joueur, la sortie son Windows doit être l'écran/HDMI branché vers la régie.

## 1. Installation (5 minutes)
1. Le pack est dans le dossier `stack03\` du dépôt PSO Valorant.
2. Copiez votre logo LST blanc dans `assets\` sous le nom `logo-lst-2023-white.svg`.
3. Dans OBS : **Affichage > Docks > Docks de navigateur personnalisés**. Nom : `Stack 03`, URL : `http://localhost:3003/stack03/control`. Ancrez le dock à droite et élargissez-le.
4. Dans le dock, onglet **Équipes** : saisissez les 4 équipes, les tags et les pseudos des joueurs (agents facultatifs). Onglet **Équipes** aussi : le map pool (déjà réglé sur Abyss, Bind, Corrode, Haven, Lotus, Summit, Sunset).

## 2. Sources navigateur (une par scène)
Pour chaque source : **Source > Navigateur**, décochez « Fichier local », collez l'URL, largeur **1920**, hauteur **1080**. Toutes les URL commencent par `http://localhost:3003/stack03/`.

| Scène OBS | Contenu à empiler (du bas vers le haut) | URL de la source navigateur |
|---|---|---|
| POV Station 01 overlay | capture du jeu station 01 + overlay | `http://localhost:3003/stack03/overlay-station?station=1` |
| POV Station 02 overlay | capture du jeu station 02 + overlay | `…/stack03/overlay-station?station=2` |
| Caméra station 01 | caméra plein écran + cadre | `…/stack03/cam?station=1` |
| Caméra station 02 | caméra plein écran + cadre | `…/stack03/cam?station=2` |
| Timeout caster | caméra casters (fenêtre 1280×720 : x 64, y 176) + chat (fenêtre 460×460 : x 1396, y 436) ; « matchs en cours » en haut | `…/stack03/timeout-caster` |
| Bracket | rien d'autre | `…/stack03/bracket` |
| Pick & ban station 01 | rien d'autre | `…/stack03/pickban?station=1` |
| Pick & ban station 02 | rien d'autre | `…/stack03/pickban?station=2` |
| Timeout (pause technique) | placer la vidéo de la pièce DERRIÈRE : la page est semi-transparente | `…/stack03/timeout` |
| Start | rien d'autre | `…/stack03/start` |
| End | rien d'autre | `…/stack03/end` |

Option cadre sponsors sur les overlays de jeu : ajoutez `&pos=bl` (bas gauche), `&pos=tr` (haut droite) ou `&pos=tl`. Par défaut : bas droite.

## 3. Transition
**Transitions de scène > + > Stinger** : fichier `stinger\stack03-stinger.mov`, type « Point de transition (temps) », **1200 ms** (transition lente, fond gris foncé, logo Stack rose). Une version `.webm` est fournie si le .mov pose problème.
Variante sans fichier : `http://localhost:3003/stack03/stinger` en source navigateur sur la scène Transition.

## 4. Pendant le live (dock)
- **Station 1 / 2** : choisir le match (poules, demis, finales) puis *Charger*. Les équipes, le BO et le libellé se règlent seuls. Saisir les scores avec +1 / −1 ou à la main. *Map suivante* avance la map en cours.
- Les scores d'une station se recopient dans **Poules** et **Bracket** tant que le match a été chargé avec *Charger*. Le bracket, le classement et le podium se calculent seuls.
- **Format** BO1 / BO3 / BO5 par station. En BO1 l'overlay affiche le score de la map ; en BO3/BO5, les maps gagnées avec les rounds de la map en cours.
- **Pick & ban** : choisir la map de chaque étape (la dernière se remplit seule), puis le côté de l'équipe A.
- **Timeout / Start** : timeout par équipe ou pause technique avec décompte ; compte à rebours de la scène Start (heure fixe ou dans 5 / 10 min).
- Case « affiché » d'une station : masque ou affiche l'overlay avec un fondu.

## 5. À savoir
- La synchronisation passe par le serveur PSO (Socket.IO). Si une scène ne bouge pas, faites clic droit > *Actualiser* sur la source.
- La police Rajdhani sont incluses : aucune connexion requise.
- *Tout réinitialiser* efface scores, équipes et veto : à utiliser avant le live uniquement.

- Sponsors : LST, Crédit Mutuel et LS4B en boucle, 10 s par logo. Les logos doivent être dans `assets/` (credit-mutuel.svg, logols4bv3.svg, logo-lst-2023-white.svg).
- Couleurs d'équipe modifiables dans l'onglet Équipes du dock (REED, PEAK, LURK, DROP par défaut).
- Pick & ban : déposez abyss.jpg, ascent.jpg, haven.jpg, lotus.jpg, split.jpg, summit.jpg, sunset.jpg dans assets/maps/ (voir LISEZ-MOI.txt).
