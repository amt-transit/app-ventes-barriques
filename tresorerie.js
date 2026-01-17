document.addEventListener('DOMContentLoaded', () => {
    let allSales = [], allStocks = [], allEncaissements = [];
    let currentTab = 'abidjan'; // 'abidjan', 'cb', 'virement'

    async function loadCashData() {
        // Chargement temps réel pour voir les changements instantanément
        const [salesSnap, stocksSnap, encSnap] = await Promise.all([
            db.collection("ventes").orderBy("timestamp", "desc").get(),
            db.collection("stocks").get(),
            db.collection("encaissements_vendeurs").orderBy("date", "desc").get()
        ]);

        allSales = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allStocks = stocksSnap.docs.map(doc => doc.data());
        allEncaissements = encSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        renderTabs();
        calculateTreasury();
    }

    function renderTabs() {
        const table = document.getElementById('abidjanPendingBody').closest('table');
        if (!table) return;
        
        // Utilisation du conteneur existant ou création si absent
        let tabsContainer = document.getElementById('treasuryTabsContainer');
        if (!tabsContainer) {
            tabsContainer = document.createElement('div');
            tabsContainer.id = 'treasuryTabsContainer';
            tabsContainer.style.marginBottom = '15px';
            tabsContainer.style.display = 'flex';
            tabsContainer.style.gap = '10px';
            tabsContainer.style.justifyContent = 'center';
            tabsContainer.style.flexWrap = 'wrap';
            table.parentElement.insertBefore(tabsContainer, table);
        }

        tabsContainer.innerHTML = `
            <button class="tab-btn ${currentTab === 'abidjan' ? 'active' : ''}" onclick="window.switchTreasuryTab('abidjan')">📍 Abidjan</button>
            <button class="tab-btn ${currentTab === 'cb' ? 'active' : ''}" onclick="window.switchTreasuryTab('cb')">💳 Carte Bancaire</button>
            <button class="tab-btn ${currentTab === 'virement' ? 'active' : ''}" onclick="window.switchTreasuryTab('virement')">🏦 Virement</button>
        `;
    }

    window.switchTreasuryTab = (tab) => {
        currentTab = tab;
        renderTabs();
        calculateTreasury();
    };

    function calculateTreasury() {
        const pendingBody = document.getElementById('abidjanPendingBody');
        pendingBody.innerHTML = '';

        let totalCash = 0, totalCB = 0, totalVirement = 0;
        let confirmedCB = 0, confirmedVirement = 0;
        let caAbidjanRegle = 0;
        let caAbidjanAttente = 0;

        // 1. Traitement des Ventes (Abidjan)
        allSales.forEach(s => {
            const montant = parseFloat(s.total) || 0;
            
            if (s.payeAbidjan) {
                // Ventes Abidjan : On trie selon l'état du reversement
                if (s.abidjanRegle === true) {
                    caAbidjanRegle += montant;
                } else {
                    caAbidjanAttente += montant;
                }
            }
        });

        // 2. Traitement des Encaissements (Validation + Script)
        allEncaissements.forEach(e => {
            const cash = parseFloat(e.montantRecu) || 0;
            const cb = parseFloat(e.montantCB) || 0;
            const vir = parseFloat(e.montantVirement) || 0;

            totalCash += cash;
            totalCB += cb;
            totalVirement += vir;

            if (e.cbConfirme === true) confirmedCB += cb;
            if (e.virementConfirme === true) confirmedVirement += vir;
        });

        // Ajout des paiements directs du script (si modeDePaiement existe dans ventes)
        allSales.forEach(s => {
            if (!s.payeAbidjan && s.modeDePaiement) {
                const m = parseFloat(s.total) || 0;
                if (s.modeDePaiement === 'Espèce') totalCash += m;
                else if (s.modeDePaiement === 'Carte Bleue') {
                    totalCB += m;
                    if (s.receptionConfirmee === true) confirmedCB += m;
                }
                else if (s.modeDePaiement === 'Virement') {
                    totalVirement += m;
                    if (s.receptionConfirmee === true) confirmedVirement += m;
                }
            }
        });

        // --- AFFICHAGE DU TABLEAU SELON L'ONGLET ---
        const tableHead = pendingBody.closest('table').querySelector('thead tr');
        
        if (currentTab === 'abidjan') {
            tableHead.innerHTML = `<th>Date</th><th>Client</th><th>Produit</th><th>Total</th><th>Vendeur</th><th>Action</th>`;
            allSales.filter(s => s.payeAbidjan && !s.abidjanRegle).forEach(s => renderPendingRow(s));
        } else if (currentTab === 'cb') {
            tableHead.innerHTML = `<th>Date</th><th>Client</th><th>Produit</th><th>Total CB</th><th>Vendeur</th><th>Action</th>`;
            const cbList = [];
            allEncaissements.filter(e => e.montantCB > 0).forEach(e => cbList.push({ 
                id: e.id, source: 'encaissements_vendeurs', type: 'cb',
                date: e.date, client: e.refCB || '-', produit: 'Encaissement', total: e.montantCB, vendeur: e.vendeur, isConfirmed: e.cbConfirme 
            }));
            allSales.filter(s => s.modeDePaiement === 'Carte Bleue').forEach(s => cbList.push({ 
                id: s.id, source: 'ventes', type: 'general',
                date: s.date, client: s.clientRef || '-', produit: s.produit, total: s.total, vendeur: s.vendeur, isConfirmed: s.receptionConfirmee 
            }));
            
            cbList.sort((a,b) => new Date(b.date) - new Date(a.date));
            cbList.forEach(row => {
                const actionBtn = row.isConfirmed ? '<span style="color:green; font-weight:bold;">✅ Reçu</span>' : `<button class="btn-settle" onclick="confirmerReception('${row.source}', '${row.id}', '${row.type}')">Confirmer</button>`;
                pendingBody.innerHTML += `<tr><td>${row.date}</td><td>${row.client}</td><td>${row.produit}</td><td style="color:#6366f1; font-weight:bold;">${formatEUR(row.total)}</td><td>${row.vendeur}</td><td>${actionBtn}</td></tr>`;
            });
        } else if (currentTab === 'virement') {
            tableHead.innerHTML = `<th>Date</th><th>Client</th><th>Produit</th><th>Total Virement</th><th>Vendeur</th><th>Action</th>`;
            const virList = [];
            allEncaissements.filter(e => e.montantVirement > 0).forEach(e => virList.push({ 
                id: e.id, source: 'encaissements_vendeurs', type: 'virement',
                date: e.date, client: e.refVirement || '-', produit: 'Encaissement', total: e.montantVirement, vendeur: e.vendeur, isConfirmed: e.virementConfirme 
            }));
            allSales.filter(s => s.modeDePaiement === 'Virement').forEach(s => virList.push({ 
                id: s.id, source: 'ventes', type: 'general',
                date: s.date, client: s.clientRef || '-', produit: s.produit, total: s.total, vendeur: s.vendeur, isConfirmed: s.receptionConfirmee 
            }));
            
            virList.sort((a,b) => new Date(b.date) - new Date(a.date));
            virList.forEach(row => {
                const actionBtn = row.isConfirmed ? '<span style="color:green; font-weight:bold;">✅ Reçu</span>' : `<button class="btn-settle" onclick="confirmerReception('${row.source}', '${row.id}', '${row.type}')">Confirmer</button>`;
                pendingBody.innerHTML += `<tr><td>${row.date}</td><td>${row.client}</td><td>${row.produit}</td><td style="color:#8b5cf6; font-weight:bold;">${formatEUR(row.total)}</td><td>${row.vendeur}</td><td>${actionBtn}</td></tr>`;
            });
        }

        // Calcul des dépenses d'achat
        const totalDepenses = allStocks.reduce((sum, item) => sum + ((parseFloat(item.quantite) || 0) * (parseFloat(item.prixAchat) || 0)), 0);
        
        // RECETTES RÉELLES = Cash + CB Confirmé + Virement Confirmé + Abidjan déjà reçu
        const recettesReelles = totalCash + confirmedCB + confirmedVirement + caAbidjanRegle;
        const soldeNet = recettesReelles - totalDepenses;

        // Affichage KPI
        document.getElementById('totalRecettes').textContent = formatEUR(recettesReelles);
        document.getElementById('totalDepenses').textContent = formatEUR(totalDepenses);
        document.getElementById('soldeReel').textContent = formatEUR(soldeNet);
        document.getElementById('attenteAbidjan').textContent = formatEUR(caAbidjanAttente);
        
        // Mise à jour des nouveaux KPIs de répartition
        if (document.getElementById('kpiTotalCash')) document.getElementById('kpiTotalCash').textContent = formatEUR(totalCash);
        if (document.getElementById('kpiTotalCB')) document.getElementById('kpiTotalCB').textContent = formatEUR(totalCB);
        if (document.getElementById('kpiTotalVir')) document.getElementById('kpiTotalVir').textContent = formatEUR(totalVirement);

        // Détails Comptabilité
        document.getElementById('ca_agence_realise').textContent = "+ " + formatEUR(totalCash + totalCB + totalVirement);
        document.getElementById('ca_abidjan_regle').textContent = "+ " + formatEUR(caAbidjanRegle);
        document.getElementById('total_cash_brut').textContent = formatEUR(recettesReelles);
    }

    function renderPendingRow(sale) {
        const tbody = document.getElementById('abidjanPendingBody');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sale.date}</td>
            <td><b>${sale.clientRef || 'N/A'}</b></td>
            <td>${sale.produit}</td>
            <td style="font-weight:bold; color:#701a75;">${formatEUR(sale.total)}</td>
            <td>${sale.vendeur}</td>
            <td><button class="btn-settle" onclick="marquerCommeRegle('${sale.id}')">Confirmer Réception ✅</button></td>
        `;
        tbody.appendChild(tr);
    }

    // FONCTION POUR VALIDER LE REVERSEMENT
    window.marquerCommeRegle = async (id) => {
        if (confirm("Confirmez-vous avoir reçu le montant de cette vente ?")) {
            try {
                await db.collection("ventes").doc(id).update({ abidjanRegle: true });
                alert("Montant intégré à la trésorerie !");
                loadCashData(); // Recharger les calculs
            } catch (e) {
                alert("Erreur lors de la validation.");
            }
        }
    };

    window.confirmerReception = async (collection, id, type) => {
        if (confirm("Confirmez-vous la réception de ce montant sur le compte bancaire ?")) {
            try {
                let updateData = {};
                if (collection === 'ventes') {
                    updateData = { receptionConfirmee: true };
                } else if (collection === 'encaissements_vendeurs') {
                    if (type === 'cb') updateData = { cbConfirme: true };
                    else if (type === 'virement') updateData = { virementConfirme: true };
                }
                await db.collection(collection).doc(id).update(updateData);
            } catch (e) {
                console.error(e);
                alert("Erreur lors de la confirmation.");
            }
        }
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    // --- GESTION DE L'ANCRE RETOUR EN HAUT ---
    window.onscroll = function() {
        const btn = document.getElementById("btnBackToTop");
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btn.classList.add("show");
        } else {
            btn.classList.remove("show");
        }
    };

    window.scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth" // Remontée fluide
        });
    };

    // Écouteurs Firestore
    db.collection("ventes").onSnapshot(() => loadCashData());
    db.collection("stocks").onSnapshot(() => loadCashData());
    db.collection("encaissements_vendeurs").onSnapshot(() => loadCashData());
});