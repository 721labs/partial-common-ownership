#!/usr/bin/env bash

set -euo pipefail

echo "Installing"

echo "\n0. Initialize pinned submodules"
git submodule update --init --recursive
test "$(git -C lib/forge-std rev-parse HEAD)" = "bf647bd6046f2f7da30d0c2bf435e5c76a780c1b"
test -z "$(git -C lib/forge-std status --porcelain --untracked-files=all)"

echo "\n1. Set Node Version"
source "$HOME/.nvm/nvm.sh"
nvm install
nvm use
test "$(node --version)" = "v24.18.0"

echo "\n2. Install Dependencies"
corepack enable pnpm
corepack install --global pnpm@11.13.1
test "$(pnpm --version)" = "11.13.1"
pnpm install --frozen-lockfile

echo "\n3. Installing Foundry"
case "$(uname -s)-$(uname -m)" in
Darwin-x86_64)
  foundry_asset="foundry_v1.7.1_darwin_amd64.tar.gz"
  foundry_sha256="c7fd1f5c9bf718d30b5cb6fc94eac605039de2aa50afc4c545a4dddc1e411acb"
  ;;
Darwin-arm64)
  foundry_asset="foundry_v1.7.1_darwin_arm64.tar.gz"
  foundry_sha256="eacdc67718fac857cad9e19c7f6729dd80de731d09df81856391d093cfcab547"
  ;;
Linux-x86_64)
  foundry_asset="foundry_v1.7.1_linux_amd64.tar.gz"
  foundry_sha256="cf7e688ed0c4c48adffca788b496076e31060b67ac5afe1e43dbb5499c20c88b"
  ;;
Linux-aarch64 | Linux-arm64)
  foundry_asset="foundry_v1.7.1_linux_arm64.tar.gz"
  foundry_sha256="c8fe8fa09ae3aba2c81b510c6f9da3a9d468029b9580e690b245b3f0aea687ae"
  ;;
*)
  echo "Unsupported Foundry platform: $(uname -s)-$(uname -m)" >&2
  exit 1
  ;;
esac

foundry_tmp="$(mktemp -d)"
trap 'rm -rf "$foundry_tmp"' EXIT
foundry_archive="$foundry_tmp/$foundry_asset"
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  "https://github.com/foundry-rs/foundry/releases/download/v1.7.1/$foundry_asset" \
  --output "$foundry_archive"
if command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "$foundry_sha256" "$foundry_archive" | sha256sum --check --status
else
  test "$(shasum -a 256 "$foundry_archive" | awk '{print $1}')" = "$foundry_sha256"
fi
mkdir -p "$HOME/.foundry/bin"
tar -xzf "$foundry_archive" -C "$HOME/.foundry/bin"
export PATH="$HOME/.foundry/bin:$PATH"

echo "\n4. Verifying Installation"
forge --version | grep -Fqx "forge Version: 1.7.1"
forge --version | grep -Fqx "Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8"
cast --version | grep -Fqx "cast Version: 1.7.1"
cast --version | grep -Fqx "Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8"
anvil --version | grep -Fqx "anvil Version: 1.7.1"
anvil --version | grep -Fqx "Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8"
