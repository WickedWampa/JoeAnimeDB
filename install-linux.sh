#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPOSITORY="WickedWampa/JoeAnimeDB"
readonly RELEASES_API="https://api.github.com/repos/${REPOSITORY}/releases?per_page=20"
readonly ICON_URL="https://raw.githubusercontent.com/${REPOSITORY}/main/installer/joeanime.png"

readonly DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"
readonly BIN_HOME="${XDG_BIN_HOME:-${HOME}/.local/bin}"
readonly INSTALL_DIR="${DATA_HOME}/JoeAnimeDB"
readonly APPLICATIONS_DIR="${DATA_HOME}/applications"
readonly ICONS_DIR="${DATA_HOME}/icons/hicolor/512x512/apps"
readonly APPIMAGE_PATH="${INSTALL_DIR}/JoeAnimeDB.AppImage"
readonly COMMAND_PATH="${BIN_HOME}/joeanime-db"
readonly DESKTOP_PATH="${APPLICATIONS_DIR}/joeanime-db.desktop"
readonly ICON_PATH="${ICONS_DIR}/joeanime-db.png"

say() {
  printf 'JoeAnimeDB: %s\n' "$*"
}

fail() {
  printf 'JoeAnimeDB install failed: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required."

case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) fail "This beta currently supports x86_64 Linux only." ;;
esac

say "Finding the newest Linux release..."

release_json="$(curl --fail --silent --show-error --location \
  --header "Accept: application/vnd.github+json" \
  --header "X-GitHub-Api-Version: 2022-11-28" \
  "${RELEASES_API}")"

appimage_url="$(
  printf '%s\n' "${release_json}" |
    sed -nE 's/^[[:space:]]*"browser_download_url":[[:space:]]*"([^"]+\.AppImage)".*/\1/p' |
    head -n 1
)"

[[ -n "${appimage_url}" ]] ||
  fail "No Linux AppImage was found in the current GitHub releases."

appimage_name="${appimage_url##*/}"
mkdir -p "${INSTALL_DIR}" "${BIN_HOME}" "${APPLICATIONS_DIR}" "${ICONS_DIR}"

temporary_dir="$(mktemp -d "${INSTALL_DIR}/.install.XXXXXX")"
trap 'rm -rf -- "${temporary_dir}"' EXIT

say "Downloading ${appimage_name}..."
curl --fail --silent --show-error --location \
  --output "${temporary_dir}/JoeAnimeDB.AppImage" \
  "${appimage_url}"

[[ -s "${temporary_dir}/JoeAnimeDB.AppImage" ]] ||
  fail "The downloaded AppImage is empty."

magic="$(LC_ALL=C od -An -tx1 -N4 "${temporary_dir}/JoeAnimeDB.AppImage" | tr -d ' \n')"
[[ "${magic}" == "7f454c46" ]] ||
  fail "The downloaded file is not a valid Linux executable."

chmod 0755 "${temporary_dir}/JoeAnimeDB.AppImage"
mv -f "${temporary_dir}/JoeAnimeDB.AppImage" "${APPIMAGE_PATH}"
ln -sfn "${APPIMAGE_PATH}" "${COMMAND_PATH}"

if curl --fail --silent --show-error --location \
  --output "${temporary_dir}/joeanime-db.png" \
  "${ICON_URL}"; then
  chmod 0644 "${temporary_dir}/joeanime-db.png"
  mv -f "${temporary_dir}/joeanime-db.png" "${ICON_PATH}"
else
  say "The application installed, but its desktop icon could not be downloaded."
fi

cat >"${DESKTOP_PATH}" <<EOF
[Desktop Entry]
Name=JoeAnimeDB
Comment=Offline-first anime tracking and personalized recommendations
Exec="${APPIMAGE_PATH}"
Icon=joeanime-db
Terminal=false
Type=Application
Categories=Utility;AudioVideo;
StartupWMClass=JoeAnimeDB
EOF

chmod 0644 "${DESKTOP_PATH}"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${APPLICATIONS_DIR}" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force --ignore-theme-index \
    "${DATA_HOME}/icons/hicolor" >/dev/null 2>&1 || true
fi

say "Installed successfully."
say "Open JoeAnimeDB from your application menu or run: joeanime-db"

case ":${PATH}:" in
  *":${BIN_HOME}:"*) ;;
  *) say "If 'joeanime-db' is not found, add ${BIN_HOME} to PATH." ;;
esac

if ! command -v fusermount >/dev/null 2>&1; then
  say "If the AppImage reports a FUSE error, install your distribution's FUSE 2 package."
fi
