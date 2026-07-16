echo "Installing"

echo "\n0. Set Node Version"
source "$HOME/.nvm/nvm.sh"
nvm install
nvm use

echo "\n1. Install Dependencies"
corepack enable pnpm
corepack install --global pnpm@11.13.1
test "$(pnpm --version)" = "11.13.1"
pnpm install --frozen-lockfile

echo "\n2. Installing Foundry"
curl -L https://foundry.paradigm.xyz | bash

# Source profile prior to running `foundryup`
case $SHELL in
*/zsh)
  source $HOME/.zshrc
  ;;
*/bash)
  source $HOME/.bashrc
  ;;
*/fish)
  source $HOME/.config/fish/config.fish
  ;;
esac

foundryup --install 1.7.1

echo "\n3. Verifying Installation"
forge --version
cast --version
anvil --version
