#!/bin/zsh
set -uo pipefail

PROJECT="$(cd -- "$(dirname -- "$0")" && pwd)"
USER_ID="$(/usr/bin/id -u)"
LOG_DIR="$PROJECT/.local"
PID_FILE="$LOG_DIR/frontend-server.pid"
PORT_FILE="$LOG_DIR/frontend-server.port"
LOG_FILE="$LOG_DIR/frontend-server.log"
ERR_FILE="$LOG_DIR/frontend-server.err.log"
PROXY_PID_FILE="$LOG_DIR/llm-proxy.pid"
PROXY_LOG="$LOG_DIR/llm-proxy.log"
PROXY_ERR="$LOG_DIR/llm-proxy.err.log"
PAGE_PATH="应用/前端/index.html"
PAGE_URL_PATH="%E5%BA%94%E7%94%A8/%E5%89%8D%E7%AB%AF/index.html"
PROXY_PORT=8787
NODE_BIN="$(command -v node 2>/dev/null || true)"

if [[ -n "${JCC_PORT:-}" ]]; then
  PORT="$JCC_PORT"
elif [[ -f "$PORT_FILE" ]] && [[ "$(/bin/cat "$PORT_FILE")" == <-> ]]; then
  PORT="$(/bin/cat "$PORT_FILE")"
else
  PORT=8766
fi

echo "金铲铲怪兽入侵 · 前端启动"
echo "项目目录：$PROJECT"
echo

fail() {
  echo
  echo "启动失败：$1"
  if [[ -t 0 ]]; then
    echo
    read "REPLY?按回车退出..."
  fi
  exit 1
}

if [[ ! -d "$PROJECT/应用/前端" || ! -f "$PROJECT/$PAGE_PATH" ]]; then
  fail "没有找到前端入口 $PROJECT/$PAGE_PATH"
fi

mkdir -p "$LOG_DIR"

server_ok() {
  /usr/bin/python3 - "$1" "$PAGE_PATH" <<'PY'
import sys
from urllib.parse import quote
from urllib.request import urlopen

port, page_path = sys.argv[1], sys.argv[2]
url = f"http://127.0.0.1:{port}/{quote(page_path, safe='/')}"
try:
    with urlopen(url, timeout=1.2) as resp:
        text = resp.read(4096).decode("utf-8", "ignore")
    ok = resp.status == 200 and ("怪兽入侵" in text or "stage2-matcher-data.js" in text)
    raise SystemExit(0 if ok else 1)
except Exception:
    raise SystemExit(1)
PY
}

port_busy() {
  /usr/sbin/lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

unload_legacy_jobs() {
  local label
  for label in com.yuyu.jcc.frontend com.yuyu.jcc.llm-proxy com.yuyu.jcc-llm-proxy; do
    /bin/launchctl bootout "gui/$USER_ID/$label" >/dev/null 2>&1 || true
  done
}

start_server() {
  : > "$LOG_FILE"
  : > "$ERR_FILE"
  /usr/bin/nohup /usr/bin/python3 -m http.server "$PORT" \
    --bind 127.0.0.1 --directory "$PROJECT" \
    > "$LOG_FILE" 2> "$ERR_FILE" < /dev/null &
  local server_pid=$!
  echo "$server_pid" > "$PID_FILE"
  echo "$PORT" > "$PORT_FILE"

  for _ in {1..40}; do
    if server_ok "$PORT"; then
      return 0
    fi
    /bin/kill -0 "$server_pid" >/dev/null 2>&1 || break
    sleep 0.15
  done

  /bin/kill "$server_pid" >/dev/null 2>&1 || true
  return 1
}

proxy_ok() {
  /usr/bin/curl -fsS --max-time 1.5 "http://127.0.0.1:$PROXY_PORT/health" 2>/dev/null \
    | /usr/bin/grep -q '"upstream":"yuyumaster.com"'
}

start_proxy() {
  [[ -n "$NODE_BIN" ]] || return 1
  if port_busy "$PROXY_PORT"; then
    return 1
  fi

  : > "$PROXY_LOG"
  : > "$PROXY_ERR"
  /usr/bin/nohup "$NODE_BIN" "$PROJECT/工程/工具/llm-proxy.js" \
    > "$PROXY_LOG" 2> "$PROXY_ERR" < /dev/null &
  local proxy_pid=$!
  echo "$proxy_pid" > "$PROXY_PID_FILE"

  for _ in {1..25}; do
    if proxy_ok; then
      return 0
    fi
    /bin/kill -0 "$proxy_pid" >/dev/null 2>&1 || break
    sleep 0.15
  done

  /bin/kill "$proxy_pid" >/dev/null 2>&1 || true
  return 1
}

unload_legacy_jobs

if server_ok "$PORT"; then
  echo "检测到前端服务已在 $PORT 端口运行，直接复用。"
else
  while port_busy "$PORT"; do
    echo "端口 $PORT 被其他程序占用，尝试下一个端口..."
    PORT=$((PORT + 1))
    (( PORT <= 8799 )) || fail "8766-8799 都不可用"
  done

  echo "启动本地前端服务：http://127.0.0.1:$PORT"
  if ! start_server; then
    tail -n 20 "$ERR_FILE" 2>/dev/null || true
    fail "本地前端服务没有通过健康检查"
  fi
fi

URL="http://127.0.0.1:${PORT}/${PAGE_URL_PATH}?v=desktop-launch#sec-stage2"
echo "打开网页：$URL"
if ! /usr/bin/open -a "Google Chrome" "$URL" 2>/dev/null; then
  /usr/bin/open "$URL" || fail "浏览器无法打开，请手动访问 $URL"
fi

echo
if proxy_ok; then
  echo "检测到LLM代理已在 $PROXY_PORT 端口运行，直接复用。"
elif [[ -z "$NODE_BIN" ]]; then
  echo "未找到 Node.js，跳过可选 LLM 代理；前端不受影响。"
elif start_proxy; then
  echo "可选LLM代理已启动：http://127.0.0.1:$PROXY_PORT/v1"
else
  echo "警告：LLM代理暂时不可用，但前端已经打开，可继续使用确定性功能。"
  tail -n 8 "$PROXY_ERR" 2>/dev/null || true
fi

echo
echo "已打开前端入口。"
echo "服务日志：$LOG_FILE"
echo "服务进程：$(/bin/cat "$PID_FILE")"
sleep 2
