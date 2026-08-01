#!/usr/bin/env bash
#
# JoeAnimeDB Linux Installer
#
# Install or update:
#   curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash
#
# Force reinstall:
#   curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --force
#
# Include prereleases:
#   curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --prerelease
#
# Uninstall:
#   curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --uninstall
#
# Help:
#   curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --help
#
# This installer:
#   - Installs JoeAnimeDB for the current user.
#   - Supports common Linux distributions.
#   - Detects missing installation tools.
#   - Detects missing FUSE 2 support.
#   - Offers to install missing packages.
#   - Prefers the newest stable AppImage release.
#   - Uses the newest prerelease when no stable AppImage exists, or when asked.
#   - Verifies GitHub's published SHA-256 digest.
#   - Avoids downloading an already-installed version.
#   - Extracts and installs the icon bundled inside the AppImage.
#   - Creates a terminal command and application-menu entry.
#   - Removes files created by older installer revisions.
#   - Preserves databases and settings when uninstalling.
#

set -Eeuo pipefail
IFS=$'\n\t'

# ==============================================================================
# Application configuration
# ==============================================================================

readonly APP_NAME="JoeAnimeDB"
readonly COMMAND_NAME="joeanime-db"
readonly REPOSITORY="WickedWampa/JoeAnimeDB"
readonly GITHUB_API="https://api.github.com/repos/${REPOSITORY}"

readonly BIN_DIR="${HOME}/.local/bin"
readonly APP_DIR="${HOME}/.local/lib/${APP_NAME}"
readonly APPLICATIONS_DIR="${HOME}/.local/share/applications"

readonly APPIMAGE_PATH="${APP_DIR}/${APP_NAME}.AppImage"
readonly VERSION_PATH="${APP_DIR}/installed-version"
readonly LAUNCHER_PATH="${BIN_DIR}/${COMMAND_NAME}"
readonly DESKTOP_PATH="${APPLICATIONS_DIR}/com.wickedwampa.JoeAnimeDB.desktop"
readonly STAGED_APPIMAGE_PATH="${APPIMAGE_PATH}.new"
readonly STAGED_VERSION_PATH="${VERSION_PATH}.new"

readonly ICON_PNG_PATH="${APP_DIR}/JoeAnimeDB.png"
readonly ICON_SVG_PATH="${APP_DIR}/JoeAnimeDB.svg"

# Files created by earlier installer revisions.
readonly LEGACY_BIN_APPIMAGE="${BIN_DIR}/${APP_NAME}.AppImage"
readonly LEGACY_MIXED_CASE_LAUNCHER="${BIN_DIR}/${APP_NAME}"
readonly LEGACY_DESKTOP_PATH="${APPLICATIONS_DIR}/joeanime-db.desktop"
readonly LEGACY_EXTRACTED_DIR="${APP_DIR}/app"

readonly INSTALL_COMMAND="curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash"
readonly FORCE_COMMAND="curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --force"
readonly PRERELEASE_COMMAND="curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --prerelease"
readonly UNINSTALL_COMMAND="curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash -s -- --uninstall"

TEMP_DIR=""
TEMP_APPIMAGE=""
TEMP_EXTRACTED_DIR=""

FORCE_INSTALL="false"
INCLUDE_PRERELEASES="false"
REQUESTED_ACTION="install"

RELEASE_TAG=""
RELEASE_NAME=""
RELEASE_URL=""
RELEASE_DIGEST=""
RELEASE_PRERELEASE="false"

PACKAGE_MANAGER=""
DISTRO_NAME=""
PRIVILEGE_COMMAND=""

# ==============================================================================
# Appearance
# ==============================================================================

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    readonly RESET=$'\033[0m'
    readonly BOLD=$'\033[1m'
    readonly DIM=$'\033[2m'
    readonly BLUE=$'\033[34m'
    readonly GREEN=$'\033[32m'
    readonly YELLOW=$'\033[33m'
    readonly RED=$'\033[31m'
else
    readonly RESET=""
    readonly BOLD=""
    readonly DIM=""
    readonly BLUE=""
    readonly GREEN=""
    readonly YELLOW=""
    readonly RED=""
fi

print_header() {
    printf '\n'
    printf '%s%s╭────────────────────────────────────────────────────────────╮%s\n' \
        "${BOLD}" "${BLUE}" "${RESET}"
    printf '%s%s│              JoeAnimeDB Linux Installer                   │%s\n' \
        "${BOLD}" "${BLUE}" "${RESET}"
    printf '%s%s╰────────────────────────────────────────────────────────────╯%s\n' \
        "${BOLD}" "${BLUE}" "${RESET}"
    printf '\n'
}

section() {
    printf '\n%s%s%s\n' "${BOLD}" "$1" "${RESET}"
    printf '%s\n' '────────────────────────────────────────────────────────────'
}

info() {
    printf '%s[INFO]%s %s\n' "${BLUE}" "${RESET}" "$*"
}

success() {
    printf '%s[ OK ]%s %s\n' "${GREEN}" "${RESET}" "$*"
}

warning() {
    printf '%s[WARN]%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2
}

failure() {
    printf '%s[FAIL]%s %s\n' "${RED}" "${RESET}" "$*" >&2
}

die() {
    failure "$*"
    exit 1
}

# ==============================================================================
# Cleanup and error handling
# ==============================================================================

cleanup() {
    if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
        rm -rf -- "${TEMP_DIR}" || true
    fi

    rm -f -- "${STAGED_APPIMAGE_PATH}" "${STAGED_VERSION_PATH}" || true
}

