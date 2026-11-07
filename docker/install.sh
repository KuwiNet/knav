#!/usr/bin/env bash
#
# knav 一键安装：应用 + 数据库都跑在 Docker 里，端口直接对外，装完就能访问。
#
#   curl -fsSL https://raw.githubusercontent.com/KuwiNet/knav/main/docker/install.sh | sudo bash
#
# 需要参数时用环境变量（管道执行没法带命令行参数）：
#   curl -fsSL .../install.sh | sudo KNAV_DB=mariadb KNAV_PORT=8080 bash
#
# 国内机器：compose 文件默认 GitHub 拉不到就自动换 Gitee，镜像默认在探测到 Docker Hub 不可达时
# 换成阿里云 ACR + DaoCloud 镜像。想强制某一边用 KNAV_CN=1 / KNAV_CN=0；脚本本身也可以从 Gitee 取：
#   curl -fsSL https://gitee.com/kuwinet/knav/raw/main/docker/install.sh | sudo bash
#
# 做的事：检查 Docker → 下载 compose 文件 → 生成 .env（随机密码、探测站点地址）
#   → 拉镜像 → 起服务 → 等健康并回取一次 CSS → 打印本机/内网/公网访问地址与站长口令。
# 不做的事：不装 Docker、不改宿主数据库、不删任何已有容器。

set -euo pipefail

KNAV_DIR="${KNAV_DIR:-/opt/knav}"
KNAV_PORT="${KNAV_PORT:-3000}"
KNAV_DB="${KNAV_DB:-mysql}"                      # mysql | mariadb
KNAV_REF="${KNAV_REF:-main}"                      # 下载 compose 文件的分支或 tag
KNAV_CN="${KNAV_CN:-auto}"                        # auto=探到 Docker Hub 不通才走国内源；1=强制国内源；0=镜像只用国外
KNAV_RAW_BASE="${KNAV_RAW_BASE:-}"                # 手动指定 compose 文件的下载地址；留空按探测结果排 GitHub / Gitee 先后
KNAV_IMAGE="${KNAV_IMAGE:-}"                      # 应用镜像；留空时按 KNAV_CN 选 Hub 或阿里云 ACR
KNAV_DB_IMAGE="${KNAV_DB_IMAGE:-}"                # 数据库镜像；留空时按 KNAV_CN 选官方或国内镜像
KNAV_ACR_IMAGE="${KNAV_ACR_IMAGE:-crpi-31z6v1rz7y15fca2.cn-beijing.personal.cr.aliyuncs.com/kuwinet/knav}"   # 国内应用镜像；控制台给的实例域名，命名空间要和阿里云上建的一致
KNAV_ADMIN_USER="${KNAV_ADMIN_USER:-admin}"
KNAV_ADMIN_EMAIL="${KNAV_ADMIN_EMAIL:-}"
KNAV_SITE_URL="${KNAV_SITE_URL:-}"
KNAV_FORCE="${KNAV_FORCE:-0}"                     # 1=重新生成 .env（会换掉数据库口令，已建好的库不会跟着改）

log() { printf '\033[1;36m[knav]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[knav] 停止：\033[0m %s\n' "$*" >&2; exit 1; }

# 非 root 时自动用 sudo 重跑一次。curl | bash 这种管道执行方式里 $0 不是文件，
# 没法重跑，只能提示改用 sudo bash（脚本本身对执行用户没有要求）
if [ "$(id -u)" -ne 0 ]; then
  if [ -f "$0" ] && command -v sudo >/dev/null 2>&1; then
    exec sudo KNAV_DIR="$KNAV_DIR" KNAV_PORT="$KNAV_PORT" KNAV_DB="$KNAV_DB" KNAV_REF="$KNAV_REF" \
      KNAV_CN="$KNAV_CN" KNAV_RAW_BASE="$KNAV_RAW_BASE" KNAV_IMAGE="$KNAV_IMAGE" \
      KNAV_DB_IMAGE="$KNAV_DB_IMAGE" KNAV_ACR_IMAGE="$KNAV_ACR_IMAGE" \
      KNAV_ADMIN_USER="$KNAV_ADMIN_USER" KNAV_ADMIN_EMAIL="$KNAV_ADMIN_EMAIL" \
      KNAV_SITE_URL="$KNAV_SITE_URL" KNAV_FORCE="$KNAV_FORCE" bash "$0" "$@"
  fi
  die "需要 root：sudo bash install.sh，或 curl -fsSL <地址> | sudo bash"
