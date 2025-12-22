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

    // Variables globales
    let allSales = [];
    let allStocks = [];
    let salesChart = null; 
    let agentChart = null; 

    // --- LOGIQUE DE MISE À JOUR PRINCIPALE ---

    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });

        updateGrandTotals(filteredSales);
        generateProductSummary(filteredSales, allStocks);
        generateAgentSummary(filteredSales);
        
        // Mise à jour de la date du rapport
        const dateDisplay = document.getElementById('reportDate');
        if (dateDisplay) {
            const today = new Date();
            dateDisplay.textContent = "Établi le : " + today.toLocaleDateString('fr-FR');
        }
    }

    function updateGrandTotals(sales) {
        const totalVentes = sales.reduce((sum, s) => sum + s.total, 0);
        const totalQuantite = sales.reduce((sum, s) => sum + s.quantite, 0);
        grandTotalVentesEl.textContent = formatEUR(totalVentes);
        grandTotalQuantiteEl.textContent = totalQuantite;
    }

    // --- PRODUITS ET BÉNÉFICES ---

    function generateProductSummary(sales, stocks) {
        if (!productSummaryTableBody) return;
        
        if (sales.length === 0) {
            productSummaryTableBody.innerHTML = '<tr><td colspan="7">Aucune donnée trouvée.</td></tr>';
            return;
        }

        const productData = {};
        let beneficeTotalGlobal = 0;

        sales.forEach(s => {
            if (!productData[s.produit]) {
                productData[s.produit] = { quantite: 0, total: 0, espece: 0, virement: 0, carteBleue: 0 };
            }
            productData[s.produit].quantite += s.quantite;
            productData[s.produit].total += s.total;
            
            switch(s.modeDePaiement) {
                case 'Espèce': productData[s.produit].espece += s.total; break;
                case 'Virement': productData[s.produit].virement += s.total; break;
                case 'Carte Bleue': productData[s.produit].carteBleue += s.total; break;
            }
        });

        // MISE À JOUR DU GRAPHIQUE PRODUITS
        updateSalesChart(productData);

        const stocksArray = stocks || [];
        const sortedProducts = Object.keys(productData).sort((a, b) => productData[b].total - productData[a].total);
        productSummaryTableBody.innerHTML = '';

        sortedProducts.forEach(product => {
            const data = productData[product];
            const stockInfo = stocksArray.find(st => st.produit === product);
            const prixAchatUnitaire = stockInfo ? stockInfo.prixAchat : 0;
            const beneficeArticle = data.total - (prixAchatUnitaire * data.quantite);
            beneficeTotalGlobal += beneficeArticle;

            productSummaryTableBody.innerHTML += `
                <tr>
                    <td data-label="Produit">${product}</td>
                    <td data-label="Qté">${data.quantite}</td>
                    <td data-label="CA">${formatEUR(data.total)}</td>
                    <td data-label="Espèces">${formatEUR(data.espece)}</td>
                    <td data-label="Virement">${formatEUR(data.virement)}</td>
                    <td data-label="Carte">${formatEUR(data.carteBleue)}</td>
                    <td data-label="Bénéfice" style="font-weight:bold; color: #28a745;">${formatEUR(beneficeArticle)}</td>
                </tr>`;
        });

        // BÉNÉFICE ET RÉINVESTISSEMENT
        const beneficeDisplay = document.getElementById('beneficeTotalDisplay');
        if (beneficeDisplay) {
            beneficeDisplay.innerHTML = `Bénéfice Global : <span style="color: #28a745;">${formatEUR(beneficeTotalGlobal)}</span>`;
        }

        updateReinvestmentTable(beneficeTotalGlobal, stocksArray);
    }

    function updateReinvestmentTable(totalBenefice, stocks) {
        const tableBody = document.getElementById('reinvestmentTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (totalBenefice <= 0) {
            tableBody.innerHTML = '<tr><td colspan="3">Aucun bénéfice pour le réinvestissement.</td></tr>';
            return;
        }

        stocks.forEach(st => {
            if (st.prixAchat > 0) {
                const qtePossible = Math.floor(totalBenefice / st.prixAchat);
                tableBody.innerHTML += `
                    <tr>
                        <td>${st.produit}</td>
                        <td>${formatEUR(st.prixAchat)}</td>
                        <td style="font-weight:bold; color: #1877f2;">${qtePossible} unité(s)</td>
                    </tr>`;
            }
        });
    }

    // --- VENDEURS ---

    function generateAgentSummary(sales) {
        if (!agentSummaryTableBody) return;
        agentSummaryTableBody.innerHTML = '';
        
        const agentData = {};
        sales.forEach(s => {
            const agentName = s.vendeur || "Non spécifié";
            if (!agentData[agentName]) agentData[agentName] = { count: 0, total: 0 };
            agentData[agentName].count++;
            agentData[agentName].total += s.total;
        });

        // MISE À JOUR DU GRAPHIQUE VENDEURS
        updateAgentChart(agentData);

        Object.keys(agentData).sort((a,b) => agentData[b].total - agentData[a].total).forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `
                <tr>
                    <td data-label="Vendeur">${agent}</td>
                    <td data-label="Ventes">${data.count}</td>
                    <td data-label="CA">${formatEUR(data.total)}</td>
                </tr>`;
        });
    }

    // --- GRAPHICS (CHART.JS) ---

    function updateSalesChart(productData) {
        const ctx = document.getElementById('salesPieChart');
        if (!ctx) return;

        const labels = Object.keys(productData);
        const dataValues = labels.map(l => productData[l].total);

        if (salesChart) salesChart.destroy();

        salesChart = new Chart(ctx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: ['#1877f2', '#28a745', '#ffc107', '#dc3545', '#6610f2', '#fd7e14']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    function updateAgentChart(agentData) {
        const ctx = document.getElementById('agentBarChart');
        if (!ctx) return;

        const labels = Object.keys(agentData);
        const dataValues = labels.map(l => agentData[l].total);

        if (agentChart) agentChart.destroy();

        agentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'CA par Vendeur',
                    data: dataValues,
                    backgroundColor: '#1877f2'
                }]
            },
            options: { 
                responsive: true, 
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } } 
            }
        });
    }

    // --- FIREBASE LISTENERS ---

    db.collection("stocks").onSnapshot(snap => {
        allStocks = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    db.collection("ventes").orderBy("date", "desc").onSnapshot(snap => {
        allSales = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    // --- EVENTS ---

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    const printBtn = document.getElementById('printReinvestmentBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => { window.print(); });
    }

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
});