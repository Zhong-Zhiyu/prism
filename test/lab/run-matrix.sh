#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
mkdir -p out
BASE=${LAB_URL:-http://127.0.0.1:18787}
SUB=${SUB:-http%3A%2F%2Flab2027.internal%3A18787%2Ffixtures%2Fsample-sub.yaml}
CFG=${CFG:-http%3A%2F%2Flab2027.internal%3A18787%2Ffixtures%2Fconfig.ini}

run() {
  local name="$1" qs="$2" code bytes
  code=$(curl -s -o "out/$name" -w "%{http_code}" --max-time 60 "$BASE/sub?$qs")
  bytes=$(wc -c < "out/$name")
  printf "%-24s http=%-4s bytes=%s\\n" "$name" "$code" "$bytes"
}

run base-clash.yaml      "target=clash&url=$SUB"
run base-singbox.json    "target=singbox&url=$SUB"
run base-surge.conf      "target=surge&url=$SUB"
run cfg-clash.yaml       "target=clash&url=$SUB&config=$CFG"
run cfg-clash-flat.yaml  "target=clash&url=$SUB&config=$CFG&expand=false"
run cfg-singbox.json     "target=singbox&url=$SUB&config=$CFG"
run cfg-surge.conf       "target=surge&url=$SUB&config=$CFG"
run opt-all-clash.yaml   "target=clash&url=$SUB&config=$CFG&dedup=false&emoji=false&append_type=true&tfo=true&udp=true&sort=true&scv=true"
run opt-nocfg-sb.json    "target=singbox&url=$SUB&dedup=false&sort=true&scv=true"
run opt-nocfg-sg.conf    "target=surge&url=$SUB&dedup=false&sort=true&scv=true"
