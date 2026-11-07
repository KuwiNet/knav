# Docker 部署

仓库自带 `Dockerfile`、`.dockerignore`、`docker/entrypoint.sh`、`docker/install.sh`，
以及 `compose.yaml` 加三份覆盖文件（`compose.mysql.yaml` 带 MySQL 8.4、`compose.mariadb.yaml`
带 MariaDB 11、`compose.host.yaml` 对接宿主机已有的库）。
最省事的是第 2.1 节的一行命令安装，其次是一条 `docker compose up -d --build`。

> **和现网另一条部署路径的关系**
> README 的「自动部署（可选）」是 **GitHub Actions 构建 `.next` 产物、服务器只替换产物并重启**
> （`scripts/deploy.sh --artifact`）；本文是**整镜像部署**。两条路互不影响：只有构建时设了
> `NEXT_OUTPUT=standalone` 才会产出 standalone 目录，现网工作流不设这个变量，产物内容和包体积都不变。
> 只有 1~2GB 内存的小机器建议继续用产物部署，不要在服务器上跑 `next build`。

---

## 1. 环境要求

| 项目 | 要求 |
|---|---|
| Docker Engine | 20.10+（需要 BuildKit，Docker Desktop 默认开启） |
| Docker Compose | v2，即 `docker compose` 子命令 |
| 架构 | amd64 / arm64 均可，没有架构相关的原生依赖 |
| 内存 | 运行 300MB 起；**构建阶段建议 1GB 以上**（`next build` 有峰值），内存不够就在别处构建再拉镜像 |
| 数据库 | 外部 MySQL 8.0+ / MariaDB 10.6+，或用附带的 `compose.mysql.yaml`、`compose.mariadb.yaml` |

运行层基于 `node:22-alpine`，只含 standalone 产物 + Next/React 运行时；
`mysql2`、`bcryptjs`、`nodemailer` 等已被 webpack 打进服务端 chunk，不再单独占一层。

---

## 2. 用 compose 起站（推荐）

### 2.1 一行命令安装（不用 clone 仓库）

`docker/install.sh` 把应用和数据库都跑在 Docker 里，自动生成口令、探测站点地址、等健康检查，
装完直接给访问地址和站长口令：

```bash
curl -fsSL https://raw.githubusercontent.com/KuwiNet/knav/main/docker/install.sh | sudo bash
```

需要改默认值时用环境变量（管道执行传不了命令行参数）：

```bash
curl -fsSL https://raw.githubusercontent.com/KuwiNet/knav/main/docker/install.sh | sudo KNAV_DB=mariadb KNAV_PORT=8080 bash
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `KNAV_DB` | `mysql` | `mysql`（8.4）或 `mariadb`（11），两份覆盖文件二选一 |
| `KNAV_PORT` | `3000` | 宿主对外端口，被占用时脚本会先拦下来并提示换 |
| `KNAV_DIR` | `/opt/knav` | 放 compose 文件与 `.env` 的目录 |
| `KNAV_IMAGE` | `kuwinet/knav:<标签>` | 应用镜像；标签跟着 `KNAV_REF` 走（`main`→`latest`，`v0.1.4`→`0.1.4`）。想用本地构建的镜像改成 `knav:local` |
| `KNAV_DB_IMAGE` | `mysql:8.4` / `mariadb:11` | 数据库镜像地址，换仓库前缀不改版本 |
| `KNAV_CN` | `auto` | 国内源开关：`auto` 探测、`1` 强制国内、`0` 镜像只用国外，见 2.1.1 |
| `KNAV_RAW_BASE` | 空 | 手动指定 compose 文件的下载地址；留空时按探测结果排 GitHub / Gitee 的先后 |
| `KNAV_SITE_URL` | 自动探测 | 公网地址 > 内网地址 > `127.0.0.1`；有域名就直接给域名，例如 `https://nav.example.com` |
| `KNAV_ADMIN_EMAIL` | 空 | 留空时站长邮箱落成 `admin@knav.local`，配 SMTP 前记得在后台改 |
| `KNAV_FORCE` | `0` | `1` 才重新生成 `.env`；数据卷已存在时新库口令不会写进已建好的库 |

脚本只做四件事：查 Docker、下载 compose 文件、生成 `.env`（权限 0600）、`compose up -d`。
不装 Docker、不动宿主机上已有的数据库、不删任何已有容器；同名容器或端口被占都会先报错退出而不是半路失败。
站长口令随机生成、只在结束时打印一次，之后要去看 `.env`。

结束时按宝塔那种样式把地址列全，直接点就能用：

```
✓ knav 已就绪
  本机访问   http://127.0.0.1:3000
  访问地址   http://192.168.100.18:3000      （内网）
             http://203.0.113.9:3000      （公网；需已把 3000 放行或映射到本机）
  站点地址   http://203.0.113.9:3000   （公网优先，没有用内网；后台「站点设置 → 基础信息」可覆盖）
  站长账号   admin
  初始密码   68f49d113fd6829701789b6f418e3ed9   ← 只打印这一次，登录后立刻改掉

  镜像来源   kuwinet/knav:latest ＋ mysql:8.4
             （想固定用哪边：KNAV_CN=1 国内源 / KNAV_CN=0 直连 Docker Hub；改完重跑安装命令即可）
```

