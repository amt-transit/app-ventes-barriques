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
    let lastKnownPrices = {}; 
    let globalSummary = {}; 

    document.getElementById('stockDate').valueAsDate = new Date();

    // --- 1. SAISIE INTELLIGENTE ---
    inputProduit.addEventListener('input', () => {
        const produitSaisi = inputProduit.value.trim();
        if (lastKnownPrices[produitSaisi]) {
            inputPrixAchat.value = lastKnownPrices[produitSaisi].prixAchat;
            inputPrixVente.value = lastKnownPrices[produitSaisi].prixVente;
        }
    });

    // --- 2. ENREGISTRER UN ACHAT (ARRIVAGE) + LOG ---
    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value.trim();
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const pAcha = parseFloat(inputPrixAchat.value) || 0;
        const pVent = parseFloat(inputPrixVente.value) || 0;
        const date = document.getElementById('stockDate').value;

        if(prod && qte > 0) {
            try {
                await db.collection("stocks").add({ date, produit: prod, prixAchat: pAcha, prixVente: pVent, quantite: qte });
                
                if (typeof window.logAction === 'function') {
                    await window.logAction("STOCK", "ARRIVAGE", `Nouvel arrivage : ${qte} unités à ${pAcha}€`, prod);
                }

                alert("Arrivage enregistré !");
                inputProduit.value = ""; 
                document.getElementById('quantiteInitiale').value = "";
                loadAllData();
            } catch (e) { alert("Erreur lors de l'enregistrement."); }
        }
    });

    // --- 3. CHARGEMENT DES DONNÉES ---
    async function loadAllData() {
        const [stockSnap, recupSnap, ventesSnap, pertesSnap] = await Promise.all([
            db.collection("stocks").orderBy("date", "asc").get(),
            db.collection("recuperations").get(),
            db.collection("ventes").get(),
            db.collection("pertes").orderBy("date", "asc").get()
        ]);

        allStocksRaw = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allRecuperationsRaw = recupSnap.docs.map(doc => doc.data());
        allVentesRaw = ventesSnap.docs.map(doc => doc.data());
        allPertesRaw = pertesSnap.docs.map(doc => doc.data());

        lastKnownPrices = {};
        allStocksRaw.forEach(s => {
            lastKnownPrices[s.produit] = { prixAchat: s.prixAchat, prixVente: s.prixVente };
        });

        renderStock();
    }

    // --- 4. RENDU DU TABLEAU ET CALCULS ---
    function renderStock() {
        stockTableBody.innerHTML = '';
        globalSummary = {}; 

        // Initialisation par produit
        allStocksRaw.forEach(s => {
            if (!globalSummary[s.produit]) {
                globalSummary[s.produit] = { 
                    in: 0, out: 0, soldAgence: 0, soldAbidjan: 0, 
                    loss: 0, lastPA: s.prixAchat, lastPV: s.prixVente, revenue: 0 
                };
            }
            globalSummary[s.produit].in += s.quantite;
            globalSummary[s.produit].lastPA = s.prixAchat;
            globalSummary[s.produit].lastPV = s.prixVente;
        });

        // Sorties vers vendeurs
        allRecuperationsRaw.forEach(r => { 
            if (globalSummary[r.produit]) globalSummary[r.produit].out += r.quantite; 
        });

        // Pertes sèches au dépôt
        allPertesRaw.forEach(p => { 
            if (globalSummary[p.produit]) globalSummary[p.produit].loss += p.quantite; 
        });

        // Ventes (Séparation Agence / Abidjan)
        allVentesRaw.forEach(v => { 
            if (globalSummary[v.produit]) { 
                if (v.payeAbidjan === true) {
                    globalSummary[v.produit].soldAbidjan += v.quantite;
                } else {
                    globalSummary[v.produit].soldAgence += v.quantite;
                }
                globalSummary[v.produit].revenue += (v.total || 0);
            } 
        });

        let gainReelTotal = 0;
        let gainEstTotal = 0;
        let totalPertesMagasin = 0;
        let totalAbidjanGlobal = 0;

        for (const prod in globalSummary) {
            const item = globalSummary[prod];
            
            // Stock physique restant au dépôt
            const enDepot = item.in - item.out - item.loss;
            
            // Bénéfice basé sur tout ce qui est vendu
            const totalVendu = item.soldAgence + item.soldAbidjan;
            const bReel = item.revenue - (totalVendu * item.lastPA);
            const bEst = (item.lastPV - item.lastPA) * enDepot;

            gainReelTotal += bReel;
            gainEstTotal += bEst;
            totalPertesMagasin += item.loss;
            totalAbidjanGlobal += item.soldAbidjan;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${prod}</b></td>
                <td style="text-align:center;">${item.in}</td>
                <td style="text-align:center;">${item.soldAgence}</td>
                <td style="text-align:center; color:#701a75; font-weight:bold;">${item.soldAbidjan}</td>
                <td style="text-align:center; color:#ef4444;">${item.loss}</td>
                <td style="text-align:center; font-weight:bold; color:${enDepot < 5 ? 'red' : 'black'}">${enDepot}</td>
                <td style="text-align:center; color:#10b981; font-weight:bold;">${bReel.toFixed(2)}€</td>
            `;
            tr.onclick = () => showProductDetails(prod, enDepot);
            stockTableBody.appendChild(tr);
        }

        // Mise à jour des cartes KPI (Synchronisé avec HTML)
        document.getElementById('volumeTotal').textContent = allStocksRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalSorti').textContent = allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalPertesStock').textContent = totalPertesMagasin;
        document.getElementById('totalAbidjanQty').textContent = totalAbidjanGlobal;
        
        // Stock réel actuellement disponible dans les étagères du dépôt
        const stockPhysiqueMagasin = allStocksRaw.reduce((a, b) => a + b.quantite, 0) 
                                   - allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0) 
                                   - totalPertesMagasin;
        
        document.getElementById('totalEnMagasin').textContent = stockPhysiqueMagasin;
        document.getElementById('beneficeReel').textContent = formatEUR(gainReelTotal);
        document.getElementById('beneficeTotalStock').textContent = formatEUR(gainEstTotal);
    }

    // --- 5. EXPORT PDF ---
    window.downloadStockPDF = function() {
        const element = document.getElementById('printableStockArea');
        const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
        const opt = {
            margin: 10,
            filename: `Inventaire_Stock_AMT_${dateStr}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    }

    // --- 6. MODAL DÉTAILS ---
    window.showProductDetails = (prodName, currentStock) => {
        const modal = document.getElementById('historyModal');
        const modalTableBody = document.getElementById('modalTableBody');
        document.getElementById('modalTitle').textContent = `Fiche Produit : ${prodName}`;
        document.getElementById('modalStockStatus').innerHTML = `Disponible au dépôt : <strong>${currentStock}</strong> unités`;
        
        const btnLoss = document.getElementById('btnLossFromModal');
        if (window.userRole !== 'superadmin') {
            btnLoss.style.display = 'none';
        } else {
            btnLoss.style.display = 'block';
            btnLoss.onclick = () => { modal.style.display = "none"; openLossModal(prodName); };
        }

        let html = `<h4 style="margin-top:20px; color:#1877f2; font-size:14px;">📦 Historique des Arrivages</h4>
                    <table class="modal-table">
                    <thead><tr><th>Date</th><th>Qté</th><th>Achat</th><th>Action</th></tr></thead><tbody>`;
        
        const lots = [...allStocksRaw].filter(s => s.produit === prodName).reverse();
        lots.forEach(l => {
            const actionHTML = (window.userRole === 'superadmin') 
                ? `<button class="btn-edit" onclick="editStockLot('${l.id}','${l.produit}',${l.quantite},${l.prixAchat},${l.prixVente})">Modifier</button>` 
                : `<span style="color:gray; font-size:10px;">Lecture seule</span>`;

            html += `<tr><td>${l.date}</td><td><b>${l.quantite}</b></td><td>${l.prixAchat.toFixed(2)}€</td><td>${actionHTML}</td></tr>`;
        });

        html += `</tbody></table><h4 style="margin-top:25px; color:#ef4444;">⚡ Pertes au dépôt</h4><table class="modal-table"><thead><tr><th>Date</th><th>Quantité</th></tr></thead><tbody>`;
        const pertesProd = allPertesRaw.filter(p => p.produit === prodName);
        if(pertesProd.length === 0) html += `<tr><td colspan="2" style="text-align:center;">Aucune perte enregistrée</td></tr>`;
        else pertesProd.forEach(p => { html += `<tr><td>${p.date}</td><td style="color:red; font-weight:bold;">- ${p.quantite}</td></tr>`; });
        
        html += `</tbody></table>`;
        modalTableBody.innerHTML = html;
        modal.style.display = "block";
    };

    // --- 7. MODIFICATION DE LOT ---
    window.editStockLot = async (id, name, q, pa, pv) => {
        if (window.userRole !== 'superadmin') return alert("Interdit.");
        const nQ = prompt(`[${name}] Modifier la Quantité :`, q);
        if (nQ !== null && nQ !== "" && parseInt(nQ) !== q) {
            try {
                await db.collection("stocks").doc(id).update({ quantite: parseInt(nQ) });
                if (typeof window.logAction === 'function') {
                    await window.logAction("STOCK", "MODIFICATION", `Correction de stock : ${q} -> ${nQ}`, name);
                }
                alert("Mis à jour !");
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
                await db.collection("pertes").add({ 
                    produit: currentLossProd, 
                    quantite: q, 
                    date: new Date().toISOString().split('T')[0] 
                });
                if (typeof window.logAction === 'function') {
                    await window.logAction("STOCK", "PERTE", `Perte déclarée : ${q} unités`, currentLossProd);
                }
                document.getElementById('lossModal').style.display = 'none';
                document.getElementById('lossQuantity').value = "";
                loadAllData();
            } catch (e) { alert("Erreur."); }
        }
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    // Initialisation Auth
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            db.collection("users").where("email", "==", user.email).get().then(snap => {
                if(!snap.empty) {
                    const data = snap.docs[0].data();
                    window.userRole = data.role;
                    window.userName = data.nom;
                    loadAllData();
                }
            });
        }
    });
});