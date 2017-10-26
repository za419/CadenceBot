var Discord=require('discord.js');
var bot=new Discord.Client();
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
})