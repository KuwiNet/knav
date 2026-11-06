# Docker 部署

仓库自带 `Dockerfile`、`.dockerignore`、`docker/entrypoint.sh`、`compose.yaml`
与 `compose.mysql.yaml`，一条 `docker compose up -d --build` 就能起站。

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
| 数据库 | 外部 MySQL 8.0+，或用附带的 `compose.mysql.yaml` |

运行层基于 `node:22-alpine`，只含 standalone 产物 + Next/React 运行时；
`mysql2`、`bcryptjs`、`nodemailer` 等已被 webpack 打进服务端 chunk，不再单独占一层。

---

## 2. 用 compose 起站（推荐）

### 2.1 用外部数据库（含现网的云 RDS）

```bash
git clone https://github.com/KuwiNet/knav.git && cd knav
cp .env.example .env      # 至少填 DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME / SITE_URL
docker compose up -d --build
```

compose 读同目录的 `.env` 做变量插值，容器配置全部来自环境变量。
**`.env` 不会进镜像**：`.dockerignore` 排除了 `.env*`（只保留 `.env.example`）。

### 2.2 连数据库一起起

先在 `.env` 里补 `MYSQL_ROOT_PASSWORD` 和 `DB_PASS`（应用账号密码，两者都不能为空），然后：

```bash
docker compose -f compose.yaml -f compose.mysql.yaml up -d --build
```

- `db` 是 `mysql:8.4`，数据在命名卷 `mysqldata`
- `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` 只在**数据卷为空的首次初始化**生效，
  之后改 `.env` 不会同步到已建好的库
- 应用等 `db` 健康检查通过才启动，首启迁移不会撞上「库还没就绪」

### 2.3 验证

```bash
docker compose ps                                 # knav 应为 healthy
curl -s http://127.0.0.1:3000/api/health           # {"ok":true}
docker compose logs knav | head                    # 看到「迁移完成: knav」
```

浏览器打开 `http://服务器IP:3000`，用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录后台，
登录后**先改密码**，再到「站点设置 → 基础信息」确认站点地址（邮件里的验证与找回密码链接以它为准）。

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
- 按 Dockerfile 的 COPY 顺序组装出与容器内一致的目录（standalone + `.next/static` + `public` +
  `db/schema.sql` + `scripts/migrate.cjs`），放到仓库外独立目录跑 `node server.js`：
  `/api/health` `{"ok":true}`、首页 200、`/sites/{id}.html` 200、`/login` 200、
  `/uploads/...` 200 且带 `max-age=31536000, immutable`
- 深色模式联动仍在：带 `knav-theme=dark` cookie 时详情页输出 `code-theme-one-dark`
- `migrate.cjs` 在无 `node_modules` 的独立目录里跑通（依赖已自包含）
- `entrypoint.sh` 四条分支：默认迁移后启动、`KNAV_MIGRATE=0` 跳过、迁移失败退出码 1 且不启动服务、
  uploads 不可写只告警不阻塞启动
- 两个 compose 文件 YAML 解析通过，服务与卷的键位正确

**真机验证**（2026-11-07，Debian + 宿主机 MariaDB，`docker build` 出的 `knav:local`）：

- 迁移在容器内跑通，建出 19 张 `knav_*` 表，随后 `node server.js` 启动，日志 `▲ Next.js 15.5.28` / `✓ Ready in 211ms`
- 首次失败依次暴露了三类问题，都已写进上面第 9 节：容器内 `127.0.0.1` 连不到宿主库 → 账号密码被
  `CREATE USER IF NOT EXISTS` 跳过 → `.env` 里 `DB_PASS` 还是占位符
- 上传目录用命名卷 `-v knav-uploads:/app/public/uploads` 挂载，无「不可写」告警

镜像推仓库需要额外的镜像仓库凭证，本仓库没有为此改 CI。
