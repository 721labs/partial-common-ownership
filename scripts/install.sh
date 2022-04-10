echo "Installing"

echo "\n0. Set Node Version"
nvm use

echo "\n1. Install Dependencies"
yarn

echo "\n2. Installing Foundry"
curl -L https://foundry.paradigm.xyz | bash
# not sure which profile you're using, so we source a few.
source ~/.zshrc
source ~/.profile
source ~/.bashrc
foundryup
forge --version
cast --version
nn
