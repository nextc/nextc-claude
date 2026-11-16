// The shell-command policy of nextc-core/scripts/autopilot-hooks.mjs, as allow/deny tables.
// Every bypass and false positive found in the 15 real runs and the 2026-11 review is listed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCommand, parseShell } from '../nextc-core/scripts/autopilot-hooks.mjs';

const ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-guard-')));
fs.writeFileSync(path.join(ROOT, 'export.plist'), '<plist><dict><key>method</key><string>app-store-connect</string><key>destination</key><string>export</string></dict></plist>');
fs.writeFileSync(path.join(ROOT, 'upload.plist'), '<plist><dict><key>destination</key>\n<string>upload</string></dict></plist>');
const ALIASES = { st: 'status', p: 'push', sp: '!git status && git push' };
const ctx = (extra = {}) => ({
  root: ROOT, runDir: path.join(ROOT, 'run'), stateDir: ROOT, deploys: [],
  env: { HOME: '/Users/me', TMPDIR: '/clone/.autopilot-tmp', FLUTTER_ROOT: '/opt/flutter' },
  gitAlias: (name) => ALIASES[name] ?? null,
  ...extra,
});

const ALLOWED = [
  // mentions, not actions
  'git log --grep=push', 'git commit -m "push the button"', 'grep -r push src', 'echo "git push"', "echo 'npm publish'",
  'echo firebase deploy', 'printf "%s\\n" "wrangler deploy"', '# git push later\ngit status', 'cat deliver.md',
  'npm test -- --publish', 'git -C repo log --oneline | grep push', 'git config --get alias.p',
  // heredoc text is data: the false denial on a ledger entry, apostrophes in prose
  "cat >> docs/ledger.md <<'EOF'\n### [5] D S3: run npm run deploy:docs after review; it's the user's call\nEOF",
  "cat > notes.md <<EOF\nWe'll git push later, don't worry\nEOF\ngit status",
  "git commit -F - <<'EOF'\nfeat: firebase deploy docs, then git push\nEOF",
  "cat <<-EOF\n\tgit push is the user's job\n\tEOF\necho done",
  // ordinary work
  'git status && npm run build', 'git st', 'node scripts/autopilot.js', 'fastlane build_ios', 'fastlane android build',
  'fastlane ios test', 'bundle exec fastlane build_ios', 'fastlane lanes', 'fastlane run gym', 'gh issue list', 'gh pr view 3', 'gh pr diff 3',
  'time npm test', 'if [ -f a ]; then npm test; fi', '! grep -q x f', '[ -f x ] && echo ok', '{ npm test; npm run lint; }',
  'case $f in *.md) echo md;; *) echo other;; esac', "git rebase --exec 'npm test' HEAD~2", 'git config user.name bot',
  'npx prettier --write src', 'yarn add left-pad', 'pnpm install', 'uv run pytest', 'python3 -m pytest', 'env FOO=1 npm test',
  'timeout 60 flutter test', 'go build ./... 2>&1 | tail', 'flutter test > out.log 2>&1', 'sh -n scripts/deploy.sh',
  "awk '{print $1}' f", 'xargs -I{} cp {} $DEST', 'FR=/opt/flutter; $FR/bin/flutter test', '$TMPDIR/g.sh file pattern',
  '$FLUTTER_ROOT/bin/flutter analyze', 'export W=/tmp/w; $W/a run',
  'python3 -c "import json; print(json.load(open(\'state.json\'))[\'steps\'])"',
  "node -e 'const s=require(\"fs\").readFileSync(\"x\");console.log(`deploy ${s}`)'",
  "python3 -I - <<'EOF'\np='a.txt'; s=open(p).read(); open(p,'w').write(s.replace('git push','x'))\nEOF",
  "perl -0pi -e 's/burst `10`/burst `20`/' docs/plan.md",
  // live-service tools in read-only or local modes
  'appwrite --help', 'appwrite functions create --help', 'firebase emulators:start', 'supabase start', 'supabase functions serve',
  'vercel build', 'wrangler dev', 'docker build -t x .', 'gradle publishToMavenLocal', './gradlew assembleDebug',
  'kubectl get pods', 'terraform plan', 'aws s3 ls', 'gcloud config list', 'eas build --local -p ios',
  // git and Claude Code files: reading is fine, and the clone's own path contains .claude/autopilot-runs/
  'cat .git/config', 'sed -n 1,5p .git/config', 'ls .git/hooks', 'cd /x/.claude/autopilot-runs/r1/src && ls',
  'echo hi > /x/.claude/autopilot-runs/r1/out.txt', 'flutter pub get --directory=/x/.claude/autopilot-runs/r1',
  `xcodebuild -exportArchive -archivePath a.xcarchive -exportOptionsPlist ${ROOT}/export.plist -exportPath out`,
];

