#!/usr/bin/env bash
# knav 生产部署：拉取代码 -> 安装依赖 -> 同步表结构 -> 构建 -> 替换产物 -> 重启 -> 健康检查
# 用法：bash scripts/deploy.sh [--if-changed]
set -Eeuo pipefail

IF_CHANGED=0
for arg in "$@"; do
  case "$arg" in
    --if-changed) IF_CHANGED=1 ;;
    -h|--help)
      echo "用法: bash scripts/deploy.sh [--if-changed]"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 2
      ;;
  esac
done

APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$APP_DIR"

# 服务器本地配置，不提交到仓库
if [ -f "$APP_DIR/.deploy.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.deploy.env"
  set +a
fi

BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-build}"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "失败: $*"; exit 1; }

# 服务器本地替换过的品牌文件在合并前暂存、合并后还原；未替换的文件仍跟随仓库更新。
BRAND_FILES=(
  public/logo.png
  public/icon.png
  src/app/icon.png
  src/app/apple-icon.png
)
BRAND_BACKUP=""

restore_tsconfig() {
  if [ "${BUILD_STARTED:-0}" = "1" ] && ! git -C "$APP_DIR" diff --quiet -- tsconfig.json 2>/dev/null; then
    log "恢复 Next 对 tsconfig.json 的自动改写"
    git -C "$APP_DIR" checkout -- tsconfig.json 2>/dev/null || true
  fi
}

restore_brand() {
  local f key
  if [ -z "$BRAND_BACKUP" ] || [ ! -d "$BRAND_BACKUP" ]; then
    return 0
  fi
  for f in "${BRAND_FILES[@]}"; do
    key="${f//\//__}"
    if [ -f "$BRAND_BACKUP/$key" ]; then
      cp -p "$BRAND_BACKUP/$key" "$APP_DIR/$f"
    fi
  done
  rm -rf "$BRAND_BACKUP"
  BRAND_BACKUP=""
}

backup_brand() {
  local f key any=0
  for f in "${BRAND_FILES[@]}"; do
    [ -f "$APP_DIR/$f" ] || fail "缺少品牌文件 $APP_DIR/$f"
  done
  for f in "${BRAND_FILES[@]}"; do
    if git -C "$APP_DIR" diff --quiet -- "$f"; then
      continue
    fi
    if [ -z "$BRAND_BACKUP" ]; then
      BRAND_BACKUP=$(mktemp -d "${TMPDIR:-/tmp}/knav-brand.XXXXXX")
    fi
    key="${f//\//__}"
    cp -p "$APP_DIR/$f" "$BRAND_BACKUP/$key"
    any=1
  done
  if [ "$any" -eq 1 ]; then
    log "暂存服务器替换的品牌文件（部署后还原）"
  fi
}

cleanup() {
  restore_tsconfig
  restore_brand
}

trap 'log "部署中断，当前提交 $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"' ERR
trap cleanup EXIT

[ -f "$APP_DIR/.env" ] || fail "缺少 $APP_DIR/.env"
[ "$NEXT_DIST_DIR" != ".next" ] || fail "NEXT_DIST_DIR 不能设为 .next"

if command -v flock >/dev/null 2>&1; then
  exec 9>"${TMPDIR:-/tmp}/knav-deploy.lock"
  flock -n 9 || {
    log "已有部署任务在运行，本次跳过"
    exit 0
  }
fi

setup_node() {
  local dir
  local candidates=()

  if command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)' 2>/dev/null; then
    return 0
  fi

  [ -n "${NODE_BIN:-}" ] && candidates+=("$NODE_BIN")
  for dir in \
    /opt/1panel/runtime/node/*/bin \
    /usr/local/node/*/bin \
    /usr/local/node*/bin \
    "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$dir/node" ] && candidates+=("$dir")
  done

  for dir in "${candidates[@]}"; do
    if "$dir/node" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)' 2>/dev/null; then
      export PATH="$dir:$PATH"
      log "使用 Node $("$dir/node" -v)（$dir）"
      return 0
    fi
  done

  fail "宿主机未找到 Node.js 18.18+；请在 $APP_DIR/.deploy.env 设置 NODE_BIN=/path/to/node/bin"
}

detect_container() {
  command -v docker >/dev/null 2>&1 || return 0

  local name src dst mounts
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    mounts=$(docker inspect --format '{{range .Mounts}}{{println .Source .Destination}}{{end}}' "$name" 2>/dev/null || true)
    while read -r src dst; do
      [ -n "$src" ] || continue
      if [ "$(readlink -f "$src" 2>/dev/null || printf '%s' "$src")" = "$APP_DIR" ]; then
        CONTAINER_NAME="$name"
        CONTAINER_WORKDIR="$dst"
        return 0
      fi
    done <<< "$mounts"
  done < <(docker ps --format '{{.Names}}' 2>/dev/null || true)
}

CONTAINER_NAME=""
CONTAINER_WORKDIR="/app"
detect_container

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "$APP_DIR 不是 Git 仓库"
[ "$(git symbolic-ref --short -q HEAD || true)" = "$BRANCH" ] || fail "当前分支不是 $BRANCH"

export GIT_TERMINAL_PROMPT=0
log "拉取 origin/$BRANCH"
git fetch --prune origin "$BRANCH"

TARGET=$(git rev-parse "origin/$BRANCH")
CURRENT=$(git rev-parse HEAD)
DEPLOYED=$(cat "$APP_DIR/.deploy-ok" 2>/dev/null || true)

