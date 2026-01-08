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
    let salesData = []; 
    let recupsDataAll = []; // TOUT l'historique pour le calcul "En main"
    let salesDataAll = [];  
    let retoursDataAll = []; 
    let consommationsData = []; 
    let currentModalSeller = ""; // Pour nommer le PDF
    let paymentsDataAll = [];
    
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

    function startDataListeners() {
        const start = dateStartInput.value; 
        const end = dateEndInput.value;

        db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                salesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderVentes();
            });

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
        db.collection("encaissements_vendeurs")
            .where("date", ">=", start)
            .where("date", "<=", end)
            .onSnapshot(s => { 
                paymentsDataAll = s.docs.map(d => ({id: d.id, ...d.data()})); // Stockage global
                renderPaiements(paymentsDataAll); 
            });
    }

    function renderInvendus() {
        if (!tableBodyInvendus) return;
        tableBodyInvendus.innerHTML = '';
        const selVendeur = filterVendeur.value;
        const filteredUsers = selVendeur ? usersData.filter(u => u.nom === selVendeur) : usersData;

        filteredUsers.forEach(user => {
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

    // --- MODALE TRIÉE PAR DATE AVEC NOUVELLES COLONNES ---
    window.openInvendusModal = (vendeur) => {
        currentModalSeller = vendeur;
        document.getElementById('modalInvendusTitle').innerText = `Bilan de ${vendeur}`;
        // Injection des données pour le PDF
        document.getElementById('pdfSellerName').innerText = vendeur;
        document.getElementById('pdfDate').innerText = new Date().toLocaleDateString('fr-FR');
        const sumBody = document.getElementById('modalSummaryBody');
        const histBody = document.getElementById('modalHistoryBody');
        sumBody.innerHTML = ''; histBody.innerHTML = '';

        const start = dateStartInput.value;
        const end = dateEndInput.value;

        // Données globales pour le résumé
        const uRecupsAll = recupsDataAll.filter(r => r.vendeur === vendeur && (r.statut === "confirme" || !r.statut));
        const uSalesAll = salesDataAll.filter(s => s.vendeur === vendeur);
        const uRetoursAll = retoursDataAll.filter(ret => ret.vendeur === vendeur);
        
        const prods = [...new Set([...uRecupsAll.map(r=>r.produit), ...uSalesAll.map(s=>s.produit), ...uRetoursAll.map(ret=>ret.produit)])];

        prods.forEach(p => {
            const pPris = uRecupsAll.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAg = uSalesAll.filter(s => s.produit === p && !s.payeAbidjan).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pAbi = uSalesAll.filter(s => s.produit === p && s.payeAbidjan === true).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pRendu = uRetoursAll.filter(r => r.produit === p).reduce((s,c) => s + (parseInt(c.quantite)||0), 0);
            const pReste = pPris - (pAg + pAbi + pRendu);
            sumBody.innerHTML += `<tr><td><b>${p}</b></td><td>${pPris}</td><td>${pAg}</td><td>${pAbi}</td><td>${pRendu}</td><td style="font-weight:bold; color:${pReste < 0 ? '#be123c' : '#1877f2'};">${pReste}</td></tr>`;
        });

        // Données de la période pour l'historique chronologique
        let logs = [];
        uRecupsAll.filter(d => d.date >= start && d.date <= end).forEach(d => logs.push({date: d.date, produit: d.produit, op: '📦 Récupération', v: '-', q: d.quantite, n: '-', c: '#1877f2'}));
        uSalesAll.filter(d => d.date >= start && d.date <= end).forEach(d => logs.push({date: d.date, produit: d.produit, op: '🏠 Vente', v: d.payeAbidjan ? 'Abidjan' : 'Agence', q: d.quantite, n: d.clientRef || '-', c: '#10b981'}));
        uRetoursAll.filter(d => d.date >= start && d.date <= end).forEach(d => logs.push({date: d.date, produit: d.produit, op: '🔄 Retour', v: '-', q: d.quantite, n: '-', c: '#f59e0b'}));
        // NOUVEAU : Ajouter les lignes de remise/paiement
        paymentsDataAll.filter(p => p.vendeur === vendeur && p.date >= start && p.date <= end).forEach(p => {
            if (p.remise > 0) {
                logs.push({date: p.date, produit: 'Remise Accordée', op: '💰 Remise', v: '-', q: formatEUR(p.remise), n: p.note || 'Remise session', c: '#be123c'});
            }
        });
        // TRI PAR DATE (Le plus récent en haut)
        logs.sort((a,b) => new Date(b.date) - new Date(a.date));

        logs.forEach(l => {
            histBody.innerHTML += `
                <tr>
                    <td>${l.date}</td>
                    <td><b>${l.produit}</b></td>
                    <td style="color:${l.c}; font-weight:bold;">${l.op}</td>
                    <td><small>${l.v}</small></td>
                    <td>${l.q}</td>
                    <td style="${l.op === '💰 Remise' ? 'color:#be123c; font-weight:bold;' : ''}">${l.q}</td>
                    <td style="color:#64748b; font-style:italic;">${l.n}</td>
                </tr>`;
        });

        document.getElementById('invendusModal').style.display = 'block';
    };

    window.closeInvendusModal = () => document.getElementById('invendusModal').style.display = 'none';

    // --- FONCTION PDF VENDEUR ---
    window.downloadSellerHistoryPDF = () => {
        const element = document.getElementById('sellerPdfArea');
        const opt = {
            margin: [10, 10, 10, 10], // Marges haut, gauche, bas, droite
            filename: `Bilan_${currentModalSeller}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 3, useCORS: true }, // scale: 3 pour une meilleure netteté du logo
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    };

    // --- MISE À JOUR DU RENDU DES VENTES (AVEC MODIF RÉFÉRENCE) ---
    function renderVentes() {
        const selV = filterVendeur.value; 
        const selC = filterClientRef.value.toLowerCase();
        let filtered = selV ? salesData.filter(d => d.vendeur === selV) : salesData;
        
        if(selC) filtered = filtered.filter(d => (d.clientRef && d.clientRef.toLowerCase().includes(selC)) || d.produit.toLowerCase().includes(selC));
        
        tableBodyVentes.innerHTML = '';
        filtered.forEach(d => {
            const isAbi = d.payeAbidjan === true;
            const tag = isAbi 
                ? `<br><span style="background:#701a75; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">📍 ABIDJAN</span>` 
                : `<br><span style="background:#1877f2; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">🏠 AGENCE</span>`;
            
            tableBodyVentes.innerHTML += `
                <tr>
                    <td>${d.date}</td>
                    <td><b>${d.produit}</b><br><small>Ref: ${d.clientRef||'-'}</small></td>
                    <td>${d.quantite}</td>
                    <td style="font-weight:bold;">${formatEUR(d.total)}${tag}</td>
                    <td style="color:#be123c;">${d.remise ? formatEUR(d.remise) : '-'}</td>
                    <td>${d.vendeur}</td>
                    <td>
                        <button onclick="editSaleQuantity('${d.id}', ${d.quantite}, ${d.prixUnitaire})" style="background:#10b981; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:10px; margin-right:5px;" title="Modifier Quantité">✏️</button>
                        
                        <button onclick="editSaleReference('${d.id}', '${d.clientRef || ''}')" style="background:#6366f1; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:10px; margin-right:5px;" title="Modifier Référence Client">📝</button>

                        <button onclick="toggleSaleStatus('${d.id}', ${isAbi})" style="background:#f59e0b; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:10px; margin-right:5px;" title="Changer Agence/Abidjan">🔄</button>
                        
                        <button class="deleteBtn" onclick="deleteDocument('ventes','${d.id}')">Suppr.</button>
                    </td>
                </tr>`;
        });
    }

    // --- FONCTION DE MODIFICATION DE RÉFÉRENCE ---
    window.editSaleReference = async (docId, currentRef) => {
        if (window.userRole !== 'superadmin') return alert("Action réservée au Super Admin.");

        const newRef = prompt("Entrez le nom ou la référence du client :", currentRef);
        
        // On autorise une valeur vide si l'utilisateur veut supprimer la note
        if (newRef !== null) {
            try {
                await db.collection("ventes").doc(docId).update({
                    clientRef: newRef.trim()
                });
                alert("Référence mise à jour !");
            } catch (e) {
                alert("Erreur lors de la modification.");
            }
        }
    };

    // --- NOUVELLE FONCTION DE MODIFICATION DE STATUT ---
    window.toggleSaleStatus = async (docId, currentlyAbidjan) => {
        // Seul le superadmin peut modifier un statut validé
        if (window.userRole !== 'superadmin') return alert("Action réservée au Super Admin.");

        const newStatus = !currentlyAbidjan;
        const confirmMsg = newStatus 
            ? "Passer cette vente en 'Payé à Abidjan' ?" 
            : "Passer cette vente en 'Vente Agence' ?";

        if(confirm(confirmMsg)) {
            try {
                let updateData = { payeAbidjan: newStatus };
                
                // Si on passe à Abidjan et qu'il n'y a pas de réf client, on en demande une
                if (newStatus === true) {
                    const ref = prompt("Référence ou nom du client à Abidjan :");
                    if (ref) updateData.clientRef = ref;
                }

                await db.collection("ventes").doc(docId).update(updateData);
                alert("Statut mis à jour avec succès !");
                // Le tableau se rafraîchira automatiquement grâce au snapshot
            } catch (e) {
                console.error("Erreur de mise à jour:", e);
                alert("Erreur lors de la modification.");
            }
        }
    };

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
        if(confirm("Supprimer définitivement cet enregistrement ?")) { await db.collection(c).doc(i).delete(); alert("Supprimé."); }
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
    // --- FONCTION DE REMISE À ZÉRO DE LA DETTE ---
    window.resetSellerDebt = async () => {
        const vendeur = currentModalSeller;
        if (!vendeur) return;

        if (window.userRole !== 'superadmin') return alert("Action réservée au Super Admin.");

        // On récupère les dates saisies dans les filtres de l'historique
        const start = document.getElementById('mainFilterDateStart').value;
        const end = document.getElementById('mainFilterDateEnd').value;

        try {
            // On récupère les données UNIQUEMENT pour la période sélectionnée
            const [vSnap, pSnap] = await Promise.all([
                db.collection("ventes")
                    .where("vendeur", "==", vendeur)
                    .where("date", ">=", start)
                    .where("date", "<=", end).get(),
                db.collection("encaissements_vendeurs")
                    .where("vendeur", "==", vendeur)
                    .where("date", ">=", start)
                    .where("date", "<=", end).get()
            ]);

            // Calcul du CA Agence sur la période
            let totalVenduPériode = 0;
            vSnap.forEach(doc => {
                const d = doc.data();
                if (d.payeAbidjan !== true) {
                    totalVenduPériode += (parseFloat(d.total) || 0);
                }
            });

            // Calcul des encaissements sur la période
            let totalEncaissePériode = 0;
            pSnap.forEach(doc => {
                const d = doc.data();
                totalEncaissePériode += (parseFloat(d.montantRecu) || 0) + (parseFloat(d.remise) || 0);
            });

            const balancePériode = totalVenduPériode - totalEncaissePériode;

            if (Math.abs(balancePériode) < 0.01) {
                return alert(`Le compte de ${vendeur} est déjà équilibré pour la période du ${start} au ${end}.`);
            }

            const msg = balancePériode > 0 
                ? `Dette de ${formatEUR(balancePériode)}` 
                : `Surplus de ${formatEUR(Math.abs(balancePériode))}`;

            if (confirm(`Période du ${start} au ${end} :\n${msg}\n\nVoulez-vous créer une régularisation pour ramener cette période à 0,00 € ?`)) {
                
                await db.collection("encaissements_vendeurs").add({
                    date: new Date().toISOString().split('T')[0], // Date du jour pour l'écriture comptable
                    vendeur: vendeur,
                    montantRecu: balancePériode, // Compense exactement l'écart de la période
                    remise: 0,
                    note: `Régularisation période ${start} au ${end}`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                alert("Régularisation effectuée ! Le Tableau de Bord sera mis à jour.");
                closeInvendusModal();
            }
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la régularisation.");
        }
    };

    init();
});