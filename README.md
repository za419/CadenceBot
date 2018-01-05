# CadenceBot

CadenceBot is a [Discord](https://discordapp.com/) bot, which serves as a client for [Cadence Radio](https://github.com/kenellorando/cadence).

CadenceBot is fully featured, and is functionally equivalent to the [web client](http://cadenceradio.com/).

## Creating an instance of CadenceBot

### Using `apt`

CadenceBot has a setup script for any platform which uses `apt` as package manager, which has `bash`, and for which `node.js`, `ffmpeg`, and `gcc`/`g++` are available.

First, [get your token from Discord](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token). I recommend allowing the setup script prepare your authentication file, and it will need that token, so save it for later.

Then, clone the repository into a folder of your choosing on your server. Enter this folder, and run the script `first-time-setup.sh`.

You'll be prompted first if you would like to set up emailing of logs on restarting the bot. When CadenceBot is started using the `restart.sh` script, all logging is directed into CadenceBot.log, stored in the same folder as the script. When the script is run, it overwrites that log. If you would like, a script called `maillog.sh` can be run to archive the log. The setup script can create this script for you, sending the log in the body of an email to the address of your choosing, with a subject line consisting of appending the current date and time to a prefix of your choosing. Remember to check your spam mail!

If you choose not to do this during setup, but want to do it later, either write the appropriate commands into `maillog.sh`, or simply rerun `first-time-setup.sh`.

You'll be prompted after that process is completed or skipped to setup your authentication file. I recommend doing this through the setup script - Although it's easy to do manually, it's simpler to use the script. Just enter the token you saved earlier.

If you choose not to create the authentication file during setup, you'll have to do it before starting the bot (otherwise it will simply fail to start). You can either do this by rerunning the `first-time-setup.sh` script, or by placing your token in a file called `auth.json` (see `auth-example.json`).

If at any point you need to recreate this setup, for example to change the address logs are mailed to, you can simply rerun `first-time-setup.sh` - The required sections will not do anything harmful to your setup unless you need a particular version of some packages for some reason outside CadenceBot, and the optional sections can be skipped simply by pressing enter.

If you have followed these steps properly, you should be able to run `restart.sh` or `node bot.js`, and your instance of CadenceBot will start running.

### Not using `apt`

CadenceBot does not have any complete automated setup for platforms which do not use `apt`.

Before anything else, clone the repository into a folder of your choosing on the server, and enter the folder. Then, install CadenceBot's dependencies:

First, [install `Node.js`](https://nodejs.org/en/download/), at least version 8.8.

Then, install the following:

 - `ffmpeg`

 - `gcc`

 - `g++`

Now, [get your token from Discord](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token). I recommend allowing the setup script prepare your authentication file, and it will need that token, so save it for later.

Then, you can run the script `first-time-setup.sh` in the repository folder - It will generate errors related to the use of `apt`, but these can be disregarded.

You'll be prompted first if you would like to set up emailing of logs on restarting the bot. When CadenceBot is started using the `restart.sh` script, all logging is directed into CadenceBot.log, stored in the same folder as the script. When the script is run, it overwrites that log. If you would like, a script called `maillog.sh` can be run to archive the log. The setup script can create this script for you, sending the log in the body of an email to the address of your choosing, with a subject line consisting of appending the current date and time to a prefix of your choosing. Remember to check your spam mail!

If you choose not to do this during setup, but want to do it later, either write the appropriate commands into `maillog.sh`, or simply rerun `first-time-setup.sh`.

You'll be prompted after that process is completed or skipped to setup your authentication file. I recommend doing this through the setup script - Although it's easy to do manually, it's simpler to use the script. Just enter the token you saved earlier.

If you choose not to create the authentication file during setup, you'll have to do it before starting the bot (otherwise it will simply fail to start). You can either do this by rerunning the `first-time-setup.sh` script, or by placing your token in a file called `auth.json` (see `auth-example.json`).

If at any point you need to recreate this setup, for example to change the address logs are mailed to, you can simply rerun `first-time-setup.sh` - The required sections will not do anything harmful to your setup unless you need a particular version of some packages for some reason outside CadenceBot, and the optional sections can be skipped simply by pressing enter.

If you have followed these steps properly, you should be able to run `restart.sh` or `node bot.js`, and your instance of CadenceBot will start running.

### Manual setup

Completely manual setup is not recommended, only because of the need to install the npm packages in `setup.sh`, in the order they appear. I therefore recommend at least running that script. Manual setup using that script proceeds as follows:

Clone the CadenceBot repository into a directory of your choosing.

[Install `Node.js`](https://nodejs.org/en/download/), at least version 8.8.

Then, install the following:

 - `ffmpeg`

 - `gcc`

 - `g++`

Now, run `setup.sh`, or open the file and install the npm packages present there in the order they appear.

The next step is to setup your authentication file. [Get your token from Discord](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token), and place it in a file named `auth.json`, following the format in `auth-example.json`.

Once this script finishes, [get your token from Discord](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token), and place it in a file called `auth.json` (see `auth-example.json`).

At this point, you should be able to run CadenceBot, but in order to ensure that your `node_modules` stay up-to-date as new changes are made to CadenceBot, it is recommended that you install the `auto-setup.sh` script as a git hook.

To do this, simply copy it into the `.git/hooks/` directory, as at least the `post-merge` hook. The `first-time-setup.sh` script copies my setup, which can is to have `auto-setup.sh` run on both post-merge and post-checkout. This can be duplicated with:

`cp auto-setup.sh .git/hooks/post-checkout`

`cp auto-setup.sh .git/hooks/post-merge`

The `auto-setup.sh` script removes `node_modules` and re-runs `setup.sh`. If you wish, you can write your own script to duplicate this behavior, or simply skip it - This function is not necessarily required for CadenceBot to run, but it does avoid errors when new CadenceBot features rely on module updates, so if you don't keep your setup up-to-date automatically, be ready to have to update your modules as shown in `setup.sh` (keep in mind that this script does change on occasion).

Now, CadenceBot should run properly, even if a change requires a new module or new module version. There is only one detail left - When CadenceBot is restarted by the `restart.sh` script, it keeps its log in the `CadenceBot.log` file, which is overwritten each time the script is run. If this is not desired, you can make a `maillog.sh` script, which shall be run before starting the bot each time `restart.sh` is run, with the intention of being used to archive the log before it is deleted (by email, usually). Add whichever commands you would like to this script to have your logs archived automatically.

## Branches

Branch names should avoid uppercase characters where reasonable.

- `dev-master`: Features which are in development or in testing, but will eventually make it to `master`, unless there's some catastrophe in their implementation (such as if they become impractical to translate into production, or if the performance impact of a feature becomes too great)
- `master`: The current production state of CadenceBot. The tip of the master branch shall always be in a state which is functional, and which is able to be used on a server which serves actual users (given proper setup). When this is not the case, it is the highest priority to repair the commit such that this is the case.
- feature branches: Any other branches, which should be named according to the feature or bug they're for (the canonical example is the now-deleted `one-step-request` branch, the feature branch for one-step request) - If this name is too long, it is permissible to create an issue on [the main GitHub repository](https://github.com/za419/CadenceBot/issues/), and name the branch after it (as in `issue-23`).
  - Development on this feature should proceed on this branch, and only on this branch.
    - If this is not a reasonable requirement, it is permissible to make a 'subfeature branch': A branch named with the name of the feature branch (in whole or as an acronym) as a prefix, with a descriptive name for the component the branch is for - Examples would include `one-step-request-filters`, `osr-logging`, or `issue-11-infrastructure`.
    - Again, development of this component should be on this branch, and only on this branch. Sub-subfeature branches, while permissible, are not required: Components of this component, should they require separate branches, may be subfeature branches of the original branch
    - Subfeature branches should be merged into their feature branches as soon as their component is complete. It is permissible for them to live on after their feature branch is merged onto `dev-master`: Then, they shall be merged back into `dev-master` as soon as their component is complete.
  - These branches should be merged into `dev-master` as soon as they are in an 'operational' state
    - That is, as soon as the feature can be activated and can run on the development server (it might not work, or it might occasionally crash the bot, but it does not always crash, even when the feature is triggered), and when the feature is set to go into production (when it is deemed likely to be practical and likely to be a wanted addition to the bot).
    - The feature branch should then be deleted.
