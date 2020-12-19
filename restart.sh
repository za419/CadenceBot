#!/bin/bash

pushd "$(dirname "$(readlink -f "$0")")" > /dev/null
pkill node
./maillog.sh 2> /dev/null
nohup node bot.js &>CadenceBot.log &
popd > /dev/null