公网地址是问三个外部服务拿的（`ifconfig.me` / `api.ipify.org` / `ipinfo.io`，各 3 秒上限），
返回私网段一律不算公网，所以 NAT 后面的机器只会显示内网那一行；机器没有外网出口时探测会在十几秒内放弃，
站点地址退回 `127.0.0.1`。注意探测到公网地址 ≠ 外面真能进来，还得路由器做端口映射或云安全组放行；
有域名的话用 `KNAV_SITE_URL=https://nav.example.com` 覆盖，比 IP 更稳（证书、SEO、换 IP 都不用再改）。

还没推仓库的机器可以 `KNAV_IMAGE=knav:local` 配合第 3 节本地构建。

#### 2.1.1 国内机器（GitHub / Docker Hub 都不通）

一条命令本身不用改，脚本里两处都会自己绕：

```bash
# 脚本也可以从 Gitee 的同一份镜像仓库取（内容与 GitHub 逐字节一致，几分钟同步一次）
curl -fsSL https://gitee.com/kuwinet/knav/raw/main/docker/install.sh | sudo bash
```

- **compose 文件**：`raw.githubusercontent.com` 和 `gitee.com/kuwinet/knav/raw/...` 两个地址依次试，
  每个 20 秒上限，两个都没通才报错并把试过的地址打出来。判定为国内时把 Gitee 排在前面——否则两个文件
  各等一轮 GitHub 超时，那半分钟就是「卡在下载 compose.yaml」的观感。Gitee 的 raw 会 302 到带时效
  签名的地址，所以必须带 `-L`，别把跳转后的地址抄进文档。
- **镜像**：`KNAV_CN=auto`（默认）先探一次 `registry-1.docker.io/v2/`——只看拿不拿得到 HTTP 状态码，
  401 说明链路是通的，压根拿不到码才算不通。判定为国内时换成：应用镜像
  `registry.cn-hangzhou.aliyuncs.com/kuwinet/knav`（阿里云 ACR，见 2.6），数据库镜像
  `docker.m.daocloud.io/library/mysql:8.4`（DaoCloud 的 Docker Hub 加速，`library/` 前缀别漏）。
  探测只花 8 秒；想固定一边就 `KNAV_CN=1` / `KNAV_CN=0`（`0` 只是不换成国内镜像，compose 文件
  拉不动时仍会兜底去 Gitee 拿一份，内容是一样的）。
- **优先级**：命令行显式给的 `KNAV_IMAGE` / `KNAV_DB_IMAGE` > 已有 `.env` 里的值 > 本次探测的默认值。
  已经装好的站重跑安装不会被探测结果换走镜像仓库，这两个值也都写在 `.env` 里，手改一样生效。
- **国内镜像拉不到会自动补试一次官方名**：ACR 是这次新加的仓库，很可能还没有对应 tag；而「探测不通」
  也只说明直连慢，配了 Docker Hub 加速器的机器按官方名 `kuwinet/knav:<同一个 tag>` 反而拉得动。
  所以判定为国内、且这一组镜像确实是脚本自己的默认值时，失败后会再用官方名试一次（标签不变，不会
  把钉住的版本换成 `latest`），拉成功就把新地址写回 `.env` 并打印一行说明。用户显式指定或 `.env`
  沿用旧值时不做这个补试。两组都失败才报错。DaoCloud 只是第三方加速，介意的话用 `KNAV_DB_IMAGE`
  指到自己的仓库。

### 2.2 用外部数据库（含现网的云 RDS）

```bash
git clone https://github.com/KuwiNet/knav.git && cd knav
cp .env.example .env      # 至少填 DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME / SITE_URL
docker compose up -d --build
```

compose 读同目录的 `.env` 做变量插值，容器配置全部来自环境变量。
**`.env` 不会进镜像**：`.dockerignore` 排除了 `.env*`（只保留 `.env.example`）。

### 2.3 连数据库一起起

先在 `.env` 里补 `MYSQL_ROOT_PASSWORD` 和 `DB_PASS`（应用账号密码，两者都不能为空），然后：

```bash
docker compose -f compose.yaml -f compose.mysql.yaml up -d --build
docker compose -f compose.yaml -f compose.mariadb.yaml up -d --build   # 想用 MariaDB 11
```

- `db` 是 `mysql:8.4`（数据卷 `mysqldata`）或 `mariadb:11`（数据卷 `mariadbdata`），两份文件二选一、别同时加载
- 表结构两边通用：`db/schema.sql` 只用 `CREATE TABLE IF NOT EXISTS` + InnoDB + `utf8mb4_unicode_ci`，
  没有 MySQL 8 专属语法（无 JSON 函数、无窗口函数、无 CTE），应用侧的 `DB_*` 也不用改
- `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` 只在**数据卷为空的首次初始化**生效，
  之后改 `.env` 不会同步到已建好的库
- 应用等 `db` 健康检查通过才启动，首启迁移不会撞上「库还没就绪」

