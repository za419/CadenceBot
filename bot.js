var Discord = require("discord.js");
var auth = require("./auth.json");
var fetch = require("node-fetch");
var request = require("request");
var exec = require("child_process").exec;
var fs = require("fs");
var logger = require("js-logging");
var config = {};
var err;
try {
    config = require("./config.json");
} catch (e) {
    err = e;
}
var defaultConfig = require("./default-config.json");

function recursiveDefault(obj, def) {
    var keys = Object.keys(def);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (obj[key] == null) {
            obj[key] = def[key];
        } else if (obj[key] instanceof Array || def[key] instanceof Array) {
            if (obj[key] instanceof Array && def[key] instanceof Array) {
                obj[key] = obj[key].concat(def[key]);
            }
        } else if (obj[key] instanceof Object && def[key] instanceof Object) {
            recursiveDefault(obj[key], def[key]);
        }
    }
}
recursiveDefault(config, defaultConfig);

// Load bans if dynamic banning is enabled (Otherwise we should trust config)
var banErr;
if (config.enableDynamicBans) {
    try {
        var bans = require("./bans.json");
        config.bannedUsers = config.bannedUsers.concat(bans);
    } catch (e) {
        banErr = e;
    }
}

// Check if we should set node to permit insecure TLS
if (config.allowInsecure) {
    require("process").env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

if (config.padLog) {
    var longestLengthIn = function (array) {
        var max = -1;
        for (var i = 0; i < array.length; ++i) {
            if (array[i].length > max) {
                max = array[i].length;
            }
        }
        return max;
    };

    // Attempt to pad the log format so that all log entries are the same length
    // Assumptions and restrictions documented below
    var logging = config.logging;
    var string = logging.format;
    config.logging.preprocess = function (data) {
        // Uppercase the level if we're configured to
        if (config.logging.uppercaseLevel)
            data.title = data.title.toUpperCase();

        // Pad the level so its centered, surrounded by enough spaces to fit the longest level
        var longestTitle = longestLengthIn(Object.keys(logging.filters));
        if (data.title.length < longestTitle) {
            var diff = longestTitle - data.title.length;
            var leftPad = Math.floor(diff / 2);
            var rightPad = diff - leftPad;
            // Account for a misalignment in testing
            // TODO find out why this is needed
            leftPad -= 1;
            rightPad -= 1;
            data.title =
                Array(leftPad + 2).join(" ") +
                data.title +
                Array(rightPad + 2).join(" ");
        }
        // Pad the line number so it has spaces to its right until its maximum length
        var lineLength = 4; // The number of digits the line field is allocated. Currently maxes at 9999 lines
        if (data.line.length <= lineLength) {
            data.line += Array(lineLength - data.line.length + 2).join(" ");
        }
    };
}

var log = logger.colorConsole(config.logging); // Use default colors. Change if necessary

// Log config override issues if they were found
if (err) log.warning("Could not load config.json: " + err);
if (banErr) log.warning("Could not load bans.json: " + banErr);

var bot = new Discord.Client({
    token: auth.token,
    autorun: true,
});

var isPlaying = {};

var reconnectAllowedAt = {};
var reconnectTimeout = 30; // Seconds

var lastSearchedSongs = {};

// Memoization layer around album art, to avoid excessive fetches.
async function getAlbumArt(currentSong) {
    if (this.cache == null) {
        log.debug("Initializing album art cache...");
        this.cache = {};
    }

    log.debug(`Searching album art cache for '${currentSong}'`);
    if (this.cache[currentSong] != null) {
        log.debug(
            `Found cached art with length ${this.cache[currentSong].length}.`
        );
        return this.cache[currentSong];
    }

    log.debug("Cache miss. Fetching art for addition to cache.");
    const artURL = config.API.aria.prefix + config.API.aria.albumart;
    log.debug(`fetch('${artURL}')`);
    const response = await fetch(artURL);
    const text = await response.text();
    log.debug(`Received response with length ${text.length}.`);
    try {
        const art = Buffer.from(JSON.parse(text).Picture, "base64");

        // If configured to limit the size of the cache, and we're at the limit, drop an artwork to make room.
        if (config.maxCachedAlbumArts > 0) {
            log.info(
                "Album art cache has a maximum configured size. Checking for cleanup need."
            );
            while (
                Object.keys(this.cache).length >= config.maxCachedAlbumArts
            ) {
                log.debug(
                    `Cache currently has ${
                        Object.keys(this.cache).length
                    } artworks, which is at least at the limit of ${
                        config.maxCachedAlbumArts
                    }.`
                );
                const key = Object.keys(this.cache)[0];
                log.debug(`Removing artwork cached for '${key}'...`);
                delete this.cache[key];
            }
            log.info("Cache is below the size limit.");
            log.debug(
                `Current size is ${
                    Object.keys(this.cache).length
                }, configured limit is ${config.maxCachedAlbumArts}.`
            );
        }

        // Now that we know there's at least one clear slot, we can store the new art in there.
        this.cache[currentSong] = art;
        log.debug("Added art to cache");
        return art;
    } catch (err) {
        log.debug("Encountered error with parse of album art:");
        log.debug(err);
        return null;
    }
}

// This is the single audio stream which will be used for all CadenceBot listeners.
// This saves bandwidth and encoding overhead as compared to having one stream for each server.
// As an added bonus, it also keeps all CadenceBot listeners in perfect sync!
// (Seeing as Cadence streams tend to desync over time, this is useful).
const stream = bot.voice.createBroadcast();

// This variable will track our current stream status, for reporting reasons
let streamStatus = "Startup";

// This will be the path we connect to.
// By default, we shall use fallback paths set in config
// But, if configured to try to auto-fetch it, we'll grab the new path and put it here.
let streamPath =
    config.API.stream.protocol +
    "://" +
    config.API.stream.fallbackPrefix +
    config.API.stream.fallbackStream;

// This function initializes the stream.
// It is provided to allow the stream to reinitialize itself when it encounters an issue...
// Which appears to happen rather often with the broadcast.
function beginGlobalPlayback() {
    streamStatus = "Connecting...";
    try {
        log.info(`Connecting to music stream at ${streamPath}...`);
        stream.play(streamPath, {
            bitrate: config.stream.bitrate,
            volume: config.stream.volume,
            passes: config.stream.retryCount,
        });
        streamStatus = "Connected.";
    } catch (e) {
        // Rate-limit restarts due to exceptions: We would rather drop a bit of music
        // than fill the log with exceptions.
        log.error("Exception during global broadcast stream init: " + e);
        streamStatus = "Connection failed.";
        setTimeout(beginGlobalPlayback, 100);
    }
}

// If the stream path should be set automatically, try to override our streamPath from the upstream.
if (config.API.stream.automatic) {
    log.info("Attempting automatic set of steam path.");
    const url = config.API.aria.prefix + config.API.aria.listenurl;
    log.debug(`Making request to ${url}`);
    request.get({ url, form: {} }, (err, response, body) => {
        if (!err && body != null) {
            log.info("Received response:");
            log.info(body);

            try {
                const path = JSON.parse(body).ListenURL;
                streamPath = config.API.stream.protocol + "://" + path;
                log.info(`Setting path to ${streamPath} and reconnecting.`);

                // Trigger a new playback
                beginGlobalPlayback();
            } catch (error) {
                log.error("Error encountered during parse of listen URL:");
                log.error(error);
            }
        } else {
            log.error("Received null body or non-null error!");
            log.error(`body: ${body}`);
            log.error(`error: ${err}`);
            log.error(`Response status code: ${response.statusCode}`);
        }
    });
}

// Start up the stream before we initialize event handlers.
// This means that playback can begin as soon as the bot can handle a command.
beginGlobalPlayback();

// Add event handlers for the stream.
// When the stream ends, reconnect and resume it.
// (We don't ever want CadenceBot to lose audio)
stream.on("end", function () {
    log.info("Global broadcast stream ended, restarting in 15ms.");
    streamStatus = "Ended.";

    // Rate-limit end restarts less aggressively: If this is not done,
    // we tend to spam the log and our connection to the stream.
    setTimeout(beginGlobalPlayback, 15);
});

// Log errors.
stream.on("error", function (err) {
    log.error("Global broadcast stream error: " + err);
    // End should be triggered as well if this interrupts playback...
    // If this doesn't happen, add a call to beginGlobalPlayback here.
    // Status can help notice this (If the stream is dead and the status is this one)
    streamStatus = "Failed.";
});

// Log warnings.
// Keep warnings up for five minutes
stream.on("warn", function (warn) {
    log.warning("Global broadcast stream warning: " + warn);
    streamStatus = "Connected, in warning state.";
    setTimeout(() => {
        streamStatus = "Connected.";
    }, 300000);
});

// Defined later: Filters that one-step-request attempts to use to choose a song to request
// Filters are queried one at a time, in order of appearance (by iterating over the keys)
// They are stored as an associative array "name": filter, where the name will be used for logging
// Each filter is a function, accepting an array of songs (the lastSearchedSongs entry for the current channel during one-step-request), plus the request string,
//  and returning an integer (the number to pass to a mock request - one plus the index of the target song)
// If the filter cannot choose a single song to request, it may return the subset of results which pass the filter
//  The implementation should replace the array being searched with this subset
// These filters should, however, come as late as reasonable, so as to not filter out results another filter would select unless these are incorrect
// If the filter cannot choose a single song to request, but would not like to narrow the search space, it should return a falsy value (0).
// If the implementation passes all filters without selecting a result,
// It will present the remaining options to the user as if it was `search`, and have them choose a request normally (manual selection filter)
var oneStepRequestFilters;

function songFormat(song) {
    return (
        '"' +
        (song.title || song.Title) +
        '" by ' +
        (song.artist || song.Artist)
    );
}

function searchResultsFormat(songs) {
    var response = "";
    for (var i = 0; i < songs.length; ++i) {
        response += "  " + (i + 1) + ")  " + songFormat(songs[i]) + "\n";
    }
    return response;
}

function nowPlayingFormat(text) {
    var json = JSON.parse(text);
    return songFormat(json);
}

function splitOnLastLine(text, length, separator = "\n") {
    text = text.substring(0, length);
    index = text.lastIndexOf(separator);

    if (index == -1) return text;

    return text.substring(0, index);
}

function sendLongReply(message, text, length = 2000) {
    // Proactive bugfix: Make sure that length isn't above 2000 (which is where Discord caps messages)
    if (length > 2000) length = 2000;

    // Special handling for messages that don't actually need long behavior
    if (text.length <= length - message.author.id.toString().length - 5) {
        message.reply(text);
        return;
    }

    // Special handling for the first part of the message.
    var response = splitOnLastLine(
        text,
        length - message.author.id.toString().length - 5
    );
    message.reply(response);
    text = text.substring(response.length + 1);

    // If the text starts with a whitespace character, discord will strip it. This prevents that.
    if (/\s/.test(text.charAt(0))) {
        text = "_" + text.charAt(0) + "_" + text.substring(1);
    }

    while (text.length > length) {
        response = splitOnLastLine(text, length);
        message.channel.send(response);
        text = text.substring(response.length + 1);

        // If the text starts with a whitespace character, discord will strip it. This prevents that.
        if (/\s/.test(text.charAt(0))) {
            text = "_" + text.charAt(0) + "_" + text.substring(1);
        }
    }
    if (text.length > 0) message.channel.send(text);
}

function sendLongMessage(channel, text, length = 2000) {
    // Proactive bugfix: Make sure that length isn't above 2000 (which is where Discord caps messages)
    if (length > 2000) length = 2000;

    // Special handling for messages that don't actually need long behavior
    if (text.length <= length) {
        channel.send(text);
        return;
    }

    while (text.length > length) {
        var response = splitOnLastLine(text, length);
        channel.send(response);
        text = text.substring(response.length + 1);

        // If the text starts with a whitespace character, discord will strip it. This prevents that.
        if (/\s/.test(text.charAt(0))) {
            text = "_" + text.charAt(0) + "_" + text.substring(1);
        }
    }
    if (text.length > 0) channel.send(text);
}

function selectOne(array) {
    // First, 'cook' array into a flat list of strings
    // (allowing for the {option: '', weight: <n>} syntax)
    const options = array.flatMap(option => {
        // A plain string is returned intact
        if (typeof option === "string") return option;

        // Assume if we don't have a string we have an object with the above syntax.
        return new Array(option.weight).fill(option.option);
    });

    // Now choose out of the remaining options.
    return options[Math.round(Math.random() * (options.length - 1))];
}

// Does the leg work of choosing a voice channel for play to default to
// Accepts an array of Discord.js GuildChannels
function playChannelSelector(guildChannels) {
    if (!(guildChannels instanceof Array) || guildChannels.length == 0) {
        log.error(
            "Channel selector was either not given an array or was given an empty array."
        );
        log.info("Was given:\n\n" + JSON.stringify(guildChannels) + "\n\n");
        return null;
    }

    log.debug(
        "Searching through channels object:\n\n" +
            JSON.stringify(guildChannels) +
            "\n\n"
    );

    voiceChannels = guildChannels.filter(channel => channel.type == "voice");

    log.debug(
        "Narrowed channels to voice channels:\n\n" +
            JSON.stringify(voiceChannels + "\n\n")
    );

    var startsWith = false;
    var includes = false;

    for (var channel of voiceChannels) {
        log.debug("Trying channel " + channel.name);

        for (var i = 0; i < config.playAutoselectChannels.length; ++i) {
            var name = config.playAutoselectChannels[i];
            log.debug("Comparing against configured test name " + name);
            if (caselessCompare(channel.name, name)) {
                log.debug("Full match. Returning");
                return channel;
            }

            if (startsWith === false) {
                if (
                    caselessCompare(
                        channel.name.substring(0, name.length),
                        name
                    )
                ) {
                    log.debug("Prefix match. Storing for later use.");
                    startsWith = channel;
                }

                if (includes === false) {
                    if (
                        channel.name
                            .toLocaleUpperCase()
                            .includes(name.toLocaleUpperCase())
                    ) {
                        log.debug("Inclusion match. Storing for later use.");
                        includes = channel;
                    }
                }
            }
        }
    }

    if (startsWith !== false) {
        log.debug("Found a prefix match. Returning channel " + startsWith.name);
        return startsWith;
    }

    if (includes !== false) {
        log.debug(
            "Found an inclusion match. Returning channel " + includes.name
        );
        return includes;
    }

    log.debug(
        "No matches found. Returning default match (first channel): " +
            voiceChannels[0].name
    );
    return voiceChannels[0];
}

// Parses a time string (1d2h3m4s) into a number of milliseconds (93784000) according to the mapping defined by dict
// Anything with no suffix is considered as a number of milliseconds.
// The numbers must be integers - No floats are permitted.
function parseTimeString(
    str,
    dict = {
        d: 24 * 3600 * 1000,
        h: 3600 * 1000,
        m: 60 * 1000,
        s: 1000,
    }
) {
    var time = 0;
    str = str.trim();
    while (str.length > 0) {
        var index = str.search(/\D/);
        if (index < 1) {
            var count = parseInt(str);
            if (isNaN(count)) throw { errorMsg: "Not a number", problem: str };

            time += count;
            break;
        }

        var count = parseInt(str);
        if (isNaN(count)) throw { errorMsg: "Not a number", problem: str };

        var rest = str.substr(index);
        var end = rest.search(/\d/);
        var suffix;
        if (end > 0) {
            suffix = rest.substr(0, end).trim();
        } else {
            suffix = rest;
            rest = "";
        }
        if (dict.hasOwnProperty(suffix)) {
            count *= dict[suffix];
            time += count;
        } else {
            throw { errorMsg: "Unrecognized unit", problem: suffix };
        }
        str = rest.substr(end).trim();
    }
    return time;
}

// Does the inverse of the above - Convert a number of seconds into a human-readable time string (milliseconds don't matter)
function generateTimeString(seconds, secondsPrecision = 2) {
    let result = "";

    // Handle very odd errors somewhat sanely.
    if (seconds < 0) {
        return "a few minutes";
    }

    // Handle days (24*60*60=86400 seconds)
    if (seconds > 86400) {
        const days = Math.floor(seconds / 86400);
        seconds %= 86400;

        if (days == 1) {
            result += "one day, ";
        } else {
            result += days.toFixed(0) + " days, ";
        }
    }

    // Now hours (60*60=3600 seconds)
    if (seconds > 3600) {
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;

        if (hours == 1) {
            result += "one hour, ";
        } else {
            result += hours.toFixed(0) + " hours, ";
        }
    }

    // Now minutes
    if (seconds > 60) {
        const minutes = Math.floor(seconds / 60);
        seconds %= 60;

        if (minutes == 1) {
            result += "one minute, ";
        } else {
            result += minutes.toFixed(0) + " minutes, ";
        }
    }

    // Now seconds
    if (seconds == 1) {
        result += "one second";
    } else if (seconds > 0) {
        result += seconds.toFixed(secondsPrecision) + " seconds";
    } else {
        // Remove the ' ,' from the end
        result = result.substring(0, result.length - 2);
    }

    // Just in case we managed to encounter an interesting timing edge case...
    if (result == "") {
        // Let the user think things are mostly sane.
        result = "one second";
    }

    return result;
}

// Returns the UTC offset of the local timezone of the given date
// (ie UTC+5:00)
function getUTCOffset(date = new Date()) {
    var hours = Math.floor(date.getTimezoneOffset() / 60);
    var out;

    // Note: getTimezoneOffset returns the time that needs to be added to reach UTC
    // IE it's the inverse of the offset we're trying to divide out.
    // That's why the signs here are apparently flipped.
    if (hours > 0) {
        out = "UTC-";
    } else if (hours < 0) {
        out = "UTC+";
    } else {
        return "UTC";
    }

    out += hours.toString() + ":";

    var minutes = (date.getTimezoneOffset() % 60).toString();
    if (minutes.length == 1) minutes = "0" + minutes;

    out += minutes;
    return out;
}

// This function handles alias expansion for core commands.
// It should be passed the content string of the message, and it will
// return the 'canonical' (de-aliased) form of any command alias within.
function coreAliasTranslation(content) {
    log.debug("Canonicalizing message: " + content);

    // Iterate over all aliases we recognize.
    for (const alias of config.commandAliases) {
        // Skip this alias if it is disabled.
        if (alias.disabled) continue;

        // If this alias is a prefix-match...
        if (alias.prefix) {
            // And our message starts with the alias text...
            if (content.startsWith(alias.alias)) {
                // Then parse out the rest of the message after the alias and canonicalize the prefix
                log.debug(
                    "Matched prefix alias: " + JSON.stringify(alias, null, 4)
                );
                const result =
                    config.commands[alias.target] +
                    content.substring(alias.alias.length);
                log.debug("Canonicalized to " + result);
                return result;
            }
            // If the alias is not a prefix match, and the message exactly matches the alias text...
        } else if (content === alias.alias) {
            // Then return the canonicalized command.
            log.debug(
                "Matched exact-match alias: " + JSON.stringify(alias, null, 4)
            );
            return config.commands[alias.target];
        }
    }
    // If no alias matched our message, return the content untouched.
    log.debug("Message is already canonical.");
    return content;
}

// Saves bannedUsers to disk
function saveBans(bannedUsers, file = "./bans.json") {
    if (config.enableDynamicBans) {
        var str = JSON.stringify(bannedUsers, null, 4);
        fs.writeFile(file, str, e => {
            if (e) log.warning("Could not save bannedUsers to disk: " + e);
            else log.info("Saved new ban list to " + file);
            log.debug("Banlist:\n" + str);
        });
    }
}

function command(message) {
    // Check banned users.
    var removeBans = [];
    if (config.bannedUsers) {
        for (var tag of config.bannedUsers) {
            var ID = tag;
            if (tag instanceof Object) {
                ID = tag.id;
                var now = new Date().getTime();
                var start = tag.start
                    ? Date.parse(tag.start)
                    : Number.NEGATIVE_INFINITY;
                var end = tag.end
                    ? Date.parse(tag.end)
                    : Number.POSITIVE_INFINITY;
                if (isNaN(start)) start = Number.NEGATIVE_INFINITY;
                if (isNaN(end)) end = Number.POSITIVE_INFINITY;

                // Apply banning if user is within the time window [start, end]
                if (now < start) {
                    // Ban has not yet started. Skip this ban setting and check later.
                    continue;
                } else if (now > end) {
                    // Ban has ended. Note that we should remove it from configuration and continue.
                    removeBans.push(config.bannedUsers.indexOf(tag));
                    continue;
                }
            }
            if (message.author.id == ID) {
                return;
            }
        }
    }
    // Ensure removes are sorted
    removeBans.sort(function (a, b) {
        return a - b;
    });
    // Now iterate through them and remove them (indexes will be stable now that we're removing them in reverse order)
    for (var ban of removeBans) {
        config.bannedUsers.splice(ban, 1);
    }
    // If at least one ban got removed, save our ban list without the removed bans
    if (removeBans.length != 0) {
        saveBans(config.bannedUsers);
    }
    removeBans = null;

    // Make sure we have a canonical form of any aliased core commands
    const messageContent = coreAliasTranslation(message.content);

    if (messageContent === config.commands.play) {
        log.notice("Received play command.");
        if (isPlaying[message.guild.id]) {
            log.info("Already playing in server " + message.guild.name);
            message.reply("Don't you have enough Cadence already?");
        } else {
            var voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                log.warning(
                    "User " +
                        message.member.user.tag +
                        " is not in a voice channel in server " +
                        message.guild.name +
                        "."
                );
                log.warning("Performing connection to autoselected channel.");
                voiceChannel = playChannelSelector(
                    message.guild.channels.cache.array()
                );
                if (voiceChannel) {
                    log.notice("Selected channel " + voiceChannel.name + ".");
                }
            }
            if (voiceChannel) {
                log.info(
                    "Attempting to join voice channel " +
                        voiceChannel.name +
                        " in server " +
                        message.guild.name
                );

                var rAA = new Date();
                rAA.setSeconds(rAA.getSeconds() + reconnectTimeout);
                reconnectAllowedAt[voiceChannel.id] = rAA;

                isPlaying[message.guild.id] = true;
                voiceChannel
                    .join()
                    .then(connection => {
                        log.notice(
                            "Joined. Beginning playback (channel bitrate=" +
                                voiceChannel.bitrate +
                                ")."
                        );
                        const dispatch = connection.play(stream);
                        dispatch.on("end", end => {
                            log.warning(
                                "Stream ended. Playback was in server " +
                                    message.guild.name +
                                    ", channel " +
                                    voiceChannel.name
                            );
                            if (!isPlaying[message.guild.id]) return;

                            log.warning("Error was: " + end);

                            isPlaying[message.guild.id] = false;
                            if (
                                new Date() < reconnectAllowedAt[voiceChannel.id]
                            ) {
                                log.notice(
                                    "Before reconnect timer for channel " +
                                        message.guild.name +
                                        ":" +
                                        voiceChannel.name +
                                        ". Disconnecting"
                                );
                                message.reply(
                                    "Since I've already tried to reconnect in the last " +
                                        reconnectTimeout +
                                        " seconds, I won't try again.\n\nRun \"" +
                                        config.commands.play +
                                        '" if you want me to try again.'
                                );
                                voiceChannel.leave();
                                return;
                            }
                            log.debug(
                                "Was allowed to reconnect to channel with id " +
                                    voiceChannel.id +
                                    " before " +
                                    reconnectAllowedAt[voiceChannel.id]
                            );

                            message.reply(
                                "Hm, I seem to have lost Cadence.\n\nLet me see if I can get it back for you."
                            );

                            // Issue a spurious nowplaying to get it in the log.
                            // Should remove this before sending to prod, probably
                            var msg = {};
                            msg.content = config.commands.nowplaying;
                            msg.reply = function (s) {
                                log.debug("Sent message: " + s);
                            };
                            msg.channel = {
                                send: d => {
                                    log.debug(
                                        `Sent additional data with length ${d.length}.`
                                    );
                                },
                            };
                            log.notice(
                                "Sending false nowplaying command in server " +
                                    message.guild.name +
                                    "...\n"
                            );
                            command(msg);

                            // Now, we want to reissue ourselves a play command
                            //  equivalent to the original one, to begin playback on
                            //  the same channel.
                            // At a glance, that means reissuing the original message.
                            // However, if the user has since disconnected...
                            //  ... We'll generate a spurious error.
                            // The play code wants to connect to the user's channel:
                            // It doesn't know what channel to connect to if the user
                            //  isn't connected.
                            // We, however, do.
                            // So, if there isn't a VC, we need to mock it.
                            // At the same time, the user could be in the wrong VC.
                            // That would make us connect to the incorrect channel.
                            // Basically, we just generally want to mock the VC.
                            // That's why the naïve implementation (command(message))
                            //  isn't the one we use here.
                            msg = {};
                            msg.content = messageContent;
                            msg.reply = function (r) {
                                message.reply(r);
                            };
                            msg.member = {};
                            msg.member.voice = { channel: voiceChannel };
                            msg.guild = message.guild;
                            log.notice(
                                "Sending mocked play command in server " +
                                    message.guild.name +
                                    "...\n"
                            );
                            command(msg);
                        });
                    })
                    .catch(err => log.critical(err));
            } else {
                log.error(
                    "User " +
                        message.member.user.tag +
                        " is not in a voice channel in server " +
                        message.guild.name +
                        "."
                );
                message.reply(
                    "You need to be in a voice channel for me to play Cadence in it, この馬鹿!"
                );
            }
        }
    } else if (messageContent === config.commands.stop) {
        log.notice("Received stop command.");
        if (isPlaying[message.guild.id]) {
            var voiceChannel = message.member.voice.channel;
            log.info(
                "Attempting to disconnect from channel in " +
                    message.guild.name +
                    "."
            );
            if (voiceChannel) {
                isPlaying[message.guild.id] = false;
                voiceChannel.leave();
                log.notice(
                    "Disconnected from channel " + voiceChannel.name + "."
                );
            } else {
                log.notice("User not in a voice channel.");
                message.reply(
                    "I dunno, I'd prefer if someone in the channel told me to stop."
                );
            }
        } else {
            log.error("Not currently playing.");
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    } else if (messageContent === config.commands.help) {
        log.notice("Received help command.");
        var help = "";
        help =
            "I have " +
            Object.keys(config.commands).length +
            " commands. They are:\n";
        for (var key in config.commands) {
            if (config.commands.hasOwnProperty(key)) {
                var paramList = "";
                if (config.commandDescriptions[key].parameters) {
                    paramList = config.commandDescriptions[key].parameters
                        .map(x => "<" + x + ">")
                        .join(" ");
                }
                help +=
                    '    "' +
                    config.commands[key] +
                    paramList +
                    '" - ' +
                    config.commandDescriptions[key].description +
                    "\n";
            }
        }
        message.reply(help);
        log.notice("Issued help message.");
    } else if (messageContent === config.commands.nowplaying) {
        log.notice("Received nowplaying command.");
        const url = config.API.aria.prefix + config.API.aria.nowplaying;
        log.info("Issuing fetch request to " + url);
        fetch(url).then(async response => {
            log.info("Received response.");
            const text = await response.text();
            log.info("Response text:\n\n" + text + "\n\n");
            log.info("Parsing response...");
            song = nowPlayingFormat(text);
            bot.user.setPresence({ game: { name: song } });
            log.notice("Parse complete: Now playing " + song);
            message.reply("Now playing: " + song);

            // If we have saved album art, attach it
            const albumArt = await getAlbumArt(song);
            if (albumArt) {
                log.info("Found existing album art.");
                log.debug(`Stored album art is ${albumArt.length} bytes long`);
                const attachment = new Discord.MessageAttachment(
                    albumArt,
                    "AlbumArt.png"
                );
                message.channel.send(attachment);
            } else {
                log.info("No available album art.");
            }
        });
    } else if (messageContent.startsWith(config.commands.search)) {
        log.notice(
            "Received search command in text channel " +
                message.channel.name +
                ", server " +
                message.guild.name +
                "."
        );
        log.debug('Received message was "' + message.content + '"');
        log.notice(
            'Canonicalized form of received message was "' +
                messageContent +
                '"'
        );
        const url = config.API.aria.prefix + config.API.aria.search;
        var data = {
            Search: messageContent.substring(config.commands.search.length),
        };

        log.info("Making a request to " + url);
        log.debug("data.Search=" + data.Search);
        var post = {
            url,
            body: data,
            json: true,
            followAllRedirects: true,
            followOriginalHttpMethod: true,
            gzip: true,
        };
        request.post(post, function (err, response, body) {
            log.info("Received response.");
            if (!err && (!response || response.statusCode == 200)) {
                log.info(
                    "No error, and either no status code or status code 200."
                );
                log.debug("Received body:\n\n" + JSON.stringify(body) + "\n\n");
                if (body == null || body.length == 0) {
                    log.info("No results.");
                    message.reply(
                        'Cadence has no results for "' + data.Search + '".'
                    );
                } else {
                    log.info(body.length + " result(s).");
                    lastSearchedSongs[message.channel.id] = body;
                    var response = "Cadence returned:\n";
                    response += searchResultsFormat(body);
                    log.debug("Issuing response:\n\n" + response + "\n\n");
                    sendLongReply(message, response);
                }
            } else {
                log.error(
                    "Response is erroneous. Returned body:\n\n" + body + "\n\n"
                );
                if (response) {
                    log.error("Returned status code: " + response.statusCode);
                    message.reply(
                        "Error " +
                            response.statusCode +
                            ". Aria says:\n\n" +
                            body
                    );
                } else {
                    log.error("No status code.");
                    message.reply("Error. Aria says:\n\n" + body);
                }
            }
        });
    } else if (messageContent.startsWith(config.commands.request)) {
        log.notice(
            "Received song request in text channel " +
                message.channel.name +
                ", server " +
                message.guild.name +
                "."
        );
        log.debug('Received message was "' + message.content + '"');
        log.notice(
            'Canonicalized form of received message was "' +
                messageContent +
                '"'
        );
        log.debug(
            "Last searched songs:\n\n" +
                JSON.stringify(lastSearchedSongs[message.channel.id]) +
                "\n\n"
        );
        lastSearchedSongs[message.channel.id] =
            lastSearchedSongs[message.channel.id] || []; // Default to empty array to avoid crash

        const url = config.API.aria.prefix + config.API.aria.request;
        var song =
            parseInt(messageContent.substring(config.commands.request.length)) -
            1;
        if (isNaN(song)) {
            // Try to conduct a search, to see if we can perform a one-step request
            song = messageContent.substring(config.commands.request.length);
            log.warning(
                song + " is not a number. Attempting one-step request."
            );

            // First, perform a mocked search, backing up lastSearchedSongs and saving the result string
            var response = false;
            var msg = {};
            msg.channel = message.channel;
            msg.guild = message.guild;
            msg.client = message.client;
            msg.author = { tag: message.author.tag, id: message.author.id };
            msg.reply = function (r) {
                log.notice("Mocked search returned:\n\n");
                log.notice(r + "\n\n");
                // Make response false if we have no results, to avoid bugs later
                response = !r.includes("no results");
            };
            msg.content = config.commands.search + song;
            lSS = lastSearchedSongs[message.channel.id].slice();

            log.notice(
                "Issuing mocked search command in server " +
                    message.guild.name +
                    "...\n"
            );
            command(msg);

            // Delay one second to allow search to complete
            setTimeout(function () {
                // Now, if any filter can select one song out of lastSearchedSongs, request it.
                var request = 0;
                var keys = Object.keys(oneStepRequestFilters);
                var key;
                for (var i = 0; i < keys.length; ++i) {
                    request = oneStepRequestFilters[keys[i]](
                        lastSearchedSongs[message.channel.id],
                        song
                    );
                    if (request) {
                        if (Array.isArray(request)) {
                            if (request.length > 0) {
                                // Prevent narrowing to empty results
                                log.notice(
                                    keys[i] +
                                        " elected to narrow from " +
                                        lastSearchedSongs[message.channel.id]
                                            .length +
                                        " to " +
                                        request.length
                                );
                                log.debug(
                                    "Previous values:\n\n" +
                                        JSON.stringify(
                                            lastSearchedSongs[
                                                message.channel.id
                                            ]
                                        ) +
                                        "\n\n"
                                );

                                lastSearchedSongs[message.channel.id] = request;

                                log.debug(
                                    "Narrowed values:\n\n" +
                                        JSON.stringify(request) +
                                        "\n\n"
                                );
                                request = 0;
                            }
                        } else {
                            key = keys[i];
                            log.notice(key + " chose song " + request);
                            break;
                        }
                    }
                }
                if (request > 0) {
                    // Generate a mocked request call, now requesting the filter's result
                    var msg = {};
                    msg.channel = message.channel;
                    msg.guild = message.guild;
                    msg.author = {
                        tag: message.author.tag,
                        id: message.author.id,
                    };
                    msg.reply = function (r) {
                        // Custom message for successful requests
                        if (
                            r.includes("received") &&
                            !r.includes("Aria says")
                        ) {
                            var song =
                                lastSearchedSongs[message.channel.id][
                                    request - 1
                                ];
                            message.reply(
                                "Requested " + songFormat(song) + "."
                            );
                        } else {
                            message.reply(r);
                        }
                    };
                    msg.content = config.commands.request + request;

                    log.notice(
                        "Issuing mocked request command in server " +
                            message.guild.name +
                            "...\n"
                    );
                    command(msg);

                    // Now that the song has been requested, log our success in one-step request
                    log.notice(
                        "Successfully performed one-step request for: " +
                            song +
                            ' using the "' +
                            key +
                            '" filter.'
                    );

                    // And restore lastSearchedSongs after a short delay (for the request to actually succeed)
                    setTimeout(function () {
                        log.info("Restoring lastSearchedSongs...");
                        lastSearchedSongs[message.channel.id] = lSS;
                        log.debug(
                            "lastSearchedSongs restored to:\n\n" +
                                JSON.stringify(
                                    lastSearchedSongs[message.channel.id]
                                ) +
                                "\n\n"
                        );
                    }, config.roundtripDelayMs);
                }
                // For the moment, we don't know how to perform one-step request for this set of responses
                else {
                    log.error("Could not perform one-step request for " + song);
                    if (
                        lastSearchedSongs[message.channel.id].length == 0 ||
                        !response
                    ) {
                        // For no results, assume the user meant to perform a normal (two-step) request
                        log.info(
                            "Zero length results (assuming inadvertent request)"
                        );

                        // Message recommended by Ken Ellorando
                        message.channel.send(
                            "Sorry, <@" +
                                message.author.id +
                                ">, I couldn't find any matching songs to fit your request '" +
                                song +
                                "'."
                        );

                        // Since lastSearchedSongs is now empty, restore it.
                        lastSearchedSongs[message.channel.id] = lSS;
                    } else {
                        string =
                            "I'm sorry, I couldn't discriminate between " +
                            lastSearchedSongs[message.channel.id].length +
                            " songs.\n\n" +
                            'Please run "' +
                            config.commands.request +
                            "\" with the number of the song you'd like to request.\n\n" +
                            searchResultsFormat(
                                lastSearchedSongs[message.channel.id]
                            );
                        log.debug("Issuing response:\n\n" + string + "\n\n");
                        sendLongReply(message, string);
                        // Since we instruct the user to use lastSearchedSongs, we overwrite the old copy.
                    }
                }
            }, config.roundtripDelayMs);
            return;
        }
        if (lastSearchedSongs[message.channel.id].length == 0) {
            log.error("No stored results.");
            message.reply(
                "Please search for your songs before requesting them."
            );
            return;
        }
        if (song < 0) {
            log.error("Non-positive input.");
            message.reply(
                "Sorry, I cannot request a song with a non-positive number."
            );
            return;
        }
        log.notice("Prepared to construct request for song at index " + song);
        if (song >= lastSearchedSongs[message.channel.id].length) {
            log.error("Index out-of-bounds.");
            message.reply(
                "Sorry, I can't request song number " +
                    (song + 1) +
                    " out of a set of " +
                    lastSearchedSongs[message.channel.id].length +
                    "."
            );
            return;
        }

        var data = {
            ID: lastSearchedSongs[message.channel.id][song].ID.toString(),
        };
        // If we've configured an API key, add it to our data package
        // (For now, request is the only command which requires or benefits from the inclusion of an API key)
        if (config.API.aria.key) {
            data.Token = config.API.aria.key;
        }

        // If support is enabled, set the tag to the user's Discord tag
        if (config.enableRequestTags) {
            if (config.useGuildTagsForRequests) data.tag = message.guild.id;
            else data.tag = message.author.tag;
        }

        var post = {
            url,
            body: JSON.stringify(data),
            followAllRedirects: true,
            followOriginalHttpMethod: true,
            gzip: true,
        };

        log.info("Making a request to " + url);
        log.debug("body=" + post.body);
        request.post(post, function (err, response, body) {
            log.info("Received response.");
            if (
                !err &&
                (!response ||
                    response.statusCode == 200 ||
                    response.statusCode == 202)
            ) {
                log.notice("Request received. Clearing lastSearchedSongs...");
                log.info("Aria says: " + body);
                message.reply("Your request has been received.");
                lastSearchedSongs[message.channel.id] = [];
            } else if (response) {
                if (response.statusCode == 429) {
                    log.warning(
                        "Request failed with status code " + response.statusCode
                    );

                    // Grab the report of how much time is left from the response, and parse it into a string
                    try {
                        const left = generateTimeString(
                            JSON.parse(body).TimeRemaining
                        );

                        message.reply(
                            "Sorry, Cadence limits how quickly you can make requests. You may request again in " +
                                left +
                                "."
                        );
                        log.notice("Issued rate limiting message.");
                    } catch (e) {
                        log.info(
                            "Unable to send normal ratelimiting message due to error, falling back to generic reply"
                        );
                        log.error(`Received error ${e}`);
                        message.reply(
                            "Sorry, Cadence limits how often you can make requests, please try again later."
                        );
                    }
                } else {
                    log.error(
                        "Request failed with status code " + response.statusCode
                    );
                    log.error("Aria says: " + body);
                    message.reply(
                        "Error " +
                            response.statusCode +
                            ". Aria says:\n\n" +
                            body
                    );
                }
            } else {
                log.error("Request failed without status code.");
                log.error("Aria says: " + body);
                message.reply("Error. Aria says:\n\n" + body);
            }
        });
    } else if (messageContent === config.commands.library) {
        log.notice(
            "Received library listing command in text channel " +
                message.channel.name +
                ", server " +
                message.guild.name +
                "."
        );
        const url = config.API.aria.prefix + config.API.aria.library;

        log.info("Making a request to " + url);
        request.get({ url, form: {} }, function (err, response, body) {
            log.info("Received response.");
            if (!err && (!response || response.statusCode == 200)) {
                log.info(
                    "No error, and either no status code or status code 200."
                );
                log.debug("Received body:\n\n" + body + "\n\n");
                var songs = JSON.parse(body);
                if (songs.length == 0) {
                    log.warning("Empty library results.");
                    message.reply("Cadence returned no library contents.");
                } else {
                    log.info(songs.length + " result(s).");

                    var response = "The Cadence library contains:\n";
                    response += searchResultsFormat(songs);
                    log.debug("Issuing response:\n\n" + response + "\n\n");
                    sendLongReply(message, response);

                    // ARIA's library API only sends {artist, title} pairs.
                    // CadenceBot offers request-from-library...
                    // Which means we need to add IDs into the data before it goes into lastSearchedSongs.
                    // Luckily, we know that Cadence orders the library in ascending order of ID
                    // (as a consequence of how both are populated)
                    // and that ID starts at 1.
                    for (var i = 0; i < songs.length; ++i) {
                        // Don't overwrite the existing ID if it exists
                        // (this protects against API changes in the future)
                        if (songs[i].ID == undefined) songs[i].ID = i + 1;
                    }

                    lastSearchedSongs[message.channel.id] = songs;
                }
            } else {
                log.error(
                    "Response is erroneous. Returned body:\n\n" + body + "\n\n"
                );
                if (response) {
                    log.error("Returned status code: " + response.statusCode);
                    message.reply(
                        "Error " +
                            response.statusCode +
                            ". Aria says:\n\n" +
                            body
                    );
                } else {
                    log.error("No status code.");
                    message.reply("Error. Aria says:\n\n" + body);
                }
            }
        });
    } else if (message.content == config.commands.status) {
        log.notice(
            "Received server status command in text channel " +
                message.channel.name +
                ", server " +
                message.guild.name +
                "."
        );

        let status = "CadenceBot: Active\n";
        if (stream.dispatcher) {
            log.info("Stream appears to be valid.");
            const uptime = generateTimeString(
                stream.dispatcher.totalStreamTime / 1000
            );
            status +=
                "Time since last stream reconnect: " +
                uptime[0].toUpperCase() +
                uptime.slice(1) +
                "\n";

            // If we've dropped more than one frame (20ms) of audio, report an unhealthy stream
            let streamHealth = "";
            if (
                stream.dispatcher.streamTime <
                stream.dispatcher.totalStreamTime - 20
            ) {
                log.warning(
                    "Stream health below 100%! Total stream time: " +
                        stream.dispatcher.totalStreamTime +
                        "ms. Healthy stream time: " +
                        stream.dispatcher.streamTime +
                        "ms."
                );
                streamHealth =
                    (
                        100 *
                        (stream.dispatcher.streamTime /
                            stream.dispatcher.totalStreamTime)
                    ).toFixed(2) + "%";
            } else {
                streamHealth = "100%";
            }
            status +=
                "Stream health since last reconnect: " + streamHealth + "\n";

            status += "Stream status: " + streamStatus + "\n";
        } else if (streamStatus == "Connected.") {
            log.warning(
                "Stream is in an invalid state (null dispatcher, no error state)! Attempting reconnect."
            );
            status +=
                "Stream status: Disconnected (automatic reconnect failed - Will retry in 3 seconds).\n";
            setTimeout(beginGlobalPlayback, 3000);
        } else {
            log.notice(
                "Stream is in pre-detected exception condition (See above entries)."
            );
            status += "Stream status: " + streamStatus + "\n";
        }
        log.info("Current server status:\n" + status);
        message.reply(status);
    }
    if (messageContent === config.commands.history) {
        log.notice(
            "Received song history command in text channel " +
                message.channel.name +
                ", server " +
                message.guild.name +
                "."
        );
        const url = config.API.aria.prefix + config.API.aria.history;

        log.info("Making a request to " + url);
        request.get({ url, form: {} }, (err, response, body) => {
            if (!err && body != null) {
                log.info("Request succeeded.");
                log.debug("Received body:");
                log.debug(body);
                let history;
                if ((body = "" || (history = JSON.parse(body)).length === 0)) {
                    log.info("Results are empty. Replying appropriately.");
                    message.reply("Cadence has no song history at the moment.");
                } else {
                    log.info(
                        `Results are nonempty, and contain ${history.length} songs. Formatting reply.`
                    );
                    let response =
                        "Cadence has recently played the following songs:\n";
                    response += searchResultsFormat(history);

                    // I'm not sure history will ever be long enough to actually merit the overhead of sendLongReply, as small as it is.
                    // The API spec says it will return at most 10 songs, while with "normal" metadata I've observed it takes about 50.
                    // However, bad things will happen if we don't use it and end up needing it.
                    // Let's program defensively and not assume shenangigans don't happen.
                    sendLongReply(message, response);
                    log.info("Sent reply.");
                }
            } else {
                log.error("Received null body or non-null error!");
                log.error(`body: ${body}`);
                log.error(`error: ${err}`);
                log.error(`Response status code: ${response.statusCode}`);
                message.reply(
                    `Error ${response.statusCode}. Please try again later.`
                );
            }
        });
    } else if (
        config.enableLogMailing &&
        message.content == config.logMailCommand
    ) {
        if (message.author.id != config.administrator) {
            log.warning(
                "Maillog command received from non-admin user with ID " +
                    message.author.id +
                    ", tag " +
                    message.author.tag
            );
            message.channel.send(
                "<@!" +
                    message.author.id +
                    "> is not the CadenceBot administrator for this server. This incident will be reported."
            );
            return;
        }
        log.debug("Ordered to mail a log file");
        exec("./maillog.sh", { shell: "/bin/bash", cwd: "." });
        log.debug("Script executed.");
    } else if (
        config.enableConfigEcho &&
        message.content == config.configEchoCommand
    ) {
        if (message.author.id != config.administrator) {
            log.warning(
                "ConfigEcho command received from non-admin user with ID " +
                    message.author.id +
                    ", tag " +
                    message.author.tag
            );
            message.channel.send(
                "<@!" +
                    message.author.id +
                    "> is not the CadenceBot administrator for this server. This incident will be reported."
            );
            return;
        }
        log.debug("Ordered to echo config back to channel.");
        sendLongReply(message, JSON.stringify(config, null, 4));
        log.debug("Sent JSONified config.");
    } else if (
        config.enableDynamicBans &&
        message.content.startsWith(config.dynamicBanPrefix)
    ) {
        if (message.author.id != config.administrator) {
            log.warning(
                "Dynamic ban command received from non-admin user with ID " +
                    message.author.id +
                    ", tag " +
                    message.author.tag
            );
            message.channel.send(
                "<@!" +
                    message.author.id +
                    "> is not the CadenceBot administrator for this server. This incident will be reported."
            );
            return;
        } else if (message.mentions.users.size == 0) {
            log.debug("Zero mentions.");
            message.reply(
                "I'm sorry, I don't know who you want me to ban - Could you ask me again and mention them?"
            );
            return;
        } else {
            var target = message.mentions.users.first();
            var ban = {};
            ban.id = target.id;
            var duration = config.defaultDynamicBanMs;

            // Check if the command continues after the mention.
            // Strip mentions and non-internal whitespace.
            var content = message.content.substring(
                config.dynamicBanPrefix.length
            );
            var mentions = new RegExp("\\\\?<([^>]+)>", "g");
            content = content.replace(mentions, "").trim();

            // If there is any remaining character, assume that it's a time string
            if (content.length > 0) {
                try {
                    duration = parseTimeString(content);
                } catch (e) {
                    message.reply(
                        "I'm sorry, I couldn't understand how long you wanted me to ban " +
                            target.toString() +
                            " for.\n(" +
                            e.errorMsg +
                            ": " +
                            e.problem +
                            ")"
                    );
                    return;
                }
            }

            if (duration > 0) {
                var time = new Date().getTime();
                time += duration;
                time = new Date(time);
                ban.end = time.toLocaleString(config.locale);
                var response;
                if (process.env.TZ) {
                    response =
                        "I will ignore " +
                        target.toString() +
                        " until " +
                        ban.end +
                        " (" +
                        process.env.TZ +
                        ")";
                    ban.end = ban.end + " " + getUTCOffset(time);
                } else {
                    ban.end = ban.end + " " + getUTCOffset(time);
                    response =
                        "I will ignore " +
                        target.toString() +
                        " until " +
                        ban.end;
                }
                message.reply(response);
            } else {
                ban = ban.id;
                message.reply(
                    "I will ignore " +
                        target.toString() +
                        " until someone unbans them."
                );
            }
            config.bannedUsers.push(ban);
            saveBans(config.bannedUsers);
        }
    } else if (
        config.enableDynamicBans &&
        message.content.startsWith(config.dynamicUnbanPrefix)
    ) {
        if (message.author.id != config.administrator) {
            log.warning(
                "Dynamic unban command received from non-admin user with ID " +
                    message.author.id +
                    ", tag " +
                    message.author.tag
            );
            message.channel.send(
                "<@!" +
                    message.author.id +
                    "> is not the CadenceBot administrator for this server. This incident will be reported."
            );
            return;
        } else if (message.mentions.users.size == 0) {
            log.debug("Zero mentions.");
            message.reply(
                "I'm sorry, I don't know who you want me to un-ban - Could you ask me again and mention them?"
            );
            return;
        } else {
            var target = message.mentions.users.first();
            config.bannedUsers = config.bannedUsers.filter(ban => {
                ban instanceof Object ? ban.id != target.id : ban != target.id;
            });
            saveBans(config.bannedUsers);
            message.reply(
                "I've removed any bans for " +
                    target.toString() +
                    ", and will now listen to their commands again."
            );
        }
    }
    // If none of those, check custom commands
    else {
        log.debug("Checking custom commands.");
        // equalTo check is easy
        if (config.customCommands.equalTo.hasOwnProperty(message.content)) {
            let customCommand = config.customCommands.equalTo[message.content];
            if (!customCommand.disabled && customCommand.alias != null) {
                if (
                    config.customCommands.equalTo.hasOwnProperty(
                        customCommand.alias
                    )
                ) {
                    customCommand =
                        config.customCommands.equalTo[customCommand.alias];
                } else {
                    log.warning(
                        "EqualTo custom command " +
                            message.content +
                            " aliases " +
                            customCommand.alias +
                            ", which does not exist."
                    );
                    return;
                }
            }

            if (!customCommand.disabled) {
                log.info(
                    "Command " +
                        message.content +
                        " matched an equalTo custom command."
                );
                // Either random or response must exist: Prefer random if both exist
                if (customCommand.random) {
                    sendLongMessage(
                        message.channel,
                        selectOne(customCommand.random)
                    );
                } else {
                    sendLongMessage(message.channel, customCommand.response);
                }
            }
        } else {
            // startsWith and targeted are harder.
            // First, the escaping function.
            var format = function (str, chr, replace) {
                // Escape chr so no regex funny business can happen
                chr = chr.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
                var re = new RegExp("[^%]?%" + chr, "g");
                return str
                    .replace(re, s => (s[0] == "%" ? "" : s[0]) + replace)
                    .replace("%%" + chr, "%" + chr);
            };

            // Now, process targeted custom sequences
            for (var i in Object.keys(config.customCommands.targeted)) {
                var key = Object.keys(config.customCommands.targeted)[i];

                if (message.content.startsWith(key)) {
                    let customCommand = config.customCommands.targeted[key];

                    log.info(
                        "Command " +
                            message.content +
                            " matched targeted custom command " +
                            key
                    );

                    if (
                        !customCommand.disabled &&
                        customCommand.alias != null
                    ) {
                        if (
                            config.customCommands.targeted.hasOwnProperty(
                                customCommand.alias
                            )
                        ) {
                            customCommand =
                                config.customCommands.targeted[
                                    customCommand.alias
                                ];
                        } else {
                            log.warning(
                                "Targeted custom command " +
                                    message.content +
                                    " aliases " +
                                    customCommand.alias +
                                    ", which does not exist."
                            );
                            return;
                        }
                    }

                    // If the resolved command is disabled, return
                    if (customCommand.disabled) return;

                    var output;
                    // Either random or format must be present. Prefer random if both exist.
                    if (customCommand.random) {
                        output = selectOne(customCommand.random);
                    } else {
                        output = customCommand.format;
                    }

                    // Make sure we have a mention if we need one
                    if (customCommand.replyOnly) {
                        if (customCommand.continues) {
                            // We need to format in some content
                            var content = message.content.substring(key.length);
                            // Format content string into the message
                            content = format(output, "s", content);
                            // Collapse spaces and send
                            content = content.replace(
                                new RegExp("  +", "g"),
                                " "
                            );
                            sendLongReply(message, content);
                        } else {
                            // Just return the format string
                            sendLongReply(message, output);
                        }
                        return;
                    } else if (message.mentions.users.size == 0) {
                        log.debug("Zero mentions.");
                        sendLongReply(
                            message,
                            "I'm sorry, I don't know who you want me to direct that to - Could you ask me again and mention them?"
                        );
                        return;
                    } else {
                        var target = message.mentions.users.first();
                        log.debug("Sent reply to " + target.tag);

                        // Reply with user mention
                        var mentioned = format(output, "u", target.toString());

                        // If the format wants content added, strip mentions and add the content.
                        // Strip multiple spaces so that tag artifacts aren't left behind
                        // This might look weird if the mention is in the middle. Don't use patterns that encourage that.
                        if (customCommand.continues) {
                            // Strip mentions
                            var content = message.content.substring(key.length);
                            var mentions = new RegExp("\\\\?<([^>]+)>", "g");
                            content = content.replace(mentions, "");

                            // Now format that content string into the message.
                            content = format(mentioned, "s", content);
                            // Now collapse multiple spaces and send
                            content = content.replace(
                                new RegExp("  +", "g"),
                                " "
                            );
                            sendLongMessage(message.channel, content);
                        } else {
                            // Just send the mentioned reply
                            sendLongMessage(message.channel, mentioned);
                        }
                        return;
                    }
                }
            }

            // Now, multitargeteds
            for (var i in Object.keys(config.customCommands.multitargeted)) {
                var key = Object.keys(config.customCommands.multitargeted)[i];

                if (message.content.startsWith(key)) {
                    let customCommand =
                        config.customCommands.multitargeted[key];

                    log.info(
                        "Command " +
                            message.content +
                            " matched multitargeted custom command " +
                            key
                    );

                    if (
                        !customCommand.disabled &&
                        customCommand.alias != null
                    ) {
                        if (
                            config.customCommands.multitargeted.hasOwnProperty(
                                customCommand.alias
                            )
                        ) {
                            customCommand =
                                config.customCommands.multitargeted[
                                    customCommand.alias
                                ];
                        } else {
                            log.warning(
                                "Multitargeted custom command " +
                                    message.content +
                                    " aliases " +
                                    customCommand.alias +
                                    ", which does not exist."
                            );
                            return;
                        }
                    }

                    // If the resolved command is disabled, return
                    if (customCommand.disabled) return;

                    if (customCommand.totalCount < 0) {
                        log.warning(
                            "Could not perform mentioning: count " +
                                customCommand.totalCount +
                                "<0. Skipping."
                        );
                        continue;
                    }

                    // Parse out the mentions.
                    var phrase = message.content.substring(key.length);
                    var remaining = customCommand.totalCount;
                    var remainingFormat = customCommand.parseFormat;
                    var mentions = {};
                    while (remaining > 0) {
                        var index = remainingFormat.indexOf("%u");
                        if (
                            index == -1 ||
                            index + 2 >= remainingFormat.length
                        ) {
                            log.error(
                                "parseFormat " +
                                    customCommand.parseFormat +
                                    " is malformed: " +
                                    remaining +
                                    " mentions should remain."
                            );
                            continue;
                        }
                        if (index >= phrase.length) {
                            log.warning(
                                "Message is malformed. Remaining user input: " +
                                    phrase +
                                    ", remaining format string: " +
                                    remainingFormat
                            );
                            continue;
                        }
                        var idx = parseInt(remainingFormat[index + 2]);
                        phrase = phrase.substring(index);
                        remainingFormat = remainingFormat.substring(
                            index + 2 + idx.toString().length
                        );
                        index = phrase.indexOf(" ");
                        if (index == -1) {
                            mentions[idx] = phrase;
                            break;
                        } else {
                            mentions[idx] = phrase.substring(0, index);
                        }
                        phrase = phrase.substring(index);
                        --remaining;
                    }

                    // Now, format mentions into the output string
                    // Either random or format must exist. If both exist, prefer random.
                    if (customCommand.random) {
                        phrase = selectOne(customCommand.random);
                    } else {
                        phrase = customCommand.format;
                    }
                    for (var i in mentions) {
                        phrase = format(phrase, "u" + i, mentions[i]);
                    }

                    // Format in any author references
                    phrase = format(phrase, "a", message.author.toString());

                    // And send out the message.
                    sendLongMessage(message.channel, phrase);
                    return;
                }
            }

            // Finally, the startsWith set
            for (var i in Object.keys(config.customCommands.startsWith)) {
                var key = Object.keys(config.customCommands.startsWith)[i];

                if (message.content.startsWith(key)) {
                    let customCommand = config.customCommands.startsWith[key];

                    log.info(
                        "Command " +
                            message.content +
                            " matched startsWith custom command " +
                            key
                    );

                    if (
                        !customCommand.disabled &&
                        customCommand.alias != null
                    ) {
                        if (
                            config.customCommands.startsWith.hasOwnProperty(
                                customCommand.alias
                            )
                        ) {
                            customCommand =
                                config.customCommands.startsWith[
                                    customCommand.alias
                                ];
                        } else {
                            log.warning(
                                "StartsWith custom command " +
                                    message.content +
                                    " aliases " +
                                    customCommand.alias +
                                    ", which does not exist."
                            );
                            return;
                        }
                    }

                    // If the resolved command is disabled, return
                    if (customCommand.disabled) return;

                    var output;
                    // Either random or format must be set. Prefer random if both are present
                    if (customCommand.random) {
                        output = selectOne(customCommand.random);
                    } else {
                        output = customCommand.format;
                    }
                    sendLongMessage(
                        message.channel,
                        format(
                            output,
                            "s",
                            message.content.substring(key.length)
                        )
                    );
                    return;
                }
            }
            log.debug("Not a custom command.");
        }
    }
}

bot.on("message", message => {
    command(message);
});

bot.on("guildCreate", guild => {
    isPlaying[guild.id] = false;
});

function updatePresence() {
    log.debug("Setting status message...");

    // Allow disable of presence feature
    // (also preventing crashes from bad interval settings
    if (config.statusUpdateIntervalMs < 0) {
        log.info(
            "Status update interval set to " +
                config.statusUpdateIntervalMs +
                ". Setting disabled-update message."
        );
        bot.user.setPresence({ game: { name: "Cadence Radio" } });
        return;
    }

    log.debug("Fetching nowplaying information...");
    const URL = config.API.aria.prefix + config.API.aria.nowplaying;
    log.debug(`fetch('${URL}')`);
    fetch(URL).then(response => {
        response.text().then(text => {
            log.debug(`Received response:\n\n${text}\n\n`);
            song = nowPlayingFormat(text);
            log.debug("Now playing:\n\n" + song + "\n\n");
            bot.user.setPresence({
                status: "online",
                afk: false,
                activity: {
                    name: song,
                },
            });
        });
    });

    log.debug("Set timeout to be called again");
    bot.setTimeout(updatePresence, config.statusUpdateIntervalMs);
}

bot.on("ready", updatePresence);

// Log unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
    log.error("Error - Unhandled promise rejection: " + reason);
});

