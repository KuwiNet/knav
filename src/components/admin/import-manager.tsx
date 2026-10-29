"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  scanImportAction,
  runImportAction,
} from "@/lib/actions/import-actions";
import type { ImportScanResult } from "@/lib/importer/types";

/**
 * 后台「数据迁移」。
 *
 * 扫描来源 → 勾选要导入的分类/内容 → 执行导入。
 * 完整快照留在服务端，这里只拿可选清单，避免一次几千条数据来回传。
 */

const TYPE_LABEL: Record<string, string> = {
  site: "网址",
  article: "文章",
  app: "软件",
};

/** 导入记录里的来源标记 */
const SOURCE_LABEL: Record<string, string> = {
  mysql: "MySQL",
  sql: "备份文件",
  wxr: "WXR",
};

function ScanButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "扫描中…" : "扫描来源"}
    </button>
  );
}

export default function ImportManager({
  history,
}: {
  history: {
    id: number;
    sourceType: string;
    sourceLabel: string;
    status: string;
    message: string;
    createdAt: string;
  }[];
}) {
  const [sourceType, setSourceType] = useState<"mysql" | "wxr" | "sql">("mysql");
  const [scan, setScan] = useState<ImportScanResult | null>(null);
  const [scanErr, setScanErr] = useState("");
  const [scanning, setScanning] = useState(false);

  const [pickedCats, setPickedCats] = useState<Set<number>>(new Set());
  const [pickedContents, setPickedContents] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState("");
  const [keyword, setKeyword] = useState("");

  const [runMsg, setRunMsg] = useState("");
  const [runErr, setRunErr] = useState("");
  const [running, setRunning] = useState(false);

  const catById = useMemo(() => {
    const m = new Map<number, ImportScanResult["categories"][number]>();
    for (const c of scan?.categories ?? []) m.set(c.sourceId, c);
    return m;
  }, [scan]);

  const topCats = useMemo(
    () =>
      (scan?.categories ?? [])
        .filter((c) => c.parentSourceId === 0 || !catById.has(c.parentSourceId))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.sourceId - b.sourceId),
    [scan, catById]
  );

  const childrenOf = (id: number) =>
    (scan?.categories ?? [])
      .filter((c) => c.parentSourceId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.sourceId - b.sourceId);

  const filteredContents = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return (scan?.contents ?? []).filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (kw && !c.title.toLowerCase().includes(kw) && !c.url.toLowerCase().includes(kw))
        return false;
      return true;
    });
  }, [scan, typeFilter, keyword]);

  const onScan = async (fd: FormData) => {
    setScanning(true);
    setScanErr("");
    setRunMsg("");
    setRunErr("");
    setScan(null);
    setPickedCats(new Set());
    setPickedContents(new Set());
    try {
      const r = await scanImportAction(fd);
      if (!r.ok || !r.result) {
        setScanErr(r.error ?? "扫描失败");
        return;
      }
      setScan(r.result);
      // 默认全选：用户再取消不要的
      setPickedCats(new Set(r.result.categories.map((c) => c.sourceId)));
      setPickedContents(new Set(r.result.contents.map((c) => c.sourceId)));
    } catch (e) {
      setScanErr((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const onRun = async (fd: FormData) => {
    setRunning(true);
    setRunMsg("");
    setRunErr("");
    try {
      const r = await runImportAction(fd);
      if (!r.ok) {
        setRunErr(r.error ?? "导入失败");
        return;
      }
      setRunMsg(r.message ?? "导入完成");
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setRunErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const toggleIn = (
    set: Set<number>,
    id: number,
    apply: (s: Set<number>) => void
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const catCheckbox = (id: number, label: string, count: number, depth: number) => (
    <label
      key={id}
      className="switch-row"
      style={{ paddingLeft: depth * 16, alignItems: "center" }}
    >
      <input
        type="checkbox"
        checked={pickedCats.has(id)}
        onChange={() => toggleIn(pickedCats, id, setPickedCats)}
      />
      <span className="switch-text">
        <span className="switch-label">
          {label}
          {count ? <span className="text-sm text-muted">（{count}）</span> : null}
        </span>
      </span>
    </label>
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* ------------------------------------------------ 来源 */}
      <section className="card card-pad">
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          第一步：选择来源
        </h2>

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          {(
            [
              ["mysql", "MySQL 源库"],
              ["sql", "MySQL 备份文件"],
              ["wxr", "WordPress 导出文件（WXR）"],
            ] as [typeof sourceType, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm ${sourceType === value ? "" : "btn-outline"}`}
              onClick={() => setSourceType(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {sourceType === "mysql" ? (
          <form action={onScan} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="sourceType" value="mysql" />
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <label className="label">数据库地址</label>
                <input className="input" name="host" placeholder="127.0.0.1" defaultValue="127.0.0.1" />
              </div>
              <div style={{ flex: 0, minWidth: 100 }}>
                <label className="label">端口</label>
                <input className="input" name="port" type="number" defaultValue="3306" />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">数据库名</label>
                <input className="input" name="dbName" placeholder="wordpress" />
              </div>
            </div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">账号</label>
                <input className="input" name="dbUser" placeholder="root" />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="label">密码</label>
                <input className="input" name="dbPass" type="password" autoComplete="off" />
              </div>
              <div style={{ flex: 0, minWidth: 120 }}>
                <label className="label">表前缀（可空）</label>
                <input className="input" name="tablePrefix" placeholder="wp_" />
              </div>
              <label className="switch-row" style={{ alignItems: "center", paddingTop: 18 }}>
                <input type="checkbox" name="ssl" value="1" />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">SSL</span>
                </span>
              </label>
            </div>
            <div className="hint">
              连接信息只在本次扫描时使用，不会存进本站数据库。会自动识别 knav、WordPress /
              OneNav、Typecho、Z-BlogPHP、Emlog、Halo 1.x 和通用 links 导航库；表前缀留空自动探测。
            </div>
            <div>
              <ScanButton />
            </div>
          </form>
        ) : sourceType === "sql" ? (
          <form action={onScan} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="sourceType" value="sql" />
            <div style={{ maxWidth: 420 }}>
              <label className="label">MySQL 备份文件</label>
              <input
                className="input"
                type="file"
                name="sqlFile"
                accept=".sql,.gz,.zip,.tar,.tgz,.txt"
              />
            </div>
            <div className="hint">
              支持 mysqldump / phpMyAdmin / Navicat 导出的 .sql，以及 .sql.gz、.zip、.tar.gz
              压缩包（单个文件不超过 64MB）。只读取文件里的建表与插入语句，不会执行备份里的任何
              SQL。自动识别 knav、WordPress / OneNav、Typecho、Z-BlogPHP、Emlog、Halo 1.x
              和通用 links 导航库。
            </div>
            <div>
              <ScanButton />
            </div>
          </form>
        ) : (
          <form action={onScan} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="sourceType" value="wxr" />
            <div style={{ maxWidth: 420 }}>
              <label className="label">WXR 文件</label>
              <input className="input" type="file" name="wxrFile" accept=".xml,.wxr" />
            </div>
            <div className="hint">
              在 WordPress 后台「工具 → 导出 → 内容」选择全部内容，导出后上传这个 XML。
              导出文件里没有分类的父子关系，导入后这些分类都是顶级分类。
            </div>
            <div>
              <ScanButton />
            </div>
          </form>
        )}

        {scanning ? <div className="hint">正在读取来源库…</div> : null}
        {scanErr ? (
          <div className="alert alert-error" style={{ marginTop: 10 }}>
            {scanErr}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ 选择 */}
      {scan ? (
        <>
          <section className="card card-pad">
            <h2 className="aside-title" style={{ marginTop: 0 }}>
              第二步：勾选要导入的内容
            </h2>

            <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span className="badge badge-accent">
                识别为 {scan.sourceSystemLabel}
              </span>
              <span className="text-sm text-muted">{scan.sourceLabel}</span>
            </div>

            <div className="stat-grid" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="stat-label">分类</div>
                <div className="stat-value">{scan.stats.categories}</div>
              </div>
              <div className="stat">
                <div className="stat-label">网址</div>
                <div className="stat-value">{scan.stats.sites}</div>
              </div>
              <div className="stat">
                <div className="stat-label">文章</div>
                <div className="stat-value">{scan.stats.articles}</div>
              </div>
              <div className="stat">
                <div className="stat-label">软件</div>
                <div className="stat-value">{scan.stats.apps}</div>
              </div>
            </div>

            {scan.sourceSiteUrl ? (
              <div className="hint" style={{ marginBottom: 12 }}>
                {scan.sourceSystem === "knav"
                  ? `来源站地址：${scan.sourceSiteUrl}。图标与正文里的 /uploads 相对路径保持原样，记得把来源站的 uploads 素材一起复制到本站。`
                  : `来源站地址：${scan.sourceSiteUrl}，图标与正文里的相对路径已按它补成绝对地址。`}
              </div>
            ) : null}

            <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() =>
                  setPickedContents(new Set(scan.contents.map((c) => c.sourceId)))
                }
              >
                全选内容
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setPickedContents(new Set())}
              >
                全不选内容
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() =>
                  setPickedCats(new Set(scan.categories.map((c) => c.sourceId)))
                }
              >
                全选分类
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setPickedCats(new Set())}
              >
                全不选分类
              </button>
            </div>

            <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <select
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ width: "auto", minWidth: 120 }}
              >
                <option value="">全部类型</option>
                <option value="site">网址</option>
                <option value="article">文章</option>
                <option value="app">软件</option>
              </select>
              <input
                className="input"
                placeholder="按标题或网址搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ maxWidth: 260 }}
              />
              <span className="text-sm text-muted">
                已选 {pickedContents.size} / {scan.contents.length} 条
              </span>
            </div>

            {/* 内容清单 */}
            <div
              style={{
                maxHeight: 360,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 8,
              }}
            >
              {filteredContents.length === 0 ? (
                <div className="hint">没有符合条件的内容</div>
              ) : (
                filteredContents.map((c) => (
                  <label
                    key={c.sourceId}
                    className="switch-row"
                    style={{ alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={pickedContents.has(c.sourceId)}
                      onChange={() =>
                        toggleIn(pickedContents, c.sourceId, setPickedContents)
                      }
                    />
                    <span className="switch-text">
                      <span className="switch-label">
                        <span className="badge badge-accent">{TYPE_LABEL[c.type]}</span>{" "}
                        {c.title || "（无标题）"}
                      </span>
                    </span>
                    {c.downloadCount > 0 ? (
                      <span className="text-sm text-muted nowrap">
                        {c.downloadCount} 个平台
                      </span>
                    ) : null}
                  </label>
                ))
              )}
            </div>

            {/* 分类清单 */}
            <h3 className="aside-title" style={{ marginTop: 16 }}>
              分类
            </h3>
            <div
              style={{
                maxHeight: 280,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 8,
              }}
            >
              {topCats.length === 0 ? <div className="hint">没有分类</div> : null}
              {topCats.map((c) => (
                <div key={c.sourceId}>
                  {catCheckbox(c.sourceId, c.name, c.count, 0)}
                  {childrenOf(c.sourceId).map((sub) =>
                    catCheckbox(sub.sourceId, sub.name, sub.count, 1)
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------ 执行 */}
          <section className="card card-pad">
            <h2 className="aside-title" style={{ marginTop: 0 }}>
              第三步：导入选项
            </h2>

            <form action={onRun} className="stack" style={{ gap: 10 }}>
              <input type="hidden" name="jobId" value={scan.jobId} />
              <input type="hidden" name="sourceType" value={scan.sourceType} />
              <input type="hidden" name="sourceRef" value={scan.sourceLabel} />
              <input
                type="hidden"
                name="categoryIds"
                value={[...pickedCats].join(",")}
              />
              <input
                type="hidden"
                name="contentIds"
                value={[...pickedContents].join(",")}
              />

              <label className="switch-row" style={{ alignItems: "center" }}>
                <input type="checkbox" name="optDownloads" value="1" defaultChecked />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">导入软件的平台版本与镜像链接</span>
                </span>
              </label>
              <label className="switch-row" style={{ alignItems: "center" }}>
                <input type="checkbox" name="optTags" value="1" defaultChecked />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">导入标签</span>
                </span>
              </label>
              <label className="switch-row" style={{ alignItems: "center" }}>
                <input type="checkbox" name="optCategoryIcons" value="1" defaultChecked />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">导入分类图标</span>
                </span>
              </label>
              <label className="switch-row" style={{ alignItems: "center" }}>
                <input type="checkbox" name="optCounters" value="1" defaultChecked />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">导入浏览量与点赞数</span>
                </span>
              </label>
              <label className="switch-row" style={{ alignItems: "center" }}>
                <input type="checkbox" name="optPublishAll" value="1" />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">
                    草稿也按「已发布」导入（默认草稿按草稿导入）
                  </span>
                </span>
              </label>
              <label className="switch-row" style={{ alignItems: "center" }}>
                <input
                  type="checkbox"
                  name="optUpdateExisting"
                  value="1"
                  defaultChecked={scan.sourceSystem === "knav"}
                />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">
                  <span className="switch-label">
                    更新已存在的内容（同步置顶、排序与分类排序）
                  </span>
                </span>
              </label>

              {scan.settings.iconfont ? (
                <label className="switch-row" style={{ alignItems: "center" }}>
                  <input
                    type="checkbox"
                    name="optSettingIconfont"
                    value="1"
                    defaultChecked
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-text">
                    <span className="switch-label">
                      导入图标字体 CSS（来源分类图标依赖它显示）
                    </span>
                  </span>
                </label>
              ) : null}

              {scan.settings.appearance > 0 ? (
                <label className="switch-row" style={{ alignItems: "center" }}>
                  <input
                    type="checkbox"
                    name="optSettingAppearance"
                    value="1"
                    defaultChecked
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-text">
                    <span className="switch-label">
                      {`导入站点外观（LOGO、主题、卡片、壁纸，${scan.settings.appearance} 项）`}
                    </span>
                  </span>
                </label>
              ) : null}

              {scan.settings.profile > 0 ? (
                <label className="switch-row" style={{ alignItems: "center" }}>
                  <input
                    type="checkbox"
                    name="optSettingProfile"
                    value="1"
                    defaultChecked
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-text">
                    <span className="switch-label">
                      {`导入站点信息与页面（名称、SEO、页脚、关于/投稿说明，${scan.settings.profile} 项）`}
                    </span>
                  </span>
                </label>
              ) : null}

              <div className="hint">
                同一来源重复导入不会产生重复内容；勾选更新会覆盖来源条目的置顶与排序。
                站点设置只导入白名单项，站点地址与 SMTP、OAuth、YOURLS、Telegram
                等密钥始终不导入。
              </div>

              <div>
                <button type="submit" className="btn" disabled={running}>
                  {running
                    ? "导入中…"
                    : `开始导入（${pickedContents.size} 条内容 / ${pickedCats.size} 个分类）`}
                </button>
              </div>
            </form>

            {runMsg ? (
              <div className="alert alert-success" style={{ marginTop: 10 }}>
                {runMsg}
              </div>
            ) : null}
            {runErr ? (
              <div className="alert alert-error" style={{ marginTop: 10 }}>
                {runErr}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {/* ------------------------------------------------ 历史 */}
      <section className="card card-pad">
        <h2 className="aside-title" style={{ marginTop: 0 }}>
          导入记录
        </h2>
        {history.length === 0 ? (
          <div className="hint">还没有导入记录</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {history.map((h) => (
              <div key={h.id} className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="badge badge-accent">
                  {SOURCE_LABEL[h.sourceType] ?? h.sourceType}
                </span>
                <span>{h.sourceLabel}</span>
                <span
                  className={
                    h.status === "success"
                      ? "text-sm"
                      : "text-sm text-muted"
                  }
                  style={h.status === "success" ? { color: "var(--green)" } : undefined}
                >
                  {h.status === "success" ? "成功" : h.status === "failed" ? "失败" : "进行中"}
                </span>
                <span className="text-sm text-muted">{h.message}</span>
                <span className="spacer" />
                <span className="text-sm text-muted">{h.createdAt}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