### 2.4 数据库装在宿主机（自装 MariaDB / 1Panel 的库）

宿主机自己装的 MySQL 通常只监听 `127.0.0.1`，账号也只授权 `localhost`。桥接容器进不了这个监听地址，
源 IP 还会被授权主机拒掉，只能同时改 `bind-address` 和授权网段（见第 9 节）。
用 `compose.host.yaml` 走 host 网络就不用动数据库——容器里的 `127.0.0.1` 就是宿主机：

```bash
docker compose -f compose.yaml -f compose.host.yaml up -d --build
```

`.env` 里保持 `DB_HOST=127.0.0.1`，并把 `PORT` 填成想对外监听的端口（host 网络下它就是宿主端口，
`ports:` 那行不再生效，compose 打一行 `Published ports are discarded` 警告属正常）。
之前用 `docker run` 起过站的，加 `KNAV_UPLOADS_VOLUME=<原卷名>` 才能接着用已有素材，否则会换到一个新空卷。
另外 host 网络的入站要过防火墙，`ufw` 为 active 的机器见第 9 节最后一条。

### 2.5 验证

```bash
docker compose ps                                 # knav 应为 healthy
curl -s http://127.0.0.1:3000/api/health           # {"ok":true}
docker compose logs knav | head                    # 看到「迁移完成: knav」
```

首页 200 不代表样式在，再取一次首页引用的 CSS 请求回来：

```bash
CSS=$(curl -s http://127.0.0.1:3000/ | grep -o '/_next/static/css/[^"]*' | head -1)
curl -s -o /dev/null -w "$CSS -> %{http_code}\n" "http://127.0.0.1:3000$CSS"   # 要 200
```

浏览器打开 `http://服务器IP:3000`，用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录后台，
登录后**先改密码**，再到「站点设置 → 基础信息」确认站点地址（邮件里的验证与找回密码链接以它为准）。

### 2.6 镜像仓库

发布工作流是 `.github/workflows/docker-publish.yml`，多架构（amd64/arm64）同时推两个仓库，都匿名可拉：

| 仓库 | 地址 | 标签 |
|---|---|---|
| Docker Hub | `kuwinet/knav` | `latest`、版本号（如 `0.1.4`）、`main` |
| GHCR | `ghcr.io/KuwiNet/knav` | 同上 |
| 阿里云 ACR | `registry.cn-hangzhou.aliyuncs.com/kuwinet/knav` | 同上；国内机器直连可用 |

ACR 是可选的：配了 Secrets `ACR_USERNAME` / `ACR_PASSWORD` 才推，没配就跳过并在日志里说明原因
（不配不影响 Hub 与 GHCR）。用户名是控制台「访问凭证」里那串**账号全名**，RAM 子账号形如
`user@主账号全名`；密码要用**固定密码**，临时凭证撑不完一次多架构构建。仓库和命名空间要在控制台先建好，
命名空间得是 `kuwinet`（与 `ACR_IMAGE` 一致），并设为公开才能匿名拉。

没推 ACR 之前国内机器也装得下去：一键脚本发现 ACR 拉不到会自动补试 Docker Hub 官方名，配了加速器的
守护进程那一步就能成（见 2.1.1）。推成之后这一行才算真正生效，验证命令：

```bash
docker manifest inspect registry.cn-hangzhou.aliyuncs.com/kuwinet/knav:latest
```

触发方式两种：打 `v*` tag 自动发布（出 `<版本>` + `latest`），或在 Actions 里手动运行
`Publish container image`（在默认分支上跑，出 `main` + `latest`）。Docker Hub 的登录用仓库 Secrets
`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`，没配时那一步自动跳过、只推 GHCR；GHCR 用工作流自带的
`GITHUB_TOKEN`，不需要额外配置。

改这个文件需要令牌带 `workflow` scope（只有 `repo` 会被 GitHub 拒：`git push` 被拒、REST 写返回 404），
所以用带 `workflow` 的经典 PAT 走 Contents API 写（`gh api -X PUT repos/.../contents/.github/workflows/...`），
或在网页上直接编辑。仓库里不留第二份副本，避免两处不一致。

```bash
curl -sS https://raw.githubusercontent.com/KuwiNet/knav/main/.github/workflows/docker-publish.yml   # 看当前内容
gh workflow run "Publish container image" --repo KuwiNet/knav --ref main                             # 手动发一次
```

---

### 2.7 Docker Hub 上的「概述」

Hub 的概述页不会自动读 README：个人账号的仓库没有这层联动，`full_description` 空着就只显示
「No overview available」。概述正文的唯一来源是 `docker/hub-overview.md`，发布工作流里并行的
`同步 Docker Hub 概述` job 每次都会拿它 PATCH 一次仓库对象，改完文案跟着下一次发布自动生效。

```bash
# 只刷新概述，不跑十几分钟的多架构构建
gh workflow run docker-publish.yml --repo KuwiNet/knav --ref main -f only_description=true
```