on_error() {
    local status=$?
    local line="${1:-unknown}"

    printf '\n' >&2
    failure "The installer stopped unexpectedly near line ${line}."
    printf 'Exit status: %s\n' "${status}" >&2
    printf '\n' >&2
    printf 'Temporary installation files have been removed.\n' >&2
    printf 'Your JoeAnimeDB database and settings were not deleted.\n' >&2

    exit "${status}"
}

trap cleanup EXIT
trap 'on_error "$LINENO"' ERR
trap 'exit 130' INT
trap 'exit 143' TERM

# ==============================================================================
# General helpers
# ==============================================================================

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

is_interactive() {
    [[ -r /dev/tty || -t 0 ]]
}

read_answer() {
    local prompt="$1"
    local answer=""

    if [[ -r /dev/tty ]]; then
        printf '%s' "${prompt}" > /dev/tty
        IFS= read -r answer < /dev/tty || true
    elif [[ -t 0 ]]; then
        printf '%s' "${prompt}"
        IFS= read -r answer || true
    fi

    printf '%s' "${answer}"
}

confirm() {
    local prompt="$1"
    local default_answer="${2:-yes}"
    local answer=""

    while true; do
        if [[ "${default_answer}" == "yes" ]]; then
            answer="$(read_answer "${prompt} [Y/n]: ")"
            answer="${answer:-y}"
        else
            answer="$(read_answer "${prompt} [y/N]: ")"
            answer="${answer:-n}"
        fi

        case "${answer}" in
            y|Y|yes|Yes|YES)
                return 0
                ;;
            n|N|no|No|NO)
                return 1
                ;;
            *)
                warning "Please answer Y or N."
                ;;
        esac
    done
}

create_directories() {
    mkdir -p \
        "${BIN_DIR}" \
        "${APP_DIR}" \
        "${APPLICATIONS_DIR}"
}

# ==============================================================================
# Distribution and privilege detection
# ==============================================================================

detect_distribution() {
    DISTRO_NAME="Unknown Linux distribution"
    PACKAGE_MANAGER=""

    if [[ -r /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release

        DISTRO_NAME="${PRETTY_NAME:-${NAME:-Unknown Linux distribution}}"
    fi

    if command_exists pacman; then
        PACKAGE_MANAGER="pacman"
    elif command_exists apt-get; then
        PACKAGE_MANAGER="apt"
    elif command_exists dnf; then
        PACKAGE_MANAGER="dnf"
    elif command_exists zypper; then
        PACKAGE_MANAGER="zypper"
    elif command_exists apk; then
        PACKAGE_MANAGER="apk"
    elif command_exists xbps-install; then
        PACKAGE_MANAGER="xbps"
    elif command_exists eopkg; then
        PACKAGE_MANAGER="eopkg"
    elif command_exists emerge; then
        PACKAGE_MANAGER="emerge"
    elif command_exists nix-env; then
        PACKAGE_MANAGER="nix"
    fi

    if [[ "${EUID}" -eq 0 ]]; then
        PRIVILEGE_COMMAND=""
    elif command_exists sudo; then
        PRIVILEGE_COMMAND="sudo"
    elif command_exists doas; then
        PRIVILEGE_COMMAND="doas"
    else
        PRIVILEGE_COMMAND=""
    fi

    info "Detected system: ${DISTRO_NAME}"

    if [[ -n "${PACKAGE_MANAGER}" ]]; then
        info "Detected package manager: ${PACKAGE_MANAGER}"
    else
        warning "The package manager could not be identified."
    fi
}

run_privileged() {
    if [[ "${EUID}" -eq 0 ]]; then
        "$@"
        return
    fi

    if [[ -z "${PRIVILEGE_COMMAND}" ]]; then
        failure "Installing system packages requires administrator privileges."
        printf '\n'
        printf 'Neither sudo nor doas was found.\n'
        printf 'Run the displayed package command manually as root, then rerun this installer.\n'
        return 1
    fi

    "${PRIVILEGE_COMMAND}" "$@"
}

display_privilege_prefix() {
    if [[ "${EUID}" -eq 0 ]]; then
        printf ''
    elif [[ -n "${PRIVILEGE_COMMAND}" ]]; then
        printf '%s ' "${PRIVILEGE_COMMAND}"
    else
        printf 'sudo '
    fi
}

# ==============================================================================
# Installer dependencies
# ==============================================================================

required_commands_available() {
    local command_name

    for command_name in \
        curl \
        jq \
        sha256sum \
        install \
        mktemp \
        awk \
        grep \
        find \
        sort \
        head \
        sed
    do
        if ! command_exists "${command_name}"; then
            return 1
        fi
    done

    return 0
}

list_missing_commands() {
    local command_name

    for command_name in \
        curl \
        jq \
        sha256sum \
        install \
        mktemp \
        awk \
        grep \
        find \
        sort \
        head \
        sed
    do
        if ! command_exists "${command_name}"; then
            printf '  - %s\n' "${command_name}"
        fi
    done
}

print_tool_install_command() {
    local prefix=""
    prefix="$(display_privilege_prefix)"

    case "${PACKAGE_MANAGER}" in
        pacman)
            printf '%spacman -S --needed curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        apt)
            printf '%sapt-get update\n' "${prefix}"
            printf '%sapt-get install curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        dnf)
            printf '%sdnf install curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        zypper)
            printf '%szypper install curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        apk)
            printf '%sapk add curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        xbps)
            printf '%sxbps-install -S curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        eopkg)
            printf '%seopkg install curl jq coreutils findutils sed grep\n' \
                "${prefix}"
            ;;
        emerge)
            printf '%semerge --ask net-misc/curl app-misc/jq sys-apps/coreutils sys-apps/findutils sys-apps/sed sys-apps/grep\n' \
                "${prefix}"
            ;;
        nix)
            printf 'nix-env -iA nixpkgs.curl nixpkgs.jq nixpkgs.coreutils nixpkgs.findutils nixpkgs.gnused nixpkgs.gnugrep\n'
            ;;
        *)
            printf 'Install curl, jq, coreutils, findutils, sed, and grep using your package manager.\n'
            ;;
    esac
}

