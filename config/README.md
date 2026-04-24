## Dossier config — Fichiers secrets

Placez les fichiers suivants dans ce dossier (NE PAS committer sur Git) :

| Fichier | Source | Description |
|---------|--------|-------------|
| `firebase-service-account.json` | Firebase Console → Project Settings → Service Accounts → Generate new private key | Clé admin Firebase pour les notifications push |

Ce fichier est référencé dans `.env` via la variable `FIREBASE_KEY_PATH`.
