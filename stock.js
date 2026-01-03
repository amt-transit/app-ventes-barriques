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

    // --- 4. CALCULS ET FILTRE DE CONFIRMATION ---
    function renderStock() {
        vendablesTableBody.innerHTML = '';
        consosTableBody.innerHTML = '';
        let globalSummary = {}; 

        // Initialisation à partir des arrivages
        allStocksRaw.forEach(s => {
            const p = s.produit.trim().toUpperCase(); 
            if (!globalSummary[p]) {
                globalSummary[p] = { in:0, out:0, soldAg:0, soldAbi:0, loss:0, cDepot:0, returns:0, rev:0, pa: s.prixAchat||0, pv: s.prixVente||0 };
            }
            globalSummary[p].in += (parseInt(s.quantite) || 0);
            globalSummary[p].pa = parseFloat(s.prixAchat) || 0;
            globalSummary[p].pv = parseFloat(s.prixVente) || 0;
        });

        // FILTRE CRUCIAL : Seules les récupérations CONFIRMÉES sortent du stock
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
            // FORMULE STOCK DÉPÔT : (Arrivages + Retours) - (Sorties Confirmées + Pertes + Consos Bureau)
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
                tr.onclick = () => { window.currentProdName = p; showProductDetails(p, enDepot); };
                vendablesTableBody.appendChild(tr);
            } else {
                const valInvestie = item.in * item.pa;
                cKPI.in += item.in; cKPI.out += item.out; cKPI.bureau += item.cDepot;
                cKPI.mag += enDepot; cKPI.invest += valInvestie;

                const tr = document.createElement('tr');
                tr.innerHTML = `<td><b>${p}</b></td><td>${item.in}</td><td>${item.out}</td><td>${item.cDepot}</td><td style="font-weight:bold; color:${depotColor}">${enDepot}</td><td style="font-weight:bold;">${formatEUR(valInvestie)}</td>`;
                tr.onclick = () => { window.currentProdName = p; showProductDetails(p, enDepot); };
                consosTableBody.appendChild(tr);
            }
        }

        // Mise à jour des cartes KPI
        const updateText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
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

    // --- ACTIONS BOUTONS ET MODALES ---
    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value;
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const date = document.getElementById('stockDate').value;
        if(!prod || qte <= 0) return alert("Saisie invalide.");
        await db.collection("stocks").add({ date, produit: prod, prixAchat: parseFloat(inputPrixAchat.value)||0, prixVente: parseFloat(inputPrixVente.value)||0, quantite: qte });
        alert("Enregistré !");
        document.getElementById('quantiteInitiale').value = ""; loadAllData();
    });

    window.confirmLoss = async () => {
        const q = parseInt(document.getElementById('lossQuantity').value);
        if(q > 0) {
            await db.collection("pertes").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] });
            document.getElementById('lossModal').style.display = 'none'; loadAllData();
        }
    };

    window.confirmConsumption = async () => {
        const q = parseInt(document.getElementById('consumeQuantity').value);
        if(q > 0) {
            await db.collection("consommations").add({ produit: window.currentProdName, quantite: q, date: new Date().toISOString().split('T')[0] });
            document.getElementById('consumeModal').style.display = 'none'; loadAllData();
        }
    };

    window.showProductDetails = (p, c) => {
        const m = document.getElementById('historyModal');
        document.getElementById('modalTitle').textContent = `Fiche : ${p}`;
        document.getElementById('modalStockStatus').innerHTML = `Dépôt actuel : <strong>${c}</strong>`;
        let h = `<table style="width:100%"><thead><tr><th>Date</th><th>Qté</th><th>Action</th></tr></thead><tbody>`;
        allStocksRaw.filter(s => s.produit === p).reverse().forEach(l => {
            h += `<tr><td>${l.date}</td><td>${l.quantite}</td><td><button onclick="editStockLot('${l.id}',${l.quantite})">🖊️</button></td></tr>`;
        });
        document.getElementById('modalTableBody').innerHTML = h + `</tbody></table>`;
        m.style.display = "block";
    };

    window.editStockLot = async (id, q) => { const n = prompt("Nouvelle quantité :", q); if(n) { await db.collection("stocks").doc(id).update({ quantite: parseInt(n) }); loadAllData(); } };
    window.openLossModal = (p) => { document.getElementById('lossProductName').textContent = p; document.getElementById('lossModal').style.display = 'block'; };
    window.openConsumeModal = (p) => { document.getElementById('consumeProductName').textContent = p; document.getElementById('consumeModal').style.display = 'block'; };
    window.downloadStockPDF = function() { const e = document.getElementById('printableStockArea'); html2pdf().set({ margin: 10, filename: 'Inventaire_AMT.pdf', html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'landscape' } }).from(e).save(); }
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    
    firebase.auth().onAuthStateChanged(user => { if (user) loadAllData(); });
});