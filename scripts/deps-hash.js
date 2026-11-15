#!/usr/bin/env node
// 依赖指纹：只取锁文件里与依赖解析相关的部分，版本号 bump 不改变指纹。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const lockPath = path.resolve(process.argv[2] || 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};
const root = packages[''] || {};

function normMap(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

const payload = {
  lockfileVersion: lock.lockfileVersion,
  dependencies: normMap(root.dependencies),
  devDependencies: normMap(root.devDependencies),
  optionalDependencies: normMap(root.optionalDependencies),
  packages: {},
};

for (const key of Object.keys(packages).sort()) {
  if (key === '') continue;
  const p = packages[key];
  payload.packages[key] = {
    version: p.version,
    resolved: p.resolved,
    integrity: p.integrity,
    link: p.link,
    dev: !!p.dev,
    optional: !!p.optional,
    devOptional: !!p.devOptional,
    peer: !!p.peer,
    hasInstallScript: !!p.hasInstallScript,
    dependencies: normMap(p.dependencies),
    optionalDependencies: normMap(p.optionalDependencies),
    peerDependencies: normMap(p.peerDependencies),
  };
}

process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') + '\n');
