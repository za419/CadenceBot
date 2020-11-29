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

## Prettier

[Prettier](https://prettier.io/) will be used to maintain the formatting of code files in CadenceBot - These being shell scripts (\*.sh) and Node files (\*.js). Configuration files (\*.json) are not affected by this at the moment.

While it is not necessarily required to use Prettier during development, formatting will be performed before new releases are tagged to help maintain some style consistency in the project.

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

## Release procedure

A new release is made whenever `dev-master` is merged into `master`, which is to say whenever a feature is moved from "development" or "testing" to "production". Releases should follow [Semantic versioning](https://semver.org/) (with the difference that, occasionally, I refer to releases which increment patch version as 'minor releases', those which increment minor version as 'releases' and those which increment major version as 'major releases'). Since CadenceBot does not deliver much of an API (it can be used as one, interacting with `command` by mocked messages as is done somewhat often in the bot itself, but this is not the intended use of the bot, and the specifics of what fields the mocked message must define are undocumented, must be found by inspecting the code, and are under no obligation not to change at any time), CadenceBot follows different rules for when version numbers are incremented - Semver compliance is mostly for rigidly formatted versioning which can be automatically parsed.

Version numbers are incremented as follows:

- Major numbers are incremented when the bot appears widely different - A layperson should be able to distinguish CadenceBot v1.x and CadenceBot v2.x as different programs at a glance.
  - I may break this rule later, at my own discretion, if minor numbers become unreasonably large.
- Minor numbers are incremented for significant features - Features on the scale of adding a new command.
  - Examples are [v1.1](https://github.com/za419/CadenceBot/releases/tag/v1.1) (adding `search`), [v1.3](https://github.com/za419/CadenceBot/releases/tag/v1.3.0) (adding multi-server support), and [v1.4](https://github.com/za419/CadenceBot/releases/tag/v1.4.0) (adding one-step request)
- Patch numbers are incremented for smaller features - Those on the scale of extending an existing command in a way that makes new usage entirely backwards compatible with old usage
  - Examples are [v1.3.1](https://github.com/za419/CadenceBot/releases/tag/v1.3.1) (a bugfix for a bug which made the bot unusable), or [v1.4.1](https://github.com/za419/CadenceBot/releases/tag/v1.4.1) (adding the nowplaying status)
- Beyond-patch numbers are incremented for small bugfixes which amount to quality-of-life fixes - An example might be fixing the format `search` provides results in.

The version number in `package.json` should be incremented when a feature is ready for release. The number should be incremented in compliance with the above guidelines. This change should occur in its own commit, which should include a short version description in its commit description. This commit should have a Sign-off (Signed-off-by), and should be signed with a GPG key if possible.

The commit in which `package.json` it updated is considered to be the one assigned to that version number. Therefore, that commit should be tagged in `git` with the version number (as in `v1.4.1`). This tag should be an annotated tag, with full patch notes, and signed with a GPG key if possible. This tag should then be made a release on GitHub, with the same (or equivalent) patch notes.