// Returns whether the two string parameters are the same-ish
function caselessCompare(a, b) {
    a = "" + a;
    b = "" + b;
    return !a.localeCompare(b, "en-US", {
        usage: "search",
        sensitivity: "base",
        ignorePunctuation: "true",
    });
}

oneStepRequestFilters = {
    "trivial-filter": function (songs) {
        if (songs.length == 1) return 1;
        else return 0;
    },
    "title-filter": function (songs, request) {
        var result = 0;
        for (var i = 0; i < songs.length; ++i) {
            if (caselessCompare(songs[i].Title, request)) {
                if (result) {
                    // Non-unique result
                    return 0;
                }
                result = i + 1;
            }
        }
        return result;
    },
    "artist-filter": function (songs, request) {
        var result = 0;
        for (var i = 0; i < songs.length; ++i) {
            if (caselessCompare(songs[i].Artist, request)) {
                if (result) {
                    // Non-unique result
                    return 0;
                }
                result = i + 1;
            }
        }
        return result;
    },
    "title+artist-filter": function (songs, request) {
        var result = 0;
        var condition = function (req, title, artist) {
            req = "" + req;
            req = req.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, "");
            title = "" + title;
            title = title.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, "");
            artist = "" + artist;
            artist = artist.replace(
                /[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g,
                ""
            );
            return (
                caselessCompare(req.substring(0, title.length), title) &&
                caselessCompare(
                    req.substring(req.length - artist.length),
                    artist
                )
            );
        };
        for (var i = 0; i < songs.length; ++i) {
            if (condition(request, songs[i].Title, songs[i].Artist)) {
                if (result) {
                    // Non-unique result
                    return 0;
                }
                result = i + 1;
            }
        }
        return result;
    },
    "artist+title-filter": function (songs, request) {
        var result = 0;
        var condition = function (req, title, artist) {
            req = "" + req;
            req = req.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, "");
            title = "" + title;
            title = title.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, "");
            artist = "" + artist;
            artist = artist.replace(
                /[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g,
                ""
            );
            return (
                caselessCompare(req.substring(0, artist.length), artist) &&
                caselessCompare(req.substring(req.length - title.length), title)
            );
        };
        for (var i = 0; i < songs.length; ++i) {
            if (condition(request, songs[i].Title, songs[i].Artist)) {
                if (result) {
                    // Non-unique result
                    return 0;
                }
                result = i + 1;
            }
        }
        return result;
    },
    "artists-narrowing-filter": function (songs, request) {
        var output = [];
        for (var i = 0; i < songs.length; ++i) {
            if (caselessCompare(songs[i].Artist, request)) {
                output.push(songs[i]);
            }
        }
        if (output.length == 0) {
            return 0;
        }
        return output;
    },
};

log.alert("Starting bot");
log.debug("Current configuration:\n" + JSON.stringify(config, null, 4));

bot.login(auth.token);
