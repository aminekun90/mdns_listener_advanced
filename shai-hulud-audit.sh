#!/bin/bash

# COULEURS POUR L'AFFICHAGE
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}--- Audit de Sécurité : Détection potentielle Shai-Hulud (Fedora Copr) ---${NC}"

# 1. VÉRIFICATION DES DÉPÔTS COPR ACTIVÉS
echo -e "\n${YELLOW}[1] Vérification des dépôts Copr actifs...${NC}"
# On cherche les fichiers de repo qui contiennent "copr" dans le nom ou l'URL
grep -r "copr.fedorainfracloud.org" /etc/yum.repos.d/ > /tmp/copr_repos_found.txt

if [ -s /tmp/copr_repos_found.txt ]; then
    echo -e "${RED}ATTENTION : Des dépôts Copr sont détectés sur ce système :${NC}"
    cat /tmp/copr_repos_found.txt
    echo -e "${YELLOW}Action requise : Vérifiez manuellement si ces dépôts (et leurs mainteneurs) sont légitimes.${NC}"
else
    echo -e "${GREEN}Aucun dépôt Copr actif détecté dans /etc/yum.repos.d/. Le risque est faible.${NC}"
fi

# 2. VÉRIFICATION DES PAQUETS RÉCEMMENT INSTALLÉS
echo -e "\n${YELLOW}[2] Vérification des 20 derniers paquets RPM installés...${NC}"
echo "L'attaque s'appuie souvent sur des installations récentes."
rpm -qa --last | head -n 20

# 3. RECHERCHE DE MOTIFS SUSPECTS (Basé sur le rapport Aqua Nautilus)
echo -e "\n${YELLOW}[3] Recherche d'indicateurs de compromission (IoC) connus...${NC}"
# Les paquets malveillants contenaient souvent des scripts 'post-install' suspects
# Note: Ceci est une recherche générique, les noms changent souvent.

# Vérification des commandes curl/wget suspectes dans les scripts de post-installation des RPM
# Attention: Cette commande peut être longue
echo "Analyse des scripts de post-installation des paquets installés (recherche de curl/wget vers des IP externes)..."
rpm -qa --qf '%{NAME}-%{VERSION}-%{RELEASE} %{POSTIN}\n' | grep -E "curl|wget" | grep -v "fedoraproject.org" > /tmp/suspicious_rpm_scripts.txt

if [ -s /tmp/suspicious_rpm_scripts.txt ]; then
    echo -e "${RED}Paquets avec des scripts post-installation contenant curl/wget détectés (à vérifier) :${NC}"
    head -n 10 /tmp/suspicious_rpm_scripts.txt
    echo "... (voir /tmp/suspicious_rpm_scripts.txt pour la liste complète)"
else
    echo -e "${GREEN}Aucun script post-installation manifestement suspect (curl/wget simple) détecté.${NC}"
fi

# 4. NETTOYAGE
rm /tmp/copr_repos_found.txt
rm /tmp/suspicious_rpm_scripts.txt

echo -e "\n${YELLOW}--- Fin de l'audit ---${NC}"