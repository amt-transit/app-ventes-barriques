document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }
    
    const salesCollection = db.collection("ventes");
    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const productSummaryTableBody = document.getElementById('productSummaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    let allSales = [];

    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });
        updateGrandTotals(filteredSales);
        generateProductSummary(filteredSales);
        generateAgentSummary(filteredSales);
    }

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

    function generateAgentSummary(sales) {
        agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (sales.length === 0) return;

        const agentData = {};
        sales.forEach(s => {
            const agentEmail = s.vendeurEmail || "Non spécifié";
            if (!agentData[agentEmail]) {
                agentData[agentEmail] = { count: 0, total: 0 };
            }
            agentData[agentEmail].count++;
            agentData[agentEmail].total += s.total;
        });

        const sortedAgents = Object.keys(agentData).sort((a, b) => agentData[b].total - agentData[a].total);
        agentSummaryTableBody.innerHTML = '';
        sortedAgents.forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `
                <tr>
                    <td data-label="Vendeur">${agent}</td>
                    <td data-label="Nb Ventes">${data.count}</td>
                    <td data-label="Chiffre d'Affaires">${formatEUR(data.total)}</td>
                </tr>`;
        });
    }

    salesCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        allSales = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Firestore: ", error));

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
});