PATCH 前先 `POST https://hub.docker.com/v2/users/login/`（用户名 + PAT 当密码）拿**账号级 JWT**。
`auth.docker.io/token` 那种 JWT 只有 registry 作用域，推镜像够用，拿它改仓库元数据会 401；
未配 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` 时该 job 直接跳过，不为它另配凭据。

两个坑：`description`（一句话简介）Hub 按 **UTF-8 字节**限长 100，中文一字 3 字节，超了返回
400 `Exceeded max number of bytes 100`，脚本里已加自检；正文图片写 `raw.githubusercontent.com`
的绝对地址即可，实测 Hub 不代理也不拦截，页面直接从 GitHub 取（`naturalWidth` 1440）。


---

## 3. 手动 docker run

```bash
docker build -t knav:local .

docker run -d --name knav --restart unless-stopped \
  -p 3000:3000 \
  -e DB_HOST=203.0.113.10 -e DB_PORT=3306 -e DB_USER=knav -e DB_PASS='强密码' -e DB_NAME=knav \
  -e SITE_URL=https://example.com \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='首启动长密码' -e ADMIN_EMAIL=admin@your-domain.com \
  -v knav-uploads:/app/public/uploads \
  knav:local
```

---

## 4. 表结构与站长账号

入口脚本 `docker/entrypoint.sh` 在起服务前执行迁移（构建时用 esbuild 预编译成单文件的
`scripts/migrate.cjs`，与 `npm run db:migrate` 同一套逻辑）：

- 按 `db/schema.sql` 建表，补列、补索引并回填历史数据，**幂等**，不会清空内容
- 库里没有站长时按 `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` 创建；
  `ADMIN_PASSWORD` 留空则跳过；已有站长时不会改名、提权或重置密码
- `ADMIN_EMAIL` 还是 `.env.example` 里的 `you@example.com` 时，站长账号会**照原样带着这个地址建进库**：
  之后改 `.env` 不会回填，找回密码与站点重置的验证码都会发到一个收不到的域名。
  建号后到后台「账号设置」改成自己的邮箱，或直接：

  ```bash
  sudo mysql -e "UPDATE knav.knav_users SET email='you@your-domain.com', email_verified_at=NOW() WHERE role='owner';"
  ```

- 迁移失败直接退出，不会带着半套表结构对外服务

想自己控制迁移窗口（升级时先停迁移）：

```bash
KNAV_MIGRATE=0 docker compose up -d                 # 或写进 .env
docker compose exec knav node /app/scripts/migrate.cjs
docker compose up -d                                 # 恢复默认行为
```

---

## 5. 上传目录（必须持久化）

后台上传的图标、LOGO，以及「图片本地化」抓下来的外链图片，都落在容器内的
`/app/public/uploads`。这个目录**不打进镜像**（`.dockerignore` 已排除），容器删掉就没了，必须挂卷：

```yaml
volumes:
  - uploads:/app/public/uploads      # compose 默认写法
```

换成 bind mount 时注意属主：容器以 `node`（uid 1000）运行，宿主机目录若是 root 属主就写不进去，
表现为上传失败、外链图片不本地化。入口脚本会在启动时打一行警告，但不会因此拒绝启动（纯只读挂载的站也能起）。

```bash
sudo mkdir -p /opt/knav-uploads
sudo chown -R 1000:1000 /opt/knav-uploads
# compose 里把上面那行换成： - /opt/knav-uploads:/app/public/uploads
```

从现网的 `git pull` 部署切到镜像时，把已有素材搬进卷：

```bash
docker compose cp /opt/knav/public/uploads/. knav:/app/public/uploads
```

搬完到后台「素材库」点一次扫描（磁盘上有、库里没登记的图片会补进素材库）。

---

## 6. 环境变量

应用侧变量与 `.env.example` 完全一致，含义见 README「环境变量」一节。容器相关的额外几项：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 容器内监听端口。只想换宿主机端口时改 compose 的 `ports`，别改它 |
| `HOSTNAME` | `0.0.0.0` | standalone `server.js` 用它绑网卡；改成 `localhost` 容器外就访问不到 |
| `KNAV_MIGRATE` | `1` | `0` = 启动时不跑迁移 |
| `TZ` | `Asia/Shanghai` | 壁纸「每天一张」按服务器本地日期切换；UTC 会让它在北京时间 08:00 才换 |
| `MYSQL_ROOT_PASSWORD` | — | 仅 `compose.mysql.yaml` 需要，必填 |

`DATABASE_URL=mysql://user:pass@host:3306/db` 优先于 `DB_*`。用了它就别同时填 `DB_*`，避免两边不一致。

---

## 7. 反向代理与 HTTPS

镜像只对外提供 3000 端口的 HTTP，TLS 交给前置服务（1Panel 的 OpenResty、Nginx、Caddy 均可）。
`SITE_URL` 与后台「站点地址」都要写公网 `https://` 域名，否则邮件里的链接、第三方登录回调地址
会指向容器内地址。

