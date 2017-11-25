# This script only works on Debian derivatives
# (or at least platforms that use apt and have the required packages)

# Mostly, this just exists to make sure that the necessary packages are installed.
# Its here for convenience, so no one struggles to figure out what needs installing.
# The script can perform more than that, but other parts are optional.
# It can automatically setup e-mailing of logs before restart
# And it can automatically create the auth.json file (used for authentication with Discord)

# As you can guess by its placement in the Git repo, this script should be run after clone, in the worktree.

curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -c "sudo apt-get install -y nodejs"
sudo apt-get install -y ffmpeg gcc g++

cp auto-setup.sh .git/hooks/post-checkout
cp auto-setup.sh .git/hooks/post-merge

./setup.sh

read -n 1 -p "Would you like to setup log emailing on restart now? (y/N) " emailing

emailing="${emailing,,}"

while [[ "$emailing" != "y" && "$emailing" != "n" && "$emailing" != "" ]]; do
    read -n 1 -p "Would you like to setup log emailing on restart now? (y/N) " emailing

    emailing="${emailing,,}"
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

	cat CadenceBot.log | mail -s "$prefix \$(date)" "$address" -aFrom:"$address"
EOL
    chmod +x maillog.sh

    echo "Done."
else
    if [ "$emailing" != "" ]; then
        echo
    fi
    echo "OK"
fi

read -n 1 -p "Would you like to setup Discord authentication now? (y/N) " authentication

authentication="${authentication,,}"

while [[ "$authentication" != "y" && "$authentication" != "n" && "$authentication" != "" ]]; do
    read -n 1 -p "Would you like to setup Discord authentication now? (y/N) " authentication

    authentication="${authentication,,}"
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

echo
echo "Setup complete."
