document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }

    const salesCollection = db.collection("ventes");
    const stocksCollection = db.collection("stocks");

    let productDB = {};
    let latestStockPrices = {};
    let allStocksData = []; // Pour le calcul du reste
    let allSalesData = [];  // Pour le calcul du reste

    // Éléments du DOM
    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm');
    const dateInput = document.getElementById('date');
    const produitInput = document.getElementById('produit');
    const prixUnitaireInput = document.getElementById('prixUnitaire');
    const quantiteInput = document.getElementById('quantite');
    const totalInput = document.getElementById('total');
    const modeDePaiementInput = document.getElementById('modeDePaiement');
    const vendeurAMTInput = document.getElementById('vendeurAMT');
    const autreVendeurInput = document.getElementById('autreVendeur');
    const referenceList = document.getElementById('referenceList');
    const stockStatusEl = document.getElementById('stockStatus'); // Assurez-vous que ce DIV existe dans votre HTML

    // --- SYNCHRONISATION DES DONNÉES ---

    try {
        productDB = await fetch('references.json').then(res => res.json());
    } catch (error) {
        console.error("Erreur: Impossible de charger references.json", error);
    }

    // Écoute des prix et des quantités de stock
    stocksCollection.onSnapshot(snapshot => {
        latestStockPrices = {};
        allStocksData = snapshot.docs.map(doc => doc.data());
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.produit && data.prixVente) {
                latestStockPrices[data.produit] = data.prixVente;
            }
        });
        checkStockLevel(produitInput.value); // Re-vérifier si les données changent
    });

    // Écoute des ventes enregistrées en base
    salesCollection.onSnapshot(snapshot => {
        allSalesData = snapshot.docs.map(doc => doc.data());
        checkStockLevel(produitInput.value);
    });

    // --- LOGIQUE DE CONTRÔLE DU STOCK ---

    function checkStockLevel(productName) {
        if (!productName || !stockStatusEl) {
            if (stockStatusEl) {
                stockStatusEl.textContent = "";
                stockStatusEl.className = "stock-status";
            }
            addEntryBtn.disabled = false;
            addEntryBtn.style.opacity = "1";
            addEntryBtn.style.cursor = "pointer";
            return;
        }

        const totalEntre = allStocksData
            .filter(s => s.produit === productName)
            .reduce((sum, s) => sum + s.quantite, 0);

        const totalVenduBase = allSalesData
            .filter(v => v.produit === productName)
            .reduce((sum, v) => sum + v.quantite, 0);

        const totalVenduLocal = dailySales
            .filter(v => v.produit === productName)
            .reduce((sum, v) => sum + v.quantite, 0);

        const reste = totalEntre - (totalVenduBase + totalVenduLocal);

        // Mise à jour visuelle et blocage du bouton
        if (totalEntre === 0) {
            stockStatusEl.textContent = "Produit non répertorié en stock";
            stockStatusEl.className = "stock-status alert-danger";
            bloquerBouton(true);
        } else if (reste <= 0) {
            stockStatusEl.textContent = "RUPTURE DE STOCK !";
            stockStatusEl.className = "stock-status alert-danger";
            bloquerBouton(true);
        } else if (reste < 10) {
            stockStatusEl.textContent = `Stock Critique : ${reste} restant(s)`;
            stockStatusEl.className = "stock-status alert-warning";
            bloquerBouton(false);
        } else {
            stockStatusEl.textContent = `Stock disponible : ${reste}`;
            stockStatusEl.className = "stock-status alert-success";
            bloquerBouton(false);
        }
    }

    function bloquerBouton(status) {
        addEntryBtn.disabled = status;
        if (status) {
            addEntryBtn.style.opacity = "0.5";
            addEntryBtn.style.cursor = "not-allowed";
            addEntryBtn.title = "Action impossible : Stock insuffisant";
        } else {
            addEntryBtn.style.opacity = "1";
            addEntryBtn.style.cursor = "pointer";
            addEntryBtn.title = "";
        }
    }

    // --- GESTION DU FORMULAIRE ---

    dateInput.valueAsDate = new Date();
    let dailySales = JSON.parse(localStorage.getItem('dailySales')) || [];

    function saveDailyToLocalStorage() {
        localStorage.setItem('dailySales', JSON.stringify(dailySales));
    }

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }

    function calculateTotal() {
        const prixUnitaire = parseFloat(prixUnitaireInput.value) || 0;
        const quantite = parseFloat(quantiteInput.value) || 0;
        const total = prixUnitaire * quantite;
        totalInput.value = total.toFixed(2);
    }

    function updateDailySummary() {
        let totalVentes = 0, totalEspeces = 0, totalVirements = 0, totalCartes = 0;
        dailySales.forEach(sale => {
            totalVentes += sale.total;
            switch(sale.modeDePaiement) {
                case 'Espèce': totalEspeces += sale.total; break;
                case 'Virement': totalVirements += sale.total; break;
                case 'Carte Bleue': totalCartes += sale.total; break;
            }
        });
        document.getElementById('dailyTotalVentes').textContent = formatEUR(totalVentes);
        document.getElementById('dailyTotalEspeces').textContent = formatEUR(totalEspeces);
        document.getElementById('dailyTotalVirements').textContent = formatEUR(totalVirements);
        document.getElementById('dailyTotalCartes').textContent = formatEUR(totalCartes);
        document.getElementById('dailyCount').textContent = dailySales.length;
    }

    produitInput.addEventListener('input', () => {
        const productValue = produitInput.value;
        
        // 1. Gestion du prix et verrouillage
        if (latestStockPrices[productValue]) {
            prixUnitaireInput.value = latestStockPrices[productValue];
            prixUnitaireInput.readOnly = true; 
            prixUnitaireInput.style.backgroundColor = "#e9ecef";
            prixUnitaireInput.style.cursor = "not-allowed";
        } else if (productDB[productValue]) {
            prixUnitaireInput.value = productDB[productValue];
            prixUnitaireInput.readOnly = false;
            prixUnitaireInput.style.backgroundColor = "#ffffff";
            prixUnitaireInput.style.cursor = "text";
        } else {
            prixUnitaireInput.value = '';
            prixUnitaireInput.readOnly = false;
            prixUnitaireInput.style.backgroundColor = "#ffffff";
        }

        // 2. Vérification du stock
        checkStockLevel(productValue);
        calculateTotal();
    });

    [prixUnitaireInput, quantiteInput].forEach(input => {
        input.addEventListener('input', () => {
            calculateTotal();
            checkStockLevel(produitInput.value); // Re-vérifier si la quantité saisie change
        });
    });

    addEntryBtn.addEventListener('click', () => {
        const user = firebase.auth().currentUser;
        if (!user) return alert("Veuillez vous reconnecter.");

        const vendeur = autreVendeurInput.value.trim() || vendeurAMTInput.value;

        const newSale = {
            date: dateInput.value,
            produit: produitInput.value,
            prixUnitaire: parseFloat(prixUnitaireInput.value) || 0,
            quantite: parseFloat(quantiteInput.value) || 0,
            total: parseFloat(totalInput.value) || 0,
            modeDePaiement: modeDePaiementInput.value,
            vendeur: vendeur,
            enregistrePar: user.email
        };

        if (!newSale.date || !newSale.produit || newSale.quantite <= 0 || !newSale.modeDePaiement || !newSale.vendeur) {
            return alert("Veuillez remplir tous les champs.");
        }
        
        dailySales.push(newSale);
        saveDailyToLocalStorage();
        renderDailyTable();
        
        // Reset
        produitInput.value = '';
        prixUnitaireInput.value = '';
        quantiteInput.value = '1';
        totalInput.value = '';
        modeDePaiementInput.value = '';
        vendeurAMTInput.value = '';
        autreVendeurInput.value = '';
        checkStockLevel(""); // Reset de l'affichage stock
        produitInput.focus();
    });

    function renderDailyTable() {
        dailyTableBody.innerHTML = '';
        dailySales.forEach((data, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${data.date}</td>
                <td>${data.produit}</td>
                <td>${data.quantite}</td>
                <td>${formatEUR(data.total)}</td>
                <td>${data.modeDePaiement}</td>
                <td>${data.vendeur}</td>
                <td><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });
        updateDailySummary();
    }

    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailySales.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
            checkStockLevel(produitInput.value); // Mise à jour après suppression
        }
    });

    saveDayBtn.addEventListener('click', () => {
        if (dailySales.length === 0) return alert("Aucune vente.");
        const batch = db.batch();
        dailySales.forEach(sale => {
            const docRef = salesCollection.doc();
            batch.set(docRef, sale);
        });
        batch.commit().then(() => {
            alert("Journée enregistrée !");
            dailySales = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        });
    });

    function populateDatalist() {
        for (const product in productDB) {
            const option = document.createElement('option');
            option.value = product;
            referenceList.appendChild(option);
        }
    }

    renderDailyTable();
    populateDatalist();
});