install_required_tools() {
    case "${PACKAGE_MANAGER}" in
        pacman)
            run_privileged pacman -S --needed \
                curl jq coreutils findutils sed grep
            ;;
        apt)
            run_privileged apt-get update
            run_privileged apt-get install -y \
                curl jq coreutils findutils sed grep
            ;;
        dnf)
            run_privileged dnf install -y \
                curl jq coreutils findutils sed grep
            ;;
        zypper)
            run_privileged zypper --non-interactive install \
                curl jq coreutils findutils sed grep
            ;;
        apk)
            run_privileged apk add \
                curl jq coreutils findutils sed grep
            ;;
        xbps)
            run_privileged xbps-install -Sy \
                curl jq coreutils findutils sed grep
            ;;
        eopkg)
            run_privileged eopkg install -y \
                curl jq coreutils findutils sed grep
            ;;
        emerge)
            run_privileged emerge --ask=n \
                net-misc/curl \
                app-misc/jq \
                sys-apps/coreutils \
                sys-apps/findutils \
                sys-apps/sed \
                sys-apps/grep
            ;;
        nix)
            nix-env -iA \
                nixpkgs.curl \
                nixpkgs.jq \
                nixpkgs.coreutils \
                nixpkgs.findutils \
                nixpkgs.gnused \
                nixpkgs.gnugrep
            ;;
        *)
            return 1
            ;;
    esac
}

ensure_required_tools() {
    section "Checking installer requirements"

    if required_commands_available; then
        success "All required installer tools are available."
        return
    fi

    warning "Some required installer tools are missing:"
    list_missing_commands

    printf '\n'
    printf 'This installer uses:\n'
    printf '  curl       Download JoeAnimeDB and query GitHub\n'
    printf '  jq         Read GitHub release metadata\n'
    printf '  coreutils  Verify and install files\n'
    printf '  findutils  Locate the icon inside the AppImage\n'
    printf '\n'
    printf 'Recommended command:\n'
    print_tool_install_command
    printf '\n'

    if [[ -z "${PACKAGE_MANAGER}" ]]; then
        die "Install the missing tools manually, then run this installer again."
    fi

    if ! is_interactive; then
        die "Install the missing tools using the command above, then rerun the installer."
    fi

    if ! confirm "Would you like the installer to install these tools now?" "yes"; then
        printf '\n'
        info "Installation cancelled before downloading JoeAnimeDB."
        printf 'Install the missing tools using the command above, then rerun this installer.\n'
        exit 0
    fi

    info "Installing required tools."

    if ! install_required_tools; then
        die "The required tools could not be installed automatically."
    fi

    if ! required_commands_available; then
        die "The package command completed, but required tools are still missing."
    fi

    success "Required installer tools are now available."
}

# ==============================================================================
# FUSE detection and installation
# ==============================================================================

fuse2_available() {
    local library=""

    for library in \
        /usr/lib/libfuse.so.2 \
        /usr/lib64/libfuse.so.2 \
        /lib/libfuse.so.2 \
        /lib64/libfuse.so.2
    do
        if [[ -e "${library}" ]]; then
            return 0
        fi
    done

    if command_exists ldconfig &&
       ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
        return 0
    fi

    return 1
}

apt_fuse_package() {
    if command_exists apt-cache &&
       apt-cache show libfuse2t64 >/dev/null 2>&1; then
        printf '%s' "libfuse2t64"
    else
        printf '%s' "libfuse2"
    fi
}

print_fuse_install_command() {
    local prefix=""
    local apt_package=""

    prefix="$(display_privilege_prefix)"

    case "${PACKAGE_MANAGER}" in
        pacman)
            printf '%spacman -S --needed fuse2\n' "${prefix}"
            ;;
        apt)
            apt_package="$(apt_fuse_package)"
            printf '%sapt-get update\n' "${prefix}"
            printf '%sapt-get install %s\n' "${prefix}" "${apt_package}"
            ;;
        dnf)
            printf '%sdnf install fuse-libs\n' "${prefix}"
            ;;
        zypper)
            printf '%szypper install libfuse2\n' "${prefix}"
            ;;
        apk)
            printf '%sapk add fuse\n' "${prefix}"
            ;;
        xbps)
            printf '%sxbps-install -S fuse\n' "${prefix}"
            ;;
        eopkg)
            printf '%seopkg install fuse\n' "${prefix}"
            ;;
        emerge)
            printf '%semerge --ask sys-fs/fuse\n' "${prefix}"
            ;;
        nix)
            printf 'Configure AppImage/FUSE support through the NixOS system configuration.\n'
            ;;
        *)
            printf 'Install the package that provides libfuse.so.2.\n'
            ;;
    esac
}

