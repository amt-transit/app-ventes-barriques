document.addEventListener('DOMContentLoaded', async () => {
    const stockCollection = db.collection("stocks");
    const salesCollection = db.collection("ventes");
    
    const stockTableBody = document.getElementById('stockTableBody');
    const addStockBtn = document.getElementById('addStockBtn');
    const stockSearch = document.getElementById('stockSearch');
    
    // Modal elements
    const modal = document.getElementById('historyModal');
    const modalTableBody = document.getElementById('modalTableBody');
    const closeModal = document.querySelector('.close-modal');

    let allStocksRaw = []; 
    let allSalesRaw = [];

    // Fermeture de la modal
    closeModal.onclick = () => modal.style.display = "none";
    window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };

    // Charger les références pour la liste déroulante (Recherche intelligente)
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
            alert("Nouvel arrivage enregistré !");
            loadStockData();
            // Reset form
            document.getElementById('stockProduit').value = '';
            document.getElementById('quantiteInitiale').value = '';
        }
    });

    function loadStockData() {
        Promise.all([
            stockCollection.get(),
            salesCollection.get()
        ]).then(([stockSnap, salesSnap]) => {
            allStocksRaw = stockSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            allSalesRaw = salesSnap.docs.map(doc => doc.data());
            renderStock();
        });
    }

    function renderStock() {
        stockTableBody.innerHTML = '';
        let vAchat = 0, vVente = 0, vVol = 0, vBenefice = 0;
        const filter = stockSearch.value.toLowerCase();

        // Groupement par produit pour le tableau principal
        const grouped = allStocksRaw.reduce((acc, curr) => {
            if (!acc[curr.produit]) {
                acc[curr.produit] = { 
                    totalEntré: 0, 
                    derniereDate: curr.date, 
                    prixVente: curr.prixVente,
                    lots: [] 
                };
            }
            acc[curr.produit].totalEntré += curr.quantite;
            acc[curr.produit].lots.push(curr);
            return acc;
        }, {});

        Object.keys(grouped).filter(p => p.toLowerCase().includes(filter)).forEach(p => {
            const item = grouped[p];
            const totalVendu = allSalesRaw.filter(sale => sale.produit === p)
                                         .reduce((sum, sale) => sum + sale.quantite, 0);
            const reste = item.totalEntré - totalVendu;

            // Calcul bénéfice estimé sur le reste (basé sur le dernier prix d'achat connu pour simplifier ou moyenne)
            const dernierPrixAchat = item.lots[item.lots.length - 1].prixAchat;
            const beneficeEst = (item.prixVente - dernierPrixAchat) * reste;

            vVol += item.totalEntré;
            vBenefice += beneficeEst;

            const row = `<tr>
                <td>${item.derniereDate}</td>
                <td class="clickable-product" onclick="showHistory('${p}')">${p} ℹ️</td>
                <td>-</td>
                <td>${item.prixVente.toFixed(2)}€</td>
                <td>${item.totalEntré}</td>
                <td>${totalVendu}</td>
                <td class="${reste <= 5 ? 'low-stock' : ''}">${reste}</td>
                <td style="font-weight:bold; color: #28a745;">${beneficeEst.toFixed(2)}€</td>
                <td><button onclick="showHistory('${p}')">Détails</button></td>
            </tr>`;
            stockTableBody.innerHTML += row;
        });

        document.getElementById('volumeTotal').textContent = vVol;
        document.getElementById('beneficeTotalStock').textContent = vBenefice.toFixed(2) + " €";
    }

    // Afficher l'historique dans la modal
    window.showHistory = (productName) => {
        const lots = allStocksRaw.filter(s => s.produit === productName);
        document.getElementById('modalTitle').textContent = `Historique des arrivages : ${productName}`;
        modalTableBody.innerHTML = '';
        
        lots.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(l => {
            modalTableBody.innerHTML += `
                <tr>
                    <td>${l.date}</td>
                    <td>${l.quantite}</td>
                    <td>${l.prixAchat.toFixed(2)}€</td>
                    <td>${l.prixVente.toFixed(2)}€</td>
                    <td>
                        <button class="editBtn" onclick="editStockEntry('${l.id}')">Modifier</button>
                        <button class="deleteBtn" onclick="deleteStock('${l.id}')">X</button>
                    </td>
                </tr>
            `;
        });
        modal.style.display = "block";
    };

    // Modifier un lot spécifique
    window.editStockEntry = async (id) => {
        const doc = allStocksRaw.find(s => s.id === id);
        const nQte = prompt("Nouvelle quantité :", doc.quantite);
        const nPA = prompt("Nouveau prix d'achat :", doc.prixAchat);
        const nPV = prompt("Nouveau prix de vente :", doc.prixVente);

        if (nQte !== null && nPA !== null && nPV !== null) {
            await stockCollection.doc(id).update({
                quantite: parseInt(nQte),
                prixAchat: parseFloat(nPA),
                prixVente: parseFloat(nPV)
            });
            modal.style.display = "none";
            loadStockData();
        }
    };

    window.deleteStock = (id) => { 
        if(confirm("Supprimer ce lot d'arrivage ?")) {
            stockCollection.doc(id).delete().then(() => {
                modal.style.display = "none";
                loadStockData();
            });
        }
    };

    stockSearch.addEventListener('input', renderStock);
    loadStockData();
});