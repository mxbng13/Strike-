#!/usr/bin/env python3
"""Génère build/2_InstallScripts.luau : un script à coller dans la barre de commandes de
Roblox Studio, qui crée (ou remplace) tous les scripts du jeu à partir des fichiers de src/."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# (fichier source, classe Roblox, nom, parent Luau)
ENTRIES = [
    ("shared/Config.luau", "ModuleScript", "Config", "shared"),
    ("server/DataManager.luau", "ModuleScript", "DataManager", "server"),
    ("server/EggSystem.luau", "ModuleScript", "EggSystem", "server"),
    ("server/ObstacleSystem.luau", "ModuleScript", "ObstacleSystem", "server"),
    ("server/Main.server.luau", "Script", "Main", "server"),
    ("client/Client.client.luau", "LocalScript", "EggMountainClient", "client"),
]


def long_string(text: str) -> str:
    level = 1
    while ("]" + "=" * level + "]") in text:
        level += 1
    eq = "=" * level
    return f"[{eq}[\n{text}]{eq}]"


def main() -> None:
    out = [
        "-- EGG MOUNTAIN — Script 2/2 : installe tous les scripts du jeu (à coller dans la barre de commandes)",
        "-- Fichier généré automatiquement par tools/make_installer.py — ne pas modifier à la main.",
        'local RS = game:GetService("ReplicatedStorage")',
        'local SSS = game:GetService("ServerScriptService")',
        'local SPS = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")',
        'for _, c in ipairs({ RS:FindFirstChild("EggMountain"), SSS:FindFirstChild("EggMountain"), SPS:FindFirstChild("EggMountainClient") }) do',
        "\tif c then c:Destroy() end",
        "end",
        'local shared = Instance.new("Folder")',
        'shared.Name = "EggMountain"',
        'local remotes = Instance.new("Folder")',
        'remotes.Name = "Remotes"',
        "remotes.Parent = shared",
        'for _, n in ipairs({ "Notify", "EggAction", "IntroDone" }) do',
        '\tlocal r = Instance.new("RemoteEvent")',
        "\tr.Name = n",
        "\tr.Parent = remotes",
        "end",
        'local server = Instance.new("Folder")',
        'server.Name = "EggMountain"',
        "local client = SPS",
        "local function add(className, name, parent, source)",
        "\tlocal s = Instance.new(className)",
        "\ts.Name = name",
        "\ts.Source = source",
        "\ts.Parent = parent",
        "end",
    ]
    for rel, cls, name, parent in ENTRIES:
        text = (SRC / rel).read_text(encoding="utf-8")
        out.append(f'add("{cls}", "{name}", {parent}, {long_string(text)})')
    out += [
        "shared.Parent = RS",
        "server.Parent = SSS",
        'print("EGG MOUNTAIN — scripts installés ! Clique sur Jouer (F5) pour tester.")',
        "",
    ]
    dest = ROOT / "build" / "2_InstallScripts.luau"
    dest.write_text("\n".join(out), encoding="utf-8")
    print(f"écrit {dest} ({dest.stat().st_size} octets)")

    # Version tout-en-un : la map + les scripts, dans un seul fichier
    map_src = (ROOT / "build" / "1_BuildMap.luau").read_text(encoding="utf-8")
    install_src = "\n".join(out)
    allinone = "\n".join([
        "-- 🥚 EGG MOUNTAIN — VERSION TOUT-EN-UN (map + scripts du jeu)",
        "-- Colle TOUT ce fichier dans la barre de commandes de Roblox Studio, puis appuie sur Entrée.",
        "-- Fichier généré automatiquement par tools/make_installer.py.",
        "do -- PARTIE 1 : construction de la map",
        map_src,
        "end",
        "do -- PARTIE 2 : installation des scripts",
        install_src,
        "end",
        'print("🥚 EGG MOUNTAIN installé en entier ! Appuie sur F5 pour jouer.")',
        "",
    ])
    dest2 = ROOT / "build" / "EggMountain_ToutEnUn.luau"
    dest2.write_text(allinone, encoding="utf-8")
    print(f"écrit {dest2} ({dest2.stat().st_size} octets)")


if __name__ == "__main__":
    main()
