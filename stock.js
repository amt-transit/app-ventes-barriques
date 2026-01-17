document.addEventListener('DOMContentLoaded', async () => {
    const addStockBtn = document.getElementById('addStockBtn');
    const inputProduit = document.getElementById('stockProduit'); 
    const inputPrixAchat = document.getElementById('prixAchat');
    const inputPrixVente = document.getElementById('prixVenteRef');
    
    // --- INJECTION DU SÉLECTEUR DE SOURCE (CAPITAL vs BÉNÉFICE) ---
    const sourceSelect = document.createElement('select');
    sourceSelect.id = 'stockSource';
    sourceSelect.style.marginBottom = '10px';
    sourceSelect.style.marginTop = '5px';
    sourceSelect.innerHTML = `<option value="benefice">Source : Bénéfice (Réinvestissement)</option><option value="capital">Source : Capital Initial / Apport</option>`;
    if (addStockBtn && addStockBtn.parentNode) {
        addStockBtn.parentNode.insertBefore(sourceSelect, addStockBtn);
    }

    const vendablesTableBody = document.getElementById('vendablesTableBody');
    const consosTableBody = document.getElementById('consosTableBody');

    let allStocksRaw = []; 
    let allRecuperationsRaw = []; 
    let allVentesRaw = [];
    let allPertesRaw = [];
    let allConsommationsRaw = []; 
    let allRetoursRaw = []; 
    let lastKnownPrices = {}; 

    document.getElementById('stockDate').valueAsDate = new Date();

    // --- 1. NAVIGATION SOUS-ONGLETS ---
    window.switchStockTab = (type) => {
        document.querySelectorAll('.stock-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.stock-section').forEach(s => s.classList.remove('active'));
        if (type === 'vendables') {
            document.getElementById('tabBtnVendables').classList.add('active');
            document.getElementById('section-vendables').classList.add('active');
        } else {
            document.getElementById('tabBtnConsos').classList.add('active');
            document.getElementById('section-consos').classList.add('active');
        }
    };

    // --- 2. GESTION PRODUITS ET PRIX ---
    inputProduit.addEventListener('change', () => {
        const p = inputProduit.value;
        if (p === "NEW") {
            const n = prompt("Nom du nouveau produit :");
            if (n && n.trim() !== "") {
                const nom = n.trim().toUpperCase();
                const opt = document.createElement('option');
                opt.value = nom; opt.textContent = nom;
                inputProduit.insertBefore(opt, inputProduit.lastElementChild);
                inputProduit.value = nom;
                inputPrixAchat.value = ""; inputPrixVente.value = "";
            } else { inputProduit.value = ""; }
            return;
        }
        if (lastKnownPrices[p]) {
            inputPrixAchat.value = lastKnownPrices[p].prixAchat;
            inputPrixVente.value = lastKnownPrices[p].prixVente;
        }
    });

    // --- 3. CHARGEMENT DONNÉES TEMPS RÉEL ---
    async function loadAllData() {
        const [stockSnap, recupSnap, ventesSnap, pertesSnap, consSnap, retoursSnap] = await Promise.all([
            db.collection("stocks").orderBy("date", "asc").get(),
            db.collection("recuperations").get(),
            db.collection("ventes").get(),
            db.collection("pertes").get(),
            db.collection("consommations").get(),
            db.collection("retours_vendeurs").get()
        ]);

        allStocksRaw = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allRecuperationsRaw = recupSnap.docs.map(doc => doc.data());
        allVentesRaw = ventesSnap.docs.map(doc => doc.data());
        allPertesRaw = pertesSnap.docs.map(doc => doc.data());
        allConsommationsRaw = consSnap.docs.map(doc => doc.data());
        allRetoursRaw = retoursSnap.docs.map(doc => doc.data());

        lastKnownPrices = {};
        allStocksRaw.forEach(s => { lastKnownPrices[s.produit] = { prixAchat: s.prixAchat, prixVente: s.prixVente }; });
        const uniqueProds = [...new Set(allStocksRaw.map(s => s.produit))].sort();
        inputProduit.innerHTML = '<option value="">-- Choisir un produit --</option>';
        uniqueProds.forEach(p => { inputProduit.innerHTML += `<option value="${p}">${p}</option>`; });
        inputProduit.innerHTML += `<option value="NEW" style="color:blue; font-weight:bold;">+ NOUVEAU PRODUIT</option>`;

        renderStock();
    }

    // --- FONCTION DE SÉCURITÉ : CALCUL DU BÉNÉFICE DISPONIBLE ---
    function getAvailableBenefice() {
        let prices = {};
        // On récupère le dernier prix d'achat connu pour chaque produit
        allStocksRaw.forEach(s => { prices[s.produit] = parseFloat(s.prixAchat) || 0; });

        let totalBenefice = 0;
        allVentesRaw.forEach(v => {
            const pa = prices[v.produit] || 0;
            totalBenefice += (parseFloat(v.total) || 0) - ((parseInt(v.quantite) || 0) * pa);
        });

        let totalReinvesti = 0;
        allStocksRaw.forEach(s => {
            if (s.source === 'benefice') totalReinvesti += (parseFloat(s.quantite) || 0) * (parseFloat(s.prixAchat) || 0);
        });

        return totalBenefice - totalReinvesti;
    }

    // --- 4. CALCULS ET AFFICHAGE ---
    function renderStock() {
        vendablesTableBody.innerHTML = '';
        consosTableBody.innerHTML = '';
        let globalSummary = {}; 

        allStocksRaw.forEach(s => {
            const p = s.produit.trim().toUpperCase(); 
            if (!globalSummary[p]) {
                globalSummary[p] = { in:0, out:0, soldAg:0, soldAbi:0, loss:0, cDepot:0, returns:0, rev:0, pa: s.prixAchat||0, pv: s.prixVente||0 };
            }
            globalSummary[p].in += (parseInt(s.quantite) || 0);
            globalSummary[p].pa = parseFloat(s.prixAchat) || 0;
            globalSummary[p].pv = parseFloat(s.prixVente) || 0;
        });

        allRecuperationsRaw.forEach(r => { 
            const p = r.produit.trim().toUpperCase(); 
            if (globalSummary[p] && r.statut === "confirme") {
                globalSummary[p].out += (parseInt(r.quantite) || 0); 
            }
        });

        allConsommationsRaw.forEach(c => { 
            const p = c.produit.trim().toUpperCase();
            if (globalSummary[p]) {
                const q = (parseInt(c.quantite) || 0);
                if (!c.vendeur || c.vendeur === "MAGASIN") globalSummary[p].cDepot += q;
            } 
        });

        allPertesRaw.forEach(p => { const prod = p.produit.trim().toUpperCase(); if (globalSummary[prod]) globalSummary[prod].loss += (parseInt(p.quantite) || 0); });
        allRetoursRaw.forEach(ret => { const prod = ret.produit.trim().toUpperCase(); if (globalSummary[prod]) globalSummary[prod].returns += (parseInt(ret.quantite) || 0); });
        
        allVentesRaw.forEach(v => { 
            const p = v.produit.trim().toUpperCase();
            if (globalSummary[p]) { 
                if (v.payeAbidjan === true) globalSummary[p].soldAbi += (parseInt(v.quantite) || 0);
                else globalSummary[p].soldAg += (parseInt(v.quantite) || 0);
                globalSummary[p].rev += (parseFloat(v.total) || 0);
            } 
        });

        let vKPI = { in:0, out:0, abi:0, mag:0, reel:0, pot:0 };
        let cKPI = { in:0, out:0, bureau:0, mag:0, invest:0 };

        for (const p in globalSummary) {
            const item = globalSummary[p];
            const enDepot = (item.in + item.returns) - (item.out + item.loss + item.cDepot);
            const totalSold = item.soldAg + item.soldAbi;
            let depotColor = enDepot > 20 ? '#10b981' : (enDepot < 10 ? '#ef4444' : (enDepot < 15 ? '#f59e0b' : 'black'));

            if (item.pv > 0) {
                const bReel = item.rev - (totalSold * item.pa);
                const bPot = (item.pv - item.pa) * enDepot;
                
                vKPI.in += item.in; vKPI.out += item.out; vKPI.abi += item.soldAbi;
                vKPI.mag += enDepot; vKPI.reel += bReel; vKPI.pot += bPot;

                const tr = document.createElement('tr');
                tr.innerHTML = `<td><b>${p}</b></td><td>${item.in}</td><td>${item.soldAg}</td><td>${item.soldAbi}</td><td>${item.loss}</td><td style="font-weight:bold; color:${depotColor}">${enDepot}</td><td style="font-weight:bold;">${formatEUR(bReel)}</td>`;
                tr.onclick = () => { showProductDetails(p, enDepot); };
                vendablesTableBody.appendChild(tr);
            } else {
                const valInvestie = item.in * item.pa;
                cKPI.in += item.in; cKPI.out += item.out; cKPI.bureau += item.cDepot;
                cKPI.mag += enDepot; cKPI.invest += valInvestie;

                const tr = document.createElement('tr');
                tr.innerHTML = `<td><b>${p}</b></td><td>${item.in}</td><td>${item.out}</td><td>${item.cDepot}</td><td style="font-weight:bold; color:${depotColor}">${enDepot}</td><td style="font-weight:bold;">${formatEUR(valInvestie)}</td>`;
                tr.onclick = () => { showProductDetails(p, enDepot); };
                consosTableBody.appendChild(tr);
            }
        }

        updateText('vend_volumeTotal', vKPI.in);
        updateText('vend_totalSorti', vKPI.out);
        updateText('vend_totalAbidjan', vKPI.abi);
        updateText('vend_totalEnMagasin', vKPI.mag);
        updateText('vend_beneficeReel', formatEUR(vKPI.reel));
        updateText('vend_beneficeTotalStock', formatEUR(vKPI.pot));
        updateText('cons_volumeTotal', cKPI.in);
        updateText('cons_usageVendeurs', cKPI.out);
        updateText('cons_usageBureau', cKPI.bureau);
        updateText('cons_totalEnMagasin', cKPI.mag);
        updateText('cons_valeurInvestie', formatEUR(cKPI.invest));
    }

    // --- 5. LOGIQUE DU MODAL (FICHE PRODUIT) ---
    window.showProductDetails = (p, currentStock) => {
        window.currentProdName = p;
        const m = document.getElementById('historyModal');
        document.getElementById('modalTitle').textContent = `Fiche : ${p}`;
        document.getElementById('modalStockStatus').innerHTML = `Dépôt actuel : <strong>${currentStock}</strong>`;
        
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = ''; // Nettoyage du tableau
        
        // Filtre les arrivages par produit et trie par date récente
        allStocksRaw.filter(s => s.produit === p).sort((a,b) => b.date.localeCompare(a.date)).forEach(l => {
            const src = l.source || 'capital';
            const srcLabel = src === 'benefice' ? '<span style="color:#f59e0b">Bénéfice</span>' : '<span style="color:#64748b">Capital</span>';
            
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';
            tr.innerHTML = `
                    <td style="padding:4px;">${l.date}</td>
                    <td style="padding:4px;">${l.quantite}</td>
                    <td style="padding:4px; font-size:10px;">${srcLabel}</td>
                    <td style="padding:4px;">
                        <button onclick="editStockLot('${l.id}',${l.quantite})" style="background:none; border:none; cursor:pointer; font-size:10px;">📝</button>
                        <button onclick="switchStockSource('${l.id}', '${src}')" style="background:none; border:none; cursor:pointer; font-size:10px; margin-left:5px;" title="Changer Source">🔄</button>
                    </td>`;
            tbody.appendChild(tr);
        });
        
        m.style.display = "block";
    };

    // --- 6. ACTIONS (PERTES, CONSOS, ÉDITION) ---
    window.editStockLot = async (id, currentQty) => { 
        const n = prompt("Modifier la quantité reçue :", currentQty); 
        if(n !== null && n !== "" && !isNaN(n)) { 
            await db.collection("stocks").doc(id).update({ quantite: parseInt(n) }); 
            alert("Mise à jour réussie !");
            document.getElementById('historyModal').style.display = 'none';
            loadAllData(); 
        } 
    };

    window.switchStockSource = async (id, currentSource) => {
        const newSource = (currentSource === 'benefice') ? 'capital' : 'benefice';
        
        // VÉRIFICATION AVANT CHANGEMENT
        if (newSource === 'benefice') {
            const item = allStocksRaw.find(s => s.id === id);
            const cost = item ? (parseFloat(item.quantite) || 0) * (parseFloat(item.prixAchat) || 0) : 0;
            const available = getAvailableBenefice();
            if (cost > available) return alert(`Impossible : Le montant (${formatEUR(cost)}) dépasse le bénéfice disponible (${formatEUR(available)}).`);
        }

        if(confirm("Changer la source de financement (Capital <-> Bénéfice) ?")) {
            await db.collection("stocks").doc(id).update({ source: newSource });
            document.getElementById('historyModal').style.display = 'none';
            loadAllData();
        }
    };

    window.openLossModal = (p) => { document.getElementById('lossProductName').textContent = p; document.getElementById('lossModal').style.display = 'block'; };
    window.openConsumeModal = (p) => { document.getElementById('consumeProductName').textContent = p; document.getElementById('consumeModal').style.display = 'block'; };

    window.confirmLoss = async () => {
        const q = parseInt(document.getElementById('lossQuantity').value);
        if(q > 0) {
            await db.collection("pertes").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] });
            document.getElementById('lossModal').style.display = 'none'; 
            document.getElementById('lossQuantity').value = "";
            loadAllData();
        }
    };

    window.confirmConsumption = async () => {
        const q = parseInt(document.getElementById('consumeQuantity').value);
        if(q > 0) {
            await db.collection("consommations").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] });
            document.getElementById('consumeModal').style.display = 'none'; 
            document.getElementById('consumeQuantity').value = "";
            loadAllData();
        }
    };

    // --- 7. INITIALISATION ET UTILS ---
    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value;
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const date = document.getElementById('stockDate').value;
        const pa = parseFloat(inputPrixAchat.value) || 0;
        const pv = parseFloat(inputPrixVente.value) || 0;
        const source = sourceSelect.value; // Récupération de la source choisie
        
        // VÉRIFICATION AVANT AJOUT
        if (source === 'benefice') {
            const cout = qte * pa;
            const available = getAvailableBenefice();
            if (cout > available) return alert(`Impossible : Le montant du réinvestissement (${formatEUR(cout)}) dépasse le bénéfice disponible (${formatEUR(available)}).`);
        }

        if(!prod || qte <= 0) return alert("Saisie invalide.");
        await db.collection("stocks").add({ date, produit: prod, prixAchat: pa, prixVente: pv, quantite: qte, source: source });
        alert("Enregistré !");
        document.getElementById('quantiteInitiale').value = ""; 
        loadAllData();
    });

    window.downloadStockPDF = function() { const e = document.getElementById('printableStockArea'); html2pdf().set({ margin: 10, filename: 'Inventaire_AMT.pdf', html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'landscape' } }).from(e).save(); }
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    const updateText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    
    firebase.auth().onAuthStateChanged(user => { if (user) loadAllData(); });
});