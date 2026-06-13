#!/bin/bash
# check-security.sh — Verificador de seguridad pre-push para repos SIATC
# Detecta patrones inseguros antes de permitir el push.
# Uso manual: ./check-security.sh
# Uso automático: instalado como .git/hooks/pre-push

ERRORS=0
WARNINGS=0
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "\n🔍 SIATC Security Check\n───────────────────────────────────"

check_file() {
    local f="$1"

    # C1: req.query.token fuera de verifyTokenForDownload
    if grep -q "req\.query\.token" "$f" 2>/dev/null; then
        if ! grep -q "verifyTokenForDownload" "$f" 2>/dev/null; then
            echo -e "${RED}[C1-CRÍTICO]${NC} req.query.token sin verifyTokenForDownload → $f"
            grep -n "req\.query\.token" "$f" | sed 's/^/     /'
            ERRORS=$((ERRORS+1))
        fi
    fi

    # C2: Paths de Windows hardcodeados en strings
    if grep -q "C:.Users." "$f" 2>/dev/null; then
        echo -e "${RED}[C2-CRÍTICO]${NC} Path hardcodeado de Windows detectado → $f"
        grep -n "C:.Users." "$f" | sed 's/^/     /'
        ERRORS=$((ERRORS+1))
    fi

    # C3: path.normalize + replace (path traversal inseguro)
    if grep -q "path\.normalize" "$f" 2>/dev/null; then
        local ln
        ln=$(grep -n "path\.normalize" "$f" | head -1 | cut -d: -f1)
        if [ -n "$ln" ]; then
            local ctx
            ctx=$(sed -n "${ln},$((ln+2))p" "$f" 2>/dev/null)
            if echo "$ctx" | grep -q "\.replace"; then
                echo -e "${RED}[C3-CRÍTICO]${NC} path.normalize + replace detectado (usar path.resolve + startsWith) → $f:$ln"
                ERRORS=$((ERRORS+1))
            fi
        fi
    fi

    # C4: GET /api/applications sin verifyToken
    local app_hit
    app_hit=$(grep -nE "app\.get\(['\"]\/api\/applications['\"]" "$f" 2>/dev/null | grep -v "verifyToken" || true)
    if [ -n "$app_hit" ]; then
        echo -e "${RED}[C4-CRÍTICO]${NC} GET /api/applications sin verifyToken → $f"
        echo "$app_hit" | sed 's/^/     /'
        ERRORS=$((ERRORS+1))
    fi

    # C5: .input() con req.params/body/query directamente sin tipo SQL
    local sql_hit
    sql_hit=$(grep -nP "\.input\('[^']+',\s*req\.(params|body|query)\." "$f" 2>/dev/null | grep -v "^\s*//" || true)
    if [ -n "$sql_hit" ]; then
        echo -e "${YELLOW}[C5-ADVERTENCIA]${NC} .input() recibe req.params/body sin tipo SQL explícito → $f"
        echo "$sql_hit" | sed 's/^/     /'
        WARNINGS=$((WARNINGS+1))
    fi
}

while IFS= read -r -d '' f; do
    check_file "$f"
done < <(find . \( -name "*.ts" -o -name "*.tsx" \) \
    ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.git/*" \
    -print0 2>/dev/null)

echo "───────────────────────────────────"
if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}❌ Push BLOQUEADO — $ERRORS error(es) crítico(s), $WARNINGS advertencia(s)${NC}"
    echo -e "   Corrige los problemas listados antes de hacer push.\n"
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Push permitido — $WARNINGS advertencia(s) no bloqueante(s)${NC}\n"
    exit 0
else
    echo -e "${GREEN}✅ OK — Sin problemas de seguridad detectados${NC}\n"
    exit 0
fi
