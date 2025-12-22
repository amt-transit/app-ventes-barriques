document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }
    
    // Éléments du DOM
    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const productSummaryTableBody = document.getElementById('productSummaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    // Variables globales pour stocker les données
    let allSales = [];
    let allStocks = [];

    // --- LOGIQUE DE MISE À JOUR ---

    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });

        updateGrandTotals(filteredSales);
        generateProductSummary(filteredSales, allStocks); // On passe les stocks ici
        generateAgentSummary(filteredSales);
    }

    function updateGrandTotals(sales) {
        const totalVentes = sales.reduce((sum, s) => sum + s.total, 0);
        const totalQuantite = sales.reduce((sum, s) => sum + s.quantite, 0);
        grandTotalVentesEl.textContent = formatEUR(totalVentes);
        grandTotalQuantiteEl.textContent = totalQuantite;
    }

    // --- RÉCAPITULATIF PRODUITS & BÉNÉFICES ---

    function generateProductSummary(sales, stocks) {
        if (!productSummaryTableBody) return;
        
        productSummaryTableBody.innerHTML = '<tr><td colspan="7">Aucune donnée pour cette période.</td></tr>';
        if (sales.length === 0) return;

        const productData = {};
        let beneficeTotalGlobal = 0;

        // 1. Agrégation des ventes
        sales.forEach(s => {
            if (!productData[s.produit]) {
                productData[s.produit] = { 
                    quantite: 0, total: 0, espece: 0, virement: 0, carteBleue: 0 
                };
            }
            productData[s.produit].quantite += s.quantite;
            productData[s.produit].total += s.total;
            
            switch(s.modeDePaiement) {
                case 'Espèce': productData[s.produit].espece += s.total; break;
                case 'Virement': productData[s.produit].virement += s.total; break;
                case 'Carte Bleue': productData[s.produit].carteBleue += s.total; break;
            }
        });

        const sortedProducts = Object.keys(productData).sort((a, b) => productData[b].total - productData[a].total);
        productSummaryTableBody.innerHTML = '';

        // 2. Calcul des bénéfices avec sécurité (stocks || [])
        const stocksArray = stocks || [];

        sortedProducts.forEach(product => {
            const data = productData[product];
            
            // On cherche le prix d'achat dans la collection stocks
            const stockInfo = stocksArray.find(st => st.produit === product);
            const prixAchatUnitaire = stockInfo ? stockInfo.prixAchat : 0;
            
            const beneficeArticle = data.total - (prixAchatUnitaire * data.quantite);
            beneficeTotalGlobal += beneficeArticle;

            productSummaryTableBody.innerHTML += `
                <tr>
                    <td data-label="Produit">${product}</td>
                    <td data-label="Qté Vendue">${data.quantite}</td>
                    <td data-label="CA">${formatEUR(data.total)}</td>
                    <td data-label="Espèces">${formatEUR(data.espece)}</td>
                    <td data-label="Virement">${formatEUR(data.virement)}</td>
                    <td data-label="Carte Bleue">${formatEUR(data.carteBleue)}</td>
                    <td data-label="Bénéfice" style="font-weight:bold; color: #28a745;">${formatEUR(beneficeArticle)}</td>
                </tr>`;
        });

        // 3. Calcul capacité de rachat
        const prixAchatMoyen = stocksArray.length > 0 
            ? (stocksArray.reduce((sum, s) => sum + s.prixAchat, 0) / stocksArray.length) 
            : 0;

        const qteRachatPossible = prixAchatMoyen > 0 ? Math.floor(beneficeTotalGlobal / prixAchatMoyen) : 0;

        const rachatEl = document.getElementById('rachatCapacite');
        if (rachatEl) {
            rachatEl.innerHTML = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745; margin-top: 20px;">
                    <strong>Bénéfice Global sur la période : ${formatEUR(beneficeTotalGlobal)}</strong><br>
                    <span style="font-size: 0.9em; color: #555;">
                        Estimation : Avec ce bénéfice, vous pouvez racheter environ <strong>${qteRachatPossible}</strong> articles 
                        (basé sur un prix d'achat moyen de ${formatEUR(prixAchatMoyen)}).
                    </span>
                </div>
            `;
        }
    }

    // --- RÉCAPITULATIF VENDEURS ---

    function generateAgentSummary(sales) {
        if (!agentSummaryTableBody) return;
        agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (sales.length === 0) return;

        const agentData = {};
        sales.forEach(s => {
            const agentName = s.vendeur || "Non spécifié";
            if (!agentData[agentName]) {
                agentData[agentName] = { count: 0, total: 0 };
            }
            agentData[agentName].count++;
            agentData[agentName].total += s.total;
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

    // --- ÉCOUTEURS FIREBASE (TEMPS RÉEL) ---

    // Écoute des stocks
    db.collection("stocks").onSnapshot(snapshot => {
        allStocks = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Stocks: ", error));

    // Écoute des ventes
    db.collection("ventes").orderBy("date", "desc").onSnapshot(snapshot => {
        allSales = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Ventes: ", error));

    // --- FILTRES ---

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    // --- UTILITAIRES ---

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
});