Nginx 最小片段：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  # 「数据迁移」要上传整份 SQL 备份，默认 1m 会拦下请求
  client_max_body_size 64m;
}
```

---

## 8. 升级与回滚

```bash
cd knav
git pull                                                    # 或换成新版本 Release 源码包后构建
docker build -t knav:$(git rev-parse --short HEAD) -t knav:local .
docker compose up -d                                        # 重建容器，命名卷里的数据不动
curl -s http://127.0.0.1:3000/api/health                    # {"ok":true}
docker compose exec knav node -e "console.log(require('./package.json').version)"
```

回滚把 tag 指回上一个镜像再 `up -d`：

```bash
docker tag knav:<旧版本> knav:local && docker compose up -d
```

迁移是幂等的，回滚镜像不会损坏已经升上去的表结构（多出来的列对旧版应用无害）。
**跨版本升级前照例先备份**：

```bash
# 数据库
docker compose exec db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction knav' > /root/knav-$(date +%F).sql
# 上传目录
docker compose cp knav:/app/public/uploads /root/knav-uploads-$(date +%F)
```

外部数据库就按 README「备份与恢复」一节处理。

---

## 9. 常见问题

**构建时报 `esbuild: not found`**
迁移脚本用 `node_modules/.bin/esbuild` 预编译，它随 `tsx` 一起装。构建阶段用的是含 devDependencies
的完整 `npm ci`；如果你把它改成 `npm ci --omit=dev`，这一步就会缺命令。

**基础镜像能不能换？**
两个阶段都是 `node:22-alpine`。若你的平台在 Alpine（musl）上跑不动 esbuild 之类工具链，把两处
`FROM node:22-alpine` 换成 `node:22-slim` 即可，同时把 `RUN apk add --no-cache tzdata` 换成
`RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*`。
应用本身没有原生依赖，两种基镜像都能跑。

**`迁移失败: connect ECONNREFUSED 127.0.0.1:3306`（然后一直重启）**
容器里的 `127.0.0.1` 是**容器自己**，不是宿主机。启动日志第二行会打印生效的库地址，按它改：

| 数据库在哪 | 怎么填 |
|---|---|
| 宿主机（含 1Panel 映射到宿主端口的 MySQL） | `DB_HOST=host.docker.internal`；compose 走内置的 `extra_hosts: ["host.docker.internal:host-gateway"]`，`docker run` 需要自己加 `--add-host=host.docker.internal:host-gateway` |
| 另一个数据库容器 | 两个容器加入同一网络，`DB_HOST` 填它的服务名 |
| 外部 / 云数据库 | `DB_HOST` 填实际地址，容器网络要能出得去 |

另外 **1Panel 新建的 MySQL 默认只监听宿主机 `127.0.0.1`**（未开「端口外网访问」），
这种情况即使填宿主 IP 也连不上，要么放开监听，要么让两个容器走同一网络用服务名访问。

刷屏是因为 `restart: unless-stopped` 会在迁移失败后不断重启，先 `docker stop <容器>`
或 `docker compose stop` 停住再改配置。

**用 `--network host` 时端口对公网可达**
host 网络下应用直接绑宿主的 `0.0.0.0:PORT`，公网机器上等于把站点（包括 `/login`）直接暴露出去。
只想本地验证时改回桥接、把端口只绑回环，再由反向代理出口访问：

```bash
docker rm -f knav && docker run -d --name knav --restart unless-stopped \
  -p 127.0.0.1:3001:3000 --add-host=host.docker.internal:host-gateway \
  -e DB_HOST=host.docker.internal --env-file /root/knav/.env \
  -v knav-uploads:/app/public/uploads knav:local
```

这条路要求 `DB_HOST=host.docker.internal`（`.env` 里也要一起改），因为容器内的 `127.0.0.1` 已经不是宿主机了。

但**宿主的数据库必须接得住来自网桥的连接**，两条都得满足，否则会退回上面两种报错：

- `bind-address`：MariaDB/MySQL 默认只监听 `127.0.0.1`（`ss -lntp | grep 3306` 只有 127.0.0.1 就是这种情况），
  要从网桥连进来得改成 `0.0.0.0` 并重启数据库服务
- 授权主机：`knav'@'localhost'` 不匹配从 `172.17.x.x` 进来的连接，会报 `Access denied for user 'knav'@'172.17...'`，
  需要按实际来源建账号（`CREATE USER 'knav'@'172.17.%' ...` 或 `'%'`）并 `GRANT`

两条都要改，等于把原本只回环可见的数据库开放给所有网卡。**数据库本来就只服务这台机器时，
保留 `--network host` + `DB_HOST=127.0.0.1` 更合适**——这时只要确认这台机器没有公网地址、
也没做端口转发（`ip a | grep -w inet`），3001 就只在局域网内可达。

**host 网络的站点局域网打不开，1Panel 的站却打得开**
两者的包路径不同：`-p` 映射的容器流量走 `nat/DOCKER` 链转发，**不经过 ufw 的 INPUT 过滤**；
`--network host` 时端口是宿主进程自己监听的，每一条入站连接都要过 INPUT。所以 `ufw` 为 `active`
的机器上，host 网络还得放行端口才有外部访问（只放开内网段，别用裸 `ufw allow 3001`）：

```bash
sudo ufw allow from 192.168.100.0/24 to any port 3001 proto tcp comment 'knav lan'
```

