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

    inputProduit.addEventListener('input', () => {
        const produitSaisi = inputProduit.value.trim();
        if (lastKnownPrices[produitSaisi]) {
            inputPrixAchat.value = lastKnownPrices[produitSaisi].prixAchat;
            inputPrixVente.value = lastKnownPrices[produitSaisi].prixVente;
        }
    });

    addStockBtn.addEventListener('click', async () => {
        const prod = inputProduit.value.trim();
        const qte = parseInt(document.getElementById('quantiteInitiale').value) || 0;
        const pAcha = parseFloat(inputPrixAchat.value) || 0;
        const pVent = parseFloat(inputPrixVente.value) || 0;
        const date = document.getElementById('stockDate').value;

        if(prod && qte > 0) {
            await db.collection("stocks").add({ date, produit: prod, prixAchat: pAcha, prixVente: pVent, quantite: qte });
            alert("Arrivage enregistré !");
            inputProduit.value = ""; 
            document.getElementById('quantiteInitiale').value = "";
            loadAllData();
        }
    });

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

    function renderStock() {
        stockTableBody.innerHTML = '';
        globalSummary = {}; 

        allStocksRaw.forEach(s => {
            if (!globalSummary[s.produit]) globalSummary[s.produit] = { in: 0, out: 0, sold: 0, loss: 0, lastPA: s.prixAchat, lastPV: s.prixVente, revenue: 0 };
            globalSummary[s.produit].in += s.quantite;
            globalSummary[s.produit].lastPA = s.prixAchat;
            globalSummary[s.produit].lastPV = s.prixVente;
        });

        allRecuperationsRaw.forEach(r => { if (globalSummary[r.produit]) globalSummary[r.produit].out += r.quantite; });
        allPertesRaw.forEach(p => { if (globalSummary[p.produit]) globalSummary[p.produit].loss += p.quantite; });
        allVentesRaw.forEach(v => { 
            if (globalSummary[v.produit]) { 
                globalSummary[v.produit].sold += v.quantite; 
                globalSummary[v.produit].revenue += (v.total || 0);
            } 
        });

        let gainReelTotal = 0;
        let gainEstTotal = 0;

        for (const prod in globalSummary) {
            const item = globalSummary[prod];
            const enDepot = item.in - item.out - item.loss;
            const bReel = item.revenue - (item.sold * item.lastPA);
            const bEst = (item.lastPV - item.lastPA) * enDepot;

            gainReelTotal += bReel;
            gainEstTotal += bEst;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${prod}</b></td>
                <td style="text-align:center;">${item.in}</td>
                <td style="text-align:center;">${item.out}</td>
                <td style="text-align:center; font-weight:bold; color:${enDepot < 5 ? 'red' : 'black'}">${enDepot}</td>
                <td style="text-align:center; color:#10b981; font-weight:bold;">${bReel.toFixed(2)}€</td>
                <td style="text-align:center; color:#8b5cf6;">${bEst.toFixed(2)}€</td>
            `;
            tr.onclick = () => showProductDetails(prod, enDepot);
            stockTableBody.appendChild(tr);
        }

        document.getElementById('volumeTotal').textContent = allStocksRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalSorti').textContent = allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0);
        document.getElementById('totalEnMagasin').textContent = (allStocksRaw.reduce((a, b) => a + b.quantite, 0) - allRecuperationsRaw.reduce((a, b) => a + b.quantite, 0) - allPertesRaw.reduce((a, b) => a + b.quantite, 0));
        document.getElementById('beneficeReel').textContent = gainReelTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
        document.getElementById('beneficeTotalStock').textContent = gainEstTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }

    // FONCTION EXPORT PDF (Méthode html2pdf comme Récupération)
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

    window.showProductDetails = (prodName, currentStock) => {
        const modal = document.getElementById('historyModal');
        const modalTableBody = document.getElementById('modalTableBody');
        document.getElementById('modalTitle').textContent = `Fiche : ${prodName}`;
        document.getElementById('modalStockStatus').innerHTML = `Stock au dépôt : <strong>${currentStock}</strong> unités`;
        document.getElementById('btnLossFromModal').onclick = () => { modal.style.display = "none"; openLossModal(prodName); };

        let html = `<h4 style="margin-top:20px; color:#1877f2;">📦 Historique des Achats</h4><table class="modal-table"><thead><tr><th>Date</th><th>Qté</th><th>Achat</th><th>Action</th></tr></thead><tbody>`;
        const lots = [...allStocksRaw].filter(s => s.produit === prodName).reverse();
        lots.forEach(l => {
            html += `<tr><td>${l.date}</td><td><b>${l.quantite}</b></td><td>${l.prixAchat.toFixed(2)}€</td><td><button class="btn-edit" onclick="editStockLot('${l.id}','${l.produit}',${l.quantite},${l.prixAchat},${l.prixVente})">Modifier</button></td></tr>`;
        });
        html += `</tbody></table><h4 style="margin-top:25px; color:#ef4444;">⚡ Historique des Pertes</h4><table class="modal-table"><thead><tr><th>Date</th><th>Quantité</th></tr></thead><tbody>`;
        const pertesProd = allPertesRaw.filter(p => p.produit === prodName);
        if(pertesProd.length === 0) html += `<tr><td colspan="2" style="text-align:center;">Aucune perte</td></tr>`;
        else pertesProd.forEach(p => { html += `<tr><td>${p.date}</td><td style="color:red;">- ${p.quantite}</td></tr>`; });
        html += `</tbody></table>`;
        modalTableBody.innerHTML = html;
        modal.style.display = "block";
    };

    window.editStockLot = async (id, name, q, pa, pv) => {
        const nQ = prompt(`Quantité :`, q);
        const nPA = prompt(`Prix Achat :`, pa);
        const nPV = prompt(`Prix Vente :`, pv);
        if (nQ && nPA && nPV) {
            await db.collection("stocks").doc(id).update({ quantite: parseInt(nQ), prixAchat: parseFloat(nPA), prixVente: parseFloat(nPV) });
            loadAllData();
        }
    };

    let currentLossProd = "";
    window.openLossModal = (prod) => { currentLossProd = prod; document.getElementById('lossProductName').textContent = prod; document.getElementById('lossModal').style.display = 'block'; };
    window.confirmLoss = async () => {
        const q = parseInt(document.getElementById('lossQuantity').value);
        if(q > 0) {
            await db.collection("pertes").add({ produit: currentLossProd, quantite: q, date: new Date().toISOString().split('T')[0] });
            document.getElementById('lossModal').style.display = 'none';
            loadAllData();
        }
    };

    loadAllData();
});