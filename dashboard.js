document.addEventListener('DOMContentLoaded', () => {
    // On vérifie que la connexion Firebase est bien active
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué. Vérifiez la configuration dans votre HTML.");
        return;
    }
    
    // --- SÉLECTIONS DU DOM ---
    const salesCollection = db.collection("ventes");
    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const productSummaryTableBody = document.getElementById('productSummaryTableBody');
    const paymentSummaryTableBody = document.getElementById('paymentSummaryTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    let allSales = []; // On stocke toutes les ventes ici

    // --- FONCTION PRINCIPALE DE MISE À JOUR DU DASHBOARD ---
    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // 1. On filtre les ventes en fonction de la plage de dates sélectionnée
        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });

        // 2. On met à jour toutes les sections avec les données filtrées
        updateGrandTotals(filteredSales);
        generateProductSummary(filteredSales);
        generatePaymentSummary(filteredSales);
    }

    // --- FONCTIONS DE GÉNÉRATION DES SECTIONS ---
    function updateGrandTotals(sales) {
        const totalVentes = sales.reduce((sum, s) => sum + s.total, 0);
        const totalQuantite = sales.reduce((sum, s) => sum + s.quantite, 0);
        grandTotalVentesEl.textContent = formatEUR(totalVentes);
        grandTotalQuantiteEl.textContent = totalQuantite;
    }

    function generateProductSummary(sales) {
    productSummaryTableBody.innerHTML = '<tr><td colspan="6">Aucune donnée pour cette période.</td></tr>';
    if (sales.length === 0) return;

    const productData = {};
    sales.forEach(s => {
        if (!productData[s.produit]) {
            productData[s.produit] = { 
                quantite: 0, 
                total: 0,
                espece: 0,
                virement: 0,
                carteBleue: 0
            };
        }
        productData[s.produit].quantite += s.quantite;
        productData[s.produit].total += s.total;
        
        switch(s.modeDePaiement) {
            case 'Espèce':
                productData[s.produit].espece += s.total;
                break;
            case 'Virement':
                productData[s.produit].virement += s.total;
                break;
            case 'Carte Bleue':
                productData[s.produit].carteBleue += s.total;
                break;
        }
    });

    const sortedProducts = Object.keys(productData).sort((a, b) => productData[b].total - productData[a].total);
    productSummaryTableBody.innerHTML = '';
    sortedProducts.forEach(product => {
        const data = productData[product];
        productSummaryTableBody.innerHTML += `
            <tr>
                <td data-label="Produit">${product}</td>
                <td data-label="Qté Vendue">${data.quantite}</td>
                <td data-label="CA">${formatEUR(data.total)}</td>
                <td data-label="Espèces">${formatEUR(data.espece)}</td>
                <td data-label="Virement">${formatEUR(data.virement)}</td>
                <td data-label="Carte Bleue">${formatEUR(data.carteBleue)}</td>
            </tr>`;
    });
}

    function generatePaymentSummary(sales) {
    const paymentData = {
        'Espèce': { count: 0, total: 0 },
        'Virement': { count: 0, total: 0 },
        'Carte Bleue': { count: 0, total: 0 }
    };

    sales.forEach(s => {
        const paymentMethod = s.modeDePaiement;
        if (paymentData[paymentMethod]) {
            paymentData[paymentMethod].count++;
            paymentData[paymentMethod].total += s.total;
        }
    });

    paymentSummaryTableBody.innerHTML = '';
    ['Espèce', 'Virement', 'Carte Bleue'].forEach(payment => {
        const data = paymentData[payment];
        paymentSummaryTableBody.innerHTML += `
            <tr>
                <td data-label="Paiement">${payment}</td>
                <td data-label="Nb Ventes">${data.count}</td>
                <td data-label="Total Encaissé">${formatEUR(data.total)}</td>
            </tr>`;
    });
}

    // --- ÉCOUTEURS D'ÉVÉNEMENTS ---

    // On écoute les changements sur la base de données en temps réel
    salesCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        allSales = snapshot.docs.map(doc => doc.data());
        updateDashboard(); // On met à jour tout le dashboard à chaque changement
    }, error => {
        console.error("Erreur de l'écouteur Firestore: ", error);
        productSummaryTableBody.innerHTML = '<tr><td colspan="3">Erreur de connexion à la base de données.</td></tr>';
        paymentSummaryTableBody.innerHTML = '<tr><td colspan="3">Erreur de connexion à la base de données.</td></tr>';
    });

    // On met à jour le dashboard quand les dates du filtre changent
    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);

    // Bouton pour réinitialiser les filtres
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateDashboard();
    });

    // --- FONCTION UTILITAIRE ---
    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
});