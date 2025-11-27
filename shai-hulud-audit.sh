#!/usr/bin/env bash

##############################################
#  Security Audit Script – Shai-Hulud / Copr Detection
#  Works on: Fedora, Rocky, CentOS, RHEL, Ubuntu,
#            GitHub Actions Ubuntu runners
##############################################

### ───────────────────────────────
###  Detect GitHub CI environment
### ───────────────────────────────
IN_CI=false
if [[ -n "$GITHUB_ACTIONS" ]]; then
    IN_CI=true
fi

### ───────────────────────────────
###  COLOR SUPPORT (auto-disable in CI/Non-TTY)
### ───────────────────────────────
if [[ -t 1 && "$1" != "--no-color" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; NC=""
fi

### ───────────────────────────────
###  TEMP FILES
### ───────────────────────────────
TMP_COPR=$(mktemp)
TMP_SCRIPTS=$(mktemp)

### ───────────────────────────────
###  REPORT HANDLING
### ───────────────────────────────
SAVE_REPORT=false
REPORT_PATH=""

if [[ "$1" == "--save-report" || "$2" == "--save-report" ]]; then
    SAVE_REPORT=true
    REPORT_PATH="security_audit_$(date +%Y%m%d_%H%M%S).log"
fi

### GitHub step summary support
if $IN_CI; then
    SUMMARY="$GITHUB_STEP_SUMMARY"
fi

log() {
    echo -e "$1"
    if $SAVE_REPORT; then echo -e "$1" >> "$REPORT_PATH"; fi
    if $IN_CI; then echo -e "$1" >> "$SUMMARY"; fi
}

warn() {
    echo -e "$RED$1$NC"
    if $SAVE_REPORT; then echo -e "$RED$1$NC" >> "$REPORT_PATH"; fi
    if $IN_CI; then echo -e "$RED$1$NC" >> "$SUMMARY"; fi
}

### ───────────────────────────────
###  HEADER
### ───────────────────────────────
log "${YELLOW}──────────────────────────────────────────────"
log " Security Audit : Shai-Hulud / Copr Detection"
log "──────────────────────────────────────────────${NC}"

###########################
#  OS DETECTION
###########################
OS=$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"')

log "Detected OS: $OS"

###########################
# 1. CHECK COPR REPOS  (Fedora systems only)
###########################
log "\n${YELLOW}[1] Checking Copr repositories...${NC}"

if [[ "$OS" == "fedora" || "$OS" == "rhel" || "$OS" == "centos" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then

    grep -r "copr.fedorainfracloud.org" /etc/yum.repos.d/ > "$TMP_COPR" 2>/dev/null

    if [[ -s "$TMP_COPR" ]]; then
        warn "⚠️ Copr repositories detected:"
        log "$(cat "$TMP_COPR")"
    else
        log "${GREEN}✔ No active Copr repositories detected.${NC}"
    fi

else
    log "Skipping Copr scan: Not a Fedora-based system."
fi


###########################
# 2. RECENTLY INSTALLED PACKAGES
###########################
log "\n${YELLOW}[2] Last installed packages...${NC}"

if command -v rpm >/dev/null 2>&1; then
    rpm -qa --last | head -n 15 | tee -a "$REPORT_PATH" 2>/dev/null
elif command -v dpkg >/dev/null 2>&1; then
    log "(Debian/Ubuntu system detected)"
    dpkg -l | tail -n 20 | tee -a "$REPORT_PATH"
else
    warn "Package manager not recognized."
fi


###########################
# 3. IOC SCAN – Suspicious post-install scripts
###########################
log "\n${YELLOW}[3] Scanning RPM POSTIN scripts for suspicious curl/wget usage...${NC}"

if command -v rpm >/dev/null 2>&1; then
    rpm -qa --qf '%{NAME}-%{VERSION}-%{RELEASE} %{POSTIN}\n' \
      | grep -E "curl|wget" \
      | grep -v "fedoraproject.org" \
      > "$TMP_SCRIPTS"

    if [[ -s "$TMP_SCRIPTS" ]]; then
        warn "⚠️ Suspicious POST-IN scripts found:"
        log "$(head -n 10 "$TMP_SCRIPTS")"
    else
        log "${GREEN}✔ No suspicious POST-IN scripts detected.${NC}"
    fi

else
    log "Skipping: RPM not detected (likely Ubuntu CI)."
fi


###########################
# SUMMARY
###########################
log "\n${YELLOW}──────────────────────────────────────────────"
log "                 AUDIT SUMMARY"
log "──────────────────────────────────────────────${NC}"

if [[ -s "$TMP_COPR" ]]; then log " • Copr Repos: ${RED}Detected${NC}"
else log " • Copr Repos: ${GREEN}None${NC}"; fi

if [[ -s "$TMP_SCRIPTS" ]]; then log " • Suspicious Scripts: ${RED}Found${NC}"
else log " • Suspicious Scripts: ${GREEN}None${NC}"; fi


###########################
# EXIT CODES
###########################
# 0 = clean
# 1 = warning
# 2 = severe threat

EXIT_CODE=0
if [[ -s "$TMP_COPR" ]]; then EXIT_CODE=1; fi
if [[ -s "$TMP_SCRIPTS" ]]; then EXIT_CODE=2; fi

# CLEAN TEMP FILES
rm -f "$TMP_COPR" "$TMP_SCRIPTS"

log "\nAudit finished with exit code: $EXIT_CODE"

exit $EXIT_CODE
#!/usr/bin/env bash

##############################################
#  Security Audit Script – Shai-Hulud / Copr Detection
#  Works on: Fedora, Rocky, CentOS, RHEL, Ubuntu,
#            GitHub Actions Ubuntu runners
##############################################

### ───────────────────────────────
###  Detect GitHub CI environment
### ───────────────────────────────
IN_CI=false
if [[ -n "$GITHUB_ACTIONS" ]]; then
    IN_CI=true
fi

### ───────────────────────────────
###  COLOR SUPPORT (auto-disable in CI/Non-TTY)
### ───────────────────────────────
if [[ -t 1 && "$1" != "--no-color" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; NC=""
fi

### ───────────────────────────────
###  TEMP FILES
### ───────────────────────────────
TMP_COPR=$(mktemp)
TMP_SCRIPTS=$(mktemp)

### ───────────────────────────────
###  REPORT HANDLING
### ───────────────────────────────
SAVE_REPORT=false
REPORT_PATH=""

if [[ "$1" == "--save-report" || "$2" == "--save-report" ]]; then
    SAVE_REPORT=true
    REPORT_PATH="security_audit_$(date +%Y%m%d_%H%M%S).log"
fi

### GitHub step summary support
if $IN_CI; then
    SUMMARY="$GITHUB_STEP_SUMMARY"
fi

log() {
    echo -e "$1"
    if $SAVE_REPORT; then echo -e "$1" >> "$REPORT_PATH"; fi
    if $IN_CI; then echo -e "$1" >> "$SUMMARY"; fi
}

warn() {
    echo -e "$RED$1$NC"
    if $SAVE_REPORT; then echo -e "$RED$1$NC" >> "$REPORT_PATH"; fi
    if $IN_CI; then echo -e "$RED$1$NC" >> "$SUMMARY"; fi
}

### ───────────────────────────────
###  HEADER
### ───────────────────────────────
log "${YELLOW}──────────────────────────────────────────────"
log " Security Audit : Shai-Hulud / Copr Detection"
log "──────────────────────────────────────────────${NC}"

###########################
#  OS DETECTION
###########################
OS=$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"')

log "Detected OS: $OS"

###########################
# 1. CHECK COPR REPOS  (Fedora systems only)
###########################
log "\n${YELLOW}[1] Checking Copr repositories...${NC}"

if [[ "$OS" == "fedora" || "$OS" == "rhel" || "$OS" == "centos" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then

    grep -r "copr.fedorainfracloud.org" /etc/yum.repos.d/ > "$TMP_COPR" 2>/dev/null

    if [[ -s "$TMP_COPR" ]]; then
        warn "⚠️ Copr repositories detected:"
        log "$(cat "$TMP_COPR")"
    else
        log "${GREEN}✔ No active Copr repositories detected.${NC}"
    fi

else
    log "Skipping Copr scan: Not a Fedora-based system."
fi


###########################
# 2. RECENTLY INSTALLED PACKAGES
###########################
log "\n${YELLOW}[2] Last installed packages...${NC}"

if command -v rpm >/dev/null 2>&1; then
    rpm -qa --last | head -n 15 | tee -a "$REPORT_PATH" 2>/dev/null
elif command -v dpkg >/dev/null 2>&1; then
    log "(Debian/Ubuntu system detected)"
    dpkg -l | tail -n 20 | tee -a "$REPORT_PATH"
else
    warn "Package manager not recognized."
fi


###########################
# 3. IOC SCAN – Suspicious post-install scripts
###########################
log "\n${YELLOW}[3] Scanning RPM POSTIN scripts for suspicious curl/wget usage...${NC}"

if command -v rpm >/dev/null 2>&1; then
    rpm -qa --qf '%{NAME}-%{VERSION}-%{RELEASE} %{POSTIN}\n' \
      | grep -E "curl|wget" \
      | grep -v "fedoraproject.org" \
      > "$TMP_SCRIPTS"

    if [[ -s "$TMP_SCRIPTS" ]]; then
        warn "⚠️ Suspicious POST-IN scripts found:"
        log "$(head -n 10 "$TMP_SCRIPTS")"
    else
        log "${GREEN}✔ No suspicious POST-IN scripts detected.${NC}"
    fi

else
    log "Skipping: RPM not detected (likely Ubuntu CI)."
fi


###########################
# SUMMARY
###########################
log "\n${YELLOW}──────────────────────────────────────────────"
log "                 AUDIT SUMMARY"
log "──────────────────────────────────────────────${NC}"

if [[ -s "$TMP_COPR" ]]; then log " • Copr Repos: ${RED}Detected${NC}"
else log " • Copr Repos: ${GREEN}None${NC}"; fi

if [[ -s "$TMP_SCRIPTS" ]]; then log " • Suspicious Scripts: ${RED}Found${NC}"
else log " • Suspicious Scripts: ${GREEN}None${NC}"; fi


###########################
# EXIT CODES
###########################
# 0 = clean
# 1 = warning
# 2 = severe threat

EXIT_CODE=0
if [[ -s "$TMP_COPR" ]]; then EXIT_CODE=1; fi
if [[ -s "$TMP_SCRIPTS" ]]; then EXIT_CODE=2; fi

# CLEAN TEMP FILES
rm -f "$TMP_COPR" "$TMP_SCRIPTS"

log "\nAudit finished with exit code: $EXIT_CODE"

exit $EXIT_CODE
