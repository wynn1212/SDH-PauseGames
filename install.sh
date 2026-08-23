#!/usr/bin/bash

VERSION=${VERSION:-"LATEST"}

APP_NAME="SDH-PauseGames"
GITHUB_REPO="https://api.github.com/repos/wynn1212"

if [ ! -d "$HOME/homebrew/plugins" ]; then
    echo "Error: Decky plugin directory doesn't exist. Do you have Decky Installed?"
    exit 1
fi

if [ "$EUID" -eq 0 ]
  then echo "Please do not run as root"
  exit
fi


echo "Removing previous install if it exists"

cd $HOME

sudo rm -rf $HOME/homebrew/plugins/$APP_NAME

echo "Installing $APP_NAME plugin"

FINAL_URL="$GITHUB_REPO/$APP_NAME/releases/latest"

if [ $VERSION != "LATEST" ] ; then
  FINAL_URL="$GITHUB_REPO/$APP_NAME/releases/tags/$VERSION"
fi

# download + install the plugin
curl -L $(curl -s $FINAL_URL | grep "browser_download_url" | cut -d '"' -f 4) -o $HOME/$APP_NAME.zip
sudo 7z x ./$APP_NAME.zip  -o$HOME/homebrew/plugins

# install complete, remove downloaded files
rm  "$HOME/$APP_NAME.zip"
sudo systemctl restart plugin_loader.service

echo "Installation complete"
