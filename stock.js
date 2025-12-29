document.addEventListener('DOMContentLoaded', async () => {
    const addStockBtn = document.getElementById('addStockBtn');
    const inputProduit = document.getElementById('stockProduit'); 
    const inputPrixAchat = document.getElementById('prixAchat');
    const inputPrixVente = document.getElementById('prixVenteRef');
    
    const vendablesTableBody = document.getElementById('vendablesTableBody');
    const consosTableBody = document.getElementById('consosTableBody');

    let allStocksRaw = []; 
    let allRecuperationsRaw = []; 
    let allVentesRaw = [];
    let allPertesRaw = [];
    let allConsommationsRaw = []; 
    let allRetoursRaw = []; 
    let lastKnownPrices = {}; 
    let globalSummary = {};

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

    // --- 2. GESTION PRODUITS ---
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

    // --- 3. ENREGISTRER ARRIVAGE ---
    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value;
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const pAcha = parseFloat(inputPrixAchat.value) || 0;
        const pVent = parseFloat(inputPrixVente.value) || 0;
        const date = document.getElementById('stockDate').value;
        if(!prod || prod === "NEW" || qte <= 0) return alert("Saisie invalide.");

        try {
            await db.collection("stocks").add({ date, produit: prod, prixAchat: pAcha, prixVente: pVent, quantite: qte });
            alert("Arrivage enregistré !");
            document.getElementById('quantiteInitiale').value = "";
            loadAllData();
        } catch (e) { alert("Erreur d'enregistrement."); }
    });

    // --- 4. CHARGEMENT DONNÉES ---
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

    // --- 5. RENDU ET CALCULS DISSOCIÉS ---
    function renderStock() {
        vendablesTableBody.innerHTML = '';
        consosTableBody.innerHTML = '';
        globalSummary = {}; 

        // Initialisation
        allStocksRaw.forEach(s => {
            const p = s.produit.trim().toUpperCase(); 
            if (!globalSummary[p]) {
                globalSummary[p] = { in:0, out:0, soldAgence:0, soldAbidjan:0, loss:0, consumedDepot:0, consumedTotal:0, returns:0, revenue:0, lastPA: s.prixAchat||0, lastPV: s.prixVente||0 };
            }
            globalSummary[p].in += (parseInt(s.quantite) || 0);
            globalSummary[p].lastPA = parseFloat(s.prixAchat) || 0;
            globalSummary[p].lastPV = parseFloat(s.prixVente) || 0;
        });

        // Mouvements
        allRecuperationsRaw.forEach(r => { const p = r.produit.trim().toUpperCase(); if (globalSummary[p]) globalSummary[p].out += (parseInt(r.quantite) || 0); });
        allConsommationsRaw.forEach(c => { 
            const p = c.produit.trim().toUpperCase();
            if (globalSummary[p]) {
                const q = (parseInt(c.quantite) || 0);
                if (!c.vendeur || c.vendeur === "MAGASIN") globalSummary[p].consumedDepot += q;
                globalSummary[p].consumedTotal += q;
            } 
        });
        allPertesRaw.forEach(p => { const prod = p.produit.trim().toUpperCase(); if (globalSummary[prod]) globalSummary[prod].loss += (parseInt(p.quantite) || 0); });
        allRetoursRaw.forEach(ret => { const prod = ret.produit.trim().toUpperCase(); if (globalSummary[prod]) globalSummary[prod].returns += (parseInt(ret.quantite) || 0); });
        allVentesRaw.forEach(v => { 
            const p = v.produit.trim().toUpperCase();
            if (globalSummary[p]) { 
                if (v.payeAbidjan === true) globalSummary[p].soldAbidjan += (parseInt(v.quantite) || 0);
                else globalSummary[p].soldAgence += (parseInt(v.quantite) || 0);
                globalSummary[p].revenue += (parseFloat(v.total) || 0);
            } 
        });

        // Initialisation des Totaux KPI dissociés
        let vKPI = { in:0, out:0, abi:0, mag:0, reel:0, pot:0 };
        let cKPI = { in:0, out:0, bureau:0, mag:0, invest:0 };

        for (const p in globalSummary) {
            const item = globalSummary[p];
            const enDepot = (item.in + item.returns) - (item.out + item.loss + item.consumedDepot);
            const totalSold = item.soldAgence + item.soldAbidjan;
            let depotColor = enDepot > 20 ? '#10b981' : (enDepot < 10 ? '#ef4444' : (enDepot < 15 ? '#f59e0b' : 'black'));

            if (item.lastPV > 0) {
                // LOGIQUE VENDABLES
                const bReel = item.revenue - (totalSold * item.lastPA);
                const bPot = (item.lastPV - item.lastPA) * enDepot;
                
                vKPI.in += item.in; vKPI.out += item.out; vKPI.abi += item.soldAbidjan;
                vKPI.mag += enDepot; vKPI.reel += bReel; vKPI.pot += bPot;

                const tr = document.createElement('tr');
                tr.innerHTML = `<td><b>${p}</b></td><td>${item.in}</td><td>${item.soldAgence}</td><td>${item.soldAbidjan}</td><td>${item.loss}</td><td style="font-weight:bold; color:${depotColor}">${enDepot}</td><td style="font-weight:bold;">${bReel.toFixed(2)}€</td>`;
                tr.onclick = () => { window.currentProdName = p; showProductDetails(p, enDepot); };
                vendablesTableBody.appendChild(tr);
            } else {
                // LOGIQUE CONSOS
                const valInvestie = item.in * item.lastPA;
                
                cKPI.in += item.in; cKPI.out += item.out; cKPI.bureau += item.consumedDepot;
                cKPI.mag += enDepot; cKPI.invest += valInvestie;

                const tr = document.createElement('tr');
                tr.innerHTML = `<td><b>${p}</b></td><td>${item.in}</td><td>${item.out}</td><td>${item.consumedDepot}</td><td style="font-weight:bold; color:${depotColor}">${enDepot}</td><td style="font-weight:bold;">${valInvestie.toFixed(2)}€</td>`;
                tr.onclick = () => { window.currentProdName = p; showProductDetails(p, enDepot); };
                consosTableBody.appendChild(tr);
            }
        }

        // MAJ KPI VENDABLES
        const updateText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        updateText('vend_volumeTotal', vKPI.in);
        updateText('vend_totalSorti', vKPI.out);
        updateText('vend_totalAbidjan', vKPI.abi);
        updateText('vend_totalEnMagasin', vKPI.mag);
        updateText('vend_beneficeReel', formatEUR(vKPI.reel));
        updateText('vend_beneficeTotalStock', formatEUR(vKPI.pot));

        // MAJ KPI CONSOS
        updateText('cons_volumeTotal', cKPI.in);
        updateText('cons_usageVendeurs', cKPI.out);
        updateText('cons_usageBureau', cKPI.bureau);
        updateText('cons_totalEnMagasin', cKPI.mag);
        updateText('cons_valeurInvestie', formatEUR(cKPI.invest));
    }

    // --- MODALS ET ACTIONS ---
    window.showProductDetails = (p, c) => {
        const m = document.getElementById('historyModal');
        document.getElementById('modalTitle').textContent = `Fiche : ${p}`;
        document.getElementById('modalStockStatus').innerHTML = `Dépôt : <strong>${c}</strong>`;
        let h = `<table style="width:100%"><thead><tr><th>Date</th><th>Qté</th><th>Modif</th></tr></thead><tbody>`;
        allStocksRaw.filter(s => s.produit === p).reverse().forEach(l => { h += `<tr><td>${l.date}</td><td>${l.quantite}</td><td><button onclick="editStockLot('${l.id}',${l.quantite})">🖊️</button></td></tr>`; });
        document.getElementById('modalTableBody').innerHTML = h + `</tbody></table>`;
        m.style.display = "block";
    };

    window.editStockLot = async (id, q) => { const n = prompt("Nouvelle quantité :", q); if(n) { await db.collection("stocks").doc(id).update({ quantite: parseInt(n) }); loadAllData(); } };
    window.confirmLoss = async () => { const q = parseInt(document.getElementById('lossQuantity').value); if(q > 0) { await db.collection("pertes").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] }); document.getElementById('lossModal').style.display = 'none'; loadAllData(); } };
    window.confirmConsumption = async () => { const q = parseInt(document.getElementById('consumeQuantity').value); if(q > 0) { await db.collection("consommations").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] }); document.getElementById('consumeModal').style.display = 'none'; loadAllData(); } };
    window.openLossModal = (p) => { document.getElementById('lossProductName').textContent = p; document.getElementById('lossModal').style.display = 'block'; };
    window.openConsumeModal = (p) => { document.getElementById('consumeProductName').textContent = p; document.getElementById('consumeModal').style.display = 'block'; };

    window.downloadStockPDF = function() { const e = document.getElementById('printableStockArea'); html2pdf().set({ margin: 10, filename: 'Stock_AMT.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'landscape' } }).from(e).save(); }
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    firebase.auth().onAuthStateChanged(user => { if (user) loadAllData(); });
});