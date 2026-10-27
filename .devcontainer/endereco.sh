#!/bin/bash
# Endereço público da porta 3000 neste Codespace (ou localhost fora dele).
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  echo "https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  echo "http://localhost:3000"
fi