fi

# 应用镜像与数据库镜像都在这张表里选：国内源只换「从哪拉」，不换「拉什么版本」
case "$KNAV_DB" in
  mysql)   DB_FILE=compose.mysql.yaml;   DB_VOL=knav_mysqldata
           DB_IMAGE_UPSTREAM=mysql:8.4
           DB_IMAGE_CN=docker.m.daocloud.io/library/mysql:8.4 ;;
  mariadb) DB_FILE=compose.mariadb.yaml; DB_VOL=knav_mariadbdata
           DB_IMAGE_UPSTREAM=mariadb:11
           DB_IMAGE_CN=docker.m.daocloud.io/library/mariadb:11 ;;
  *) die "KNAV_DB 只能是 mysql 或 mariadb（当前：$KNAV_DB）" ;;
esac

# Docker Hub 通不通：只看能不能拿到 HTTP 状态码。401 是「要鉴权」，链路本身是通的；
# 拿不到码（000）才是 TCP/TLS 直接被超时拖死，国内多数机器就是这一种。8 秒上限，探测不拖慢安装
hub_reachable() {
  local c
  c="$(curl -sS -o /dev/null -m 8 -w '%{http_code}' https://registry-1.docker.io/v2/ 2>/dev/null || true)"
  [ -n "$c" ] && [ "$c" != 000 ]
}

USE_CN="$KNAV_CN"
if [ "$USE_CN" = auto ]; then
  if hub_reachable; then
    USE_CN=0
  else
    USE_CN=1
    log "探测到 Docker Hub 不可达，本次改用国内源（要强制关掉：KNAV_CN=0）"
  fi
fi
# 镜像标签和 KNAV_REF 对齐：main 分支的产物同时打了 latest，tag v0.1.4 的产物打了 0.1.4
if [ "$KNAV_REF" = main ]; then IMG_TAG=latest; else IMG_TAG="${KNAV_REF#v}"; fi
if [ "$USE_CN" = 1 ]; then
  IMG_DEFAULT="$KNAV_ACR_IMAGE:$IMG_TAG"; DB_IMG_DEFAULT="$DB_IMAGE_CN"
else
  IMG_DEFAULT="kuwinet/knav:$IMG_TAG"; DB_IMG_DEFAULT="$DB_IMAGE_UPSTREAM"
fi
# 记一下是不是命令行显式给的值：沿用旧 .env 时，没显式指定就以 .env 为准，
# 免得一次探测把已装好的站换成另一个仓库（结尾打印的也是 .env 里那个）
USER_SET_IMAGE=0
USER_SET_DB_IMAGE=0
if [ -n "$KNAV_IMAGE" ]; then USER_SET_IMAGE=1; fi
if [ -n "$KNAV_DB_IMAGE" ]; then USER_SET_DB_IMAGE=1; fi
KNAV_IMAGE="${KNAV_IMAGE:-$IMG_DEFAULT}"
KNAV_DB_IMAGE="${KNAV_DB_IMAGE:-$DB_IMG_DEFAULT}"

command -v docker >/dev/null 2>&1 || die "没找到 docker。先装 Docker：curl -fsSL https://get.docker.com | sh"
docker info >/dev/null 2>&1 || die "docker 守护进程不可用（服务没起，或当前用户没权限）：systemctl start docker"
docker compose version >/dev/null 2>&1 || die "缺 Docker Compose v2（docker compose 子命令）。装 Docker 时自带，单独装见 docs.docker.com/compose"

# 端口占用与同名容器提前拦下来，别等到 compose 报半截错
if docker ps -a --format '{{.Names}}' | grep -qx knav; then
  die "已存在名为 knav 的容器（多半是 docker run 起的）。先删掉再装：docker rm -f knav"
fi
if ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$KNAV_PORT\$"; then
  die "端口 $KNAV_PORT 已被占用：ss -lntp | grep ':$KNAV_PORT'。换端口：KNAV_PORT=8080 重跑"
fi

mkdir -p "$KNAV_DIR"
cd "$KNAV_DIR"

# 两个源依次试，每个源 20 秒上限（--retry 1 封顶两次；下一个源是另一台机器，在同一台上死磕没意义）。
# 上面探到 Docker Hub 不通就把 Gitee 排前面，省掉两个文件各等一轮 GitHub 超时——那半分钟正是
# 「卡在下载 compose.yaml」的观感。Gitee 的 raw 会 302 到带时效签名的地址，必须 -L 才拿得到正文
# （不带 -L 落盘的是 388 字节的跳转页）
GH_RAW="https://raw.githubusercontent.com/KuwiNet/knav/$KNAV_REF"
GN_RAW="https://gitee.com/kuwinet/knav/raw/$KNAV_REF"
RAW_BASES=()
if [ -n "$KNAV_RAW_BASE" ]; then
  RAW_BASES=("$KNAV_RAW_BASE")
