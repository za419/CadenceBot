var Discord=require('discord.js');
var auth=require('./auth.json');
var config=require('./config.json');
var fetch=require('node-fetch');
var request=require('request');
var logger=require('js-logging');

if (config.padLog) {
    var longestLengthIn=function(array) {
        var max=-1;
        for (var i=0; i<array.length; ++i) {
            if (array[i].length>max) {
                max=array[i].length;
            }
        }
        return max;
    }

    // Attempt to pad the log format so that all log entries are the same length
    // Assumptions and restrictions documented below
    var logging=config.logging;
    var string=logging.format;
    config.logging.preprocess=function(data) {
        // Pad the level so its centered, surrounded by enough spaces to fit the longest level
        var longestTitle=longestLengthIn(Object.keys(logging.filters));
        if (data.title.length<longestTitle) {
            var diff=longestTitle-data.title.length;
            var leftPad=Math.floor(diff/2);
            var rightPad=diff-leftPad;
            // Account for a misalignment in testing
            // TODO find out why this is needed
            leftPad-=1;
            rightPad-=1;
            data.title=Array(leftPad+2).join(' ')+data.title+Array(rightPad+2).join(' ');
        }
        // Pad the line number so it has spaces to its right until its maximum length
        var lineLength=4; // The number of digits the line field is allocated. Currently maxes at 9999 lines
        if (data.line.length<lineLength) {
            data.line+=Array((lineLength-data.line.length)+2).join(' ');
        }
    };
}

var log=logger.colorConsole(config.logging); // Use default colors. Change if necessary

var bot=new Discord.Client({
    token: auth.token,
    autorun: true
});

var isPlaying={};

var reconnectAllowedAt={};
var reconnectTimeout=30; // Seconds

var lastSearchedSongs={};

