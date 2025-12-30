document.addEventListener('DOMContentLoaded', () => {
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyInvendus = document.getElementById('tableBodyInvendus');
    const tableBodyConsommables = document.getElementById('tableBodyConsommables');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const filterVendeur = document.getElementById('filterVendeur');
    const filterClientRef = document.getElementById('filterClientRef'); 
    const dateStartInput = document.getElementById('mainFilterDateStart');
    const dateEndInput = document.getElementById('mainFilterDateEnd');

    let usersData = []; 
    let salesData = [];
    let recupsData = [];
    let retoursData = [];
    let consommationsData = []; 
    
    let unsubscribeVentes = null;
    let unsubscribeRecups = null;
    let unsubscribeRetours = null;

    async function init() {
        setDefaultDates();
        await loadAllUsers();
        firebase.auth().onAuthStateChanged(user => {
            if (user) { setTimeout(() => { startDataListeners(); loadAuditLogs(); }, 800); }
        });
    }

    function setDefaultDates() {
        const now = new Date();
        dateStartInput.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        dateEndInput.value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    async function loadAllUsers() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        usersData = snap.docs.map(doc => doc.data());
        if (filterVendeur) {
            filterVendeur.innerHTML = '<option value="">Vendeur: Tous</option>';
            usersData.forEach(u => { filterVendeur.innerHTML += `<option value="${u.nom}">${u.nom}</option>`; });
        }
    }

    window.changeMonth = (offset) => {
        let currentStart = new Date(dateStartInput.value);
        currentStart.setMonth(currentStart.getMonth() + offset);
        dateStartInput.value = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1).toISOString().split('T')[0];
        dateEndInput.value = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0).toISOString().split('T')[0];
        startDataListeners(); 
    };

    window.switchTab = (type) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('active');
        document.getElementById(`section-${type}`).classList.add('active');
        const gFilters = document.getElementById('global-filters');
        if (gFilters) gFilters.style.display = (type === 'audit' || type === 'consommables') ? 'none' : 'flex';
    };

    function startDataListeners() {
        const start = dateStartInput.value; const end = dateEndInput.value;
        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribeRecups) unsubscribeRecups();
        if (unsubscribeRetours) unsubscribeRetours();

        unsubscribeVentes = db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => { salesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderVentes(); renderInvendus(); });

        unsubscribeRecups = db.collection("recuperations").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => { recupsData = snap.docs.map(doc => doc.data()); renderInvendus(); });

        unsubscribeRetours = db.collection("retours_vendeurs").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => { retoursData = snap.docs.map(doc => doc.data()); renderInvendus(); });
        
        db.collection("consommations").where("date", ">=", start).where("date", "<=", end).onSnapshot(s => { consommationsData = s.docs.map(d => d.data()); renderConsommables(); });
        db.collection("encaissements_vendeurs").where("date", ">=", start).where("date", "<=", end).onSnapshot(s => { renderPaiements(s.docs.map(d => ({id: d.id, ...d.data()}))); });
    }

    // --- REGROUPEMENT PAR COMPTE UTILISATEUR ---
    function renderInvendus() {
        if (!tableBodyInvendus) return;
        tableBodyInvendus.innerHTML = '';
        const selVendeur = filterVendeur.value;
        const filteredUsers = selVendeur ? usersData.filter(u => u.nom === selVendeur) : usersData;

        filteredUsers.forEach(user => {
            const uRecups = recupsData.filter(r => r.vendeur === user.nom);
            const uSales = salesData.filter(s => s.vendeur === user.nom);
            const uRetours = retoursData.filter(ret => ret.vendeur === user.nom);

            const distinctProds = [...new Set([...uRecups.map(r=>r.produit), ...uSales.map(s=>s.produit), ...uRetours.map(ret=>ret.produit)])];
            
            // Si aucune activité, on passe (ou on affiche 0 selon votre choix)
            if (distinctProds.length === 0) return; 

            let totalPris = 0, totalAg = 0, totalAbi = 0, totalRendu = 0;
            distinctProds.forEach(p => {
                totalPris += uRecups.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
                totalAg += uSales.filter(s => s.produit === p && !s.payeAbidjan).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
                totalAbi += uSales.filter(s => s.produit === p && s.payeAbidjan === true).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
                totalRendu += uRetours.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            });

            const totalEnMain = totalPris - (totalAg + totalAbi + totalRendu);

            const tr = document.createElement('tr');
            tr.className = "clickable-row";
            tr.onclick = () => openInvendusModal(user.nom); // Ouvrir pour ce vendeur
            tr.innerHTML = `
                <td><b>${user.nom}</b></td>
                <td>${distinctProds.length} types</td>
                <td>${totalPris}</td>
                <td>${totalAg}</td>
                <td style="color:#701a75;">${totalAbi}</td>
                <td>${totalRendu}</td>
                <td style="font-weight:bold; color:#1877f2;">${totalEnMain}</td>
            `;
            tableBodyInvendus.appendChild(tr);
        });
    }

    // --- MODALE MULTI-PRODUITS ET MULTI-DATES ---
    window.openInvendusModal = (vendeur) => {
        document.getElementById('modalInvendusTitle').innerText = `Bilan : ${vendeur}`;
        const sumBody = document.getElementById('modalSummaryBody');
        const histBody = document.getElementById('modalHistoryBody');
        sumBody.innerHTML = ''; histBody.innerHTML = '';

        const uRecups = recupsData.filter(r => r.vendeur === vendeur);
        const uSales = salesData.filter(s => s.vendeur === vendeur);
        const uRetours = retoursData.filter(ret => ret.vendeur === vendeur);
        const prods = [...new Set([...uRecups.map(r=>r.produit), ...uSales.map(s=>s.produit), ...uRetours.map(ret=>ret.produit)])];

        // 1. Remplir le résumé par produit
        prods.forEach(p => {
            const pPris = uRecups.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAg = uSales.filter(s => s.produit === p && !s.payeAbidjan).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAbi = uSales.filter(s => s.produit === p && s.payeAbidjan === true).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pRendu = uRetours.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pReste = pPris - (pAg + pAbi + pRendu);
            sumBody.innerHTML += `<tr><td><b>${p}</b></td><td>${pPris}</td><td>${pAg}</td><td>${pAbi}</td><td>${pRendu}</td><td style="font-weight:bold; color:#1877f2;">${pReste}</td></tr>`;
        });

        // 2. Remplir l'historique chronologique
        let logs = [];
        uRecups.forEach(d => logs.push({d: d.date, t: '📦 Récupération', p: d.produit, q: d.quantite, n: '-'}));
        uSales.forEach(d => logs.push({d: d.date, t: d.payeAbidjan ? '📍 Vente Abidjan' : '🏠 Vente Agence', p: d.produit, q: d.quantite, n: d.clientRef || '-'}));
        uRetours.forEach(d => logs.push({d: d.date, t: '🔄 Retour Colis', p: d.produit, q: d.quantite, n: '-'}));
        
        logs.sort((a,b) => new Date(b.d) - new Date(a.d));
        logs.forEach(l => { histBody.innerHTML += `<tr><td>${l.d}</td><td>${l.t}</td><td>${l.p}</td><td>${l.q}</td><td>${l.n}</td></tr>`; });

        document.getElementById('invendusModal').style.display = 'block';
    };

    window.closeInvendusModal = () => document.getElementById('invendusModal').style.display = 'none';

    // (Reste des fonctions renderVentes, audit, etc. identiques)
    function renderVentes() {
        const selV = filterVendeur.value; const selC = filterClientRef.value.toLowerCase();
        let filtered = selV ? salesData.filter(d => d.vendeur === selV) : salesData;
        if(selC) filtered = filtered.filter(d => (d.clientRef && d.clientRef.toLowerCase().includes(selC)) || d.produit.toLowerCase().includes(selC));
        tableBodyVentes.innerHTML = '';
        filtered.forEach(d => {
            const tag = d.payeAbidjan ? `<br><span style="background:#701a75; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">📍 ABIDJAN</span>` : `<br><span style="background:#1877f2; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">🏠 AGENCE</span>`;
            tableBodyVentes.innerHTML += `<tr><td>${d.date}</td><td><b>${d.produit}</b><br><small>Ref: ${d.clientRef||'-'}</small></td><td>${d.quantite}</td><td style="font-weight:bold;">${formatEUR(d.total)}${tag}</td><td>${d.vendeur}</td><td><button onclick="deleteDocument('ventes','${d.id}')">Suppr.</button></td></tr>`;
        });
    }

    function renderConsommables() {
        tableBodyConsommables.innerHTML = '';
        consommationsData.forEach(d => { tableBodyConsommables.innerHTML += `<tr><td>${d.date}</td><td><b>${d.produit}</b></td><td>${d.quantite}</td><td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:10px;">USAGE INTERNE</span></td><td><button>Suppr.</button></td></tr>`; });
    }

    function renderPaiements(data) {
        tableBodyPaiements.innerHTML = '';
        data.forEach(d => { tableBodyPaiements.innerHTML += `<tr><td>${d.date}</td><td>${d.vendeur}</td><td>${d.montantRecu}€</td><td>${d.remise}€</td><td style="font-weight:bold;">${(d.montantRecu||0)+(d.remise||0)}€</td><td><button>Suppr.</button></td></tr>`; });
    }

    function loadAuditLogs() { db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).onSnapshot(s => { auditLogBody.innerHTML = ''; s.forEach(doc => { const l = doc.data(); auditLogBody.innerHTML += `<tr><td><small>${l.dateAction}</small></td><td>${l.auteur}</td><td>${l.module}</td><td>${l.type}</td><td>${l.details}</td></tr>`; }); }); }
    window.deleteDocument = async (c, i) => { if(confirm("Supprimer ?")) await db.collection(c).doc(i).delete(); };
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    
    init();
});