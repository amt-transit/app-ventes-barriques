document.addEventListener('DOMContentLoaded', () => {
    // Note : La connexion Firebase est en pause.
    // const db = firebase.firestore();
    // const salesCollection = db.collection("ventes");

    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const productSummaryTableBody = document.getElementById('productSummaryTableBody');
    const paymentSummaryTableBody = document.getElementById('paymentSummaryTableBody');
    // ... (sélection des filtres de date)

    let allSales = [];

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
    
    function updateDashboard() {
        // ... (logique de filtrage par date)
        const filteredSales = allSales; 

        // Mise à jour des grands totaux
        const totalVentes = filteredSales.reduce((sum, s) => sum + s.total, 0);
        const totalQuantite = filteredSales.reduce((sum, s) => sum + s.quantite, 0);
        grandTotalVentesEl.textContent = formatEUR(totalVentes);
        grandTotalQuantiteEl.textContent = totalQuantite;

        // Mise à jour du récapitulatif par produit
        const productData = {};
        filteredSales.forEach(s => {
            if (!productData[s.produit]) productData[s.produit] = { quantite: 0, total: 0 };
            productData[s.produit].quantite += s.quantite;
            productData[s.produit].total += s.total;
        });
        productSummaryTableBody.innerHTML = '';
        for (const product in productData) {
            const data = productData[product];
            productSummaryTableBody.innerHTML += `<tr><td>${product}</td><td>${data.quantite}</td><td>${formatEUR(data.total)}</td></tr>`;
        }

        // Mise à jour du récapitulatif par mode de paiement
        const paymentData = {};
        filteredSales.forEach(s => {
            if (!paymentData[s.modeDePaiement]) paymentData[s.modeDePaiement] = { count: 0, total: 0 };
            paymentData[s.modeDePaiement].count++;
            paymentData[s.modeDePaiement].total += s.total;
        });
        paymentSummaryTableBody.innerHTML = '';
        for (const payment in paymentData) {
            const data = paymentData[payment];
            paymentSummaryTableBody.innerHTML += `<tr><td>${payment}</td><td>${data.count}</td><td>${formatEUR(data.total)}</td></tr>`;
        }
    }

    // NOTE : Cette partie sera activée avec Firebase
    // salesCollection.onSnapshot(snapshot => { ... });
    
    // Pour le test en local, on affiche des messages
    productSummaryTableBody.innerHTML = '<tr><td colspan="3">Les statistiques seront disponibles après la connexion à la base de données.</td></tr>';
    paymentSummaryTableBody.innerHTML = '<tr><td colspan="3">Les statistiques seront disponibles après la connexion à la base de données.</td></tr>';
});