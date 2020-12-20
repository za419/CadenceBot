#!/bin/bash

pushd "$(dirname "$(readlink -f "$0")")" > /dev/null
if ! pkill node 2>/dev/null; then
    # Try sudo before things break
    echo "Trying sudo to kill old running instance (probably started by rc.local)"
    sudo pkill node
fi
./maillog.sh 2> /dev/null
nohup node bot.js &>CadenceBot.log &
popd > /dev/null
