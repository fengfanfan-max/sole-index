#!/usr/bin/env bash
#
# Local acceptance check.
#
#   pnpm verify                 # against http://localhost:3000
#   BASE_URL=http://host:3001 pnpm verify
#
# Every claim the README makes about behaviour is asserted here rather than
# described. The point is that you should be able to *falsify* the interesting
# claims — particularly the paywall, which is the one most projects fake.
#
# Requires the server to already be running.

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${SOLEINDEX_SESSION_SECRET:-dev-only-insecure-secret-change-me}"

pass=0
fail=0
skip=0

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }
dim()   { printf '\033[2m%s\033[0m' "$1"; }

ok()   { printf '  %s %s\n' "$(green PASS)" "$1"; pass=$((pass+1)); }
bad()  { printf '  %s %s\n' "$(red FAIL)" "$1"; printf '       %s\n' "$2"; fail=$((fail+1)); }
note() { printf '  %s %s\n' "$(dim '····')" "$1"; }

assert() { # assert <description> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi
}

assert_ne() { # assert_ne <description> <a> <b>
  if [ "$2" != "$3" ]; then ok "$1"; else bad "$1" "both were '$2'"; fi
}

# ---------------------------------------------------------------------------
# Signed demo cookies — mirrors src/lib/auth/session.ts
# ---------------------------------------------------------------------------

make_cookie() { # make_cookie <userId> <name> <email> <role> <tier> <initials>
  node -e '
    const { createHmac } = require("node:crypto");
    const [secret, userId, name, email, role, tier, initials] = process.argv.slice(1);
    const payload = Buffer.from(JSON.stringify({ userId, name, email, role, tier, initials })).toString("base64url");
    process.stdout.write(payload + "." + createHmac("sha256", secret).update(payload).digest("base64url"));
  ' "$SECRET" "$1" "$2" "$3" "$4" "$5" "$6"
}

ADMIN=$(make_cookie u-fanfan "Fanfan Feng" analyst@soleindex.dev admin enterprise FF)
EDITOR=$(make_cookie u-editor "Mira Okafor" editor@soleindex.dev editor pro MO)
VIEWER=$(make_cookie u-viewer "Demo Viewer" viewer@soleindex.dev viewer free DV)
TAMPERED="$(node -e '
  process.stdout.write(Buffer.from(JSON.stringify({userId:"x",name:"X",email:"x@x",role:"admin",tier:"enterprise",initials:"X"})).toString("base64url") + "." + "A".repeat(43));
')"

COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

# fetch <cookie-name> <path> <outfile> -> http code
fetch() {
  curl -s -o "$3" -w '%{http_code}' --max-time 60 -H "Cookie: si_session=$1" "${BASE_URL}$2"
}

# Presence check returning exactly "1" or "0".
#
# Note: `grep -c` prints "0" *and* exits 1 when nothing matches, so the obvious
# `... || echo 0` appends a second zero. Command substitution captures stdout
# regardless of exit status, which is what we want.
contains() { local n; n=$(grep -ac -- "$1" "$2" 2>/dev/null); echo "${n:-0}"; }

# ---------------------------------------------------------------------------

echo
echo "SoleIndex — local acceptance check"
echo "  target  $BASE_URL"
echo

echo "0. Server reachable"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$BASE_URL/" || echo 000)
if [ "$code" != "200" ]; then
  bad "server responded" "got HTTP $code — is it running? try: pnpm dev"
  echo
  exit 1
fi
ok "server responded 200 (the first request migrates and seeds automatically)"

# ---------------------------------------------------------------------------

echo
echo "1. Every route renders"
declare -A ROUTES=(
  [/]=200 [/products]=200 [/compare]=200 [/trends]=200
  [/trends/methodology]=200 [/editorial]=200 [/pricing]=200 [/login]=200
  [/admin]=200 [/admin/editorial]=200 [/admin/ops]=200
)
for route in "${!ROUTES[@]}"; do
  got=$(fetch "$ADMIN" "$route" "$COOKIE_DIR/route.html")
  assert "GET $route" "${ROUTES[$route]}" "$got"
done

# A product and an article, discovered from the catalogue rather than hardcoded.
fetch "$ADMIN" "/products" "$COOKIE_DIR/products.html" >/dev/null
SLUG=$(grep -ao '/products/[a-z0-9-]\{6,\}' "$COOKIE_DIR/products.html" | head -1)
got=$(fetch "$ADMIN" "$SLUG" "$COOKIE_DIR/detail.html")
assert "GET $SLUG (product detail)" "200" "$got"
assert "  product detail shows a price history chart" "1" "$(contains 'Price history' "$COOKIE_DIR/detail.html")"
assert "  product detail shows the momentum breakdown" "1" "$(contains 'Momentum breakdown' "$COOKIE_DIR/detail.html")"

echo
echo "2. 404 handling"
got=$(fetch "$ADMIN" "/products/this-style-code-does-not-exist" "$COOKIE_DIR/404.html")
assert "unknown product returns 404" "404" "$got"
got=$(fetch "$ADMIN" "/editorial/no-such-report" "$COOKIE_DIR/404b.html")
assert "unknown article returns 404" "404" "$got"

# ---------------------------------------------------------------------------

echo
echo "3. The paywall is server-side (the important one)"
V_TRENDS="$COOKIE_DIR/trends-viewer.html"
A_TRENDS="$COOKIE_DIR/trends-admin.html"
fetch "$VIEWER" "/trends" "$V_TRENDS" >/dev/null
fetch "$ADMIN"  "/trends" "$A_TRENDS" >/dev/null

v_bytes=$(wc -c < "$V_TRENDS" | tr -d ' ')
a_bytes=$(wc -c < "$A_TRENDS" | tr -d ' ')