elif [ "$USE_CN" = 1 ]; then
  RAW_BASES=("$GN_RAW" "$GH_RAW")
else
  RAW_BASES=("$GH_RAW" "$GN_RAW")
fi
for f in compose.yaml "$DB_FILE"; do
  got=0
  for base in "${RAW_BASES[@]}"; do
    log "下载 $f（← $(printf '%s' "$base" | cut -d/ -f3)）"
    if curl -fsSL --retry 1 -m 20 -o "$f.part" "$base/$f"; then got=1; break; fi
    rm -f "$f.part"
  done
  [ "$got" = 1 ] || die "下载 $f 失败，两个源都没通：${RAW_BASES[*]}。可以先手动把仓库根目录的 $f 放到 $KNAV_DIR 再重跑，或用 KNAV_RAW_BASE 指定一个能访问的镜像地址"
  [ -s "$f.part" ] || die "$f 下载后是空的"
  mv -f "$f.part" "$f"
done

ENV_FILE="$KNAV_DIR/.env"
ADMIN_PASSWORD=""
PW_FRESH=0

# 内网地址：默认路由的 src 最可靠（多网卡时它就是对外那张卡），拿不到就退到第一个全局 IPv4
lan_ip() { ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1; }
lan_ip_fallback() { ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1; }
# 公网出口地址：任一探测服务返回 IPv4 即算，全失败（内网无出口/探测被墙）就返回空。
# 三个服务各 3 秒上限，所以断外网的机器最多慢 9 秒，不会挂住。
public_ip() {
  local u v
  for u in https://ifconfig.me/ip https://api.ipify.org https://ipinfo.io/ip; do
    v="$(curl -fsS -m 3 "$u" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)"
    # 回环/私网/链路本地一律不算公网：NAT 后面探测到的往往就是内网地址，拿去当站点地址会骗人
    case "$v" in
      '' | 127.* | 10.* | 169.254.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].*) continue ;;
      *) printf '%s' "$v"; return 0 ;;
    esac
  done
  return 0
}
# 三个探测都要 || true：set -o pipefail 下，ip 命令缺失或没默认路由会让赋值本身失败，
# 脚本会在「装完并已通过健康检查」的位置直接退出（旧版结尾那行就是这么炸的）
LAN_IP="$(lan_ip || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(lan_ip_fallback || true)"
PUB_IP="$(public_ip || true)"

# 沿用旧配置时这些值要从 .env 里读回来，否则结尾打印的是空
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }
# 写回 .env：没有这一行就追加（老版本的 .env 里没有 KNAV_IMAGE / KNAV_DB_IMAGE 两行）
env_set() {
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"; fi
}
if [ -f "$ENV_FILE" ] && [ "$KNAV_FORCE" != "1" ]; then
  log "沿用已有 $ENV_FILE（要重新生成：KNAV_FORCE=1）"
  ADMIN_PASSWORD="$(env_get ADMIN_PASSWORD)"
  [ -n "$KNAV_SITE_URL" ] || KNAV_SITE_URL="$(env_get SITE_URL)"
  KNAV_ADMIN_EMAIL="$(env_get ADMIN_EMAIL)"
  SMTP_HOST_NOW="$(env_get SMTP_HOST)"
  if [ "$USER_SET_IMAGE" = 0 ]; then KNAV_IMAGE="$(env_get KNAV_IMAGE)"; fi
  if [ "$USER_SET_DB_IMAGE" = 0 ]; then KNAV_DB_IMAGE="$(env_get KNAV_DB_IMAGE)"; fi
  # 老版本的 .env 里没有这两行，读回来是空；空着就别硬套，让 compose 用它自己的默认值
  KNAV_IMAGE="${KNAV_IMAGE:-$IMG_DEFAULT}"
  KNAV_DB_IMAGE="${KNAV_DB_IMAGE:-$DB_IMG_DEFAULT}"
