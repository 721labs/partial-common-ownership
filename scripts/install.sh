echo "Installing"

echo "\n0. Set Node Version"
source $HOME/.nvm/nvm.sh
nvm use

echo "\n1. Install Dependencies"
yarn

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

foundryup

echo "\n3. Verifying Installation"
forge --version
cast --version
anvil --version
