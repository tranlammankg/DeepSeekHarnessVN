#!/usr/bin/env bash
# HarnessVN - khoi dong may ao tren Linux. Chay: bash start-linux.sh
exec "$(cd "$(dirname "$0")/.." && pwd)/run-vm.sh" "$@"
