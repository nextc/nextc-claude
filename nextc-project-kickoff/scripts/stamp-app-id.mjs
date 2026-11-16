#!/usr/bin/env node
// Makes the Android applicationId and the iOS/macOS bundle identifiers equal to the decided app id.
// `flutter create` camel-cases the iOS id but keeps underscores on Android, so multi-word names diverge.
// Handles build.gradle.kts and build.gradle; with --check it only reports. A no-op when everything already matches.
// Usage: node stamp-app-id.mjs --dir <flutter project> --app-id com.org.app [--check]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, isMain } from './lib/util.mjs';

const KTS = /(applicationId\s*=\s*)"([^"]*)"/;
const GROOVY = /(applicationId\s*=?\s*)(['"])([^'"]*)\2/;

export function readAndroidId(text) {
  const k = KTS.exec(text);
  if (k) return k[2];
  const g = GROOVY.exec(text);
  return g ? g[3] : null;
}

export function setAndroidId(text, id) {
  if (KTS.test(text)) return text.replace(KTS, `$1"${id}"`);
  if (GROOVY.test(text)) return text.replace(GROOVY, `$1$2${id}$2`);
  throw new Error('no applicationId found');
}

export function readBundleIds(text) {
  return [...text.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim().replace(/^"|"$/g, ''));
}

// ASSUMPTION: the shortest PRODUCT_BUNDLE_IDENTIFIER is the app target; test/extension targets extend it with a suffix.
export function setBundleIds(text, id) {
  const ids = readBundleIds(text).filter((v) => !v.includes('$('));
  if (!ids.length) throw new Error('no PRODUCT_BUNDLE_IDENTIFIER found');
  const base = ids.reduce((a, b) => (b.length < a.length ? b : a));
  return text.replace(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g, (whole, v) => {
    const val = v.trim().replace(/^"|"$/g, '');
    if (val === base) return `PRODUCT_BUNDLE_IDENTIFIER = ${id};`;
    if (val.startsWith(`${base}.`)) return `PRODUCT_BUNDLE_IDENTIFIER = ${id}${val.slice(base.length)};`;
    return whole;
  });
}

export function androidGradleFile(dir) {
  for (const f of ['android/app/build.gradle.kts', 'android/app/build.gradle']) if (existsSync(join(dir, f))) return f;
  return null;
}

export function stamp({ dir, appId, check = false }) {
  const report = { android: null, ios: null, macos: null, changed: [] };
  const g = androidGradleFile(dir);
  if (g) {
    const t = readFileSync(join(dir, g), 'utf8');
    report.android = { file: g, current: readAndroidId(t) };
    if (report.android.current !== appId) {
      if (!check) { writeFileSync(join(dir, g), setAndroidId(t, appId)); report.changed.push(g); }
    }
  }
  for (const [key, rel] of [['ios', 'ios/Runner.xcodeproj/project.pbxproj'], ['macos', 'macos/Runner.xcodeproj/project.pbxproj']]) {
    const f = join(dir, rel);
    if (!existsSync(f)) continue;
    const t = readFileSync(f, 'utf8');
    const ids = [...new Set(readBundleIds(t))];
    report[key] = { file: rel, current: ids };
    const next = setBundleIds(t, appId);
    if (next !== t && !check) { writeFileSync(f, next); report.changed.push(rel); }
  }
  return report;
}

if (isMain(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2), { flags: ['check'] });
  try {
    const r = stamp({ dir: a.dir || '.', appId: a['app-id'], check: !!a.check });
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(`stamp-app-id: ${e.message}`);
    process.exit(2);
  }
}