同理，`-p 127.0.0.1:3001:3000` 是 Docker 的「只绑回环」写法，局域网一定连不上——这不是防火墙，
是绑址。排查时两行就能分开：`sudo ss -lntp | grep ':3001'` 看绑在 `127.0.0.1` 还是 `0.0.0.0`，
在宿主上 `curl -o /dev/null -w '%{http_code}\n' http://<局域网IP>:3001/api/health` 能通则问题在客户端侧。

**`Access denied for user 'knav'@'localhost' (using password: YES)`**
网络和端口已经通了，是账号认证失败。先分清三种情况：

```bash
sudo mysql -e "SELECT user,host,plugin,authentication_string<>'' AS has_pw FROM mysql.user WHERE user='knav';"
```

- `plugin=unix_socket`：这个账号不能走密码认证，用 `ALTER USER ... IDENTIFIED BY '密码'` 重建为 `mysql_native_password`
- `has_pw=1` 但仍被拒：`.env` 里的密码和库里的不一致。`CREATE USER IF NOT EXISTS` 对**已存在的账号不会改密码**，
  所以先前用占位符建过一次之后，后面的密码改动会被静默跳过——用 `ALTER USER` 显式改
- `.env` 里是占位符没替换：`awk -F= '/^DB_PASS/{print length($2)}' .env` 看长度，正常应该和你设的一致

改完用 `.env 里的值`做非交互验证，通过了再重建容器（`--env-file` 只在创建时读一次，`docker restart` 不会重新读）：

```bash
mysql -u knav -p"$(awk -F= '/^DB_PASS/{print $2}' /root/knav/.env)" -h 127.0.0.1 knav -e "SELECT 1;"
```

密码里避开 `$` `&` `!` `#` 和引号、空格：`--env-file` 不剥引号、`sed` 会把 `&` 当整个匹配，
这类字符会让「明明填了却认证失败」。`ADMIN_PASSWORD` 非空但少于 8 位时迁移直接报错退出，
表现和连不上库一样是重启循环。

**页面能打开但完全没有样式（`/_next/static/**` 全部 404）**
`output: standalone` 的产物里**不含** `static` 目录，要自己 COPY 到运行目录，
且**目标路径跟着 `distDir` 走**：本镜像构建时设了 `NEXT_DIST_DIR=.next-build`，
`standalone/server.js` 里烧死了 `distDir: "./.next-build"`，静态资源按 `<distDir>/static` 查找，
所以 Dockerfile 里是 `.next-build/static → ./.next-build/static`，不是官方案例里的 `./.next/static`。

这个坑不会让服务起不来：`/api/health` 照样 200、页面照样 200，只是样式和客户端脚本全丢，
看起来像「CSS 没编译」。两条命令定性：

```bash
CSS=$(curl -s http://127.0.0.1:3001/ | grep -o '/_next/static/css/[^"]*' | head -1)
curl -s -o /dev/null -w "$CSS -> %{http_code}\n" "http://127.0.0.1:3001$CSS"   # 404 就是挂错目录
sudo docker exec knav sh -c 'ls .next-build/static/css .next/static/css 2>&1'  # 看文件到底落在哪
```

改 `distDir` 时两处要一起改：`ENV NEXT_DIST_DIR` 和 `COPY --from=build /app/<distDir>/static ./<distDir>/static`。

**`/api/health` 返回 `{"ok":false}` 或一直是 unhealthy**
连不上数据库。`docker compose logs knav` 里分辨：
`ECONNREFUSED` 是 host/port 不对或 db 未就绪；`Access denied` 是账号密码或授权主机不对；
`Unknown database` 是库名不对。自建 MySQL 8 默认的 `caching_sha2_password` 不需要额外参数——
mysql2 会自己向服务端请求 RSA 公钥，明文连接也能完成首次认证。

**`/app/public/uploads 不可写` 警告**
见第 5 节，bind mount 的宿主机目录要 `chown -R 1000:1000`。

**改 `.env` 后没生效**
compose 只在 `up -d` 时重算环境变量，改完执行 `docker compose up -d`（会重建容器）；
`docker compose restart` 不会重新注入。

**首启慢 / 国内机器构建慢**
`npm ci` 视网络而定，`next build` 约 1~2 分钟。可以在 `Dockerfile` 的 `RUN npm ci` 之前加一行
`RUN npm config set registry https://registry.npmmirror.com`。

**想同时出 amd64 和 arm64 镜像**
单独构建即可（依赖里没有原生模块）。跨架构推仓库用
`docker buildx build --platform linux/arm64,linux/amd64 -t <registry>/knav:<tag> --push .`。

**推这几个文件会不会触发线上部署？**
`deploy.yml` 的 `paths-ignore` 没有覆盖 `Dockerfile` / `compose*.yaml` / `docker/**`，
推送会触发一次部署 run。它构建的是默认产物（未设 `NEXT_OUTPUT`），线上跑的还是
`.next` + `next start`，行为不变；只是会多等一次约 1 分钟的构建。

---

## 10. 本次打包的验证状态

在开发机（无 Docker）上按镜像布局逐项验证过：