install_fuse2() {
    local apt_package=""

    case "${PACKAGE_MANAGER}" in
        pacman)
            run_privileged pacman -S --needed fuse2
            ;;
        apt)
            apt_package="$(apt_fuse_package)"
            run_privileged apt-get update
            run_privileged apt-get install -y "${apt_package}"
            ;;
        dnf)
            run_privileged dnf install -y fuse-libs
            ;;
        zypper)
            run_privileged zypper --non-interactive install libfuse2
            ;;
        apk)
            run_privileged apk add fuse
            ;;
        xbps)
            run_privileged xbps-install -Sy fuse
            ;;
        eopkg)
            run_privileged eopkg install -y fuse
            ;;
        emerge)
            run_privileged emerge --ask=n sys-fs/fuse
            ;;
        *)
            return 1
            ;;
    esac
}

ensure_fuse2() {
    section "Checking AppImage support"

    if fuse2_available; then
        success "FUSE 2 compatibility support is available."
        return
    fi

    warning "The FUSE 2 compatibility library was not detected."

    printf '\n'
    printf 'JoeAnimeDB is distributed as an AppImage.\n'
    printf 'The AppImage requires the compatibility library:\n'
    printf '\n'
    printf '  libfuse.so.2\n'
    printf '\n'
    printf 'Recommended installation command:\n'
    printf '\n'
    print_fuse_install_command
    printf '\n'

    if [[ -z "${PACKAGE_MANAGER}" || "${PACKAGE_MANAGER}" == "nix" ]]; then
        die "Install FUSE 2 manually using the guidance above, then rerun this installer."
    fi

    if ! is_interactive; then
        die "FUSE 2 must be installed before JoeAnimeDB can be installed."
    fi

    if ! confirm "Would you like the installer to install FUSE 2 now?" "yes"; then
        printf '\n'
        info "JoeAnimeDB installation cancelled before downloading anything."
        printf '\n'
        printf 'Install FUSE 2 manually with:\n'
        printf '\n'
        print_fuse_install_command
        printf '\n'
        printf 'Then run the installer again:\n'
        printf '\n'
        printf '  %s\n' "${INSTALL_COMMAND}"
        printf '\n'
        exit 0
    fi

    info "Installing FUSE 2 compatibility support."

    if ! install_fuse2; then
        die "FUSE 2 could not be installed automatically."
    fi

    if ! fuse2_available; then
        failure "The package manager completed, but libfuse.so.2 is still unavailable."
        printf '\n'
        printf 'Try opening a new terminal or restarting the computer.\n'
        printf 'Your distribution may require a different FUSE 2 compatibility package.\n'
        exit 1
    fi

    success "FUSE 2 compatibility support is now available."
}

# ==============================================================================
# GitHub release lookup
# ==============================================================================

get_latest_release() {
    local release_json=""
    local selected_release=""
    local stable_appimage_available="false"

    section "Finding the newest release"

    info "Checking GitHub for JoeAnimeDB releases."

    release_json="$(
        curl \
            --fail \
            --silent \
            --show-error \
            --location \
            --retry 3 \
            --retry-delay 2 \
            --connect-timeout 15 \
            --max-time 60 \
            --header "Accept: application/vnd.github+json" \
            --header "X-GitHub-Api-Version: 2022-11-28" \
            "${GITHUB_API}/releases?per_page=50"
    )" || die "GitHub release information could not be downloaded."

    if ! jq -e 'type == "array"' >/dev/null 2>&1 <<< "${release_json}"; then
        failure "GitHub returned an unexpected response."

        jq -r '.message // empty' <<< "${release_json}" 2>/dev/null || true

        exit 1
    fi

    stable_appimage_available="$(
        jq -r '
            [
                .[]
                | select(.draft == false)
                | select(.prerelease == false)
                | . as $release
                | .assets[]
                | select(.state == "uploaded")
                | select(.name | test("\\.AppImage$"; "i"))
            ]
            | if length > 0 then "true" else "false" end
        ' <<< "${release_json}"
    )"

    selected_release="$(
        jq -c --argjson include_prereleases "${INCLUDE_PRERELEASES}" '
            [
                .[]
                | select(.draft == false)
                | . as $release
                | .assets[]
                | select(.state == "uploaded")
                | select(.name | test("\\.AppImage$"; "i"))
                | {
                    tag: $release.tag_name,
                    prerelease: $release.prerelease,
                    published_at: ($release.published_at // $release.created_at),
                    name: .name,
                    url: .browser_download_url,
                    digest: (.digest // "")
                }
            ] as $releases
            | (
                if $include_prereleases or
                   ([$releases[] | select(.prerelease == false)] | length) == 0
                then $releases
                else [$releases[] | select(.prerelease == false)]
                end
              )
            | sort_by(.published_at // "")
            | reverse
            | .[0]
        ' <<< "${release_json}"
    )"

    if [[ -z "${selected_release}" || "${selected_release}" == "null" ]]; then
        die "No published JoeAnimeDB AppImage asset was found."
    fi

    RELEASE_TAG="$(jq -r '.tag' <<< "${selected_release}")"
    RELEASE_NAME="$(jq -r '.name' <<< "${selected_release}")"
    RELEASE_URL="$(jq -r '.url' <<< "${selected_release}")"
    RELEASE_DIGEST="$(
        jq -r '.digest' <<< "${selected_release}" |
            sed 's/^sha256://'
    )"
    RELEASE_PRERELEASE="$(
        jq -r '.prerelease' <<< "${selected_release}"
    )"

    if [[ -z "${RELEASE_TAG}" ||
          -z "${RELEASE_NAME}" ||
          -z "${RELEASE_URL}" ||
          "${RELEASE_URL}" == "null" ]]; then
        die "The selected GitHub release is missing required information."
    fi

    success "Newest AppImage release: ${RELEASE_TAG}"

    if [[ "${RELEASE_PRERELEASE}" == "true" ]]; then
        if [[ "${INCLUDE_PRERELEASES}" == "true" ]]; then
            warning "${RELEASE_TAG} is a prerelease version selected from the beta channel."
        elif [[ "${stable_appimage_available}" == "false" ]]; then
            warning "No stable AppImage release is available yet."
            warning "Using the newest prerelease: ${RELEASE_TAG}"
        else
            warning "${RELEASE_TAG} is a prerelease version."
        fi
    fi
}

