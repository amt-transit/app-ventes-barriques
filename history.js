document.addEventListener('DOMContentLoaded', () => {
    // --- SÉLECTEURS ---
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyInvendus = document.getElementById('tableBodyInvendus');
    const tableBodyConsommables = document.getElementById('tableBodyConsommables');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const auditLogBody = document.getElementById('auditLogBody');
    const filterVendeur = document.getElementById('filterVendeur');
    const filterClientRef = document.getElementById('filterClientRef'); 
    const dateStartInput = document.getElementById('mainFilterDateStart');
    const dateEndInput = document.getElementById('mainFilterDateEnd');

    // --- ÉTAT ---
    let usersData = []; 
    let salesData = []; // Pour l'affichage filtré
    let recupsDataAll = []; // TOUT l'historique pour le calcul "En main"
    let salesDataAll = [];  // TOUT l'historique pour le calcul "En main"
    let retoursDataAll = []; // TOUT l'historique pour le calcul "En main"
    let consommationsData = []; 
    
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

    // --- ÉCOUTEURS : CALCUL GLOBAL VS AFFICHAGE PÉRIODIQUE ---
    function startDataListeners() {
        const start = dateStartInput.value; 
        const end = dateEndInput.value;

        // 1. Écouteur pour l'affichage du tableau "Ventes" (Filtré par date)
        db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                salesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderVentes();
            });

        // 2. Écouteurs globaux pour le calcul "En main" (On ignore la date de début)
        db.collection("recuperations").onSnapshot(snap => {
            recupsDataAll = snap.docs.map(doc => doc.data());
            renderInvendus();
        });

        db.collection("ventes").onSnapshot(snap => {
            salesDataAll = snap.docs.map(doc => doc.data());
            renderInvendus();
        });

        db.collection("retours_vendeurs").onSnapshot(snap => {
            retoursDataAll = snap.docs.map(doc => doc.data());
            renderInvendus();
        });

        db.collection("consommations").where("date", ">=", start).where("date", "<=", end).onSnapshot(s => { consommationsData = s.docs.map(d => d.data()); renderConsommables(); });
        db.collection("encaissements_vendeurs").where("date", ">=", start).where("date", "<=", end).onSnapshot(s => { renderPaiements(s.docs.map(d => ({id: d.id, ...d.data()}))); });
    }

    // --- RENDU DES INVENDUS (LOGIQUE DE STOCK RÉEL) ---
    function renderInvendus() {
        if (!tableBodyInvendus) return;
        tableBodyInvendus.innerHTML = '';
        const selVendeur = filterVendeur.value;
        const filteredUsers = selVendeur ? usersData.filter(u => u.nom === selVendeur) : usersData;

        filteredUsers.forEach(user => {
            // Filtrage sur la totalité de la base pour ce vendeur
            const uRecups = recupsDataAll.filter(r => r.vendeur === user.nom && (r.statut === "confirme" || !r.statut));
            const uSales = salesDataAll.filter(s => s.vendeur === user.nom);
            const uRetours = retoursDataAll.filter(ret => ret.vendeur === user.nom);

            const distinctProds = [...new Set([...uRecups.map(r=>r.produit), ...uSales.map(s=>s.produit), ...uRetours.map(ret=>ret.produit)])];
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
            tr.onclick = () => openInvendusModal(user.nom);
            tr.innerHTML = `
                <td><b>${user.nom}</b></td>
                <td>${distinctProds.length} types</td>
                <td>${totalPris}</td>
                <td>${totalAg}</td>
                <td style="color:#701a75;">${totalAbi}</td>
                <td>${totalRendu}</td>
                <td style="font-weight:bold; color:${totalEnMain < 0 ? '#be123c' : '#1877f2'};">${totalEnMain}</td>
            `;
            tableBodyInvendus.appendChild(tr);
        });
    }

    // --- MODALE (Utilise aussi les données globales) ---
    window.openInvendusModal = (vendeur) => {
        document.getElementById('modalInvendusTitle').innerText = `Bilan Total : ${vendeur}`;
        const sumBody = document.getElementById('modalSummaryBody');
        const histBody = document.getElementById('modalHistoryBody');
        sumBody.innerHTML = ''; histBody.innerHTML = '';

        const uRecups = recupsDataAll.filter(r => r.vendeur === vendeur && (r.statut === "confirme" || !r.statut));
        const uSales = salesDataAll.filter(s => s.vendeur === vendeur);
        const uRetours = retoursDataAll.filter(ret => ret.vendeur === vendeur);
        const prods = [...new Set([...uRecups.map(r=>r.produit), ...uSales.map(s=>s.produit), ...uRetours.map(ret=>ret.produit)])];

        prods.forEach(p => {
            const pPris = uRecups.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAg = uSales.filter(s => s.produit === p && !s.payeAbidjan).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAbi = uSales.filter(s => s.produit === p && s.payeAbidjan === true).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pRendu = uRetours.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pReste = pPris - (pAg + pAbi + pRendu);
            sumBody.innerHTML += `<tr><td><b>${p}</b></td><td>${pPris}</td><td>${pAg}</td><td>${pAbi}</td><td>${pRendu}</td><td style="font-weight:bold; color:${pReste < 0 ? '#be123c' : '#1877f2'};">${pReste}</td></tr>`;
        });

        let logs = [];
        uRecups.forEach(d => logs.push({d: d.date, t: '📦 Récupération', p: d.produit, q: d.quantite, n: '-' , c: '#1877f2'}));
        uSales.forEach(d => logs.push({d: d.date, t: d.payeAbidjan ? '📍 Vente Abidjan' : '🏠 Vente Agence', p: d.produit, q: d.quantite, n: d.clientRef || '-', c: d.payeAbidjan ? '#701a75' : '#10b981'}));
        uRetours.forEach(d => logs.push({d: d.date, t: '🔄 Retour Colis', p: d.produit, q: d.quantite, n: '-', c: '#f59e0b'}));
        
        logs.sort((a,b) => new Date(b.d) - new Date(a.d));
        logs.forEach(l => { histBody.innerHTML += `<tr><td>${l.d}</td><td style="color:${l.c}; font-weight:bold;">${l.t}</td><td>${l.p}</td><td>${l.q}</td><td>${l.n}</td></tr>`; });

        document.getElementById('invendusModal').style.display = 'block';
    };

    window.closeInvendusModal = () => document.getElementById('invendusModal').style.display = 'none';

    function renderVentes() {
        const selV = filterVendeur.value; const selC = filterClientRef.value.toLowerCase();
        let filtered = selV ? salesData.filter(d => d.vendeur === selV) : salesData;
        if(selC) filtered = filtered.filter(d => (d.clientRef && d.clientRef.toLowerCase().includes(selC)) || d.produit.toLowerCase().includes(selC));
        tableBodyVentes.innerHTML = '';
        filtered.forEach(d => {
            const tag = d.payeAbidjan ? `<br><span style="background:#701a75; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">📍 ABIDJAN</span>` : `<br><span style="background:#1877f2; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">🏠 AGENCE</span>`;
            tableBodyVentes.innerHTML += `<tr><td>${d.date}</td><td><b>${d.produit}</b><br><small>Ref: ${d.clientRef||'-'}</small></td><td>${d.quantite}</td><td style="font-weight:bold;">${formatEUR(d.total)}${tag}</td><td>${d.vendeur}</td><td><button class="deleteBtn" onclick="deleteDocument('ventes','${d.id}')">Suppr.</button></td></tr>`;
        });
    }

    function renderConsommables() {
        tableBodyConsommables.innerHTML = '';
        consommationsData.forEach(d => { tableBodyConsommables.innerHTML += `<tr><td>${d.date}</td><td><b>${d.produit}</b></td><td>${d.quantite}</td><td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:10px;">USAGE INTERNE</span></td><td><button class="deleteBtn" onclick="deleteDocument('consommations','${d.id}')">Suppr.</button></td></tr>`; });
    }

    function renderPaiements(data) {
        const selV = filterVendeur.value;
        let filtered = selV ? data.filter(d => d.vendeur === selV) : data;
        tableBodyPaiements.innerHTML = '';
        filtered.forEach(d => { tableBodyPaiements.innerHTML += `<tr><td>${d.date}</td><td>${d.vendeur}</td><td>${formatEUR(d.montantRecu)}</td><td>${formatEUR(d.remise)}</td><td style="font-weight:bold;">${formatEUR((parseFloat(d.montantRecu)||0)+(parseFloat(d.remise)||0))}</td><td><button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs','${d.id}')">Suppr.</button></td></tr>`; });
    }

    function loadAuditLogs() { db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).onSnapshot(s => { const auditLogBody = document.getElementById('auditLogBody'); if(auditLogBody) { auditLogBody.innerHTML = ''; s.forEach(doc => { const l = doc.data(); auditLogBody.innerHTML += `<tr><td><small>${l.dateAction}</small></td><td>${l.auteur}</td><td>${l.module}</td><td>${l.type}</td><td>${l.details}</td></tr>`; }); } }); }
    
    window.deleteDocument = async (c, i) => { 
        if (window.userRole !== 'superadmin') return alert("Super Admin requis pour supprimer.");
        if(confirm("Supprimer définitivement cet enregistrement ?")) {
            await db.collection(c).doc(i).delete(); 
            alert("Supprimé.");
        }
    };
    
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    
    window.switchTab = (type) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('active');
        document.getElementById(`section-${type}`).classList.add('active');
        const gFilters = document.getElementById('global-filters');
        if (gFilters) gFilters.style.display = (type === 'audit' || type === 'consommables') ? 'none' : 'flex';
    };

    [filterVendeur, filterClientRef, dateStartInput, dateEndInput].forEach(el => {
        if(el) el.addEventListener('input', () => { renderVentes(); renderInvendus(); });
    });

    init();
});