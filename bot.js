var Discord=require('discord.js');
var auth=require('./auth.json');
var config=require('./config.json');
var fetch=require('node-fetch');
var request=require('request');
var logger=require('js-logging');

var log=logger.colorConsole(); // Use default colors. Change if necessary

var bot=new Discord.Client({
    token: auth.token,
    autorun: true
});
var isPlaying=false;

var reconnectAllowedAt=new Date();
var reconnectTimeout=30; // Seconds

var lastSearchedSongs=[];

function command(message) {
    if (message.content===config.commands.play) {
        console.log("\nReceived play command.");
        if (isPlaying) {
            console.log("Already playing.\n");
            message.reply("Don't you have enough Cadence already?");
        }
        else {
            var voiceChannel=message.member.voiceChannel;
            if (voiceChannel) {
                console.log("Attempting to join voice channel "+voiceChannel.name);
                isPlaying=true;
                voiceChannel.join().then(connection => {
                    console.log("Joined. Beginning playback (channel bitrate="+voiceChannel.bitrate+").");
                    const dispatch = connection.playArbitraryInput('http://cadenceradio.com:8000/cadence1');
                    dispatch.on("end", end=> {
                        console.log("\nStream ended. The current time is "+new Date().toString());
			if (!isPlaying) return;

                        console.log("Error was: "+end);

                        isPlaying=false;
                        if (new Date()<reconnectAllowedAt) {
                            console.log("Before reconnect timer. Disconnecting");
                            message.reply("Since I've already tried to reconnect in the last "+reconnectTimeout+" seconds, I won't try again.\n\nRun \""+config.commands.play+"\" if you want me to try again.");
                            voiceChannel.leave();
                            return;
                        }
                        reconnectAllowedAt=new Date();
                        reconnectAllowedAt.setSeconds(reconnectAllowedAt.getSeconds()+reconnectTimeout);

                        message.reply("Hm, I seem to have lost Cadence.\n\nLet me see if I can get it back for you.");
                        
                        // Issue a spurious nowplaying to get it in the log.
                        // Should remove this before sending to prod, probably
                        var msg={};
                        msg.content=config.commands.nowplaying;
                        msg.reply=function (s) {console.log("Sent message: "+s)};
                        console.log("Sending false nowplaying command...");
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
                        console.log("Sending mocked play command...");
                        command(msg);
                    });
                }).catch(err => console.log(err));
            }
            else {
                console.log("User "+message.member.user.tag+" is not in a voice channel.");
                message.reply("You need to be in a voice channel for me to play Cadence in it, silly!");
            }
        }
    }
    else if (message.content===config.commands.stop) {
        console.log("\nReceived stop command.");
        if (isPlaying) {
            console.log("Attempting to disconnect from channel.");
            var voiceChannel=message.member.voiceChannel;
            if (voiceChannel) {
                isPlaying=false;
                voiceChannel.leave();
                console.log("Disconnected from channel "+voiceChannel.name+".");
            }
            else {
                console.log("User not in a voice channel.");
                message.reply("I dunno, I'd prefer if someone in the channel told me to stop.");
            }
        }
        else {
            console.log("Not currently playing.");
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    }
    else if (message.content===config.commands.help) {
        console.log("\nReceived help command.");
        var help="";
        help="I have "+Object.keys(config.commands).length+" commands. They are:\n";
        for (var key in config.commands) {
            if (config.commands.hasOwnProperty(key)) {
                help+="    \""+config.commands[key]+"\" - "+config.commandDescriptions[key]+"\n";
            }
        }
        message.reply(help);
        console.log("Issued help message.");
    }
    else if (message.content===config.commands.nowplaying) {
        console.log("\nReceived nowplaying command.");
        const url="http://cadenceradio.com:8000/now-playing.xsl";
        console.log("Issuing fetch request to "+url);
        fetch(url).then(response => {
            console.log("Received response.");
            response.text().then(text => {
                console.log("Response text:\n\n"+text+"\n\n");
                console.log("Parsing response...");
                text=text.substring("parseMusic(".length, text.length-2);
                var json=JSON.parse(text);
                var artist=json['/cadence1']['artist_name'].trim();
                var song=json['/cadence1']['song_title'].trim();
                console.log("Parse complete: Now playing \""+song+"\" by "+artist);
                message.reply("Now playing: \""+song+"\" by "+artist);
            });
        });
    }
    else if (message.content.startsWith(config.commands.search)) {
        console.log("\nReceived search command.");
        console.log("Received message was \""+message.content+"\"");
        const url='http://cadenceradio.com/search';
        var data={
            search: message.content.substring(config.commands.search.length)
        };

        console.log("Making a request to "+url);
        console.log("data.search="+data.search);        
        request.post({url, form: data}, function(err, response, body) {
           console.log("Received response.");
           if (!err && (!response || response.statusCode==200)) {
               console.log("No error, and either no status code or status code 200.");
               console.log("Received body:\n\n"+body+"\n\n");
               var songs=JSON.parse(body);
               if (songs.length==0) {
                   console.log("No results.");
                   message.reply("Cadence has no results for \""+data.search+"\".");
               }
               else {
                   console.log(songs.length+" results.");
                   lastSearchedSongs=songs;
                   var response="Cadence returned:\n";
                   for (var i=0; i<songs.length; ++i) {
                       response+="  "+(i+1)+")  \""+songs[i].title+"\" by "+songs[i].artist[0]+"\n";
                   }
                   message.reply(response);
               }
           }
           else {
               console.log("Response is erroneous. Returned body:\n\n"+body+"\n\n");
               if (response) {
                   console.log("Returned status code: "+response.statusCode);
                   message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
               }
               else {
                   console.log("No status code.");
                   message.reply("Error. Aria says:\n\n"+body);
               }
           }
        });
    }
    else if (message.content.startsWith(config.commands.request)) {
        console.log("\nReceived song request.");
        console.log("Received message was \""+message.content+"\"");
        console.log("Last searched songs:\n\n"+JSON.stringify(lastSearchedSongs)+"\n\n");
        if (lastSearchedSongs.length==0) {
            console.log("No stored results.");
            message.reply("Please search for your songs before requesting them.");
            return;
        }
        const url='http://cadenceradio.com/request';
        var song=parseInt(message.content.substring(config.commands.request.length))-1;
        if (isNaN(song)) {
            console.log("NaN requested:\n"+message.content.substring(config.commands.request.length));
            message.reply("Please request a number.");
            return;
        }
        if (song<0) {
            console.log("Non-positive input.");
            message.reply("Sorry, I cannot request a song with a non-positive number.");
            return;
        }
        console.log("Prepared to construct request for song at index "+song);
        if (song>=lastSearchedSongs.length) {
            console.log("Index out-of-bounds.");
            message.reply("Sorry, I can't request song number "+(song+1)+" out of a set of "+lastSearchedSongs.length+".");
            return;
        }

        var data={
            path: lastSearchedSongs[song].path
        };
        console.log("Making a request to "+url);
        console.log("data.path="+data.path);
        request.post({url, form: data}, function(err, response, body) {
            console.log("Received response.");
            if (!err && (!response || response.statusCode==200)) {
                console.log("Request received. Clearing lastSearchedSongs...");
                console.log("Aria says: "+body);
                message.reply("Your request has been received.");
                lastSearchedSongs=[];
            }
            else if (response) {
                console.log("Request failed with status code "+response.statusCode);
                if (response.statusCode==429) {
                    console.log("Issued rate limiting message.");
                    message.reply("Sorry, Cadence limits you to one request every five minutes.");
                }
                else {
                    console.log("Aria says: "+body);
                    message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
                }
            }
            else {
                console.log("Request failed without status code.");
                console.log("Aria says: "+body);
                message.reply("Error. Aria says:\n\n"+body);
            }
        });
    }
}

bot.on('message', message => {
    command(message)
});

bot.login(auth.token);