else
  PW_FRESH=1
  SMTP_HOST_NOW=""
  # MYSQL_* 建号口令只在数据卷为空的第一次初始化生效，卷还在就只是改了张纸
  if docker volume inspect "$DB_VOL" >/dev/null 2>&1; then
    log "注意：数据卷 $DB_VOL 已存在，新密码不会写进已经建好的库。真要从零装先删卷：docker volume rm $DB_VOL"
  fi
  gen_pw() { # 十六进制：不含 $ & ! # 空格，避开 .env 与 compose 插值的所有坑
    if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
    else od -An -tx1 -N16 /dev/urandom | tr -d ' \n'; fi
  }
  if [ -z "$KNAV_SITE_URL" ]; then
    # 站点地址优先公网，其次内网，都没有就退回环；探测不到绝不能拼出 http://:3000
    SITE_IP="${PUB_IP:-${LAN_IP:-127.0.0.1}}"
    KNAV_SITE_URL="http://$SITE_IP:$KNAV_PORT"
  fi
  ADMIN_PASSWORD="$(gen_pw)"

  umask 077
  cat >"$ENV_FILE" <<EOF
# 由 docker/install.sh 生成于 $(date '+%F %T')。权限 0600，别提交到 git、别贴进工单。
# 改了这里的值要重新执行：docker compose -f compose.yaml -f $DB_FILE up -d

PORT=$KNAV_PORT
KNAV_IMAGE=$KNAV_IMAGE
# 数据库镜像：默认就是 compose.mysql.yaml / compose.mariadb.yaml 里写的官方名，
# 国内机器走 DaoCloud 镜像时才带上前缀。换库版本只改这里，不用碰 compose 文件
KNAV_DB_IMAGE=$KNAV_DB_IMAGE

# 数据库（跑在同一个 compose 网络里，DB_HOST 就是服务名 db）
DB_HOST=db
DB_PORT=3306
DB_USER=knav
DB_PASS=$(gen_pw)
DB_NAME=knav
MYSQL_ROOT_PASSWORD=$(gen_pw)

# 站点地址：外发邮件里的验证/找回密码链接、OG 图、sitemap、OAuth 回调都以它为准
# 安装时按「公网 > 内网 > 127.0.0.1」探测；后台「站点设置 → 站点地址」里存过值就以数据库为准，这里会被忽略
SITE_URL=$KNAV_SITE_URL

# 首次建库时创建站长；已有站长后不会再改。登录后台请立即换密码
ADMIN_USERNAME=$KNAV_ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=$KNAV_ADMIN_EMAIL

# 邮件：留空则不发信，只写进后台的通知日志
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=knav
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 $ENV_FILE（数据库口令随机、权限 0600）"
fi

COMPOSE="docker compose -f $KNAV_DIR/compose.yaml -f $KNAV_DIR/$DB_FILE"

if docker image inspect "$KNAV_IMAGE" >/dev/null 2>&1; then
  log "本机已有 $KNAV_IMAGE，跳过拉取"
else
  # 按顺序试的镜像组合，格式「应用镜像|库镜像」。第一组是本次判定（或 .env 沿用）的来源；
  # 判定为国内、且这一组确实是脚本给的 ACR 默认值时，再补一组 Docker Hub 官方名。原因是
  # 「探测不通」只代表直连 registry-1.docker.io 慢，守护进程里配了加速器的机器按官方名反而能拉下来，
  # 而 ACR 是这次新加的仓库，很可能还没有对应 tag——没有这组兜底，国内机器就卡在拉镜像无路可走。
  # 用户显式指定或 .env 沿用旧值时不加，免得拉取失败把站点悄悄换成 latest
  COMBOS=("$KNAV_IMAGE|$KNAV_DB_IMAGE")
  if [ "$USE_CN" = 1 ] && [ "$USER_SET_IMAGE" = 0 ] && [ "$KNAV_IMAGE" = "$KNAV_ACR_IMAGE:$IMG_TAG" ]; then
    FB_IMG="kuwinet/knav:$IMG_TAG"
    FB_DB="$KNAV_DB_IMAGE"
    # 数据库镜像只有确实是 DaoCloud 前缀时才换回官方名，用户自己指的仓库不碰
    if [ "$KNAV_DB_IMAGE" = "$DB_IMAGE_CN" ]; then FB_DB="$DB_IMAGE_UPSTREAM"; fi
    COMBOS+=("$FB_IMG|$FB_DB")
  fi
  pulled=0
  for combo in "${COMBOS[@]}"; do
    img="${combo%%|*}"
    dbimg="${combo##*|}"
    if [ "$img" = "$KNAV_IMAGE" ] && [ "$dbimg" = "$KNAV_DB_IMAGE" ]; then
      log "拉取镜像：$img + $dbimg"
    else
      log "上一组没拉到，换：$img + $dbimg"
    fi
    if KNAV_IMAGE="$img" KNAV_DB_IMAGE="$dbimg" $COMPOSE pull; then
      pulled=1
      if [ "$img" != "$KNAV_IMAGE" ] || [ "$dbimg" != "$KNAV_DB_IMAGE" ]; then
        KNAV_IMAGE="$img"
        KNAV_DB_IMAGE="$dbimg"
        env_set KNAV_IMAGE "$KNAV_IMAGE"
        env_set KNAV_DB_IMAGE "$KNAV_DB_IMAGE"
        log "本次改用 $KNAV_IMAGE + $KNAV_DB_IMAGE，已写回 $ENV_FILE（下次 up -d 不会又换回去）"
      fi
      break
    fi
  done
  [ "$pulled" = 1 ] || die "拉镜像失败，试过的组合：${COMBOS[*]//|/ + }。ACR 上还没这个 tag 就等发布工作流推一次再重跑（配 ACR 见 docs/docker.md 2.6）；这台机能直连 Docker Hub 或配了加速器就 KNAV_CN=0 重跑；都不行改用本地构建 KNAV_IMAGE=knav:local，见第 3 节"
