document.addEventListener('DOMContentLoaded', () => {
    // --- SÉLECTEURS DOM ---
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const auditLogBody = document.getElementById('auditLogBody');
    const auditBadge = document.getElementById('auditCount');
    const filterVendeur = document.getElementById('filterVendeur');

    // Filtres Audit
    const logFilterDate = document.getElementById('logFilterDate');
    const logFilterAuteur = document.getElementById('logFilterAuteur');
    const logFilterModule = document.getElementById('logFilterModule');
    const logFilterSearch = document.getElementById('logFilterSearch');

    // --- VARIABLES D'ÉTAT ---
    let allLogs = [];
    let unsubscribeVentes = null;
    let unsubscribePaiements = null;
    let lastViewedTimestamp = localStorage.getItem('lastAuditLogView') || 0;

    // --- 1. INITIALISATION ---
    async function init() {
        await loadUsersIntoFilters();
        
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // On laisse un court délai pour que auth-guard récupère les rôles
                setTimeout(() => {
                    startDataListeners();
                    loadAuditLogs();
                }, 800);
            }
        });
    }

    // Chargement dynamique des noms d'utilisateurs dans les menus de filtrage
    async function loadUsersIntoFilters() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        snap.forEach(doc => {
            const nom = doc.data().nom;
            const opt = `<option value="${nom}">${nom}</option>`;
            if (filterVendeur) filterVendeur.innerHTML += opt;
            if (logFilterAuteur) logFilterAuteur.innerHTML += opt;
        });
    }

    // --- 2. GESTION DES ONGLETS & COMPTEUR ---
    window.switchTab = (type) => {
        // Mise à jour visuelle des boutons et sections
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        
        document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('active');
        document.getElementById(`section-${type}`).classList.add('active');

        // Réinitialisation du compteur si on ouvre l'onglet Audit
        if (type === 'audit') {
            resetAuditCounter();
        }
    };

    function resetAuditCounter() {
        if (allLogs.length > 0 && allLogs[0].timestamp) {
            // On mémorise le timestamp du log le plus récent comme étant "vu"
            lastViewedTimestamp = allLogs[0].timestamp.toMillis();
            localStorage.setItem('lastAuditLogView', lastViewedTimestamp);
        }
        if (auditBadge) {
            auditBadge.style.display = 'none';
            auditBadge.innerText = '0';
        }
    }

    // --- 3. ÉCOUTEURS VENTES ET PAIEMENTS ---
    function startDataListeners(vendeurNom = "") {
        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribePaiements) unsubscribePaiements();

        let qVentes = db.collection("ventes").orderBy("date", "desc");
        let qPaiements = db.collection("encaissements_vendeurs").orderBy("date", "desc");

        if (vendeurNom !== "") {
            qVentes = qVentes.where("vendeur", "==", vendeurNom);
            qPaiements = qPaiements.where("vendeur", "==", vendeurNom);
        }

        unsubscribeVentes = qVentes.onSnapshot(snap => {
            renderVentes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        unsubscribePaiements = qPaiements.onSnapshot(snap => {
            renderPaiements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }

    if (filterVendeur) {
        filterVendeur.addEventListener('change', () => startDataListeners(filterVendeur.value));
    }

    function renderVentes(sales) {
        tableBodyVentes.innerHTML = '';
        sales.forEach(data => {
            // Détection du paiement Abidjan
            const tagAbidjan = data.payeAbidjan 
                ? `<br><span class="badge-role" style="background:#701a75; color:white; font-size:9px;">📍 ABIDJAN</span>` 
                : '';
            const clientInfo = data.clientRef ? `<br><small style="color:#701a75">Ref: ${data.clientRef}</small>` : '';

            const actions = (window.userRole === 'superadmin') 
                ? `<button class="btn-reset" onclick="editDocument('ventes', '${data.id}')">Modif.</button>
                  <button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button>`
                : `<span style="font-size:10px; color:gray;">Lecture seule</span>`;

            tableBodyVentes.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td>${data.produit}${clientInfo}</td>
                    <td>${data.quantite}</td>
                    <td>${formatEUR(data.prixUnitaire)}</td>
                    <td style="font-weight:bold;">${formatEUR(data.total)}${tagAbidjan}</td>
                    <td>${data.modeDePaiement || 'Validé'}</td>
                    <td style="color:#1877f2; font-weight:bold;">${data.vendeur}</td>
                    <td>${data.enregistrePar || 'Admin'}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function renderPaiements(payments) {
        tableBodyPaiements.innerHTML = '';
        payments.forEach(data => {
            const total = (data.montantRecu || 0) + (data.remise || 0);
            const actions = (window.userRole === 'superadmin')
                ? `<button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs', '${data.id}')">Suppr.</button>`
                : `<small>Protégé</small>`;

            tableBodyPaiements.innerHTML += `
                <tr>
                    <td>${data.date}</td><td style="font-weight:bold; color:#1877f2;">${data.vendeur}</td>
                    <td style="color: #10b981;">+ ${formatEUR(data.montantRecu)}</td>
                    <td style="color: #3b82f6;">${formatEUR(data.remise)}</td>
                    <td style="font-weight:bold;">${formatEUR(total)}</td><td>${actions}</td>
                </tr>`;
        });
    }

    // --- 4. JOURNAL D'AUDIT (LOGS) ---
    function loadAuditLogs() {
        // Récupération des 150 dernières actions sensibles
        db.collection("audit_logs").orderBy("timestamp", "desc").limit(150).onSnapshot(snap => {
            allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Calcul du badge de notification (si on n'est pas sur l'onglet audit)
            const isTabAudit = document.getElementById('btnAudit').classList.contains('active');
            if (!isTabAudit && auditBadge) {
                const newItems = allLogs.filter(log => {
                    const ts = log.timestamp ? log.timestamp.toMillis() : 0;
                    return ts > lastViewedTimestamp;
                }).length;

                if (newItems > 0) {
                    auditBadge.innerText = newItems;
                    auditBadge.style.display = 'inline-block';
                }
            }
            applyLogFilters();
        });
    }

    function applyLogFilters() {
        if (!auditLogBody) return;

        const fDate = logFilterDate.value;
        const fAuteur = logFilterAuteur.value;
        const fModule = logFilterModule.value;
        const fSearch = logFilterSearch.value.toLowerCase();

        const filtered = allLogs.filter(log => {
            // Filtre par date
            if (fDate) {
                const formattedDate = fDate.split('-').reverse().join('/');
                if (!log.dateAction.includes(formattedDate)) return false;
            }
            // Filtres utilisateur et module
            if (fAuteur && log.auteur !== fAuteur) return false;
            if (fModule && log.module !== fModule) return false;
            // Recherche textuelle dans les détails
            if (fSearch && !log.details.toLowerCase().includes(fSearch)) return false;
            
            return true;
        });

        renderAuditTable(filtered);
    }

    function renderAuditTable(logs) {
        auditLogBody.innerHTML = '';
        if (logs.length === 0) {
            auditLogBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:gray; padding:20px;">Aucune correspondance trouvée.</td></tr>';
            return;
        }

        logs.forEach(log => {
            const mColor = log.module === 'STOCK' ? '#1877f2' : log.module === 'COMPTES' ? '#8b5cf6' : '#f59e0b';
            auditLogBody.innerHTML += `
                <tr>
                    <td><small>${log.dateAction}</small></td>
                    <td><b>${log.auteur}</b></td>
                    <td><span class="badge-role" style="background:${mColor}; color:white; padding:2px 6px; font-size:10px;">${log.module}</span></td>
                    <td style="color:${log.type === 'SUPPRESSION' ? 'red' : 'orange'}; font-weight:bold;">${log.type}</td>
                    <td style="font-size:11px;">${log.details} [${log.produit || 'N/A'}]</td>
                </tr>`;
        });
    }

    // Écouteurs pour les changements de filtres audit
    [logFilterDate, logFilterAuteur, logFilterModule, logFilterSearch].forEach(el => {
        if (el) el.addEventListener('input', applyLogFilters);
    });

    // --- 5. ACTIONS SUPER ADMIN ---
    window.deleteDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Action réservée au Super Admin.");
        if (confirm("Supprimer définitivement cette donnée ? L'action sera logguée.")) {
            const snap = await db.collection(coll).doc(docId).get();
            const old = snap.data();
            const moduleName = coll === 'ventes' ? 'VENTES' : 'PAIEMENTS';
            
            await db.collection(coll).doc(docId).delete();
            // Enregistrement automatique dans l'audit centralisé
            window.logAction(moduleName, "SUPPRESSION", `Valeur: ${old.total || old.montantRecu}€ pour ${old.vendeur}`, old.produit || "N/A");
        }
    };

    window.editDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Action réservée au Super Admin.");
        const snap = await db.collection(coll).doc(docId).get();
        const old = snap.data();
        const newQty = prompt("Nouvelle quantité :", old.quantite);

        if (newQty && newQty != old.quantite) {
            const newTotal = parseInt(newQty) * old.prixUnitaire;
            await db.collection(coll).doc(docId).update({ quantite: parseInt(newQty), total: newTotal });
            
            window.logAction("VENTES", "MODIFICATION", `Qté: ${old.quantite} -> ${newQty}. Nouveau total: ${newTotal}€`, old.produit);
        }
    };

    // --- 6. EXPORT PDF ---
    window.downloadAuditLogPDF = function() {
        const element = document.getElementById('printableAuditArea');
        const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
        
        const opt = {
            margin: 10,
            filename: `Audit_AMT_Global_${dateStr}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } // Paysage pour la lisibilité
        };

        html2pdf().set(opt).from(element).save();
    };

    function formatEUR(n) { 
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); 
    }
    
    init();
});