-- ===========================================================================
-- knav 数据库结构
--
-- knav 有自己的表结构，不再依赖 WordPress 的 wp_* 表。
-- 老站（WordPress + OneNav / WebStack 等导航站）的数据通过
-- 后台「数据迁移」页导入：先扫描源库，再勾选要导入的内容，最后写入下面这些表。
--
-- 命名约定：
--   knav_ 前缀 = knav 自有表
--   站点配置   = knav_settings（name/value）
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------- 用户
CREATE TABLE IF NOT EXISTS `knav_users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(60)  NOT NULL                COMMENT '登录名',
  `email`         VARCHAR(190) NOT NULL                COMMENT '邮箱',
  `password_hash` VARCHAR(255) NOT NULL DEFAULT ''     COMMENT 'bcrypt 密码散列',
  `nickname`      VARCHAR(60)  NOT NULL DEFAULT ''     COMMENT '昵称',
  `avatar`        VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '头像地址',
  `bio`           VARCHAR(500) NOT NULL DEFAULT ''     COMMENT '个人简介',
  `role`          ENUM('user','editor','admin','owner') NOT NULL DEFAULT 'user'
                                                          COMMENT 'owner=站长（唯一，可转移）',
  `status`        ENUM('pending','active','banned') NOT NULL DEFAULT 'pending'
                                                          COMMENT 'pending=待验证邮箱',
  `email_verified_at` DATETIME     NULL                COMMENT '邮箱验证通过时间',
  `provider`      VARCHAR(20)  NULL DEFAULT NULL COMMENT '登录方式：password/telegram/github/gitee/google',
  `provider_id`   VARCHAR(190) NULL DEFAULT NULL COMMENT '第三方用户标识',
  `provider_email` VARCHAR(190) NOT NULL DEFAULT ''   COMMENT '第三方返回的邮箱',
  `last_login_at` DATETIME     NULL,
  `login_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  UNIQUE KEY `uk_provider` (`provider`, `provider_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站点用户';

-- ---------------------------------------------------------------- 会话
CREATE TABLE IF NOT EXISTS `knav_sessions` (
  `id`         CHAR(64)     NOT NULL                    COMMENT '会话 token 的 sha256',
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `expires_at` DATETIME     NOT NULL,
  `ip`         VARCHAR(45)  NOT NULL DEFAULT '',
  `user_agent` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录会话';

-- ---------------------------------------------------------------- 邮件令牌
CREATE TABLE IF NOT EXISTS `knav_email_tokens` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `email`      VARCHAR(190) NOT NULL,
  `purpose`    ENUM('verify','reset_password','change_email','site_reset') NOT NULL,
  `token_hash` CHAR(64)     NOT NULL                    COMMENT '令牌 sha256，不存明文',
  `expires_at` DATETIME     NOT NULL,
  `used_at`    DATETIME     NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token_hash`),
  KEY `idx_user_purpose` (`user_id`,`purpose`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮件验证/重置令牌';

-- ---------------------------------------------------------------- 站内通知
CREATE TABLE IF NOT EXISTS `knav_notifications` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `type`       VARCHAR(40)  NOT NULL DEFAULT ''          COMMENT 'verify/review/system',
  `title`      VARCHAR(200) NOT NULL,
  `body`       TEXT         NULL,
  `link`       VARCHAR(500) NOT NULL DEFAULT '',
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read` (`user_id`,`is_read`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内通知';

-- ---------------------------------------------------------------- 邮件日志
CREATE TABLE IF NOT EXISTS `knav_mail_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `to_email`   VARCHAR(190) NOT NULL,
  `subject`    VARCHAR(200) NOT NULL,
  `body`       MEDIUMTEXT   NULL,
  `status`     ENUM('sent','failed') NOT NULL DEFAULT 'sent',
  `error`      VARCHAR(1000) NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_to` (`to_email`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮件发送日志';

-- ---------------------------------------------------------------- 分类
-- knav 自己的分类树：parent_id 指向顶级分类，顶级分类 parent_id = 0。
-- 分类图标 / 封面 / 主题色 / 排序都是原生字段，不再借用 WordPress 的 termmeta。
CREATE TABLE IF NOT EXISTS `knav_categories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`   INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '父分类，0 = 顶级分类',
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `icon`        VARCHAR(1024) NOT NULL DEFAULT ''      COMMENT '内置图标名 / iconfont 类名 / 图片地址（源站常用 data:URI）',
  `cover`       VARCHAR(500) NOT NULL DEFAULT '',
  `color`       VARCHAR(32)  NOT NULL DEFAULT '',
  `sort_order`  INT NOT NULL DEFAULT 0                 COMMENT '排序权重，越小越靠前',
  `content_count` INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '内容数（冗余，导入/改动时刷新）',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分类';

-- ---------------------------------------------------------------- 内容
-- 网址收藏 / 文章 / 软件统一存一张表，用 type 区分。
-- url 对应网址收藏的跳转地址；content_md 是文章正文；软件详情走 knav_downloads。
CREATE TABLE IF NOT EXISTS `knav_contents` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`        ENUM('site','article','app') NOT NULL,
  `title`       VARCHAR(200) NOT NULL,
  `slug`        VARCHAR(200) NOT NULL DEFAULT '',
  `url`         VARCHAR(500) NOT NULL DEFAULT '',
  `description` VARCHAR(1000) NOT NULL DEFAULT '',
  `content_md`  MEDIUMTEXT    NULL,
  `icon`        VARCHAR(1024) NOT NULL DEFAULT ''      COMMENT '自定义图标（导入时可能是 data:URI）',
  `cover`       VARCHAR(500) NOT NULL DEFAULT ''       COMMENT '封面图',
  `category_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `views`       INT UNSIGNED NOT NULL DEFAULT 0,
  `likes`       INT UNSIGNED NOT NULL DEFAULT 0,
  `sticky`      TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `status`      ENUM('publish','draft','trash','pending') NOT NULL DEFAULT 'publish',
  `source`      VARCHAR(60)  NOT NULL DEFAULT ''       COMMENT '导入来源标记',
  `source_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '来源库里的原始 ID，便于溯源/去重',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type_status` (`type`,`status`),
  KEY `idx_category` (`category_id`),
  KEY `idx_sticky_order` (`sticky`,`sort_order`),
  KEY `idx_created` (`created_at`),
  KEY `idx_source` (`source`,`source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容（网址/文章/软件）';

-- ---------------------------------------------------------------- 标签
CREATE TABLE IF NOT EXISTS `knav_tags` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `slug`       VARCHAR(120) NOT NULL,
  `count`      INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  KEY `idx_count` (`count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签';

CREATE TABLE IF NOT EXISTS `knav_content_tags` (
  `content_id` BIGINT UNSIGNED NOT NULL,
  `tag_id`     INT UNSIGNED NOT NULL,
  PRIMARY KEY (`content_id`,`tag_id`),
  KEY `idx_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容-标签关联';

-- 内容-分类关联：一条内容可归入多个分类。
-- knav_contents.category_id 仍保留为主分类（列表、排序、面包屑用）。
CREATE TABLE IF NOT EXISTS `knav_content_categories` (
  `content_id`  BIGINT UNSIGNED NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`content_id`,`category_id`),
  KEY `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容-分类关联';

-- ---------------------------------------------------------------- 备用链接
-- 网址收藏的「备用地址」（OneNav 的 _spare_sites_link）。
CREATE TABLE IF NOT EXISTS `knav_content_links` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content_id` BIGINT UNSIGNED NOT NULL,
  `name`       VARCHAR(100) NOT NULL DEFAULT '',
  `url`        VARCHAR(500) NOT NULL,
  `note`       VARCHAR(200) NOT NULL DEFAULT '',
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_content` (`content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容备用链接';

-- ---------------------------------------------------------------- 软件下载
-- 三层结构：软件（knav_contents，type=app）
--            └ 平台版本（knav_downloads，一个软件可挂 Windows/macOS/Android/OpenWrt… 多条，
--                        每条再带一个 arch 架构：x64/ARM64/universal…，同平台可分架构各挂一条）
--                └ 镜像链接（knav_download_mirrors，每个平台可挂 官方下载/百度网盘/123网盘/App Store/Play… 多条）
CREATE TABLE IF NOT EXISTS `knav_downloads` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content_id`    BIGINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '所属软件 knav_contents.ID',
  `submission_id` BIGINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '关联 knav_submissions.ID',
  `resource_title` VARCHAR(200) NOT NULL DEFAULT ''     COMMENT '软件名称（留空则用内容标题）',
  `platform`      VARCHAR(60)  NOT NULL DEFAULT ''      COMMENT '平台：Windows/macOS/Linux/Android/iOS/OpenWrt/Web/HarmonyOS',
  `arch`          VARCHAR(40)  NOT NULL DEFAULT ''      COMMENT '架构：x64/x86/ARM64/ARM32/universal/Apple Silicon/Intel，留空表示不限',
  `version`       VARCHAR(60)  NOT NULL DEFAULT '',
  `file_size`     VARCHAR(40)  NOT NULL DEFAULT '',
  `sha256`        VARCHAR(128) NOT NULL DEFAULT '',
  `preview`       VARCHAR(500) NOT NULL DEFAULT '',
  `note`          VARCHAR(500) NOT NULL DEFAULT '',
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1        COMMENT '开关：0=前台不显示该平台',
  `count`         INT UNSIGNED NOT NULL DEFAULT 0       COMMENT '该平台累计下载次数',
  `sort_order`    INT NOT NULL DEFAULT 0,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_content` (`content_id`),
  KEY `idx_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='软件平台版本';

-- 平台版本下的镜像下载链接。同一个平台可以同时给官方直链、网盘、应用商店等多个入口。
CREATE TABLE IF NOT EXISTS `knav_download_mirrors` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `download_id` BIGINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '关联 knav_downloads.id',
  `name`        VARCHAR(100) NOT NULL                   COMMENT '镜像名称：官方下载/百度网盘/123网盘/App Store/Play/App Gallery',
  `url`         VARCHAR(500) NOT NULL                   COMMENT '下载地址',
  `file_size`   VARCHAR(40)  NOT NULL DEFAULT ''       COMMENT '该镜像的文件大小，留空则用平台版本的',
  `note`        VARCHAR(200) NOT NULL DEFAULT ''       COMMENT '备注，如网盘提取码',
  `enabled`     TINYINT(1)   NOT NULL DEFAULT 1         COMMENT '开关：0=前台不显示该镜像',
  `count`       INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '下载次数',
  `sort_order`  INT NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_download` (`download_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='下载镜像链接';

-- ---------------------------------------------------------------- 投稿
CREATE TABLE IF NOT EXISTS `knav_submissions` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `type`       ENUM('site','article','app') NOT NULL     COMMENT 'site=网址收藏 article=文章 app=软件',
  `title`      VARCHAR(200) NOT NULL,
  `url`        VARCHAR(500) NOT NULL DEFAULT ''          COMMENT '网址型投稿的目标地址',
  `description` VARCHAR(1000) NOT NULL DEFAULT ''        COMMENT '简介/摘要',
  `content_md` MEDIUMTEXT    NULL                       COMMENT '文章型投稿的 Markdown 正文',
  `cover`      VARCHAR(500) NOT NULL DEFAULT ''          COMMENT '封面图',
  `icon`       VARCHAR(500) NOT NULL DEFAULT '',
  `category_id` INT UNSIGNED NOT NULL DEFAULT 0          COMMENT '目标分类 knav_categories.id',
  `tags`       VARCHAR(500) NOT NULL DEFAULT ''          COMMENT '逗号分隔的标签名',
  `status`     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `review_note` VARCHAR(1000) NOT NULL DEFAULT ''        COMMENT '审核意见（驳回原因）',
  `reviewer_id` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME     NULL,
  `published_id` BIGINT UNSIGNED NULL                   COMMENT '通过后写入的 knav_contents.ID',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户投稿与审核';

-- ---------------------------------------------------------------- 素材库
CREATE TABLE IF NOT EXISTS `knav_media` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename`   VARCHAR(255) NOT NULL                     COMMENT '原始文件名',
  `path`       VARCHAR(500) NOT NULL                     COMMENT '站内相对路径，如 /uploads/2026/10/xx.png',
  `url`        VARCHAR(500) NOT NULL                     COMMENT '完整访问地址',
  `mime`       VARCHAR(100) NOT NULL DEFAULT ''          COMMENT 'MIME 类型',
  `size`       BIGINT UNSIGNED NOT NULL DEFAULT 0        COMMENT '字节数',
  `width`      INT UNSIGNED NOT NULL DEFAULT 0           COMMENT '像素宽（图片）',
  `height`     INT UNSIGNED NOT NULL DEFAULT 0           COMMENT '像素高（图片）',
  `alt`        VARCHAR(255) NOT NULL DEFAULT ''          COMMENT '替代文本',
  `source_url` VARCHAR(500) NOT NULL DEFAULT ''          COMMENT '本地化前的外链地址',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='素材库';

-- ---------------------------------------------------------------- 操作日志
CREATE TABLE IF NOT EXISTS `knav_admin_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `username`   VARCHAR(60)  NOT NULL DEFAULT ''          COMMENT '操作人',
  `action`     VARCHAR(60)  NOT NULL DEFAULT ''          COMMENT '动作，如 content.update',
  `target`     VARCHAR(255) NOT NULL DEFAULT ''          COMMENT '对象描述',
  `detail`     TEXT         NULL,
  `ip`         VARCHAR(45)  NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台操作日志';

-- ---------------------------------------------------------------- 站点设置
CREATE TABLE IF NOT EXISTS `knav_settings` (
  `name`       VARCHAR(60) NOT NULL,
  `value`      TEXT        NULL,
  `updated_at` DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站点配置项';

-- ---------------------------------------------------------------- 用户收藏
CREATE TABLE IF NOT EXISTS `knav_favorites` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `content_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_content` (`user_id`,`content_id`),
  KEY `idx_content` (`content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收藏';

-- ---------------------------------------------------------------- 导入记录
-- 每次「数据迁移」的来源与结果都留档，便于回溯和重复导入时判断。
CREATE TABLE IF NOT EXISTS `knav_import_jobs` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_type`  VARCHAR(30) NOT NULL DEFAULT ''        COMMENT 'mysql=直连源库 sql=备份文件 wxr=WXR 导出',
  `source_label` VARCHAR(255) NOT NULL DEFAULT ''        COMMENT '来源站点名或数据库名',
  `source_ref`   VARCHAR(500) NOT NULL DEFAULT ''        COMMENT '来源描述（地址/文件名）',
  `options`      TEXT NULL                              COMMENT '本次勾选的导入项 JSON',
  `stats`        TEXT NULL                              COMMENT '导入结果统计 JSON',
  `status`       ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  `message`      VARCHAR(1000) NOT NULL DEFAULT '',
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`  DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据导入记录';
