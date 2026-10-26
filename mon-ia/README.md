# Mon IA — ton assistant personnel

Une IA rien qu'à toi : chat + génération d'images, et **c'est toi qui règles tout** dans l'écran *Paramètres*
(personnalité, instructions, mots bloqués, modèle, température, images on/off, mot de passe).

Aucune dépendance : il faut juste Node 18 ou plus.

## Lancer

```bash
cd mon-ia
npm start          # → http://127.0.0.1:3333
```

Puis ouvre **Paramètres** et renseigne au moins un fournisseur de texte et un fournisseur d'images.
Tes réglages et clés sont enregistrés dans `mon-ia/data/settings.json` (ignoré par git, jamais envoyé au navigateur en clair).

Pour y accéder depuis ton téléphone sur le même Wi‑Fi : `HOST=0.0.0.0 npm start`, puis mets un mot de passe dans les paramètres.

## Choisir les modèles

| Usage | Fournisseur | URL de l'API | Modèle (exemple) | Clé |
|---|---|---|---|---|
| Texte | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | oui |
| Texte | Anthropic | `https://api.anthropic.com` | `claude-sonnet-5-5` | oui |
| Texte | OpenRouter (des centaines de modèles) | `https://openrouter.ai/api/v1` | au choix | oui |
| Texte | **Ollama, 100 % local** | `http://localhost:11434/v1` | `llama3.1`, `mistral`… | non |
| Images | OpenAI | `https://api.openai.com/v1` | `gpt-image-1` | oui |
| Images | **Stable Diffusion local** (AUTOMATIC1111 / Forge lancé avec `--api`) | `http://127.0.0.1:7860` | — | non |

## Utiliser

- Écris normalement pour discuter.
- Pour une image : clique sur 🖼️ ou commence ton message par `/image`, ex. `/image un chat astronaute style aquarelle`.
- Chaque image a un lien *Télécharger*.

## Les restrictions

Tout ce que l'app ajoute comme règles se trouve dans *Paramètres* : le prompt système, la liste de mots bloqués,
l'activation des images. Par défaut il n'y en a aucune.

À savoir : si tu utilises un service en ligne (OpenAI, Anthropic, OpenRouter…), ce service applique toujours
ses propres règles d'utilisation, que l'app ne peut pas désactiver. Avec un modèle local (Ollama + Stable Diffusion),
tout tourne sur ta machine et le comportement dépend uniquement du modèle que tu choisis d'installer.