# ==============================================================================
# Existing installation detection
# ==============================================================================

installed_version() {
    if [[ -r "${VERSION_PATH}" ]]; then
        cat "${VERSION_PATH}"
    fi
}

same_version_installed() {
    local current_version=""

    current_version="$(installed_version)"

    [[ -n "${current_version}" &&
       "${current_version}" == "${RELEASE_TAG}" &&
       -x "${APPIMAGE_PATH}" ]]
}

# ==============================================================================
# Temporary files, download, and verification
# ==============================================================================

prepare_temporary_directory() {
    TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/joeanime-db.XXXXXX")"
    TEMP_APPIMAGE="${TEMP_DIR}/${RELEASE_NAME}"
    TEMP_EXTRACTED_DIR="${TEMP_DIR}/appimage-extracted"
}

download_appimage() {
    section "Downloading JoeAnimeDB"

    info "Downloading ${RELEASE_NAME}."
    info "Version: ${RELEASE_TAG}"

    curl \
        --fail \
        --location \
        --retry 3 \
        --retry-delay 2 \
        --connect-timeout 20 \
        --progress-bar \
        "${RELEASE_URL}" \
        --output "${TEMP_APPIMAGE}" ||
        die "The JoeAnimeDB AppImage download failed."

    if [[ ! -s "${TEMP_APPIMAGE}" ]]; then
        die "The downloaded AppImage is empty."
    fi

    chmod 0755 "${TEMP_APPIMAGE}"

    success "Download completed."
}

verify_appimage() {
    local actual_digest=""

    section "Verifying download"

    if [[ -z "${RELEASE_DIGEST}" ||
          "${RELEASE_DIGEST}" == "null" ]]; then
        warning "GitHub did not publish a SHA-256 digest for this asset."
        warning "The installer cannot cryptographically verify the download."

        if is_interactive; then
            if ! confirm "Continue without checksum verification?" "no"; then
                info "Installation cancelled."
                exit 0
            fi
        else
            die "Checksum verification is unavailable in noninteractive mode."
        fi

        return
    fi

    info "Calculating the downloaded file's SHA-256 checksum."

    actual_digest="$(
        sha256sum "${TEMP_APPIMAGE}" |
            awk '{print $1}'
    )"

    if [[ "${actual_digest}" != "${RELEASE_DIGEST}" ]]; then
        failure "SHA-256 checksum verification failed."

        printf '\n'
        printf 'Expected:\n'
        printf '  %s\n' "${RELEASE_DIGEST}"
        printf '\n'
        printf 'Received:\n'
        printf '  %s\n' "${actual_digest}"
        printf '\n'
        printf 'The downloaded file will not be installed.\n'

        exit 1
    fi

    success "The GitHub SHA-256 checksum matches."
}

# ==============================================================================
# Icon extraction
# ==============================================================================

extract_appimage_for_icon() {
    mkdir -p "${TEMP_EXTRACTED_DIR}"

    info "Examining the AppImage for its application icon."

    if ! (
        cd "${TEMP_EXTRACTED_DIR}"
        "${TEMP_APPIMAGE}" --appimage-extract >/dev/null 2>&1
    ); then
        warning "The AppImage contents could not be inspected."
        warning "A generic application icon will be used."
        return 1
    fi

    return 0
}

find_bundled_icon() {
    local squashfs_dir="${TEMP_EXTRACTED_DIR}/squashfs-root"
    local found_icon=""

    if [[ ! -d "${squashfs_dir}" ]]; then
        return 1
    fi

    # Prefer an explicit JoeAnimeDB PNG.
    found_icon="$(
        find "${squashfs_dir}" -type f \
            \( \
                -iname 'joeanime-db.png' -o \
                -iname 'joeanime_db.png' -o \
                -iname 'joeanime*.png' -o \
                -iname 'JoeAnimeDB.png' \
            \) \
            -print 2>/dev/null |
            head -n 1
    )"

    if [[ -n "${found_icon}" ]]; then
        printf '%s\n' "${found_icon}"
        return 0
    fi

    # Prefer an explicit JoeAnimeDB SVG next.
    found_icon="$(
        find "${squashfs_dir}" -type f \
            \( \
                -iname 'joeanime-db.svg' -o \
                -iname 'joeanime_db.svg' -o \
                -iname 'joeanime*.svg' -o \
                -iname 'JoeAnimeDB.svg' \
            \) \
            -print 2>/dev/null |
            head -n 1
    )"

    if [[ -n "${found_icon}" ]]; then
        printf '%s\n' "${found_icon}"
        return 0
    fi

    # AppImages commonly use .DirIcon as their primary icon.
    if [[ -e "${squashfs_dir}/.DirIcon" ]]; then
        found_icon="$(
            readlink -f "${squashfs_dir}/.DirIcon" 2>/dev/null || true
        )"

        if [[ -n "${found_icon}" && -f "${found_icon}" ]]; then
            printf '%s\n' "${found_icon}"
            return 0
        fi
    fi

    # Prefer icons from freedesktop application icon locations.
    found_icon="$(
        find "${squashfs_dir}/usr/share/icons" -type f \
            \( -iname '*.png' -o -iname '*.svg' \) \
            -path '*/apps/*' \
            -print 2>/dev/null |
            head -n 1
    )"

    if [[ -n "${found_icon}" ]]; then
        printf '%s\n' "${found_icon}"
        return 0
    fi

    # Last resort: use the largest PNG found in the AppImage.
    found_icon="$(
        find "${squashfs_dir}" -type f -iname '*.png' \
            -printf '%s\t%p\n' 2>/dev/null |
            sort -nr |
            head -n 1 |
            awk -F '\t' '{print $2}'
    )"

    if [[ -n "${found_icon}" ]]; then
        printf '%s\n' "${found_icon}"
        return 0
    fi

    # Final fallback: any SVG.
    found_icon="$(
        find "${squashfs_dir}" -type f -iname '*.svg' \
            -print 2>/dev/null |
            head -n 1
    )"

    if [[ -n "${found_icon}" ]]; then
        printf '%s\n' "${found_icon}"
        return 0
    fi

    return 1
}