- `NEXT_OUTPUT=standalone NEXT_DIST_DIR=.next-build npm run build` 产出 `.next-build/standalone`，
  `server.js` 存在；不设该变量的生产构建**不产出** standalone，现网部署路径不变
- 按 Dockerfile 的 COPY 顺序组装出与容器内一致的目录（standalone + `<distDir>/static` + `public` +
  `db/schema.sql` + `scripts/migrate.cjs`），放到仓库外独立目录跑 `node server.js`：
  `/api/health` `{"ok":true}`、首页 200、`/sites/{id}.html` 200、`/login` 200、
  `/uploads/...` 200 且带 `max-age=31536000, immutable`
- 静态资源单独量过：`/_next/static/css/*.css` 200（51 KB）、`/_next/static/chunks/*.js` 200。
  首版镜像把 static 拷成了 `./.next/static`，页面 200 但样式全无，真机上才发现——只看
  `/api/health` 和首页状态码是查不出这个的，必须取首页里引用的 CSS 路径再请求一次
- 深色模式联动仍在：带 `knav-theme=dark` cookie 时详情页输出 `code-theme-one-dark`
- `migrate.cjs` 在无 `node_modules` 的独立目录里跑通（依赖已自包含）
- `entrypoint.sh` 四条分支：默认迁移后启动、`KNAV_MIGRATE=0` 跳过、迁移失败退出码 1 且不启动服务、
  uploads 不可写只告警不阻塞启动
- 四个 compose 文件（`compose.yaml` + mysql / mariadb / host 覆盖）YAML 解析通过，服务与卷的键位正确

**真机验证**（2026-11-07，Debian + 宿主机 MariaDB，`docker build` 出的 `knav:local`）：

- 迁移在容器内跑通，建出 19 张 `knav_*` 表，随后 `node server.js` 启动，日志 `▲ Next.js 15.5.28` / `✓ Ready in 211ms`
- 首次失败依次暴露了三类问题，都已写进上面第 9 节：容器内 `127.0.0.1` 连不到宿主库 → 账号密码被
  `CREATE USER IF NOT EXISTS` 跳过 → `.env` 里 `DB_PASS` 还是占位符；
  服务起来后还发现「页面全 200 但没有样式」，是 static 拷错了目标目录（第 9 节最后一条）
- 上传目录用命名卷 `-v knav-uploads:/app/public/uploads` 挂载，无「不可写」告警
- 最终形态 `--network host` + `DB_HOST=127.0.0.1` + `-e PORT=3001`：宿主 `0.0.0.0:3001` 监听，
  回环与局域网 IP 的 `/api/health` 都是 200（`ufw` 放行 `192.168.100.0/24` 之后才通，见第 9 节）

**CI 发镜像**（2026-11-07，Run 42283113774，手动触发 `Publish container image`）：

- 构建成功，Docker Hub `kuwinet/knav` 出 `latest` 与 `main`，manifest index 里是 `linux/amd64` + `linux/arm64`
- 两个仓库都匿名可拉：Hub `is_private=false`，GHCR 用匿名 token 取 `latest` manifest 返回 200
- 从 registry 读回的 amd64 镜像配置与 Dockerfile 一致：Entrypoint `/usr/local/bin/knav-entrypoint.sh`、
  Cmd `node server.js`、WorkingDir `/app`、User `node`、EXPOSE 3000、`TZ=Asia/Shanghai`、`HOSTNAME=0.0.0.0`

**打 tag 发镜像**（2026-11-07，推 `v0.1.4`，Run 42329967413）：

- 版本号标签要这一次才出现：Hub `kuwinet/knav` 实际有 `0.1.4`、`0.1`、`v0.1.4`、`latest`、`main`，
  GHCR 同样五个标签，匿名 token 取 manifest 全部 200
- 上一次手动触发只出 `latest` + `main` 不是 bug：`type=semver` 只解析 `refs/tags/v*`，而
  `workflow_dispatch` 的 `github.ref_type` 恒为 `branch`（就算把 ref 选成某个 tag 也一样），
  所以**版本号镜像标签只能靠推 `v*` tag 的那次 run 拿到**；手动触发用来补 `latest`

**Docker Hub 概述**（2026-11-07，Run 42335969311，手动触发 `only_description=true`）：

- 前两次分别败在鉴权和限长：拿 `auth.docker.io` 的 JWT 去 PATCH 网站 API 回 401（那串只有 registry
  作用域，推镜像够用）；换 `POST /v2/users/login/` 的账号 JWT 后接口通了，又被 `description`
  129 字节 > 上限 100 拒成 400
- 现在匿名 `GET /v2/repositories/kuwinet/knav/` 能读到 92 字节的 `description` 和 4886 字节的
  `full_description`（正文来自 `docker/hub-overview.md`）；浏览器里「No overview available」消失，
  3 张截图直接从 `raw.githubusercontent.com` 取到，`naturalWidth` 都是 1440
- `only_description=true` 时 `build` job 被 `if:` 整个跳过（run 里显示 0s），改文案不用陪跑多架构构建

**国内源（Gitee 下载 + ACR/DaoCloud 镜像）**（2026-11-07 改动，开发机无 Docker，用桩程序跑矩阵验证）：

