var Discord=require('discord.js');
var auth=require('./auth.json');
var config=require('./config.json');
var fetch=require('node-fetch');
var request=require('request');

var bot=new Discord.Client({
    token: auth.token,
    autorun: true
});
var isPlaying=false;

var lastSearchedSongs=[];

bot.on('message', message => {
    if (message.content===config.commands.play) {
        console.log("Received play command.");
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
                        isPlaying=false;
                        message.reply("End of Cadence: "+end);
                        voiceChannel.leave();
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
        if (isPlaying) {
            var voiceChannel=message.member.voiceChannel;
            if (voiceChannel) {
                isPlaying=false;
                voiceChannel.leave();
            }
            else {
                message.reply("I dunno, I'd prefer if someone in the channel told me to stop.");
            }
        }
        else {
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    }
    else if (message.content===config.commands.help) {
        var help="";
        help="I have "+Object.keys(config.commands).length+" commands. They are:\n";
        for (var key in config.commands) {
            if (config.commands.hasOwnProperty(key)) {
                help+="    \""+config.commands[key]+"\" - "+config.commandDescriptions[key]+"\n";
            }
        }
        message.reply(help);
    }
    else if (message.content===config.commands.nowplaying) {
        const url="http://cadenceradio.com:8000/now-playing.xsl";
        fetch(url).then(response => {
            response.text().then(text => {
                text=text.substring("parseMusic(".length, text.length-2);
                var json=JSON.parse(text);
                var artist=json['/cadence1']['artist_name'].trim();
                var song=json['/cadence1']['song_title'].trim();
                message.reply("Now playing: \""+song+"\" by "+artist);
            });
        });
    }
    else if (message.content.startsWith(config.commands.search)) {
        const url='http://cadenceradio.com/search';
        var data={
            search: message.content.substring(config.commands.search.length)
        };
        
        request.post({url, form: data}, function(err, response, body) {
           if (!err && (!response || response.statusCode==200)) {
               var songs=JSON.parse(body);
               if (songs.length==0) {
                   message.reply("Cadence has no results for \""+data.search+"\".");
               }
               else {
                   lastSearchedSongs=songs;
                   var response="Cadence returned:\n";
                   for (var i=0; i<songs.length; ++i) {
                       response+="  "+(i+1)+")  \""+songs[i].title+"\" by "+songs[i].artist[0]+"\n";
                   }
                   message.reply(response);
               }
           }
           else {
               if (response) {
                   message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
               }
               else {
                   message.reply("Error. Aria says:\n\n"+body);
               }
           }
        });
    }
    else if (message.content.startsWith(config.commands.request)) {
        if (lastSearchedSongs.length==0) {
            message.reply("Please search for your songs before requesting them.");
            return;
        }
        const url='http://cadenceradio.com/request';
        var song=parseInt(message.content.substring(config.commands.request.length))-1;
        if (song>=lastSearchedSongs.length) {
            message.reply("Sorry, I can't request song number "+song+" out of a set of "+lastSearchedSongs.length+".");
            return;
        }

        var data={
            path: lastSearchedSongs[song].path
        };
        request.post({url, form: data}, function(err, response, body) {
            if (!err && (!response || response.statusCode==200)) {
                message.reply("Your request has been received.");
                lastSearchedSongs=[];
            }
            else if (response) {
                if (response.statusCode==429) {
                    message.reply("Sorry, Cadence limits you to one request every five minutes.");
                }
                else {
                    message.reply("Error "+response.statusCode+". Aria says:\n\n"+body);
                }
            }
            else {
                message.reply("Error. Aria says:\n\n"+body);
            }
        });
    }
})

bot.login(auth.token);
