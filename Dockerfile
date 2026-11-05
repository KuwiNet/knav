# syntax=docker/dockerfile:1
#
# knav 镜像：多阶段构建。运行层只有 Next.js standalone 产物——
# mysql2 / bcryptjs / nodemailer 这些运行时依赖已被 webpack 打进服务端 chunk，
# 所以不再额外拷 node_modules。用法与验证记录见 docs/docker.md。
# 构建上下文由 .dockerignore 收窄：.env、public/uploads、数据库导出都不进镜像。

FROM node:22-alpine AS build

# NEXT_OUTPUT=standalone 只在镜像构建里出现；现网的产物部署不设它，构建行为不变
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    NEXT_DIST_DIR=.next-build

WORKDIR /app

# 先只拷锁文件：改代码不会让 npm ci 这一层失效
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# 迁移脚本平时用 tsx 跑，运行层没有 devDependencies，这里用 esbuild（随 tsx 装好）
# 预编译成单文件 cjs。不加 --external：standalone 的 trace 里没有 mysql2 / bcryptjs，
# 留成外部依赖运行时会 Cannot find module，所以整包自包含。
RUN npm run build && \
    ./node_modules/.bin/esbuild scripts/migrate.ts \
      --bundle --platform=node --format=cjs \
      --outfile=.next-build/migrate.cjs

FROM node:22-alpine

# 壁纸「每天一张」按服务器本地日期切换；容器默认 UTC 会让它北京时间 08:00 才换，
# 所以装 tzdata 并默认 Asia/Shanghai（用 TZ 环境变量覆盖即可）
RUN apk add --no-cache tzdata

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

# 一律用 COPY --chown，不用 chown -R：后者会把整层文件再复制一遍，镜像白白变大
COPY --chown=node:node --from=build /app/.next-build/standalone ./
COPY --chown=node:node --from=build /app/.next-build/static ./.next/static
COPY --chown=node:node --from=build /app/.next-build/migrate.cjs ./scripts/migrate.cjs
COPY --chown=node:node --from=build /app/db/schema.sql ./db/schema.sql
COPY --chown=node:node --from=build /app/public ./public

COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/knav-entrypoint.sh
RUN chmod 755 /usr/local/bin/knav-entrypoint.sh && \
    mkdir -p /app/public/uploads && \
    chown node:node /app/public/uploads

USER node
EXPOSE 3000

# 读 /api/health：连不上数据库会返回 503，容器直接标记 unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/knav-entrypoint.sh"]
CMD ["node", "server.js"]
