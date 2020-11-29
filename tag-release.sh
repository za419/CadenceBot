#!/bin/bash

## This script will be used to create the 'release commit' which is tagged for releases, and to perform the tagging itself.
# It was one necessary parameter: The new release number.

function usage {
    echo "$(basename "$0") release"
    echo "  release: The new release number to be applied to the current source."
    echo "           (for example 1.5.2.1)"
}

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
pushd $SCRIPT_DIR

# Argument list checking

if [ $# -ne 1 ]; then
    usage >&2
    exit 1
fi

if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    usage
    exit 0
fi

version=$1

# Fail if there are dirty changes
if ! git diff --quiet; then
    echo "The working directory $SCRIPT_DIR is not clean. Please commit or reset before running $(basename "$0")" >&2
    exit 2
fi

# Apply prettier from the local install. Fail if not possible or prettier fails.
if ! ./node_modules/.bin/prettier --write .; then
    echo "Prettier failed - Check that it is installed and executable in $SCRIPT_DIR/node_modules/.bin/" >&2
    exit 3
fi

# Commit a style fix
if (! git diff --quiet) && (! git commit -am "Apply prettier formatting before v$version"); then
    echo "Unable to commit required prettier formatting." >&2
    exit 4
fi

# Update the package.json version number
if ! sed -i "s/^  \"version\": \".*\",$/  \"version\": \"$version\",/" ./package.json; then
    echo "Could not update $SCRIPT_DIR/package.json for new version number." >&2
    exit 5
fi

# Check that we could in fact update it
if git diff --quiet; then
    echo "Could not update $SCRIPT_DIR/package.json for new version number." >&2
    exit 6
fi

# Commit the version update (this is our release commit)
if ! git commit -asS -m "Update package.json for version $version"; then
    echo "Unable to create release commit." >&2
    exit 7
fi

# Tag the new version (open a dialog for the user to describe the release)
echo "Creating tag v$version. Please provide a reasonable description of the changes in this release."
if ! git tag -as v$version; then
    echo "Unable to create release tag." >&2
    exit 8
fi

# That's all, folks!
popd
echo "Release $version is ready. Please review and push when ready." >&2
exit 0
