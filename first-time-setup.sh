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