fi

log "启动服务（首次建库会跑迁移，约 1 分钟）"
$COMPOSE up -d

log "等待 /api/health …"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS -m 3 "http://127.0.0.1:$KNAV_PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { $COMPOSE logs --tail 40; die "健康检查超时，上面是容器日志"; }

# 首页 200 不代表样式在：standalone 的 static 挂错目录时只有 /_next/static/** 会 404
CSS="$(curl -fsS -m 5 "http://127.0.0.1:$KNAV_PORT/" | grep -o '/_next/static/css/[^"]*' | head -1 || true)"
if [ -n "$CSS" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$KNAV_PORT$CSS" || true)"
  [ "$code" = 200 ] || die "样式文件 $CSS 返回 ${code:-无响应}，镜像里的 static 目录不对，见 docs/docker.md 第 9 节"
fi

printf '\n\033[1;32m✓ knav 已就绪\033[0m\n'
echo "  本机访问   http://127.0.0.1:$KNAV_PORT"
if [ -n "$PUB_IP" ]; then
  # 有公网出口就两条都列出来；公网地址能不能从外面进来还取决于路由/云安全组，这里提示一句
  echo "  访问地址   http://${LAN_IP:-$PUB_IP}:$KNAV_PORT      （内网）"
  echo "             http://$PUB_IP:$KNAV_PORT      （公网；需已把 $KNAV_PORT 放行或映射到本机）"
elif [ -n "$LAN_IP" ]; then
  echo "  访问地址   http://$LAN_IP:$KNAV_PORT      （内网）"
fi
echo "  站点地址   $KNAV_SITE_URL   （公网优先，没有用内网；后台「站点设置 → 基础信息」可覆盖）"
echo "  站长账号   $KNAV_ADMIN_USER"
if [ "$PW_FRESH" = 1 ]; then
  echo "  初始密码   $ADMIN_PASSWORD   ← 只打印这一次，登录后立刻改掉"
elif [ -n "$ADMIN_PASSWORD" ]; then
  echo "  站长密码   $ADMIN_PASSWORD   ← 沿用 $ENV_FILE 里的旧口令，本次没有重置"
else
  echo "  站长密码   $ENV_FILE 里 ADMIN_PASSWORD 为空，未自动建号（用 create-admin.ts 或后台建）"
fi
echo
echo "  镜像来源   $KNAV_IMAGE ＋ $KNAV_DB_IMAGE"
echo "             （想固定用哪边：KNAV_CN=1 国内源 / KNAV_CN=0 直连 Docker Hub；改完重跑安装命令即可）"
echo "  日常操作   cd $KNAV_DIR"
echo "             $COMPOSE ps            # 状态"
echo "             $COMPOSE logs -f knav  # 日志"
echo "             $COMPOSE restart       # 重启（改 .env 要用 up -d 才会重读）"
echo "  备份恢复   docs/docker.md 第 8 节；数据库口令在 $ENV_FILE"
if [ -z "$SMTP_HOST_NOW" ]; then
  echo "  待办       SMTP_HOST 还没配：找回密码邮件发不出去，后台「站点设置 → 邮件（SMTP）」填完即可（内网站可忽略）"
fi
