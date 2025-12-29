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

    // --- 2. ENREGISTRER UN ACHAT (ARRIVAGE) ---
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

    // --- 3. CHARGEMENT DES DONNÉES ---
    async function loadAllData() {
        const [stockSnap, recupSnap, ventesSnap, pertesSnap, consSnap] = await Promise.all([
            db.collection("stocks").orderBy("date", "asc").get(),
            db.collection("recuperations").get(),
            db.collection("ventes").get(),
            db.collection("pertes").orderBy("date", "asc").get(),
            db.collection("consommations").get() 
        ]);

        allStocksRaw = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allRecuperationsRaw = recupSnap.docs.map(doc => doc.data());
        allVentesRaw = ventesSnap.docs.map(doc => doc.data());
        allPertesRaw = pertesSnap.docs.map(doc => doc.data());
        allConsommationsRaw = consSnap.docs.map(doc => doc.data());

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

    // --- 4. RENDU DU TABLEAU ET CALCULS ---
    function renderStock() {
        stockTableBody.innerHTML = '';
        globalSummary = {}; 

        allStocksRaw.forEach(s => {
            if (!globalSummary[s.produit]) {
                globalSummary[s.produit] = { in: 0, out: 0, soldAgence: 0, soldAbidjan: 0, loss: 0, consumed: 0, revenue: 0, lastPA: s.prixAchat, lastPV: s.prixVente };
            }
            globalSummary[s.produit].in += s.quantite;
            globalSummary[s.produit].lastPA = s.prixAchat;
            globalSummary[s.produit].lastPV = s.prixVente;
        });

        allRecuperationsRaw.forEach(r => { if (globalSummary[r.produit]) globalSummary[r.produit].out += r.quantite; });
        allPertesRaw.forEach(p => { if (globalSummary[p.produit]) globalSummary[p.produit].loss += p.quantite; });
        allConsommationsRaw.forEach(c => { if (globalSummary[c.produit]) globalSummary[c.produit].consumed += c.quantite; });
        
        allVentesRaw.forEach(v => { 
            if (globalSummary[v.produit]) { 
                if (v.payeAbidjan === true) globalSummary[v.produit].soldAbidjan += v.quantite;
                else globalSummary[v.produit].soldAgence += v.quantite;
                globalSummary[v.produit].revenue += (v.total || 0);
            } 
        });

        let gainReelTotal = 0; let gainEstTotal = 0;
        let totalPertesMagasin = 0; let totalAbidjanGlobal = 0;

        for (const prod in globalSummary) {
            const item = globalSummary[prod];
            const enDepot = item.in - item.out - item.loss - item.consumed;
            const totalVendu = item.soldAgence + item.soldAbidjan;
            
            // Bénéfice Réel : Revenus - (Coût des vendus + Coût des consommés)
            const bReel = item.revenue - ((totalVendu + item.consumed) * item.lastPA);
            const bEst = (item.lastPV - item.lastPA) * enDepot;

            gainReelTotal += bReel; gainEstTotal += bEst;
            totalPertesMagasin += item.loss; totalAbidjanGlobal += item.soldAbidjan;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${prod}</b></td>
                <td style="text-align:center;">${item.in}</td>
                <td style="text-align:center;">${item.soldAgence}</td>
                <td style="text-align:center; color:#701a75; font-weight:bold;">${item.soldAbidjan}</td>
                <td style="text-align:center; color:#ef4444;">${item.loss}</td>
                <td style="text-align:center; color:#64748b;">${item.consumed}</td>
                <td style="text-align:center; font-weight:bold; color:${enDepot < 5 ? 'red' : 'black'}">${enDepot}</td>
                <td style="text-align:center; color:${bReel < 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">${bReel.toFixed(2)}€</td>
            `;
            tr.onclick = () => showProductDetails(prod, enDepot);
            stockTableBody.appendChild(tr);
        }

        document.getElementById('volumeTotal').textContent = allStocksRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalSorti').textContent = allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalPertesStock').textContent = totalPertesMagasin;
        document.getElementById('totalAbidjanQty').textContent = totalAbidjanGlobal;
        document.getElementById('totalEnMagasin').textContent = (allStocksRaw.reduce((a, b) => a + b.quantite, 0) - allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0) - totalPertesMagasin - allConsommationsRaw.reduce((a,b) => a+b.quantite, 0));
        document.getElementById('beneficeReel').textContent = formatEUR(gainReelTotal);
        document.getElementById('beneficeTotalStock').textContent = formatEUR(gainEstTotal);
    }

    // --- 5. EXPORT PDF ---
    window.downloadStockPDF = function() {
        const element = document.getElementById('printableStockArea');
        html2pdf().set({ margin: 10, filename: 'Inventaire_Stock_AMT.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(element).save();
    }

    // --- 6. MODALS ET ACTIONS ---
    window.showProductDetails = (prodName, currentStock) => {
        const modal = document.getElementById('historyModal');
        document.getElementById('modalTitle').textContent = `Fiche : ${prodName}`;
        document.getElementById('modalStockStatus').innerHTML = `Stock au dépôt : <strong>${currentStock}</strong>`;
        
        // Configuration des boutons d'action dans la modal
        const btnLoss = document.getElementById('btnLossFromModal');
        const btnCons = document.getElementById('btnConsumeFromModal');

        if (window.userRole !== 'superadmin') {
            btnLoss.style.display = 'none';
            if (btnCons) btnCons.style.display = 'none';
        } else {
            btnLoss.style.display = 'block';
            btnLoss.onclick = () => { modal.style.display = "none"; openLossModal(prodName); };
            if (btnCons) {
                btnCons.style.display = 'block';
                btnCons.onclick = () => { modal.style.display = "none"; openConsumeModal(prodName); };
            }
        }

        let html = `<h4>Historique Arrivages</h4><table class="modal-table"><thead><tr><th>Date</th><th>Qté</th><th>Action</th></tr></thead><tbody>`;
        [...allStocksRaw].filter(s => s.produit === prodName).reverse().forEach(l => {
            const action = (window.userRole === 'superadmin') ? `<button onclick="editStockLot('${l.id}','${l.produit}',${l.quantite})">Modif</button>` : '';
            html += `<tr><td>${l.date}</td><td>${l.quantite}</td><td>${action}</td></tr>`;
        });
        document.getElementById('modalTableBody').innerHTML = html + `</tbody></table>`;
        modal.style.display = "block";
    };

    // --- 7. MODIFICATION DE LOT ---
    window.editStockLot = async (id, name, q) => {
        if (window.userRole !== 'superadmin') return alert("Interdit.");
        const nQ = prompt(`[${name}] Modifier la Quantité actuelle (${q}) :`, q);
        if (nQ !== null && nQ !== "" && parseInt(nQ) !== q) {
            try {
                await db.collection("stocks").doc(id).update({ quantite: parseInt(nQ) });
                alert("Stock mis à jour.");
                loadAllData();
            } catch (e) { alert("Erreur."); }
        }
    };

    // --- 8. GESTION DES PERTES ---
    let currentLossProd = "";
    window.openLossModal = (prod) => { 
        currentLossProd = prod; 
        document.getElementById('lossProductName').textContent = prod; 
        document.getElementById('lossModal').style.display = 'block'; 
    };

    window.confirmLoss = async () => {
        if (window.userRole !== 'superadmin') return alert("Interdit.");
        const q = parseInt(document.getElementById('lossQuantity').value);
        if(q > 0) {
            try {
                await db.collection("pertes").add({ produit: currentLossProd, quantite: q, date: new Date().toISOString().split('T')[0] });
                document.getElementById('lossModal').style.display = 'none';
                document.getElementById('lossQuantity').value = "";
                loadAllData();
            } catch (e) { alert("Erreur."); }
        }
    };

    // --- 9. GESTION DE LA CONSOMMATION INTERNE ---
    let currentConsumeProd = "";
    window.openConsumeModal = (prod) => { 
        currentConsumeProd = prod; 
        document.getElementById('consumeProductName').textContent = prod; 
        document.getElementById('consumeModal').style.display = 'block'; 
    };

    window.confirmConsumption = async () => {
        const inputQ = document.getElementById('consumeQuantity');
        const q = parseInt(inputQ.value);
        if(q > 0) {
            try {
                await db.collection("consommations").add({ 
                    produit: currentConsumeProd, 
                    quantite: q, 
                    date: new Date().toISOString().split('T')[0] 
                });
                if (typeof window.logAction === 'function') {
                    await window.logAction("STOCK", "CONSOMMATION", `Usage interne : ${q} unités`, currentConsumeProd);
                }
                document.getElementById('consumeModal').style.display = 'none';
                inputQ.value = "";
                loadAllData();
                alert("Consommation enregistrée.");
            } catch (e) { alert("Erreur."); }
        }
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            db.collection("users").where("email", "==", user.email).get().then(snap => {
                if(!snap.empty) {
                    const data = snap.docs[0].data();
                    window.userRole = data.role;
                    loadAllData();
                }
            });
        }
    });
});