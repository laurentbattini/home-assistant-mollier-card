# Mollier Card

## Installation via HACS

1. Ajouter ce dépôt comme "Custom repository" dans HACS → Frontend.
2. Installer la carte Mollier.
3. Ajouter la ressource dans Lovelace :

```yaml
resources:
  - url: /hacsfiles/home-assistant-mollier-card/mollier-card.js
    type: module