function command(message) {
    if (message.content===config.commands.play) {
        log.notice("Received play command.");
        if (isPlaying[message.guild.id]) {
            log.info("Already playing in server "+message.guild.name);
            message.reply("Don't you have enough Cadence already?");
        }
        else {
            var voiceChannel=message.member.voiceChannel;
            if (voiceChannel) {
                log.info("Attempting to join voice channel "+voiceChannel.name+" in server "+message.guild.name);

                var rAA=new Date();
                rAA.setSeconds(rAA.getSeconds()+reconnectTimeout);
                reconnectAllowedAt[voiceChannel.id]=rAA;

                isPlaying[message.guild.id]=true;
                voiceChannel.join().then(connection => {
                    log.notice("Joined. Beginning playback (channel bitrate="+voiceChannel.bitrate+").");
                    const dispatch = connection.playArbitraryInput('http://cadenceradio.com:8000/cadence1', { 'bitrate': config.bitrate });
                    dispatch.on("end", end=> {
                        log.warning("Stream ended. Playback was in server "+message.guild.name+", channel "+voiceChannel.name);
                        if (!isPlaying[message.guild.id]) return;

                        log.warning("Error was: "+end);

                        isPlaying[message.guild.id]=false;
                        if (new Date()<reconnectAllowedAt[voiceChannel.id]) {
                            log.notice("Before reconnect timer for channel "+message.guild.name+":"+voiceChannel.name+". Disconnecting");
                            message.reply("Since I've already tried to reconnect in the last "+reconnectTimeout+" seconds, I won't try again.\n\nRun \""+config.commands.play+"\" if you want me to try again.");
                            voiceChannel.leave();
                            return;
                        }
                        log.debug("Was allowed to reconnect to channel with id "+voiceChannel.id+" before "+reconnectAllowedAt[voiceChannel.id]);

                        message.reply("Hm, I seem to have lost Cadence.\n\nLet me see if I can get it back for you.");

                        // Issue a spurious nowplaying to get it in the log.
                        // Should remove this before sending to prod, probably
                        var msg={};
                        msg.content=config.commands.nowplaying;
                        msg.reply=function (s) {log.debug("Sent message: "+s)};
                        log.notice("Sending false nowplaying command in server "+message.guild.name+"...");
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
                        msg={};
                        msg.content=message.content;
                        msg.reply=function(r) {message.reply(r)};
                        msg.member={};
                        msg.member.voiceChannel=voiceChannel;
                        msg.guild=message.guild;
                        log.notice("Sending mocked play command in server "+message.guild.name+"...");
                        command(msg);
                    });
                }).catch(err => log.critical(err));
            }
            else {
                log.error("User "+message.member.user.tag+" is not in a voice channel in server "+message.guild.name+".");
                message.reply("You need to be in a voice channel for me to play Cadence in it, silly!");
            }
        }
    }
    else if (message.content===config.commands.stop) {
        log.notice("Received stop command.");
        if (isPlaying[message.guild.id]) {
            var voiceChannel=message.member.voiceChannel;
            log.info("Attempting to disconnect from channel in "+message.guild.name+".");
            if (voiceChannel) {
                isPlaying[message.guild.id]=false;
                voiceChannel.leave();
                log.notice("Disconnected from channel "+voiceChannel.name+".");
            }
            else {
                log.notice("User not in a voice channel.");
                message.reply("I dunno, I'd prefer if someone in the channel told me to stop.");
            }
        }
        else {
            log.error("Not currently playing.");
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    }
    else if (message.content===config.commands.help) {
        log.notice("Received help command.");
        var help="";
        help="I have "+Object.keys(config.commands).length+" commands. They are:\n";
        for (var key in config.commands) {
            if (config.commands.hasOwnProperty(key)) {
                help+="    \""+config.commands[key]+"\" - "+config.commandDescriptions[key]+"\n";
            }
        }
        message.reply(help);
        log.notice("Issued help message.");
    }
    else if (message.content===config.commands.nowplaying) {
        log.notice("Received nowplaying command.");
        const url="http://cadenceradio.com:8000/now-playing.xsl";
        log.info("Issuing fetch request to "+url);
        fetch(url).then(response => {
            log.info("Received response.");
            response.text().then(text => {
                log.info("Response text:\n\n"+text+"\n\n");
                log.info("Parsing response...");
                text=text.substring("parseMusic(".length, text.length-2);
                var json=JSON.parse(text);
                var artist=json['/cadence1']['artist_name'].trim();
                var song=json['/cadence1']['song_title'].trim();
                log.notice("Parse complete: Now playing \""+song+"\" by "+artist);
                message.reply("Now playing: \""+song+"\" by "+artist);
            });
        });
    }
    else if (message.content.startsWith(config.commands.search)) {
        log.notice("Received search command in text channel "+message.channel.name+", server "+message.guild.name+".");
        log.notice("Received message was \""+message.content+"\"");
        const url='http://cadenceradio.com/search';
        var data={
            search: message.content.substring(config.commands.search.length)
        };

        log.info("Making a request to "+url);
        log.debug("data.search="+data.search);
        request.post({url, form: data}, function(err, response, body) {
           log.info("Received response.");
           if (!err && (!response || response.statusCode==200)) {
               log.info("No error, and either no status code or status code 200.");
               log.debug("Received body:\n\n"+body+"\n\n");
               var songs=JSON.parse(body);
               if (songs.length==0) {
                   log.info("No results.");
                   message.reply("Cadence has no results for \""+data.search+"\".");
               }
               else {
                   log.info(songs.length+" result(s).");
                   lastSearchedSongs[message.channel.id]=songs;
                   var response="Cadence returned:\n";
                   for (var i=0; i<songs.length; ++i) {
                       response+="  "+(i+1)+")  \""+songs[i].title+"\" by "+songs[i].artist[0]+"\n";
                   }
                   log.debug("Issuing response:\n\n"+response+"\n\n");
                   message.reply(response);
               }
           }
           else {
               log.error("Response is erroneous. Returned body:\n\n"+body+"\n\n");
               if (response) {
                   log.error("Returned status code: "+response.statusCode);
                   message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
               }
               else {
                   log.error("No status code.");
                   message.reply("Error. Aria says:\n\n"+body);
               }
           }
        });
    }
    else if (message.content.startsWith(config.commands.request)) {
        log.notice("Received song request in text channel "+message.channel.name+", server "+message.guild.name+".");
        log.notice("Received message was \""+message.content+"\"");
        log.debug("Last searched songs:\n\n"+JSON.stringify(lastSearchedSongs[message.channel.id])+"\n\n");
        lastSearchedSongs[message.channel.id]=lastSearchedSongs[message.channel.id] || []; // Default to empty array to avoid crash
        if (lastSearchedSongs[message.channel.id].length==0) {
            log.error("No stored results.");
            message.reply("Please search for your songs before requesting them.");
            return;
        }
        const url='http://cadenceradio.com/request';
        var song=parseInt(message.content.substring(config.commands.request.length))-1;
        if (isNaN(song)) {
            log.error("NaN requested:\n"+message.content.substring(config.commands.request.length));
            message.reply("Please request a number.");
            return;
        }
        if (song<0) {
            log.error("Non-positive input.");
            message.reply("Sorry, I cannot request a song with a non-positive number.");
            return;
        }
        log.notice("Prepared to construct request for song at index "+song);
        if (song>=lastSearchedSongs[message.channel.id].length) {
            log.error("Index out-of-bounds.");
            message.reply("Sorry, I can't request song number "+(song+1)+" out of a set of "+lastSearchedSongs[message.channel.id].length+".");
            return;
        }

        var data={
            path: lastSearchedSongs[message.channel.id][song].path
        };
        log.info("Making a request to "+url);
        log.debug("data.path="+data.path);
        request.post({url, form: data}, function(err, response, body) {
            log.info("Received response.");
            if (!err && (!response || response.statusCode==200)) {
                log.notice("Request received. Clearing lastSearchedSongs...");
                log.info("Aria says: "+body);
                message.reply("Your request has been received.");
                lastSearchedSongs[message.channel.id]=[];
            }
            else if (response) {
                if (response.statusCode==429) {
                    log.warning("Request failed with status code "+response.statusCode);
                    log.notice("Issued rate limiting message.");
                    message.reply("Sorry, Cadence limits you to one request every five minutes.");
                }
                else {
                    log.error("Request failed with status code "+response.statusCode);
                    log.error("Aria says: "+body);
                    message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
                }
            }
            else {
                log.error("Request failed without status code.");
                log.error("Aria says: "+body);
                message.reply("Error. Aria says:\n\n"+body);
            }
        });
    }
}

bot.on('message', message => {
    command(message)
});

bot.on('guildCreate', guild => {
    isPlaying[guild.id]=false;
});

log.alert("Starting bot");

bot.login(auth.token);
