document.addEventListener('DOMContentLoaded', async () => {
    const stockTableBody = document.getElementById('stockTableBody');
    const addStockBtn = document.getElementById('addStockBtn');
    const inputProduit = document.getElementById('stockProduit'); 
    const inputPrixAchat = document.getElementById('prixAchat');
    const inputPrixVente = document.getElementById('prixVenteRef');
    
    let allStocksRaw = []; 
    let allRecuperationsRaw = []; 
    let allVentesRaw = [];
    let allPertesRaw = [];
    let allConsommationsRaw = []; 
    let allRetoursRaw = []; // <-- AJOUT : Pour stocker les retours
    let lastKnownPrices = {}; 
    let globalSummary = {};

    document.getElementById('stockDate').valueAsDate = new Date();

    // --- 1. GESTION DU SÉLECTEUR DE PRODUIT ---
    inputProduit.addEventListener('change', () => {
        const produitSaisi = inputProduit.value;
        if (produitSaisi === "NEW") {
            const nouveauNom = prompt("Entrez le nom du nouveau produit :");
            if (nouveauNom && nouveauNom.trim() !== "") {
                const nomPropre = nouveauNom.trim().toUpperCase();
                const opt = document.createElement('option');
                opt.value = nomPropre;
                opt.textContent = nomPropre;
                inputProduit.insertBefore(opt, inputProduit.lastElementChild);
                inputProduit.value = nomPropre;
                inputPrixAchat.value = "";
                inputPrixVente.value = "";
            } else {
                inputProduit.value = "";
            }
            return;
        }
        if (lastKnownPrices[produitSaisi]) {
            inputPrixAchat.value = lastKnownPrices[produitSaisi].prixAchat;
            inputPrixVente.value = lastKnownPrices[produitSaisi].prixVente;
        }
    });

    // --- 2. ENREGISTRER UN ACHAT ---
    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value;
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const pAcha = parseFloat(inputPrixAchat.value) || 0;
        const pVent = parseFloat(inputPrixVente.value) || 0;
        const date = document.getElementById('stockDate').value;

        if(!prod || prod === "" || prod === "NEW") return alert("Veuillez choisir un produit.");
        if(qte <= 0) return alert("Quantité invalide.");

        try {
            await db.collection("stocks").add({ date, produit: prod, prixAchat: pAcha, prixVente: pVent, quantite: qte });
            if (typeof window.logAction === 'function') {
                await window.logAction("STOCK", "ARRIVAGE", `Nouvel arrivage : ${qte} unités`, prod);
            }
            alert("Arrivage enregistré !");
            document.getElementById('quantiteInitiale').value = "";
            loadAllData();
        } catch (e) { alert("Erreur d'enregistrement."); }
    });

    // --- 3. CHARGEMENT DES DONNÉES (CORRIGÉ) ---
    async function loadAllData() {
        const [stockSnap, recupSnap, ventesSnap, pertesSnap, consSnap, retoursSnap] = await Promise.all([
            db.collection("stocks").orderBy("date", "asc").get(),
            db.collection("recuperations").get(),
            db.collection("ventes").get(),
            db.collection("pertes").orderBy("date", "asc").get(),
            db.collection("consommations").get(),
            db.collection("retours_vendeurs").get() // <-- AJOUT : Récupération des retours de Validation
        ]);

        allStocksRaw = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allRecuperationsRaw = recupSnap.docs.map(doc => doc.data());
        allVentesRaw = ventesSnap.docs.map(doc => doc.data());
        allPertesRaw = pertesSnap.docs.map(doc => doc.data());
        allConsommationsRaw = consSnap.docs.map(doc => doc.data());
        allRetoursRaw = retoursSnap.docs.map(doc => doc.data()); // <-- AJOUT

        lastKnownPrices = {};
        allStocksRaw.forEach(s => {
            lastKnownPrices[s.produit] = { prixAchat: s.prixAchat, prixVente: s.prixVente };
        });

        const uniqueProds = [...new Set(allStocksRaw.map(s => s.produit))].sort();
        inputProduit.innerHTML = '<option value="">-- Choisir un produit --</option>';
        uniqueProds.forEach(p => { inputProduit.innerHTML += `<option value="${p}">${p}</option>`; });
        inputProduit.innerHTML += `<option value="NEW" style="color:blue; font-weight:bold;">+ NOUVEAU PRODUIT</option>`;

        renderStock();
    }

    // --- 4. RENDU DU TABLEAU ET CALCULS (CORRIGÉ) ---
    function renderStock() {
        stockTableBody.innerHTML = '';
        globalSummary = {}; 
        let investissementTotalConsos = 0; 
        let cumulBeneficeReelGlobal = 0; 

        // 1. Initialisation par produit (Entrées en stock)
        allStocksRaw.forEach(s => {
            const p = s.produit.trim().toUpperCase(); 
            if (!globalSummary[p]) {
                globalSummary[p] = { 
                    in: 0, out: 0, soldAgence: 0, soldAbidjan: 0, 
                    loss: 0, consumedDepot: 0, consumedTotal: 0, returns: 0, 
                    revenue: 0, lastPA: s.prixAchat || 0, lastPV: s.prixVente || 0 
                };
            }
            globalSummary[p].in += (parseInt(s.quantite) || 0);
            globalSummary[p].lastPA = parseFloat(s.prixAchat) || 0;
            globalSummary[p].lastPV = parseFloat(s.prixVente) || 0;
        });

        // 2. Accumulation des mouvements
        // Sorties vers vendeurs
        allRecuperationsRaw.forEach(r => { 
            const p = r.produit.trim().toUpperCase();
            if (globalSummary[p]) globalSummary[p].out += (parseInt(r.quantite) || 0); 
        });

        // Consommations (Logique de distinction Dépôt vs Vendeur)
        allConsommationsRaw.forEach(c => { 
            const p = c.produit.trim().toUpperCase();
            if (globalSummary[p]) {
                const qte = (parseInt(c.quantite) || 0);
                // Si la consommation n'a pas de vendeur, elle sort directement du dépôt
                if (!c.vendeur || c.vendeur === "" || c.vendeur === "MAGASIN") {
                    globalSummary[p].consumedDepot += qte;
                }
                // On suit le total consommé pour les statistiques financières
                globalSummary[p].consumedTotal += qte;
            } 
        });

        // Pertes et Retours
        allPertesRaw.forEach(p => { 
            const prod = p.produit.trim().toUpperCase();
            if (globalSummary[prod]) globalSummary[prod].loss += (parseInt(p.quantite) || 0); 
        });
        allRetoursRaw.forEach(ret => { 
            const prod = ret.produit.trim().toUpperCase();
            if (globalSummary[prod]) globalSummary[prod].returns += (parseInt(ret.quantite) || 0); 
        });
        
        // 3. Accumulation des ventes
        allVentesRaw.forEach(v => { 
            const p = v.produit.trim().toUpperCase();
            if (globalSummary[p]) { 
                if (v.payeAbidjan === true) globalSummary[p].soldAbidjan += (parseInt(v.quantite) || 0);
                else globalSummary[p].soldAgence += (parseInt(v.quantite) || 0);
                globalSummary[p].revenue += (parseFloat(v.total) || 0);
            } 
        });

        // 4. Génération des lignes du tableau
        for (const p in globalSummary) {
            const item = globalSummary[p];
            
            // NOUVELLE FORMULE PHYSIQUE :
            // Le stock au dépôt = (Reçu + Retours) - (Donné Vendeurs + Pertes + Consommé AU DEPOT)
            const enDepot = (item.in + item.returns) - (item.out + item.loss + item.consumedDepot);
            
            const totalSold = item.soldAgence + item.soldAbidjan;

            // Logique Consommables (PV=0) : Investissement total
            if (item.lastPV <= 0) {
                investissementTotalConsos += (item.in * item.lastPA);
            }

            // Marge sur vente réelle (Profit)
            const bReel = item.revenue - (totalSold * item.lastPA);
            // Bénéfice Potentiel (Uniquement produits vendables)
            const bEst = item.lastPV > 0 ? (item.lastPV - item.lastPA) * enDepot : 0;

            cumulBeneficeReelGlobal += bReel;

            let depotColor = enDepot > 20 ? '#10b981' : (enDepot < 10 ? '#ef4444' : (enDepot < 15 ? '#f59e0b' : 'black'));

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${p}</b></td>
                <td style="text-align:center;">${item.in}</td>
                <td style="text-align:center;">${item.soldAgence}</td>
                <td style="text-align:center; color:#701a75;">${item.soldAbidjan}</td>
                <td style="text-align:center; color:#ef4444;">${item.loss}</td>
                <td style="text-align:center; color:#64748b;">${item.consumedTotal}</td>
                <td style="text-align:center; font-weight:bold; color:${depotColor}">${enDepot}</td>
                <td style="text-align:center; color:${bReel < 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">${bReel.toFixed(2)}€</td>
            `;
            tr.onclick = () => showProductDetails(p, enDepot);
            stockTableBody.appendChild(tr);
        }

        // 5. MISE À JOUR DES CARTES KPI (EN-TÊTES)
        document.getElementById('volumeTotal').textContent = allStocksRaw.reduce((a, b) => a + (parseInt(b.quantite) || 0), 0);
        document.getElementById('totalSorti').textContent = allRecuperationsRaw.reduce((a, b) => a + (parseInt(b.quantite) || 0), 0);
        document.getElementById('totalPertesStock').textContent = allPertesRaw.reduce((a, b) => a + (parseInt(b.quantite) || 0), 0);
        document.getElementById('totalAbidjanQty').textContent = allVentesRaw.filter(v => v.payeAbidjan).reduce((a, b) => a + (parseInt(b.quantite) || 0), 0);
        
        // Coût total des consommables (Achat)
        const coutConsElem = document.getElementById('totalCoutConsommables');
        if (coutConsElem) coutConsElem.textContent = formatEUR(investissementTotalConsos);

        // Calcul du Stock Magasin Global pour la carte KPI
        const tIn = allStocksRaw.reduce((a,b) => a + (parseInt(b.quantite) || 0), 0);
        const tRet = allRetoursRaw.reduce((a,b) => a + (parseInt(b.quantite) || 0), 0);
        const tOut = allRecuperationsRaw.reduce((a,b) => a + (parseInt(b.quantite) || 0), 0);
        const tLoss = allPertesRaw.reduce((a,b) => a + (parseInt(b.quantite) || 0), 0);
        // On utilise ici la somme des consommations "Dépôt" pour le stock physique global
        const tConsDepot = Object.values(globalSummary).reduce((a, b) => a + b.consumedDepot, 0);
        
        document.getElementById('totalEnMagasin').textContent = (tIn + tRet) - (tOut + tLoss + tConsDepot);
        document.getElementById('beneficeReel').textContent = formatEUR(cumulBeneficeReelGlobal);

        // Bénéfice POTENTIEL Global recalculé proprement
        const gainEstTotalGlobal = Object.values(globalSummary).reduce((sum, item) => {
            const stockRestant = (item.in + item.returns) - (item.out + item.loss + item.consumedDepot);
            return sum + (item.lastPV > 0 ? (item.lastPV - item.lastPA) * stockRestant : 0);
        }, 0);
        document.getElementById('beneficeTotalStock').textContent = formatEUR(gainEstTotalGlobal);
    }

    // --- 5. EXPORT PDF / MODALS ---
    window.downloadStockPDF = function() {
        const element = document.getElementById('printableStockArea');
        html2pdf().set({ margin: 10, filename: 'Inventaire_AMT.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'landscape' } }).from(element).save();
    }

    window.showProductDetails = (prodName, currentStock) => {
        const modal = document.getElementById('historyModal');
        let badge = currentStock > 20 ? 'badge-green' : (currentStock < 10 ? 'badge-red' : 'badge-orange');
        let status = currentStock > 20 ? 'Optimal' : (currentStock < 10 ? 'Rupture' : 'Faible');

        document.getElementById('modalTitle').textContent = `Fiche : ${prodName}`;
        document.getElementById('modalStockStatus').innerHTML = `Dépôt : <strong>${currentStock}</strong> <span class="stock-badge ${badge}">${status}</span>`;
        
        document.getElementById('btnLossFromModal').onclick = () => { modal.style.display = "none"; openLossModal(prodName); };
        const btnCons = document.getElementById('btnConsumeFromModal');
        if (btnCons) btnCons.onclick = () => { modal.style.display = "none"; openConsumeModal(prodName); };

        let html = `<h4>Historique</h4><table class="modal-table"><thead><tr><th>Date</th><th>Qté</th><th>Action</th></tr></thead><tbody>`;
        [...allStocksRaw].filter(s => s.produit === prodName).reverse().forEach(l => {
            html += `<tr><td>${l.date}</td><td>${l.quantite}</td><td><button onclick="editStockLot('${l.id}','${l.produit}',${l.quantite})">Modif</button></td></tr>`;
        });
        document.getElementById('modalTableBody').innerHTML = html + `</tbody></table>`;
        modal.style.display = "block";
    };

    // --- 7. ACTIONS ADMIN (CORRECTION, PERTES, CONSO) ---
    window.editStockLot = async (id, name, q) => {
        const nQ = prompt(`Modifier Quantité (${q}) :`, q);
        if (nQ) { await db.collection("stocks").doc(id).update({ quantite: parseInt(nQ) }); loadAllData(); }
    };

    window.openLossModal = (p) => { document.getElementById('lossProductName').textContent = p; window.currentLossProd = p; document.getElementById('lossModal').style.display = 'block'; };
    window.confirmLoss = async () => { 
        const q = parseInt(document.getElementById('lossQuantity').value);
        if(q > 0) { await db.collection("pertes").add({ produit: window.currentLossProd, quantite: q, date: new Date().toISOString().split('T')[0] }); document.getElementById('lossModal').style.display = 'none'; loadAllData(); }
    };

    window.openConsumeModal = (p) => { document.getElementById('consumeProductName').textContent = p; window.currentConsumeProd = p; document.getElementById('consumeModal').style.display = 'block'; };
    window.confirmConsumption = async () => {
        const q = parseInt(document.getElementById('consumeQuantity').value);
        if(q > 0) { await db.collection("consommations").add({ produit: window.currentConsumeProd, quantite: q, date: new Date().toISOString().split('T')[0] }); document.getElementById('consumeModal').style.display = 'none'; loadAllData(); }
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    firebase.auth().onAuthStateChanged(user => { if (user) { db.collection("users").where("email", "==", user.email).get().then(snap => { if(!snap.empty) { window.userRole = snap.docs[0].data().role; loadAllData(); } }); } });
});