assert "free tier sees the locked panel" "1" "$(contains 'Trend intelligence is a Pro feature' "$V_TRENDS")"
assert "free tier does NOT receive the chart markup" "0" "$(contains 'Share of transaction value over time' "$V_TRENDS")"
assert "free tier does NOT receive the momentum leaderboard" "0" "$(contains 'Momentum leaderboard' "$V_TRENDS")"
assert "Pro tier receives the chart markup" "1" "$(contains 'Share of transaction value over time' "$A_TRENDS")"

if [ "$a_bytes" -gt $((v_bytes + 40000)) ]; then
  ok "response is materially smaller for free tier (${v_bytes}B vs ${a_bytes}B, diff $((a_bytes - v_bytes))B)"
else
  bad "response size differs meaningfully" "free ${v_bytes}B vs pro ${a_bytes}B — the gate may not be withholding data"
fi

echo
echo "4. Tier gating on the analyst desk"
got=$(fetch "$VIEWER" "/admin" "$COOKIE_DIR/admin-viewer.html")
assert "free tier reaches /admin with HTTP 200" "200" "$got"
assert "  but sees the locked panel" "1" "$(contains 'Authoring requires an editor or administrator role' "$COOKIE_DIR/admin-viewer.html")"
assert "  and NOT the composer" "0" "$(contains 'New observation' "$COOKIE_DIR/admin-viewer.html")"

# ---------------------------------------------------------------------------

echo
echo "5. Draft isolation"
# Seeded with status=draft.
DRAFT="/editorial/2027-outlook-consolidation"
got=$(fetch "$VIEWER" "$DRAFT" "$COOKIE_DIR/draft-viewer.html")
assert "draft returns 404 for a viewer" "404" "$got"
got=$(fetch "$EDITOR" "$DRAFT" "$COOKIE_DIR/draft-editor.html")
assert "draft returns 200 for an editor" "200" "$got"
if [ "$(contains 'This is a draft' "$COOKIE_DIR/draft-editor.html")" -ge 1 ]; then
  ok "  with an explicit draft banner"
else
  bad "  with an explicit draft banner" "the draft banner was not rendered"
fi

echo
echo "6. Session cookie cannot be self-promoted"
got=$(fetch "$TAMPERED" "/admin" "$COOKIE_DIR/tampered.html")
assert "tampered cookie reaches /admin with HTTP 200" "200" "$got"
assert "  but is demoted to least privilege" "1" "$(contains 'Authoring requires an editor or administrator role' "$COOKIE_DIR/tampered.html")"
assert "  and the admin desk does not leak" "0" "$(contains 'New observation' "$COOKIE_DIR/tampered.html")"
got=$(fetch "$TAMPERED" "/trends" "$COOKIE_DIR/tampered-trends.html")
assert "  trends are locked for the tampered cookie too" "1" "$(contains 'Trend intelligence is a Pro feature' "$COOKIE_DIR/tampered-trends.html")"

# ---------------------------------------------------------------------------

echo
echo "7. The data is real enough to be worth looking at"
fetch "$ADMIN" "/" "$COOKIE_DIR/home.html" >/dev/null
assert "catalogue size is reported as 240" "1" "$(contains '240' "$COOKIE_DIR/home.html")"
assert "resale index is rendered" "1" "$(contains 'Resale index' "$COOKIE_DIR/home.html")"
assert "analyst notes appear on the home page" "1" "$(contains 'Latest from the analyst desk' "$COOKIE_DIR/home.html")"
assert "reports appear on the home page" "1" "$(contains 'Reports' "$COOKIE_DIR/home.html")"

fetch "$ADMIN" "/compare" "$COOKIE_DIR/compare.html" >/dev/null
assert "/compare with no selection shows an empty state" "1" "$(contains 'Nothing selected yet' "$COOKIE_DIR/compare.html")"

# ---------------------------------------------------------------------------

echo
echo "8. Navigation highlights exactly one section per route"
# Regression guard. A prefix-matching active check lit both /trends and
# /trends/methodology on the methodology page (and /admin alongside /admin/ops and
# /admin/editorial). Nothing failed — it simply looked wrong — so it is asserted
# here. Expected count is 2: the desktop sidebar plus the mobile nav.
for route in / /products /compare /trends /trends/methodology /editorial \
             /pricing /admin /admin/editorial /admin/ops; do
  body=$(curl -s --max-time 60 -H "Cookie: si_session=$ADMIN" "${BASE_URL}${route}")
  n=$(printf '%s' "$body" | grep -ao 'aria-current="page"' | wc -l | tr -d ' ')
  if [ "$n" = "2" ]; then
    ok "$route marks exactly one section current (desktop + mobile)"
  else
    bad "$route marks exactly one section current" "found $n aria-current attributes, expected 2"
  fi
done

# And the specific case that was wrong.
fetch "$ADMIN" "/trends/methodology" "$COOKIE_DIR/method.html" >/dev/null
if grep -aq 'href="/trends/methodology"[^>]*' "$COOKIE_DIR/method.html" \
   && ! grep -aq 'aria-current="page"[^>]*href="/trends"' "$COOKIE_DIR/method.html"; then
  ok "the /trends parent is not marked current on the methodology page"
else
  bad "the /trends parent is not marked current on the methodology page" \
      "the parent section is still highlighted"
fi

# ---------------------------------------------------------------------------

echo
echo "─────────────────────────────────────────────"
printf '  %s  %s  %s\n' "$(green "$pass passed")" "$(red "$fail failed")" "$(dim "$skip skipped")"
echo

if [ "$fail" -gt 0 ]; then
  echo "  Some checks failed. That is the script doing its job — open the route"
  echo "  named in the failure and look at what it actually rendered."
  echo
  exit 1
fi

echo "  All behavioural claims verified against the running application."
echo