install_bundled_icon() {
    local found_icon=""

    section "Installing application icon"

    rm -f -- "${ICON_PNG_PATH}" "${ICON_SVG_PATH}"

    if ! extract_appimage_for_icon; then
        return 0
    fi

    found_icon="$(find_bundled_icon || true)"

    if [[ -z "${found_icon}" || ! -f "${found_icon}" ]]; then
        warning "No usable application icon was found inside the AppImage."
        warning "A generic application icon will be used."
        return 0
    fi

    case "${found_icon,,}" in
        *.svg)
            install -m 0644 "${found_icon}" "${ICON_SVG_PATH}"
            success "SVG application icon installed:"
            printf '  %s\n' "${ICON_SVG_PATH}"
            ;;
        *)
            install -m 0644 "${found_icon}" "${ICON_PNG_PATH}"
            success "PNG application icon installed:"
            printf '  %s\n' "${ICON_PNG_PATH}"
            ;;
    esac
}

installed_icon_path() {
    if [[ -f "${ICON_PNG_PATH}" ]]; then
        printf '%s\n' "${ICON_PNG_PATH}"
    elif [[ -f "${ICON_SVG_PATH}" ]]; then
        printf '%s\n' "${ICON_SVG_PATH}"
    else
        printf '%s\n' "applications-multimedia"
    fi
}

# ==============================================================================
# Legacy cleanup
# ==============================================================================

clean_legacy_installation() {
    local removed="false"

    section "Cleaning older installer files"

    if [[ -e "${LEGACY_BIN_APPIMAGE}" ||
          -L "${LEGACY_BIN_APPIMAGE}" ]]; then
        rm -f -- "${LEGACY_BIN_APPIMAGE}"
        info "Removed legacy AppImage:"
        printf '  %s\n' "${LEGACY_BIN_APPIMAGE}"
        removed="true"
    fi

    if [[ -e "${LEGACY_MIXED_CASE_LAUNCHER}" ||
          -L "${LEGACY_MIXED_CASE_LAUNCHER}" ]]; then
        rm -f -- "${LEGACY_MIXED_CASE_LAUNCHER}"
        info "Removed legacy mixed-case terminal launcher:"
        printf '  %s\n' "${LEGACY_MIXED_CASE_LAUNCHER}"
        removed="true"
    fi

    if [[ -e "${LEGACY_DESKTOP_PATH}" ||
          -L "${LEGACY_DESKTOP_PATH}" ]]; then
        rm -f -- "${LEGACY_DESKTOP_PATH}"
        info "Removed legacy desktop entry:"
        printf '  %s\n' "${LEGACY_DESKTOP_PATH}"
        removed="true"
    fi

    if [[ -d "${LEGACY_EXTRACTED_DIR}" ]]; then
        rm -rf -- "${LEGACY_EXTRACTED_DIR}"
        info "Removed old permanently extracted application files."
        removed="true"
    fi

    if [[ "${removed}" == "false" ]]; then
        success "No legacy installer files needed removal."
    else
        success "Legacy installer files cleaned."
    fi
}

# ==============================================================================
# Application installation
# ==============================================================================

install_appimage() {
    section "Installing JoeAnimeDB"

    create_directories

    rm -f -- "${STAGED_APPIMAGE_PATH}" "${STAGED_VERSION_PATH}"

    install \
        -m 0755 \
        "${TEMP_APPIMAGE}" \
        "${STAGED_APPIMAGE_PATH}"

    printf '%s\n' "${RELEASE_TAG}" > "${STAGED_VERSION_PATH}"
    chmod 0644 "${STAGED_VERSION_PATH}"

    # Staging beside the destinations makes each rename atomic. If a download
    # or copy is interrupted, the currently installed AppImage remains intact.
    mv -f -- "${STAGED_APPIMAGE_PATH}" "${APPIMAGE_PATH}"
    mv -f -- "${STAGED_VERSION_PATH}" "${VERSION_PATH}"

    success "AppImage installed:"
    printf '  %s\n' "${APPIMAGE_PATH}"
}

