document.addEventListener('DOMContentLoaded', () => {
    // --- SÉLECTEURS ---
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const auditLogBody = document.getElementById('auditLogBody');
    const auditBadge = document.getElementById('auditCount');
    const filterVendeur = document.getElementById('filterVendeur');
    const dateStartInput = document.getElementById('mainFilterDateStart');
    const dateEndInput = document.getElementById('mainFilterDateEnd');

    const logFilterDate = document.getElementById('logFilterDate');
    const logFilterAuteur = document.getElementById('logFilterAuteur');
    const logFilterModule = document.getElementById('logFilterModule');
    const logFilterSearch = document.getElementById('logFilterSearch');

    // --- ÉTAT ---
    let allLogs = [];
    let unsubscribeVentes = null;
    let unsubscribePaiements = null;
    let lastViewedTimestamp = localStorage.getItem('lastAuditLogView') || 0;

    // --- 1. INITIALISATION ---
    async function init() {
        setDefaultDates(); // Mois en cours
        await loadUsersIntoFilters();
        
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                setTimeout(() => {
                    startDataListeners();
                    loadAuditLogs();
                }, 800);
            }
        });
    }

    // Définit le mois actuel (du 1er au dernier jour)
    function setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        dateStartInput.value = firstDay.toISOString().split('T')[0];
        dateEndInput.value = lastDay.toISOString().split('T')[0];
    }

    // Fonction de navigation mois par mois
    window.changeMonth = (offset) => {
        let currentStart = new Date(dateStartInput.value);
        currentStart.setMonth(currentStart.getMonth() + offset);
        
        const firstDay = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1);
        const lastDay = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0);
        
        dateStartInput.value = firstDay.toISOString().split('T')[0];
        dateEndInput.value = lastDay.toISOString().split('T')[0];
        
        startDataListeners(); // Recharger les données
    };

    async function loadUsersIntoFilters() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        snap.forEach(doc => {
            const nom = doc.data().nom;
            const opt = `<option value="${nom}">${nom}</option>`;
            if (filterVendeur) filterVendeur.innerHTML += opt;
            if (logFilterAuteur) logFilterAuteur.innerHTML += opt;
        });
    }

    // --- 2. NAVIGATION ---
    window.switchTab = (type) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('active');
        document.getElementById(`section-${type}`).classList.add('active');
        
        // Cacher les filtres temporels globaux dans l'onglet Audit
        document.getElementById('global-filters').style.display = (type === 'audit') ? 'none' : 'flex';
        if (type === 'audit') resetAuditCounter();
    };

    function resetAuditCounter() {
        if (allLogs.length > 0 && allLogs[0].timestamp) {
            lastViewedTimestamp = allLogs[0].timestamp.toMillis();
            localStorage.setItem('lastAuditLogView', lastViewedTimestamp);
        }
        if (auditBadge) { auditBadge.style.display = 'none'; auditBadge.innerText = '0'; }
    }

    // --- 3. ÉCOUTEURS VENTES & PAIEMENTS ---
    function startDataListeners() {
        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribePaiements) unsubscribePaiements();

        const start = dateStartInput.value;
        const end = dateEndInput.value;
        const selectedVendeur = filterVendeur.value;

        // Requêtes Firestore
        let qVentes = db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc");
        let qPaiements = db.collection("encaissements_vendeurs").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc");

        unsubscribeVentes = qVentes.onSnapshot(snap => {
            let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (selectedVendeur) data = data.filter(d => d.vendeur === selectedVendeur);
            renderVentes(data);
        });

        unsubscribePaiements = qPaiements.onSnapshot(snap => {
            let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (selectedVendeur) data = data.filter(d => d.vendeur === selectedVendeur);
            renderPaiements(data);
        });
    }

    [dateStartInput, dateEndInput, filterVendeur].forEach(el => el.addEventListener('change', startDataListeners));

    function renderVentes(sales) {
        tableBodyVentes.innerHTML = '';
        if (sales.length === 0) { tableBodyVentes.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">Aucune vente.</td></tr>'; return; }
        
        sales.forEach(data => {
            const tagAbidjan = data.payeAbidjan ? `<br><span class="badge-role" style="background:#701a75; color:white; font-size:9px;">📍 ABIDJAN</span>` : '';
            const clientInfo = data.clientRef ? `<br><small style="color:#701a75">Ref: ${data.clientRef}</small>` : '';
            const actions = (window.userRole === 'superadmin') 
                ? `<button class="btn-reset" onclick="editDocument('ventes', '${data.id}')">Modif.</button>
                   <button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button>`
                : `<span style="font-size:10px; color:gray;">Lecture seule</span>`;

            tableBodyVentes.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td><b>${data.produit}</b>${clientInfo}</td>
                    <td>${data.quantite}</td>
                    <td style="font-weight:bold;">${formatEUR(data.total)}${tagAbidjan}</td>
                    <td style="color:#1877f2; font-weight:bold;">${data.vendeur}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function renderPaiements(payments) {
        tableBodyPaiements.innerHTML = '';
        if (payments.length === 0) { tableBodyPaiements.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">Aucun paiement.</td></tr>'; return; }

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
                    <td style="font-weight:bold;">${formatEUR(total)}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    // --- 4. AUDIT ---
    function loadAuditLogs() {
        db.collection("audit_logs").orderBy("timestamp", "desc").limit(150).onSnapshot(snap => {
            allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const isTabAudit = document.getElementById('btnAudit').classList.contains('active');
            if (!isTabAudit && auditBadge) {
                const newItems = allLogs.filter(log => (log.timestamp?.toMillis() || 0) > lastViewedTimestamp).length;
                if (newItems > 0) { auditBadge.innerText = newItems; auditBadge.style.display = 'inline-block'; }
            }
            applyLogFilters();
        });
    }

    function applyLogFilters() {
        const fDate = logFilterDate.value;
        const fAuteur = logFilterAuteur.value;
        const fModule = logFilterModule.value;
        const fSearch = logFilterSearch.value.toLowerCase();

        const filtered = allLogs.filter(log => {
            if (fDate && !log.dateAction.includes(fDate.split('-').reverse().join('/'))) return false;
            if (fAuteur && log.auteur !== fAuteur) return false;
            if (fModule && log.module !== fModule) return false;
            if (fSearch && !log.details.toLowerCase().includes(fSearch)) return false;
            return true;
        });

        auditLogBody.innerHTML = '';
        filtered.forEach(log => {
            const mColor = log.module === 'STOCK' ? '#1877f2' : log.module === 'COMPTES' ? '#8b5cf6' : '#f59e0b';
            auditLogBody.innerHTML += `
                <tr>
                    <td><small>${log.dateAction}</small></td>
                    <td><b>${log.auteur}</b></td>
                    <td><span class="badge-role" style="background:${mColor}; color:white;">${log.module}</span></td>
                    <td style="color:${log.type === 'SUPPRESSION' ? 'red' : 'orange'}; font-weight:bold;">${log.type}</td>
                    <td style="font-size:11px;">${log.details} [${log.produit || 'N/A'}]</td>
                </tr>`;
        });
    }

    [logFilterDate, logFilterAuteur, logFilterModule, logFilterSearch].forEach(el => el.addEventListener('input', applyLogFilters));

    // --- 5. ACTIONS ADMIN ---
    window.deleteDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Super Admin requis.");
        if (confirm("Confirmer la suppression ? (Sera enregistré dans l'Audit)")) {
            const snap = await db.collection(coll).doc(docId).get();
            const old = snap.data();
            await db.collection(coll).doc(docId).delete();
            window.logAction(coll.toUpperCase(), "SUPPRESSION", `Action par Admin. Valeur: ${old.total || old.montantRecu}€`, old.produit || "N/A");
        }
    };

    window.editDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Super Admin requis.");
        const snap = await db.collection(coll).doc(docId).get();
        const old = snap.data();
        const nQ = prompt("Nouvelle quantité :", old.quantite);
        if (nQ && nQ != old.quantite) {
            const nT = parseInt(nQ) * old.prixUnitaire;
            await db.collection(coll).doc(docId).update({ quantite: parseInt(nQ), total: nT });
            window.logAction("VENTES", "MODIFICATION", `Qté corrigée: ${old.quantite} -> ${nQ}`, old.produit);
        }
    };

    window.downloadAuditLogPDF = function() {
        const element = document.getElementById('printableAuditArea');
        html2pdf().set({ margin: 10, filename: 'Audit_Global.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(element).save();
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    init();
});