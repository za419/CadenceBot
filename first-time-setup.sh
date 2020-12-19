# This script only works on Debian derivatives
# (or at least platforms that use apt and have the required packages)

# Mostly, this just exists to make sure that the necessary packages are installed.
# Its here for convenience, so no one struggles to figure out what needs installing.
# The script can perform more than that, but other parts are optional.
# It can automatically setup e-mailing of logs before restart,
# It can automatically configure the system timezone,
# And it can automatically create the auth.json file (used for authentication with Discord)

# As you can guess by its placement in the Git repo, this script should be run after clone, in the worktree.

sudo apt update
curl -sL https://deb.nodesource.com/setup_current.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g npm
sudo apt install -y ffmpeg
sudo apt install -y build-essential
sudo apt install -y gcc g++
sudo apt install -y make

pushd "$(dirname "$(readlink -f "$0")")" > /dev/null

cp auto-setup.sh .git/hooks/post-checkout
cp auto-setup.sh .git/hooks/post-merge

./setup.sh

emailing="invalid"

while [[ "$emailing" != "y" && "$emailing" != "n" && "$emailing" != "" ]]; do
    read -n 1 -p "Would you like to setup log emailing on restart now? (y/N) " emailing

    emailing="${emailing,,}"
    echo
done

if [ "$emailing" == "y" ]; then
    echo

    address=""
    while [ "$address" == "" ]; do
        read -p "Which email address would you like to send emails to? " address
    done

    read -p "Which subject prefix would you like to use? (press enter for default) " prefix
    if [ "$prefix" == "" ]; then
        prefix="CadenceBot prestart log at "
    fi

    echo "Creating script..."

    cat >./maillog.sh <<-EOL
	#!/bin/bash

	mail -A CadenceBot.log -s "$prefix \$(date)" "$address" -aFrom:"$address" < /dev/null
EOL
    chmod +x maillog.sh

    echo "Done."
else
    if [ "$emailing" != "" ]; then
        echo
    fi
    echo "OK"
fi


authentication="invalid"
echo

while [[ "$authentication" != "y" && "$authentication" != "n" && "$authentication" != "" ]]; do
    read -n 1 -p "Would you like to setup Discord authentication now? (y/N) " authentication

    authentication="${authentication,,}"
    echo
done

if [ "$authentication" == "y" ]; then
    echo

    token=""
    while [ "$token" == "" ]; do
        read -p "Please enter your Discord bot token: " token
    done

    echo "Creating script..."

    cat >./auth.json <<-EOL
	{
	  "token": "$token"
	}
EOL

    echo "Done."
else
    if [ "$authentication" == "n" ]; then
        echo
    fi

    echo "OK."
fi

timezone="invalid"
echo
echo "The shell session's timezone on bot start will be used to set the log timezone."

while [[ "$timezone" != "y" && "$timezone" != "n" && "$timezone" != "" ]]; do
    read -n 1 -p "Would you like to configure your shell session timezone now? (y/N) " timezone

    timezone="${timezone,,}"
    echo
done

if [ "$timezone" == "y" ]; then
    echo

    zone=""
    while [ "$zone" == "" ]; do
        read -p "Please enter your timezone (ex. America/Chicago): " zone
    done

    echo "Adding to ~/.bashrc..."

    cat >>~/.bashrc <<-EOL

# Set timezone to $zone.
export TZ="$zone"
EOL

    echo "Done."
    echo "Note that this change will not take effect until you restart bash."
    echo "Run 'exec bash' to do so in your current shell."
else
    if [ "$timezone" == "n" ]; then
        echo
    fi

    echo "OK."
fi


autostart="invalid"
echo

while [[ "$autostart" != "y" && "$autostart" != "n" && "$autostart" != "" ]]; do
    read -n 1 -p "Would you like to setup CadenceBot to start automatically on reboot? (y/N) " authentication

    autostart="${autostart,,}"
    echo
done

if [ "$autostart" == "y" ]; then
    echo
    echo "You may be prompted to enter credentials for sudo to allow this configuration."

    if [ -f /etc/rc.local ]; then
        sudo echo "bash \"$PWD/restart.sh\"" >> /etc/rc.local
        sudo chmod +x /etc/rc.local
    else
        sudo cat >/etc/rc.local <<-EOL
#!/bin/bash

bash "$PWD/restart.sh
EOL
        sudo chmod +x /etc/rc.local
    fi

    echo "Done."
else
    if [ "$autostart" == "n" ]; then
        echo
    fi

    echo "OK."
fi

echo
echo "Setup complete."
echo "Run restart.sh to start CadenceBot."

popd > /dev/null