if [ "$IF_CHANGED" -eq 1 ] && [ "$CURRENT" = "$TARGET" ] && [ "$DEPLOYED" = "$TARGET" ]; then
  log "已是最新版本（${CURRENT:0:7}），无需部署"
  exit 0
fi

OTHER_CHANGES=$(git status --porcelain --untracked-files=no |
  grep -vE '^ M (public/logo\.png|public/icon\.png|src/app/icon\.png|src/app/apple-icon\.png)$' || true)
[ -z "$OTHER_CHANGES" ] || fail "服务器工作区有未提交修改（品牌文件除外），请先处理:
$OTHER_CHANGES"

backup_brand
git checkout -- "${BRAND_FILES[@]}"
git merge --ff-only "$TARGET"
restore_brand
log "当前版本: $(git log --oneline -1)"

rm -rf "$APP_DIR/$NEXT_DIST_DIR"
BUILD_STARTED=1

if [ -n "$CONTAINER_NAME" ]; then
  log "检测到运行容器 $CONTAINER_NAME（$CONTAINER_WORKDIR），在容器内构建"

  log "安装依赖"
  docker exec -w "$CONTAINER_WORKDIR" "$CONTAINER_NAME" npm ci --include=dev --no-audit --no-fund

  log "同步数据库结构"
  docker exec -w "$CONTAINER_WORKDIR" "$CONTAINER_NAME" npm run db:migrate

  log "构建到 $NEXT_DIST_DIR"
  docker exec -w "$CONTAINER_WORKDIR" -e "NEXT_DIST_DIR=$NEXT_DIST_DIR" "$CONTAINER_NAME" npm run build
else
  setup_node
  command -v npm >/dev/null 2>&1 || fail "未找到 npm"

  log "安装依赖"
  npm ci --include=dev --no-audit --no-fund

  log "同步数据库结构"
  npm run db:migrate

  log "构建到 $NEXT_DIST_DIR"
  NEXT_DIST_DIR="$NEXT_DIST_DIR" npm run build
fi

[ -d "$APP_DIR/$NEXT_DIST_DIR" ] || fail "构建目录 $NEXT_DIST_DIR 不存在"

rm -rf "$APP_DIR/.next.prev"
if [ -d "$APP_DIR/.next" ]; then
  mv "$APP_DIR/.next" "$APP_DIR/.next.prev"
fi
mv "$APP_DIR/$NEXT_DIST_DIR" "$APP_DIR/.next"

if [ -z "$CONTAINER_NAME" ]; then
  APP_OWNER="${APP_OWNER:-$(stat -c '%U' "$APP_DIR/public/uploads" 2>/dev/null || true)}"
  if [ -n "$APP_OWNER" ] && [ "$APP_OWNER" != "$(id -un)" ]; then
    log "调整构建产物属主为 $APP_OWNER"
    chown -R "$APP_OWNER" "$APP_DIR/.next" "$APP_DIR/node_modules" 2>/dev/null || true
  fi
fi

restart_app() {
  if [ -n "${RESTART_CMD:-}" ]; then
    log "重启: $RESTART_CMD"
    eval "$RESTART_CMD"
    return 0
  fi

  if [ -n "$CONTAINER_NAME" ]; then
    log "重启容器 $CONTAINER_NAME"
    docker restart "$CONTAINER_NAME" >/dev/null
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if systemctl cat knav.service >/dev/null 2>&1; then
      log "重启 systemd 服务 knav"
      systemctl restart knav
      return 0
    fi

    local unit wd
    while IFS= read -r unit; do
      [ -n "$unit" ] || continue
      wd=$(systemctl show -p WorkingDirectory --value "$unit" 2>/dev/null || true)
      if [ "$wd" = "$APP_DIR" ]; then
        log "重启 systemd 服务 $unit"
        systemctl restart "$unit"
        return 0
      fi
    done < <(systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | awk '{print $1}')
  fi

  if command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    local pm2_name
    pm2_name=$(pm2 jlist 2>/dev/null | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const apps = JSON.parse(s);
          const hit =
            apps.find((a) => a.pm2_env && a.pm2_env.pm_cwd === process.argv[1]) ||
            apps.find((a) => (a.name || "").toLowerCase().includes("knav"));
          if (hit) process.stdout.write(hit.name || "");
        } catch {}
      });
    ' "$APP_DIR" 2>/dev/null || true)
    if [ -n "$pm2_name" ]; then
      log "重启 PM2 进程 $pm2_name"
      pm2 restart "$pm2_name" --update-env
      pm2 save >/dev/null 2>&1 || true
      return 0
    fi
  fi

  fail "无法确定应用如何重启；请在 $APP_DIR/.deploy.env 设置 RESTART_CMD"
}

restart_app

if ! command -v curl >/dev/null 2>&1; then
  log "未安装 curl，跳过健康检查"
  git rev-parse HEAD > "$APP_DIR/.deploy-ok"
  log "部署完成: $(git log --oneline -1)"
  exit 0
fi

log "健康检查 $HEALTH_URL"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    git rev-parse HEAD > "$APP_DIR/.deploy-ok"
    log "部署完成: $(git log --oneline -1)"
    exit 0
  fi
  sleep 2
done

fail "健康检查未通过；旧构建保留在 $APP_DIR/.next.prev，排查后可手动恢复"
