document.addEventListener('DOMContentLoaded', () => {
    // --- SÉLECTEURS ---
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyInvendus = document.getElementById('tableBodyInvendus');
    const tableBodyConsommables = document.getElementById('tableBodyConsommables');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const auditLogBody = document.getElementById('auditLogBody');
    const auditBadge = document.getElementById('auditCount');
    const filterVendeur = document.getElementById('filterVendeur');
    const filterClientRef = document.getElementById('filterClientRef'); // Nouveau
    const dateStartInput = document.getElementById('mainFilterDateStart');
    const dateEndInput = document.getElementById('mainFilterDateEnd');

    // --- ÉTAT ---
    let allLogs = [];
    let salesData = [];
    let recupsData = [];
    let retoursData = [];
    let consommationsData = []; 
    
    let unsubscribeVentes = null;
    let unsubscribePaiements = null;
    let unsubscribeRecups = null;
    let unsubscribeRetours = null;
    let unsubscribeConsos = null; 
    let lastViewedTimestamp = localStorage.getItem('lastAuditLogView') || 0;

    // --- 1. INITIALISATION ---
    async function init() {
        setDefaultDates();
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

    function setDefaultDates() {
        if (!dateStartInput || !dateEndInput) return;
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        dateStartInput.value = firstDay.toISOString().split('T')[0];
        dateEndInput.value = lastDay.toISOString().split('T')[0];
    }

    window.changeMonth = (offset) => {
        let currentStart = new Date(dateStartInput.value);
        currentStart.setMonth(currentStart.getMonth() + offset);
        dateStartInput.value = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1).toISOString().split('T')[0];
        dateEndInput.value = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0).toISOString().split('T')[0];
        startDataListeners(); 
    };

    async function loadUsersIntoFilters() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        snap.forEach(doc => {
            const nom = doc.data().nom;
            if (filterVendeur) filterVendeur.innerHTML += `<option value="${nom}">${nom}</option>`;
        });
    }

    // --- 2. NAVIGATION ---
    window.switchTab = (type) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        
        const btn = document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (btn) btn.classList.add('active');
        
        const section = document.getElementById(`section-${type}`);
        if (section) section.classList.add('active');
        
        const gFilters = document.getElementById('global-filters');
        if (gFilters) gFilters.style.display = (type === 'audit' || type === 'consommables') ? 'none' : 'flex';
        
        if (type === 'audit') resetAuditCounter();
    };

    function resetAuditCounter() {
        if (allLogs.length > 0 && allLogs[0].timestamp) {
            lastViewedTimestamp = allLogs[0].timestamp.toMillis();
            localStorage.setItem('lastAuditLogView', lastViewedTimestamp);
        }
        if (auditBadge) { auditBadge.style.display = 'none'; auditBadge.innerText = '0'; }
    }

    // --- 3. ÉCOUTEURS DE DONNÉES ---
    function startDataListeners() {
        const start = dateStartInput.value;
        const end = dateEndInput.value;
        const selVendeur = filterVendeur.value;
        const selClient = filterClientRef.value.toLowerCase(); // Recherche Client

        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribePaiements) unsubscribePaiements();
        if (unsubscribeRecups) unsubscribeRecups();
        if (unsubscribeRetours) unsubscribeRetours();
        if (unsubscribeConsos) unsubscribeConsos();

        unsubscribeVentes = db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                salesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Filtrage combiné : Vendeur + Référence Client
                let filtered = selVendeur ? salesData.filter(d => d.vendeur === selVendeur) : salesData;
                if (selClient) {
                    filtered = filtered.filter(d => 
                        (d.clientRef && d.clientRef.toLowerCase().includes(selClient)) || 
                        (d.produit && d.produit.toLowerCase().includes(selClient))
                    );
                }
                
                renderVentes(filtered);
                renderInvendus();
            });

        unsubscribeConsos = db.collection("consommations").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                consommationsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderConsommables(consommationsData);
            });

        unsubscribePaiements = db.collection("encaissements_vendeurs").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPaiements(selVendeur ? data.filter(d => d.vendeur === selVendeur) : data);
            });

        unsubscribeRecups = db.collection("recuperations").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => { recupsData = snap.docs.map(doc => doc.data()); renderInvendus(); });

        unsubscribeRetours = db.collection("retours_vendeurs").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => { retoursData = snap.docs.map(doc => doc.data()); renderInvendus(); });
    }

    // Écouteurs pour les changements de filtres
    [filterVendeur, filterClientRef, dateStartInput, dateEndInput].forEach(el => {
        if (el) el.addEventListener('input', startDataListeners);
    });

    // --- 4. FONCTIONS DE RENDU ---

    function renderVentes(sales) {
        if (!tableBodyVentes) return;
        tableBodyVentes.innerHTML = sales.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:gray;">Aucune vente trouvée.</td></tr>' : '';
        
        sales.forEach(data => {
            const actions = (window.userRole === 'superadmin') ? `<button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button>` : '<small>Lecture</small>';
            
            // Marquage visuel Agence vs Abidjan
            const tagAbidjan = data.payeAbidjan 
                ? `<br><span style="background:#701a75; color:white; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:bold;">📍 ABIDJAN</span>` 
                : `<br><span style="background:#1877f2; color:white; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:bold;">🏠 AGENCE</span>`;
            
            const infoClient = data.clientRef 
                ? `<br><small style="color:#475569; font-style:italic;">Client: ${data.clientRef}</small>` 
                : '';

            tableBodyVentes.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td><b>${data.produit}</b>${infoClient}</td>
                    <td>${data.quantite}</td>
                    <td style="font-weight:bold;">${formatEUR(data.total)}${tagAbidjan}</td>
                    <td style="color:#1877f2; font-weight:bold;">${data.vendeur}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function renderConsommables(data) {
        if (!tableBodyConsommables) return;
        tableBodyConsommables.innerHTML = data.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:gray;">Aucun usage interne.</td></tr>' : '';
        data.forEach(item => {
            const actions = (window.userRole === 'superadmin') ? `<button class="deleteBtn" onclick="deleteDocument('consommations', '${item.id}')">Suppr.</button>` : '<small>Lecture</small>';
            tableBodyConsommables.innerHTML += `
                <tr>
                    <td>${item.date}</td>
                    <td><b>${item.produit}</b></td>
                    <td>${item.quantite}</td>
                    <td><span style="background:#f1f5f9; padding:3px 8px; border-radius:5px; font-size:10px; color:#475569; font-weight:bold;">USAGE INTERNE</span></td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function renderInvendus() {
        if (!tableBodyInvendus) return;
        tableBodyInvendus.innerHTML = '';
        const selVendeur = filterVendeur.value;
        let invendusMap = {};

        recupsData.forEach(r => {
            if (selVendeur && r.vendeur !== selVendeur) return;
            const key = `${r.vendeur}_${r.produit}`;
            if (!invendusMap[key]) invendusMap[key] = { vendeur: r.vendeur, produit: r.produit, pris: 0, vendu: 0, rendu: 0 };
            invendusMap[key].pris += (parseInt(r.quantite) || 0);
        });
        salesData.forEach(v => {
            if (selVendeur && v.vendeur !== selVendeur) return;
            const key = `${v.vendeur}_${v.produit}`;
            if (invendusMap[key]) invendusMap[key].vendu += (parseInt(v.quantite) || 0);
        });
        retoursData.forEach(ret => {
            if (selVendeur && ret.vendeur !== selVendeur) return;
            const key = `${ret.vendeur}_${ret.produit}`;
            if (invendusMap[key]) invendusMap[key].rendu += (parseInt(ret.quantite) || 0);
        });

        Object.keys(invendusMap).forEach(k => {
            const d = invendusMap[k];
            const enMain = d.pris - d.vendu - d.rendu;
            if (enMain > 0) {
                tableBodyInvendus.innerHTML += `
                    <tr>
                        <td><b>${d.vendeur}</b></td>
                        <td>${d.produit}</td>
                        <td>${d.pris}</td>
                        <td>${d.vendu}</td>
                        <td>${d.rendu}</td>
                        <td style="font-weight:bold; color:#1877f2;">${enMain}</td>
                    </tr>`;
            }
        });
    }

    function renderPaiements(payments) {
        if (!tableBodyPaiements) return;
        tableBodyPaiements.innerHTML = payments.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:gray;">Aucun paiement.</td></tr>' : '';
        payments.forEach(data => {
            const total = (parseFloat(data.montantRecu) || 0) + (parseFloat(data.remise) || 0);
            const actions = (window.userRole === 'superadmin') ? `<button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs', '${data.id}')">Suppr.</button>` : '<small>Protégé</small>';
            tableBodyPaiements.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td style="font-weight:bold; color:#1877f2;">${data.vendeur}</td>
                    <td style="color: #10b981;">+ ${formatEUR(data.montantRecu)}</td>
                    <td style="color: #3b82f6;">${formatEUR(data.remise)}</td>
                    <td style="font-weight:bold;">${formatEUR(total)}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function loadAuditLogs() {
        db.collection("audit_logs").orderBy("timestamp", "desc").limit(150).onSnapshot(snap => {
            allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyLogFilters();
        });
    }

    function applyLogFilters() {
        if (!auditLogBody) return;
        auditLogBody.innerHTML = '';
        allLogs.forEach(log => {
            const mColor = log.module === 'STOCK' ? '#1877f2' : (log.module === 'COMPTES' ? '#8b5cf6' : '#f59e0b');
            auditLogBody.innerHTML += `
                <tr>
                    <td><small>${log.dateAction}</small></td>
                    <td><b>${log.auteur}</b></td>
                    <td><span class="badge-role" style="background:${mColor}; color:white; padding:2px 6px; font-size:10px; border-radius:4px;">${log.module}</span></td>
                    <td style="color:${log.type === 'SUPPRESSION' ? 'red' : 'orange'}; font-weight:bold;">${log.type}</td>
                    <td style="font-size:11px;">${log.details} [${log.produit || 'N/A'}]</td>
                </tr>`;
        });
    }

    window.deleteDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Super Admin requis.");
        if (confirm("Supprimer définitivement ?")) {
            try {
                await db.collection(coll).doc(docId).delete();
                alert("Supprimé.");
            } catch (e) { alert("Erreur."); }
        }
    };

    window.downloadAuditLogPDF = function() {
        const element = document.getElementById('printableAuditArea');
        html2pdf().set({ margin: 10, filename: 'Audit_AMT.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'landscape' } }).from(element).save();
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    
    init();
});