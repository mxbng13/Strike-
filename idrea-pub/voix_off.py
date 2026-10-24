"""Génère la voix off (fr-FR-RemyMultilingualNeural) + le minutage mot à mot de chaque réplique.

Usage : python3 voix_off.py [script.json DOSSIER]  ->  DOSSIER/vo_N.mp3 et DOSSIER/vo.json
(script.json : {"lignes": [...]} ; par défaut, le texte de la pub derma roller / huile de ricin)
"""
import asyncio, json, os, subprocess, sys

try:  # derrière un proxy TLS (environnement cloud), utiliser le bundle CA local s'il existe
    import certifi
    if os.path.exists("/root/.ccr/ca-bundle.crt"):
        certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
except ImportError:
    pass
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
VOICE = "fr-FR-RemyMultilingualNeural"
RATE = "+10%"

# Texte prononcé (TTS) — le texte affiché en sous-titres est dérivé des mots renvoyés.
LIGNES = [
    "T'en as marre de ne toujours pas avoir de barbe à 18 ans ? Voici ce que tu peux faire pour prendre soin de ta peau et de ta barbe.",
    "Première étape : le derma roller. C'est un accessoire à utiliser avec précaution. Attention, il ne faut pas l'utiliser n'importe comment : suis les consignes du fabricant et respecte les règles d'hygiène.",
    "Deuxième étape : l'huile de ricin. Elle aide à nourrir et à assouplir les poils. Tu peux l'intégrer à ta routine de soin si ta peau la tolère, en suivant les précautions d'utilisation.",
    "Le plus important, c'est de prendre soin de ta peau, de choisir des produits adaptés et de rester régulier dans ta routine. Et rappelle-toi : la pousse de la barbe dépend aussi beaucoup de la génétique et des hormones.",
    "Tu veux découvrir ces produits ? Retrouve-les chez Idréa et découvre notre sélection pour ta routine de soin du visage.",
]


async def une_ligne(i, texte):
    mp3 = os.path.join(BUILD, f"vo_{i}.mp3")
    mots = []
    com = edge_tts.Communicate(texte, VOICE, rate=RATE, boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                mots.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).strip())
    return {"fichier": mp3, "duree": dur, "mots": mots, "texte": texte}


async def main():
    global BUILD, LIGNES, VOICE, RATE
    if len(sys.argv) > 2:
        cfg = json.load(open(sys.argv[1]))
        LIGNES = cfg["lignes"]
        VOICE = cfg.get("voix", VOICE)
        RATE = cfg.get("debit", RATE)
        BUILD = os.path.abspath(sys.argv[2])
    os.makedirs(BUILD, exist_ok=True)
    res = [await une_ligne(i, t) for i, t in enumerate(LIGNES)]
    with open(os.path.join(BUILD, "vo.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    for r in res:
        print(f"{r['duree']:.2f}s  {r['texte'][:50]}")


asyncio.run(main())
