document.addEventListener('DOMContentLoaded', async () => {
    const stockCollection = db.collection("stocks");
    const salesCollection = db.collection("ventes");
    
    const stockTableBody = document.getElementById('stockTableBody');
    const addStockBtn = document.getElementById('addStockBtn');
    const stockSearch = document.getElementById('stockSearch');

    // Charger les références pour la liste déroulante
    const productDB = await fetch('references.json').then(res => res.json());
    const refList = document.getElementById('referenceList');
    for (const p in productDB) {
        let opt = document.createElement('option');
        opt.value = p; refList.appendChild(opt);
    }

    // Ajouter du stock
    addStockBtn.addEventListener('click', async () => {
        const data = {
            date: document.getElementById('stockDate').value,
            produit: document.getElementById('stockProduit').value,
            prixAchat: parseFloat(document.getElementById('prixAchat').value) || 0,
            prixVente: parseFloat(document.getElementById('prixVenteRef').value) || 0,
            quantite: parseInt(document.getElementById('quantiteInitiale').value) || 0
        };

        if(data.produit && data.quantite > 0) {
            await stockCollection.add(data);
            alert("Stock mis à jour !");
            location.reload();
        }
    });

    // Écouter les changements (Stocks + Ventes)
    function loadStockData() {
        Promise.all([
            stockCollection.get(),
            salesCollection.get()
        ]).then(([stockSnap, salesSnap]) => {
            const stocks = stockSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            const sales = salesSnap.docs.map(doc => doc.data());
            renderStock(stocks, sales);
        });
    }

    function renderStock(stocks, sales) {
        stockTableBody.innerHTML = '';
        let vAchat = 0, vVente = 0, vVol = 0, vBenefice = 0; // Ajout de vBenefice
        const filter = stockSearch.value.toLowerCase();

        stocks.filter(s => s.produit.toLowerCase().includes(filter)).forEach(s => {
            const totalVendu = sales.filter(sale => sale.produit === s.produit)
                                .reduce((sum, sale) => sum + sale.quantite, 0);
            const reste = s.quantite - totalVendu;

            // Calcul du bénéfice estimé sur la quantité totale entrée en stock
            // Formule : (Prix Vente Unit. - Prix Achat Unit.) * Quantité Restante
            const beneficeEst = (s.prixVente - s.prixAchat) * reste;

            vAchat += (s.prixAchat * s.quantite);
            vVente += (s.prixVente * s.quantite);
            vVol += s.quantite;
            vBenefice += beneficeEst; // Cumul pour le total

            const row = `<tr>
                <td>${s.date}</td>
                <td>${s.produit}</td>
                <td>${s.prixAchat.toFixed(2)}€</td>
                <td>${s.prixVente.toFixed(2)}€</td>
                <td>${s.quantite}</td>
                <td>${totalVendu}</td>
                <td>${reste}</td>
                <td style="font-weight:bold; color: #28a745;">${beneficeEst.toFixed(2)}€</td>
                <td><button class="deleteBtn" onclick="deleteStock('${s.id}')">X</button></td>
            </tr>`;
            stockTableBody.innerHTML += row;
        });

        // Mise à jour des cartes de résumé
        document.getElementById('valeurAchatTotal').textContent = vAchat.toFixed(2) + " €";
        document.getElementById('valeurVenteTotal').textContent = vVente.toFixed(2) + " €";
        document.getElementById('volumeTotal').textContent = vVol;
        document.getElementById('beneficeTotalStock').textContent = vBenefice.toFixed(2) + " €";
    }

    stockSearch.addEventListener('input', loadStockData);
    window.deleteStock = (id) => { if(confirm("Supprimer ?")) stockCollection.doc(id).delete().then(() => loadStockData()); };
    loadStockData();
});