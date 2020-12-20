#!/bin/bash

pushd "$(dirname "$(readlink -f "$0")")" > /dev/null
if ! pkill node >/dev/null; then
    # Try sudo before things break
    sudo pkill node
fi
./maillog.sh 2> /dev/null
nohup node bot.js &>CadenceBot.log &
popd > /dev/null
