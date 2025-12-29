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

        allStocksRaw.forEach(s => {
            if (!globalSummary[s.produit]) {
                globalSummary[s.produit] = { 
                    in: 0, out: 0, soldAgence: 0, soldAbidjan: 0, 
                    loss: 0, consumed: 0, returns: 0, // <-- AJOUT : returns
                    revenue: 0, lastPA: s.prixAchat, lastPV: s.prixVente 
                };
            }
            globalSummary[s.produit].in += s.quantite;
        });

        allRecuperationsRaw.forEach(r => { if (globalSummary[r.produit]) globalSummary[r.produit].out += r.quantite; });
        allPertesRaw.forEach(p => { if (globalSummary[p.produit]) globalSummary[p.produit].loss += p.quantite; });
        allConsommationsRaw.forEach(c => { if (globalSummary[c.produit]) globalSummary[c.produit].consumed += c.quantite; });
        allRetoursRaw.forEach(ret => { if (globalSummary[ret.produit]) globalSummary[ret.produit].returns += ret.quantite; }); // <-- AJOUT
        
        allVentesRaw.forEach(v => { 
            if (globalSummary[v.produit]) { 
                if (v.payeAbidjan === true) globalSummary[v.produit].soldAbidjan += v.quantite;
                else globalSummary[v.produit].soldAgence += v.quantite;
                globalSummary[v.produit].revenue += (v.total || 0);
            } 
        });

        let gainReelTotal = 0; let gainEstTotal = 0;

        for (const prod in globalSummary) {
            const item = globalSummary[prod];
            
            // MATHÉMATIQUES DU STOCK PHYSIQUE (En Dépôt) :
            // (Reçu + Retours des vendeurs) - (Donné aux vendeurs + Pertes + Consommé)
            const enDepot = (item.in + item.returns) - (item.out + item.loss + item.consumed); // <-- FORMULE CORRIGÉE
            
            const totalVendu = item.soldAgence + item.soldAbidjan;
            const bReel = item.revenue - ((totalVendu + item.consumed) * item.lastPA);
            const bEst = (item.lastPV - item.lastPA) * enDepot;

            gainReelTotal += bReel; gainEstTotal += bEst;

            let depotColor = enDepot > 20 ? '#10b981' : (enDepot < 10 ? '#ef4444' : (enDepot < 15 ? '#f59e0b' : 'black'));

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${prod}</b></td>
                <td style="text-align:center;">${item.in}</td>
                <td style="text-align:center;">${item.soldAgence}</td>
                <td style="text-align:center; color:#701a75;">${item.soldAbidjan}</td>
                <td style="text-align:center; color:#ef4444;">${item.loss}</td>
                <td style="text-align:center; color:#64748b;">${item.consumed}</td>
                <td style="text-align:center; font-weight:bold; color:${depotColor}">${enDepot}</td>
                <td style="text-align:center; color:${bReel < 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">${bReel.toFixed(2)}€</td>
            `;
            tr.onclick = () => showProductDetails(prod, enDepot);
            stockTableBody.appendChild(tr);
        }

        // MISE À JOUR DES KPI (Compteurs en haut)
        document.getElementById('volumeTotal').textContent = allStocksRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalSorti').textContent = allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalPertesStock').textContent = allPertesRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalAbidjanQty').textContent = allVentesRaw.filter(v => v.payeAbidjan).reduce((a, b) => a + b.quantite, 0);
        
        // Calcul final Stock Dépôt Global : (Total Reçu + Total Retours) - (Total Sorties + Total Pertes + Total Conso)
        const tIn = allStocksRaw.reduce((a,b) => a + b.quantite, 0);
        const tRet = allRetoursRaw.reduce((a,b) => a + b.quantite, 0);
        const tOut = allRecuperationsRaw.reduce((a,b) => a + b.quantite, 0);
        const tLoss = allPertesRaw.reduce((a,b) => a + b.quantite, 0);
        const tCons = allConsommationsRaw.reduce((a,b) => a + b.quantite, 0);
        
        document.getElementById('totalEnMagasin').textContent = (tIn + tRet) - (tOut + tLoss + tCons);
        document.getElementById('beneficeReel').textContent = formatEUR(gainReelTotal);
        document.getElementById('beneficeTotalStock').textContent = formatEUR(gainEstTotal);
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