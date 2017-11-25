# This script only works on Debian derivatives
# (or at least platforms that use apt and have the required packages)

# Mostly, this just exists to make sure that the necessary packages are installed.
# Actually, it doesn't do much of anything else. It's just that and copying hooks.
# Its here for convenience, so no one struggles to figure out what needs installing.

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