create_launcher() {
    info "Creating the JoeAnimeDB terminal command."

    cat > "${LAUNCHER_PATH}" <<EOF
#!/usr/bin/env bash

set -euo pipefail

readonly APPIMAGE="${APPIMAGE_PATH}"

if [[ ! -x "\${APPIMAGE}" ]]; then
    printf 'JoeAnimeDB is not installed correctly.\\n' >&2
    printf 'The AppImage is missing or not executable:\\n' >&2
    printf '  %s\\n' "\${APPIMAGE}" >&2
    printf '\\nRun the JoeAnimeDB installer again to repair it.\\n' >&2
    exit 1
fi

exec "\${APPIMAGE}" "\$@"
EOF

    chmod 0755 "${LAUNCHER_PATH}"

    success "Terminal command created:"
    printf '  %s\n' "${COMMAND_NAME}"
}

create_desktop_entry() {
    local icon_value=""

    info "Creating the desktop application entry."

    icon_value="$(installed_icon_path)"

    {
        printf '%s\n' '[Desktop Entry]'
        printf '%s\n' 'Version=1.0'
        printf '%s\n' 'Type=Application'
        printf '%s\n' 'Name=JoeAnimeDB'
        printf '%s\n' 'GenericName=Anime Database Manager'
        printf '%s\n' 'Comment=Manage and browse an anime database'
        printf 'Exec="%s"\n' "${LAUNCHER_PATH}"
        printf 'TryExec=%s\n' "${LAUNCHER_PATH}"
        printf 'Icon=%s\n' "${icon_value}"
        printf '%s\n' 'Terminal=false'
        printf '%s\n' 'Categories=AudioVideo;Database;'
        printf '%s\n' 'Keywords=anime;database;media;'
        printf '%s\n' 'StartupNotify=true'
    } > "${DESKTOP_PATH}"

    chmod 0644 "${DESKTOP_PATH}"

    if command_exists update-desktop-database; then
        update-desktop-database "${APPLICATIONS_DIR}" \
            >/dev/null 2>&1 || true
    fi

    success "Desktop application entry created:"
    printf '  %s\n' "${DESKTOP_PATH}"
}

warn_about_path() {
    case ":${PATH}:" in
        *":${BIN_DIR}:"*)
            success "${BIN_DIR} is present in PATH."
            ;;
        *)
            warning "${BIN_DIR} is not present in the current PATH."

            printf '\n'
            printf 'JoeAnimeDB can still be launched from the application menu.\n'
            printf '\n'
            printf 'To enable the terminal command, add this line to your shell configuration:\n'
            printf '\n'
            printf '  export PATH="$HOME/.local/bin:$PATH"\n'
            printf '\n'
            printf 'For Zsh, add it to:\n'
            printf '  ~/.zshrc\n'
            printf '\n'
            printf 'For Bash, add it to:\n'
            printf '  ~/.bashrc\n'
            ;;
    esac
}

# ==============================================================================
# Already-installed repair
# ==============================================================================

repair_existing_integration() {
    section "Checking existing installation"

    success "JoeAnimeDB ${RELEASE_TAG} is already installed."
    info "The AppImage will not be downloaded again."

    create_directories
    create_launcher
    create_desktop_entry
    warn_about_path

    printf '\n'
    printf '%sJoeAnimeDB is already current.%s\n' "${BOLD}" "${RESET}"
    printf '\n'
    printf 'Launch it with:\n'
    printf '\n'
    printf '  %s\n' "${COMMAND_NAME}"
    printf '\n'
    printf 'Use --force to download and reinstall the same version.\n'
}

# ==============================================================================
# Installation summary
# ==============================================================================

show_install_summary() {
    printf '\n'
    printf '%s%s╭────────────────────────────────────────────────────────────╮%s\n' \
        "${BOLD}" "${GREEN}" "${RESET}"
    printf '%s%s│             JoeAnimeDB installed successfully             │%s\n' \
        "${BOLD}" "${GREEN}" "${RESET}"
    printf '%s%s╰────────────────────────────────────────────────────────────╯%s\n' \
        "${BOLD}" "${GREEN}" "${RESET}"
    printf '\n'

    printf 'Installed version:\n'
    printf '  %s\n' "${RELEASE_TAG}"
    printf '\n'

    printf 'Launch from a terminal:\n'
    printf '  %s\n' "${COMMAND_NAME}"
    printf '\n'

    printf 'JoeAnimeDB should also appear in your application launcher.\n'
    printf '\n'

    printf 'Installed AppImage:\n'
    printf '  %s\n' "${APPIMAGE_PATH}"
    printf '\n'

    printf 'Check for updates later:\n'
    printf '  %s\n' "${INSTALL_COMMAND}"
    printf '\n'

    printf 'Include prerelease versions:\n'
    printf '  %s\n' "${PRERELEASE_COMMAND}"
    printf '\n'

    printf 'Force reinstall:\n'
    printf '  %s\n' "${FORCE_COMMAND}"
    printf '\n'

    printf 'Uninstall:\n'
    printf '  %s\n' "${UNINSTALL_COMMAND}"
    printf '\n'

    printf '%sJoeAnimeDB was not launched automatically.%s\n' \
        "${DIM}" "${RESET}"
    printf '%sYour databases and settings were not modified.%s\n' \
        "${DIM}" "${RESET}"
}

# ==============================================================================
# Main installation workflow
# ==============================================================================

