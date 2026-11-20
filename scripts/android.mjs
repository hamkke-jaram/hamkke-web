#!/usr/bin/env node
/**
 * 안드로이드 앱(Capacitor) 빌드·설치 도우미.
 *   node scripts/android.mjs apk                 디버그 APK 만들기(gradle assembleDebug)
 *   node scripts/android.mjs install [기기]       APK 설치 + 서버 포트 잇기(adb reverse) + 앱 열기
 *
 * 필요한 것: JDK 21(JAVA_HOME), Android SDK(ANDROID_HOME 또는 ANDROID_SDK_ROOT. 윈도우는 기본 설치 위치를 스스로 찾는다).
 * 기기는 `adb devices`에 보이는 이름(예: emulator-5556). 연결된 기기가 하나뿐이면 생략해도 된다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const APK = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APP_ID = 'kr.hamkkejaram.app';
/** 앱이 부르는 이 컴퓨터의 서버 포트(.env.android). 폰의 localhost 를 이 컴퓨터로 잇는다. */
const PORTS = [8080, 8090];
const win = process.platform === 'win32';

function sdkDir() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const guess = win && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : join(process.env.HOME ?? '', 'Android', 'Sdk');
  return existsSync(guess) ? guess : null;
}

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [command, device] = process.argv.slice(2);
const sdk = sdkDir();
if (!sdk) fail('Android SDK를 찾지 못했어요. ANDROID_HOME 을 SDK 폴더로 정해 주세요.');

if (command === 'apk') {
  if (!existsSync(join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'index.html'))) {
    fail('앱에 담을 화면 파일이 없어요. 먼저 `npm run android:build` 를 실행해 주세요.');
  }
  const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  // gradlew.bat 은 셸을 거쳐야 실행된다(윈도우). 셸에는 인자를 따로 넘기지 않고 명령 한 줄로 준다(Node 경고 DEP0190).
  if (win) run(`"${join(androidDir, 'gradlew.bat')}" assembleDebug`, [], { cwd: androidDir, env, shell: true });
  else run('./gradlew', ['assembleDebug'], { cwd: androidDir, env });
  console.log(`\nAPK: ${APK}`);
} else if (command === 'install') {
  if (!existsSync(APK)) fail('APK가 없어요. 먼저 `npm run android:apk` 를 실행해 주세요.');
  const adb = join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb');
  const target = device ? ['-s', device] : [];
  for (const port of PORTS) run(adb, [...target, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  run(adb, [...target, 'install', '-r', APK]);
  run(adb, [...target, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
} else {
  fail('쓰임: node scripts/android.mjs apk | install [기기]');
}
