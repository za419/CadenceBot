var Discord=require('discord.js');
var auth=require('./auth.json');
var config=require('./config.json');
var fetch=require('node-fetch');

var bot=new Discord.Client({
    token: auth.token,
    autorun: true
});
var isPlaying=false;

bot.on('message', message => {
    if (message.content===config.commands.play) {
        if (isPlaying) {
            message.reply("Don't you have enough Cadence already?");
        }
        else {
            var voiceChannel=message.member.voiceChannel;
            if (voiceChannel) {
                isPlaying=true;
                voiceChannel.join().then(connection => {
                    const dispatch = connection.playArbitraryInput('http://cadenceradio.com:8000/cadence1');
//                  dispatch.on("end", end=> {
//                      isPlaying=false;
//                      message.reply("End of Cadence: "+end);
//                      voiceChannel.leave();
//                  });
                }).catch(err => console.log(err));
            }
            else {
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
            response.json().then(json => {
                var artist=json['/cadence1']['artist_name'].trim();
                var song=json['/cadence1']['song_title'].trim();
                message.reply("Now playing: "+song+" by "+artist);
            });
        });
    }
})

bot.login(auth.token);
