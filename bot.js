var Discord=require('discord.js');
var auth=require('./auth.json');
var bot=new Discord.Client({
    token: auth.token,
    autorun: true
});
var isPlaying=false;

bot.on('message', message => {
    if (message.content==="CADENCE!!") {
        if (isPlaying) {
            message.reply("Don't you have enough Cadence already?");
        }
        else {
            isPlaying=true;
            var voiceChannel=message.member.voiceChannel;
            voiceChannel.join().then(connection => {
                const dispatch = connection.playFile('http://cadenceradio.com:8000/cadence1.mp3');
                dispatch.on("end", end=> {
                    message.reply("End of Cadence");
                    voiceChannel.leave();
                });
            }).catch(err => console.log(err));
        }
    }
    else if (message.content==="NO CADENCE!!") {
        if (isPlaying) {
            isPlaying=false;
            var voiceChannel=message.member.voiceChannel;
            voiceChannel.leave();
        }
        else {
            message.reply("OK, OK, I get it, you don't like me, sheesh!");
        }
    }
})

bot.login(auth.token);
