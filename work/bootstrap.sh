#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/learning-env.sh"
skip_browser=false
assemble_only=false
while (($#)); do
  case "$1" in
    --check)
      command -v tmux >/dev/null
      command -v rsvg-convert >/dev/null
      command -v pdftotext >/dev/null
      node work/check-install.mjs
      exit 0 ;;
    --skip-browser) skip_browser=true ;;
    --assemble-only) assemble_only=true ;;
    *) echo "Unknown setup option: $1" >&2; exit 2 ;;
  esac
  shift
done
mkdir -p work/downloads work/runtime work/pi-agent
# Avoid two concurrent installers writing the same runtime or source checkout.
exec 9>work/downloads/setup.lock
flock -n 9 || { echo 'Setup is already running for this workspace.' >&2; exit 1; }
missing=false
for executable in tmux rsvg-convert pdftotext pdftohtml curl git xz python3; do
  command -v "$executable" >/dev/null || missing=true
done
if $missing || ! dpkg-query -W -f='${Status}' python3-venv 2>/dev/null | grep -q 'install ok installed'; then
  echo 'Installing Linux prerequisites (sudo may ask for your Linux password).'
  sudo apt-get update
  sudo apt-get install -y curl git xz-utils tmux librsvg2-bin poppler-utils python3 python3-venv fonts-dejavu-core
fi
fetch_source() {
  local url="$1" commit="$2" destination="$3" patch="$4"
  local stage
  stage=$(mktemp -d "$workspace/work/downloads/source.XXXXXX")
  git -C "$stage" init -q
  git -C "$stage" fetch -q --depth 1 "$url" "$commit"
  git -C "$stage" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$stage" rev-parse HEAD)" == "$commit" ]]
  git -C "$stage" apply --check "$workspace/$patch"
  git -C "$stage" apply "$workspace/$patch"
  mv "$stage" "$destination"
}
# Source pins are checked into dependencies.json; system Python reads them before Node is installed.
readarray -t pins < <(python3 - <<'PY'
import json
m=json.load(open('dependencies.json'))
for key in ('learn','subagents'):
    print(m[key]['url']); print(m[key]['commit'])
print(m['node']); print(m['pi']); print(m['webAccess'])
PY
)
if [[ ! -d .pi ]]; then
  fetch_source "${pins[0]}" "${pins[1]}" "$workspace/.pi" patches/learn.patch
  cp -a overlay/.pi/. .pi/
  sed -i '/^model: /d' .pi/agents/*.md
elif [[ ! -f .install-state.json ]]; then
  echo 'An unmanaged .pi folder exists. Use a fresh repository folder; setup will not overwrite it.' >&2
  exit 1
fi
if [[ ! -d work/pi-interactive-subagents ]]; then
  fetch_source "${pins[2]}" "${pins[3]}" "$workspace/work/pi-interactive-subagents" patches/subagents.patch
  # Helpers inherit the chosen provider/model, rather than requiring a second paid account.
  sed -i '/^model: /d' work/pi-interactive-subagents/agents/*.md
fi
python3 - <<'PY'
import json, shutil
from pathlib import Path
root=Path.cwd(); vault=root/'outputs/Learning Vault'
vault.mkdir(parents=True,exist_ok=True)
for source in (root/'templates/vault').rglob('*'):
    if not source.is_file(): continue
    target=vault/source.relative_to(root/'templates/vault')
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists(): shutil.copyfile(source,target)
for folder in ['Sessions','Checkpoints','Sources/Class Materials','Course']:
    (vault/folder).mkdir(parents=True,exist_ok=True)
for source in (root/'docs').glob('*.md'):
    target=vault/'Course'/source.name
    if not target.exists(): shutil.copyfile(source,target)
for name, source in [('Video Principles.md', root/'.pi/course-context/video-teaching-principles.md'), ('runtime-contract.json', root/'.pi/learning-runtime.json')]:
    target=vault/'Course'/name
    if not target.exists(): shutil.copyfile(source,target)
# Mark the assembled sources so a dependency-install failure can be repaired on re-run.
(root/'.install-state.json').write_text(json.dumps({'sources':json.loads((root/'dependencies.json').read_text()),'ready':False})+'\n')
PY
if $assemble_only; then echo 'Sources and blank vault assembled; dependencies not installed.'; exit 0; fi
node_version="${pins[4]}"
if [[ ! -x work/runtime/node/bin/node ]] || [[ "$(work/runtime/node/bin/node --version)" != "v$node_version" ]]; then
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo 'Unsupported Linux CPU architecture' >&2; exit 1 ;; esac
  archive="node-v$node_version-linux-$arch.tar.xz"
  base="https://nodejs.org/dist/v$node_version"
  curl --fail --location --retry 3 "$base/SHASUMS256.txt" -o work/downloads/SHASUMS256.txt
  curl --fail --location --retry 3 "$base/$archive" -o "work/downloads/$archive"
  (cd work/downloads; awk -v name="$archive" '$2 == name {print}' SHASUMS256.txt | sha256sum --check --strict -)
  mkdir -p work/runtime/node
  tar -xJf "work/downloads/$archive" -C work/runtime/node --strip-components=1
fi
export PATH="$workspace/work/runtime/node/bin:$PATH"
if ! node -e 'const m=require("./dependencies.json"); for (const [p,v] of [["@earendil-works/pi-coding-agent",m.pi],["pi-web-access",m.webAccess]]) {if(require("./work/runtime/pi/node_modules/"+p+"/package.json").version!==v) process.exit(1)}' 2>/dev/null; then
  npm install --prefix work/runtime/pi --ignore-scripts --no-audit --no-fund "@earendil-works/pi-coding-agent@${pins[5]}" "pi-web-access@${pins[6]}"
fi
if [[ ! -f .pi/extensions/visual-tools/node_modules/.package-lock.json ]]; then
  (cd .pi/extensions/visual-tools; npm ci --ignore-scripts --no-audit --no-fund)
fi
if ! $skip_browser; then
  browser_packages=(libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libgbm1 libgtk-3-0t64 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 fonts-liberation)
  missing_browser=false
  for package in "${browser_packages[@]}"; do
    dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed' || missing_browser=true
  done
  if $missing_browser; then
    sudo apt-get update
    sudo apt-get install -y "${browser_packages[@]}"
  fi
  # Puppeteer detects and reuses the same browser build on later setup runs.
  (cd .pi/extensions/visual-tools; node node_modules/puppeteer/install.mjs)
fi
node work/configure-workspace.mjs
node work/check-install.mjs
node -e 'const fs=require("fs"); const p=".install-state.json"; const s=JSON.parse(fs.readFileSync(p)); s.ready=true; fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n")'
echo 'Learning tools installed. Sign in to your own AI provider with /login inside Pi.'
