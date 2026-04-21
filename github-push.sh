#!/usr/bin/env bash
# Uso: ./github-push.sh "mensaje del commit"
# Si no se pasa mensaje, usa "chore: update" por defecto.

set -e

MSG="${1:-chore: update}"

echo "→ Staging todos los cambios..."
git add -A

echo "→ Commit: \"$MSG\""
git commit -m "$MSG"

echo "→ Push a main..."
git push origin main

echo "✓ Push completado."
