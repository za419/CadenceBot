# CadenceBot

CadenceBot is a [Discord](https://discordapp.com/) bot, which serves as a client for [Cadence Radio](https://github.com/kenellorando/cadence).

CadenceBot is fully featured, and is functionally equivalent to the [web client](http://cadenceradio.com/).

## Creating an instance of CadenceBot

### Using `apt`

CadenceBot has a setup script for any platform which uses `apt` as package manager, which has `bash`, and for which `node.js`, `ffmpeg`, and `gcc`/`g++` are available.

First, clone the repository into a folder of your choosing on your server. Enter this folder, and run the script `first-time-setup.sh`.

Once this script finishes, [get your token from Discord](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token), and place it in a file called `auth.json` (see `auth-example.json`).

If you have followed these steps properly, you should be able to run `restart.sh` or `node bot.js`, and your instance of CadenceBot will start running.

### Not using `apt`

CadenceBot does not have any automated setup for platforms which do not use `apt`.

Before anything else, clone the repository into a folder of your choosing on the server, and enter the folder. Then, install CadenceBot's dependencies:

First, [install `Node.js`](https://nodejs.org/en/download/), at least version 8.8.

Then, install the following:

 - `ffmpeg`
 
 - `gcc`
 
 - `g++`

Then, you can run the script `setup.sh` in the repository folder.

At this point, you should be able to run CadenceBot, but in order to ensure that your `node_modules` stay up-to-date as new changes are made to CadenceBot, it is recommended that you install the `auto-setup.sh` script as a git hook.

To do this, simply copy it into the `.git/hooks/` directory, as at least the `post-merge` hook. The `first-time-setup.sh` script copies my setup, which can is to have `auto-setup.sh` run on both post-merge and post-checkout. This can be duplicated with:

`cp auto-setup.sh .git/hooks/post-checkout`

`cp auto-setup.sh .git/hooks/post-merge`