const DENIED = [
  // push in every form
  'git push', 'git push origin HEAD', 'git push origin +HEAD:main', 'git -C /x push', 'git -c core.x=1 push', 'cd a && git push',
  'FOO=1 git push', 'sudo -u bob git push', 'env -i git push', 'nohup git push &', 'echo x | xargs git push', '/usr/bin/git push',
  'timeout 60 git push', 'git send-email x.patch', 'git lfs push origin main', 'git svn dcommit', 'git-push origin',
  // shell keywords and grouping
  'if true; then git push; fi', 'while true; do git push; done', 'until false; do git push; done', '! git push', '{ git push; }',
  '(git push)', '( cd a && git push )', 'f() { git push; }; f', 'time git push', 'case x in a) echo;; *) git push;; esac',
  // substitutions and heredocs
  'bash -c "git push"', "sh -c 'cd x; git push'", 'echo $(git push)', 'echo "`git push`"', 'echo `git push`', 'cat <(git push)',
  "cat <<EOF\nit's fine\nEOF\ngit push", 'cat <<EOF\n$(git push)\nEOF', 'cat <<EOF\n`git push`\nEOF', 'bash <<EOF\ngit push\nEOF',
  "bash -s <<'EOF'\necho hi\ngit push\nEOF",
  // carriers
  'env -S "git push"', "env --split-string='git push origin'", 'find . -name x -exec git push \\;', 'find . -execdir git push {} +',
  'git submodule foreach "git push"', 'git rebase -x "git push" HEAD~1', 'git bisect run git push', 'alias p="git push"',
  // opaque: variables, globs, braces, eval, generated code
  'git$cmd', 'git${IFS}push', 'cmd=" push"; git$cmd', 'X=push; git $X', 'git $(echo push)', 'git pu{s,}h', 'eval "$CMD"', 'bash -c "$CMD"',
  "$'\\x67it' push", 'G=$(which git); $G push',
  'python3 -c "import subprocess; subprocess.run([\'git\',\'push\'])"', "node -e 'require(\"child_process\").execSync(\"git push\")'",
  "python3 - <<'EOF'\nimport os\nos.system('git push')\nEOF", "ruby -e '`git push`'", "awk 'BEGIN{system(\"git push\")}'",
  "perl -e 'qx(git push)'", 'python3 -m twine upload dist/x.whl', "echo 'unterminated",
  // aliases and config that hide a push
  'git p', 'git sp', 'git -c alias.x=push x', 'git config alias.y push', 'GIT_CONFIG_KEY_0=alias.z git z', 'GIT_CONFIG_COUNT=1 git status',
  // config and files that would run outside the sandbox later
  'git config core.hooksPath /tmp/h', 'git config core.fsmonitor "x"', 'git config --add include.path ../evil', 'git config --edit',
  'git credential fill', 'echo x > .git/hooks/pre-commit', 'cp evil .git/hooks/pre-commit', 'sed -i "" s/a/b/ .git/config',
  'ln -s /x .git/config', 'cat > .claude/settings.local.json <<EOF\n{}\nEOF', 'tee .mcp.json < x', 'cd .git && ls',
  'echo x > /x/.claude/autopilot-runs/r1/.git/hooks/post-commit',
  // GitHub
  'gh pr create', 'gh api repos/x', 'gh auth token', 'gh workflow run deploy.yml', 'gh secret set X', 'gh release create v1',
  // stores
  'fastlane ios release_testflight', 'bundle exec fastlane pilot upload', 'fastlane run upload_to_testflight', 'fastlane ios beta',
  'fastlane android deploy', 'fastlane release', 'fastlane run upload_to_play_store', 'fastlane ios build_and_upload',
  'xcrun altool --upload-app', 'xcrun notarytool submit a.zip', 'eas submit -p ios', 'npx eas submit', 'eas update', 'eas build -p ios',
  `xcodebuild -exportArchive -archivePath a.xcarchive -exportOptionsPlist ${ROOT}/upload.plist -exportPath out`,
  'xcodebuild -exportArchive -archivePath a.xcarchive -exportPath out',
  // packages
  'npm publish', 'npm --prefix pkg publish', 'pnpm -r publish', 'yarn npm publish', 'dart pub publish', 'dart pub lish', 'flutter pub publish',
  'cargo publish --dry-run', 'twine upload dist/*', 'gem push x.gem', 'pod trunk push', 'mvn clean deploy', './gradlew publish', 'docker push img',
  'uvx twine upload dist/x', 'poetry publish',
  // live services
  'firebase deploy', 'firebase deploy --only hosting', 'npx firebase deploy', 'yarn firebase deploy', 'npm exec -- firebase deploy',
  'wrangler deploy', 'wrangler pages deploy dist', 'appwrite push functions', 'appwrite deploy function', 'supabase db push',
  'supabase functions deploy x', 'vercel', 'vercel --prod', 'npx vercel --prod', 'netlify deploy --prod', 'fly deploy', 'gcloud app deploy',
  'aws s3 sync dist s3://b', 'kubectl apply -f k.yaml', 'terraform apply', 'helm upgrade x y', 'security find-generic-password -s x -w',
  // the launcher itself
  'node /path/to/autopilot-run.mjs r1',
];

