var Discord=require('discord.js');
var auth=require('./auth.json');
var config=require('./config.json');
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
            isPlaying=true;
            var voiceChannel=message.member.voiceChannel;
            voiceChannel.join().then(connection => {
                const dispatch = connection.playArbitraryInput('http://cadenceradio.com:8000/cadence1');
//                dispatch.on("end", end=> {
//                    isPlaying=false;
//                    message.reply("End of Cadence: "+end);
//                    voiceChannel.leave();
//                });
            }).catch(err => console.log(err));
        }
    }
    else if (message.content===config.commands.stop) {
        if (isPlaying) {
            isPlaying=false;
            var voiceChannel=message.member.voiceChannel;
            voiceChannel.leave();
        }
        else {
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    }
    else if (message.content===config.commands.help) {
        var help="";
        help="I have "+config.commands.keys.length+" commands. They are:\n";
        for (var key in config.commands) {
            if (config.commands.hasOwnProperty(key)) {
                help+="  "+config.commands[key]+" - "+key+"\n";
            }
        }
        message.reply(help);
    }
})

bot.login(auth.token);
