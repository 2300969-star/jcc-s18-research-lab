#!/bin/zsh
set -euo pipefail

PROJECT="$(cd -- "$(dirname -- "$0")" && pwd)"
PORT="${JCC_PORT:-8766}"
LOG_DIR="$PROJECT/.local"
PID_FILE="$LOG_DIR/frontend-server.pid"
PORT_FILE="$LOG_DIR/frontend-server.port"
LOG_FILE="$LOG_DIR/frontend-server.log"
ERR_FILE="$LOG_DIR/frontend-server.err.log"
PAGE_PATH="应用/前端/index.html"
LABEL="com.yuyu.jcc.frontend"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROXY_PORT=8787
PROXY_LABEL="com.yuyu.jcc.llm-proxy"
PROXY_PLIST="$HOME/Library/LaunchAgents/$PROXY_LABEL.plist"
PROXY_LOG="$LOG_DIR/llm-proxy.log"
PROXY_ERR="$LOG_DIR/llm-proxy.err.log"

echo "金铲铲怪兽入侵 · 前端启动"
echo "项目目录：$PROJECT"
echo

if [[ ! -d "$PROJECT/应用/前端" ]]; then
  echo "没有找到前端目录：$PROJECT/应用/前端"
  echo "请确认项目仍在 $PROJECT"
  echo
  read "REPLY?按回车退出..."
  exit 1
fi

mkdir -p "$LOG_DIR"

server_ok() {
  /usr/bin/python3 - "$1" "$PAGE_PATH" <<'PY'
import sys
from urllib.request import urlopen

port, page_path = sys.argv[1], sys.argv[2]
url = f"http://127.0.0.1:{port}/{page_path}"
try:
    with urlopen(url, timeout=1.2) as resp:
        text = resp.read(4096).decode("utf-8", "ignore")
    ok = "怪兽入侵" in text or "stage2-matcher-data.js" in text
    raise SystemExit(0 if ok else 1)
except Exception:
    raise SystemExit(1)
PY
}

port_busy() {
  /usr/sbin/lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

write_plist() {
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>WorkingDirectory</key>
  <string>$PROJECT</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>-m</string>
    <string>http.server</string>
    <string>$PORT</string>
    <string>--bind</string>
    <string>127.0.0.1</string>
  </array>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$ERR_FILE</string>
</dict>
</plist>
PLIST
}

start_service() {
  write_plist
  /bin/launchctl bootout "gui/$(/usr/bin/id -u)" "$PLIST" >/dev/null 2>&1 || true
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$PLIST"
  /bin/launchctl kickstart -k "gui/$(/usr/bin/id -u)/$LABEL" >/dev/null 2>&1 || true
  echo "$PORT" > "$PORT_FILE"
  /bin/launchctl print "gui/$(/usr/bin/id -u)/$LABEL" 2>/dev/null | awk '/pid = / {print $3; exit}' > "$PID_FILE" || true
}

proxy_ok() {
  /usr/bin/curl -fsS --max-time 1.5 "http://127.0.0.1:$PROXY_PORT/health" 2>/dev/null | /usr/bin/grep -q '"upstream":"yuyumaster.com"'
}

proxy_managed() {
  /bin/launchctl print "gui/$(/usr/bin/id -u)/$PROXY_LABEL" >/dev/null 2>&1 \
    && /usr/bin/grep -q "$PROJECT/工程/工具/llm-proxy.js" "$PROXY_PLIST"
}

write_proxy_plist() {
  cat > "$PROXY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PROXY_LABEL</string>
  <key>WorkingDirectory</key>
  <string>$PROJECT</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>$PROJECT/工程/工具/llm-proxy.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$PROXY_LOG</string>
  <key>StandardErrorPath</key>
  <string>$PROXY_ERR</string>
</dict>
</plist>
PLIST
}

start_proxy_service() {
  local old_pid old_cmd
  /bin/launchctl bootout "gui/$(/usr/bin/id -u)" "$PROXY_PLIST" >/dev/null 2>&1 || true
  old_pid="$(/usr/sbin/lsof -tiTCP:"$PROXY_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "$old_pid" ]]; then
    old_cmd="$(/bin/ps -p "$old_pid" -o command= 2>/dev/null || true)"
    if [[ "$old_cmd" == *"$PROJECT/工程/工具/llm-proxy.js"* || "$old_cmd" == *"$PROJECT/tools/llm-proxy.js"* || "$old_cmd" == *"$PROJECT/llm-proxy.js"* ]]; then
      /bin/kill "$old_pid" 2>/dev/null || true
      for _ in {1..15}; do
        /usr/sbin/lsof -tiTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
        sleep 0.2
      done
    else
      echo "端口 $PROXY_PORT 被其他程序占用，无法启动LLM代理：$old_cmd"
      return 1
    fi
  fi
  write_proxy_plist
  /bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$PROXY_PLIST"
  for _ in {1..20}; do
    proxy_ok && return 0
    sleep 0.2
  done
  echo "LLM代理启动失败，最近日志："
  tail -n 20 "$PROXY_ERR" || true
  return 1
}

if proxy_ok && proxy_managed; then
  echo "检测到LLM代理已在 $PROXY_PORT 端口运行，直接复用。"
else
  echo "启动LLM代理：http://127.0.0.1:$PROXY_PORT/v1"
  start_proxy_service
fi

if server_ok "$PORT"; then
  echo "检测到前端服务已在 $PORT 端口运行，直接复用。"
else
  while port_busy "$PORT"; do
    echo "端口 $PORT 已被占用，尝试下一个端口..."
    PORT=$((PORT + 1))
    if (( PORT > 8799 )); then
      echo "8766-8799 都不可用，无法启动前端服务。"
      read "REPLY?按回车退出..."
      exit 1
    fi
  done

  echo "启动本地前端服务：http://127.0.0.1:$PORT"
  start_service

  for _ in {1..30}; do
    server_ok "$PORT" && break
    sleep 0.2
  done

  if ! server_ok "$PORT"; then
    echo "服务启动失败，最近日志："
    tail -n 20 "$LOG_FILE" || true
    tail -n 20 "$ERR_FILE" || true
    echo
    read "REPLY?按回车退出..."
    exit 1
  fi
fi

URL="http://127.0.0.1:${PORT}/${PAGE_PATH}?v=desktop-launch#sec-stage2"
echo "打开 Chrome：$URL"
open -a "Google Chrome" "$URL" || open "$URL"

echo
echo "已打开前端入口。"
echo "服务日志：$LOG_FILE"
echo "如需关闭服务，可在终端执行：launchctl bootout gui/\$(id -u) \"$PLIST\""
sleep 2