install_application() {
    print_header

    detect_distribution
    ensure_required_tools
    ensure_fuse2
    get_latest_release
    create_directories
    clean_legacy_installation

    if same_version_installed && [[ "${FORCE_INSTALL}" != "true" ]]; then
        repair_existing_integration
        return
    fi

    prepare_temporary_directory
    download_appimage
    verify_appimage
    install_appimage
    install_bundled_icon
    create_launcher
    create_desktop_entry
    warn_about_path
    show_install_summary
}

# ==============================================================================
# Uninstallation
# ==============================================================================

uninstall_application() {
    local removed="false"

    print_header
    section "Uninstalling JoeAnimeDB"

    printf 'This removes only files managed by this installer:\n'
    printf '\n'
    printf '  %s\n' "${APP_DIR}"
    printf '  %s\n' "${LAUNCHER_PATH}"
    printf '  %s\n' "${DESKTOP_PATH}"
    printf '  %s\n' "${LEGACY_BIN_APPIMAGE}"
    printf '  %s\n' "${LEGACY_MIXED_CASE_LAUNCHER}"
    printf '  %s\n' "${LEGACY_DESKTOP_PATH}"
    printf '\n'
    printf 'JoeAnimeDB databases, settings, caches, and user-created data\n'
    printf 'will be preserved.\n'
    printf '\n'

    if is_interactive; then
        if ! confirm "Continue with uninstall?" "yes"; then
            info "Uninstall cancelled."
            exit 0
        fi
    fi

    if [[ -d "${APP_DIR}" ]]; then
        rm -rf -- "${APP_DIR}"
        success "Removed application files."
        removed="true"
    fi

    if [[ -e "${LAUNCHER_PATH}" ||
          -L "${LAUNCHER_PATH}" ]]; then
        rm -f -- "${LAUNCHER_PATH}"
        success "Removed terminal launcher."
        removed="true"
    fi

    if [[ -e "${DESKTOP_PATH}" ||
          -L "${DESKTOP_PATH}" ]]; then
        rm -f -- "${DESKTOP_PATH}"
        success "Removed desktop application entry."
        removed="true"
    fi

    if [[ -e "${LEGACY_BIN_APPIMAGE}" ||
          -L "${LEGACY_BIN_APPIMAGE}" ]]; then
        rm -f -- "${LEGACY_BIN_APPIMAGE}"
        success "Removed legacy AppImage."
        removed="true"
    fi

    if [[ -e "${LEGACY_MIXED_CASE_LAUNCHER}" ||
          -L "${LEGACY_MIXED_CASE_LAUNCHER}" ]]; then
        rm -f -- "${LEGACY_MIXED_CASE_LAUNCHER}"
        success "Removed legacy mixed-case terminal launcher."
        removed="true"
    fi

    if [[ -e "${LEGACY_DESKTOP_PATH}" ||
          -L "${LEGACY_DESKTOP_PATH}" ]]; then
        rm -f -- "${LEGACY_DESKTOP_PATH}"
        success "Removed legacy desktop entry."
        removed="true"
    fi

    if command_exists update-desktop-database; then
        update-desktop-database "${APPLICATIONS_DIR}" \
            >/dev/null 2>&1 || true
    fi

    printf '\n'

    if [[ "${removed}" == "true" ]]; then
        printf '%s%sJoeAnimeDB was uninstalled successfully.%s\n' \
            "${BOLD}" "${GREEN}" "${RESET}"
    else
        info "No JoeAnimeDB installation managed by this script was found."
    fi

    printf '\n'
    printf 'JoeAnimeDB databases, settings, caches, and user-created data were preserved.\n'
}

# ==============================================================================
# Help
# ==============================================================================

show_help() {
    cat <<EOF
JoeAnimeDB Linux Installer

INSTALL OR UPDATE

  ${INSTALL_COMMAND}

INCLUDE PRERELEASES

  ${PRERELEASE_COMMAND}

FORCE REINSTALL

  ${FORCE_COMMAND}

UNINSTALL

  ${UNINSTALL_COMMAND}

OPTIONS

  --install
      Install or update JoeAnimeDB.

  --update
      Install or update JoeAnimeDB.

  --force
      Download and reinstall JoeAnimeDB even if the newest version
      is already installed.

  --prerelease
      Include prerelease versions when selecting the newest AppImage.
      Without this option, the installer prefers stable releases and
      uses a prerelease only when no stable AppImage is available.

  --uninstall
      Remove files managed by this installer.

  --help
      Display this help.

INSTALLATION LOCATIONS

  AppImage:
    ${APPIMAGE_PATH}

  Installed version marker:
    ${VERSION_PATH}

  Terminal launcher:
    ${LAUNCHER_PATH}

  Desktop entry:
    ${DESKTOP_PATH}

IMPORTANT

  Stable AppImage releases are preferred by default. Until a stable
  AppImage exists, the newest prerelease is installed automatically.

  Uninstalling preserves JoeAnimeDB databases, settings, caches,
  and user-created data.

  The installer does not automatically launch JoeAnimeDB.
EOF
}

# ==============================================================================
# Command-line processing
# ==============================================================================

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --install|--update)
            REQUESTED_ACTION="install"
            ;;

        --force)
            FORCE_INSTALL="true"
            ;;

        --prerelease)
            INCLUDE_PRERELEASES="true"
            ;;

        --uninstall|-u)
            REQUESTED_ACTION="uninstall"
            ;;

        --help|-h)
            show_help
            exit 0
            ;;

        *)
            failure "Unknown option: $1"
            printf '\n'
            show_help
            exit 2
            ;;
    esac

    shift
done

case "${REQUESTED_ACTION}" in
    install)
        install_application
        ;;

    uninstall)
        uninstall_application
        ;;
esac