test('guard allows ordinary work and commands that only mention an outward action', () => {
  for (const c of ALLOWED) assert.equal(checkCommand(c, ctx()), null, c);
});

test('guard denies push, uploads, publishing, live services, hidden carriers and opaque commands', () => {
  for (const c of DENIED) assert.notEqual(checkCommand(c, ctx()), null, c);
});

test('a deploy step\'s own recorded command is allowed only after its gate passes', () => {
  const runDir = path.join(ROOT, 'gated');
  fs.mkdirSync(runDir, { recursive: true });
  const deploys = [{ step: 'S3', commands: ['firebase deploy --only hosting'], scripts: [] }];
  fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({ steps: [{ id: 'S3', kind: 'deploy', status: 'in_progress', gate: null }] }));
  assert.match(checkCommand('firebase deploy --only hosting', ctx({ runDir, deploys })), /compatibility check/);
  fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({ steps: [{ id: 'S3', kind: 'deploy', status: 'in_progress', gate: 'pass' }] }));
  assert.equal(checkCommand('firebase deploy --only hosting', ctx({ runDir, deploys })), null);
  assert.notEqual(checkCommand('firebase deploy', ctx({ runDir, deploys })), null, 'an unrecorded deploy command stays denied');
});

test('opaque and unparseable commands get a reason that says how to fix them', () => {
  assert.match(checkCommand('git$cmd', ctx()), /Write the command out plainly/);
  assert.match(checkCommand("echo 'oops", ctx()), /could not parse.*unterminated single quote/);
  assert.match(checkCommand("python3 -c 'import subprocess'", ctx()), /starts another process/);
});

test('parser keeps heredoc bodies as data and runs only their substitutions', () => {
  const { commands } = parseShell("cat <<'EOF' > f\n$(rm -rf /)\nEOF\ncat <<EOF\nx $(date) y\nEOF", { env: {} });
  assert.deepEqual(commands.map((c) => c.words.map((w) => w.text)), [['cat'], ['cat'], ['date']]);
  assert.equal(commands[0].heredocs[0].body, '$(rm -rf /)');
  assert.equal(commands[0].heredocs[0].quoted, true);
  assert.deepEqual(commands[0].redirects.map((r) => r.text), ['f']);
});

test('parser resolves literal assignments and the environment, and marks the rest dynamic', () => {
  const { commands } = parseShell('A=/opt/x; $A/bin/t $HOME $UNSET "$(id)"', { env: { HOME: '/h' } });
  const words = commands.at(-1).words;
  assert.deepEqual(words.map((w) => [w.text, w.dyn]), [['/opt/x/bin/t', false], ['/h', false], ['$UNSET', true], ['', true]]);
});