- 连通性实测：`gitee.com/kuwinet/knav` 是自动同步的公开镜像，`raw/main/compose.yaml`、
  `raw/main/compose.mysql.yaml`、`raw/main/docker/install.sh` 都是 200（0.4 秒级），内容与 GitHub 逐字节一致
  （`compose.mysql.yaml` sha256 前缀 `c12257452424` 两边相同），`v0.1.0…v0.1.4` 五个 tag 都在；
  同一时刻 `raw.githubusercontent.com` 从本机打 25 秒超时 000，正好是现场卡住的那个失败
- DaoCloud 加速实测：`docker.m.daocloud.io/v2/library/mysql/manifests/8.4` 与 `mariadb:11` 匿名 200，
  但 `kuwinet/knav` 403（只加速官方镜像），所以应用镜像仍要走 ACR
- install.sh 桩矩阵 16 个场景全过：`auto` 探到 Hub 不通→ACR+DaoCloud 两个地址都落到 `.env`，且 compose
  文件改为先试 Gitee；`auto` 探到通→`kuwinet/knav:latest` + `mysql:8.4`，先试 GitHub；`KNAV_CN=1/0` 无视探测；
  GitHub raw 挂→自动改用 Gitee 且仍成功；两个源都挂→报出试过的两个地址并退出 1；`KNAV_REF=v0.1.4`→镜像标签跟着变 `0.1.4`；
  mariadb 分支→`mariadb:11` 前缀正确；`KNAV_RAW_BASE` 指定单一地址→不试另一个；显式 `KNAV_IMAGE`→不加兜底组
- 兜底补试那三种失败形态单独验过：ACR 还没有这个 tag（`PULL_ACR=fail`）→自动换成 `kuwinet/knav:latest` +
  `mysql:8.4` 拉成功，并把新地址写回 `.env`（`docker pull` 恰好两次）；DaoCloud 挂（`PULL_CN=fail`）同理；
  两组都失败（`PULLFAIL=1`）→退出 1 并打印两组组合。钉版本时兜底保持版本：`KNAV_REF=v0.1.4` 失败后补试的是
  `kuwinet/knav:0.1.4`，不会借机升到 `latest`；已有 `.env` 钉在 `0.1.3` 的站即使判定国内也只 pull 一次、
  原值不动；老 `.env` 里根本没有这两行时，兜底成功后追加进去而不是改错别处
- 优先级三条也单独验过：已有 `.env`（`kuwinet/knav:0.1.3` + `mysql:8.4`）时即使 `auto` 判定国内也不换仓库；
  老 `.env` 没有 `KNAV_DB_IMAGE` 行时读回空、退回本次默认；命令行 `KNAV_IMAGE=...` 压过 `.env` 与探测
- **待真机确认**：ACR 命名空间还没建，匿名 `GET registry.cn-hangzhou.aliyuncs.com/v2/kuwinet/knav/manifests/latest`
  拿到的是 401 + `dockerauth.cn-hangzhou.aliyuncs.com` 的鉴权跳转（仓库不存在/未公开就是这个表现），
  所以现在国内机器的首次安装靠的是上面那步「补试官方名」。配好凭据推一次镜像后再验 `KNAV_CN=1` 走 ACR 的路

**一键安装脚本**（开发机无 Docker，用桩程序 `docker`/`curl`/`ip`/`ss`/`openssl` 跑完整流程验证）：

- `mysql` 与 `mariadb` 两条分支各自只下载/引用对应的覆盖文件，卷名 `knav_mysqldata` / `knav_mariadbdata` 正确
- 首次安装生成 `.env`（三个口令各自独立、`ADMIN_EMAIL` 留空）；站点地址按「公网 > 内网 > 127.0.0.1」写入
- 地址探测五种情形都跑过：内网+公网（两行都显示，站点地址取公网）、探测值其实等于内网（被私网段过滤掉，只显示内网一行）、
  `ip` 无输出、完全没有 `ip` 命令、已有 `.env`（`.env` 里的旧站点地址不被探测结果覆盖）
- 已有 `.env` 时沿用并明确说「本次没有重置」；`KNAV_FORCE=1` 且数据卷存在时先警告再重新生成
- 同名容器、端口被占用两种前置冲突都提前退出，不会走到 `up -d`
- 收尾会回取首页引用的 CSS 再请求一次，非 200 直接失败退出（就是镜像里那个 static 目录坑）
- 加探测时顺带修掉一个会致命的写法：`set -o pipefail` 下 `LAN_IP="$(ip ... | sed ... | head -1)"` 在 `ip` 缺失时
  赋值本身就失败，脚本会在「服务已起、健康检查已过」的位置直接退出——现在三处探测一律 `\|\| true`，
  CSS 状态码取值同样补了 `\|\| true`

**仍未在真机验证**：`install.sh` 对真实 Docker 的执行（含从 Hub 拉 `kuwinet/knav:latest` 后首启建库）、
`compose.mariadb.yaml` 起 MariaDB 11 跑迁移。第 2.1 节列的默认值（命名空间 `kuwinet/knav`）已与实际推上去的仓库核对一致。
