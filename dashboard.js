document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }
    
    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const productSummaryTableBody = document.getElementById('productSummaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    let allSales = [];
    let allStocks = [];
    let allRecuperations = []; // Stocke les données de la page QR Code
    let allPayments = []; // Stocke les données de la page Validation
    let salesChart = null; 
    let agentChart = null; 

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
        generateAgentPackageStock(filteredSales, allRecuperations);
        generateFinancialBalance(filteredSales, allPayments);
        
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

    // --- MODIFICATION DE LA FONCTION GENERATEPRODUCTSUMMARY ---
    function generateProductSummary(sales, stocks) {
        if (!productSummaryTableBody) return;
        
        if (sales.length === 0) {
            productSummaryTableBody.innerHTML = '<tr><td colspan="4">Aucune donnée trouvée.</td></tr>';
            return;
        }

        const productData = {};
        let beneficeTotalGlobal = 0;

        sales.forEach(s => {
            if (!productData[s.produit]) {
                productData[s.produit] = { quantite: 0, total: 0 };
            }
            productData[s.produit].quantite += s.quantite;
            productData[s.produit].total += s.total;
        });

        // Appel du graphique avec les nouvelles options de légende
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

            // CORRECTION : On génère exactement 4 colonnes pour correspondre au HTML
            productSummaryTableBody.innerHTML += `
                <tr>
                    <td>${product}</td>
                    <td style="text-align:center;">${data.quantite}</td>
                    <td>${formatEUR(data.total)}</td>
                    <td style="font-weight:bold; color: #28a745;">${formatEUR(beneficeArticle)}</td>
                </tr>`;
        });

        const beneficeDisplay = document.getElementById('beneficeTotalDisplay');
        if (beneficeDisplay) {
            beneficeDisplay.innerHTML = `Bénéfice Global : <span style="color: #28a745;">${formatEUR(beneficeTotalGlobal)}</span>`;
        }

        updateReinvestmentTable(beneficeTotalGlobal, stocksArray);
    }

    // --- CONFIGURATION DE LA LÉGENDE SUR UNE LIGNE ---
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
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        display: true,
                        labels: {
                            boxWidth: 10,    // Réduit la taille des carrés de couleur
                            padding: 8,     // Réduit l'espace entre les éléments
                            usePointStyle: true // Utilise des points au lieu de carrés pour gagner de l'espace
                        }
                    } 
                }
            }
        });
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

        updateAgentChart(agentData);

        Object.keys(agentData).sort((a,b) => agentData[b].total - agentData[a].total).forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td style="text-align:center;">${data.count}</td>
                    <td>${formatEUR(data.total)}</td>
                </tr>`;
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
    function generateAgentPackageStock(sales, recuperations) {
        const tableBody = document.getElementById('agentPackageStockTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const tracking = {};

        // 1. On compte tout ce que les vendeurs ont RÉCUPÉRÉ (via QR Code)
        recuperations.forEach(r => {
            const name = r.vendeur;
            if (!tracking[name]) tracking[name] = { recup: 0, vendu: 0 };
            tracking[name].recup += (r.quantite || 0);
        });

        // 2. On soustrait tout ce qu'ils ont VENDU (via page Saisie)
        sales.forEach(s => {
            const name = s.vendeur;
            if (!tracking[name]) tracking[name] = { recup: 0, vendu: 0 };
            tracking[name].vendu += (s.quantite || 0);
        });

        // 3. Affichage du tableau
        const agents = Object.keys(tracking).sort();
        
        if (agents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Aucun mouvement de colis enregistré.</td></tr>';
            return;
        }

        agents.forEach(agent => {
            const data = tracking[agent];
            const reste = data.recup - data.vendu;
            
            // On n'affiche que si le vendeur a eu un mouvement
            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td style="text-align:center;">${data.recup}</td>
                    <td style="text-align:center;">${data.vendu}</td>
                    <td style="text-align:center; font-weight:bold; color: ${reste > 0 ? '#dc3545' : '#28a745'};">
                        ${reste} colis
                    </td>
                </tr>
            `;
        });
    }
    function generateFinancialBalance(sales, payments, recuperations, stocks) {
        const tableBody = document.getElementById('financeBalanceTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const finance = {};

        // 1. On calcule le CA TOTAL déclaré par chaque vendeur (Ventes enregistrées)
        sales.forEach(s => {
            const name = s.vendeur || "Inconnu";
            if (!finance[name]) finance[name] = { declare: 0, reçu: 0 };
            finance[name].declare += (s.total || 0);
        });

        // 2. On calcule l'ARGENT RÉELLEMENT REÇU et validé par l'admin
        payments.forEach(p => {
            const name = p.vendeur;
            if (!finance[name]) finance[name] = { declare: 0, reçu: 0 };
            finance[name].reçu += (p.montantRecu || 0);
        });

        const agents = Object.keys(finance).sort();
        
        if (agents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Aucune donnée financière.</td></tr>';
            return;
        }

        agents.forEach(agent => {
            const f = finance[agent];
            const resteAPayer = f.declare - f.reçu;

            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td>${formatEUR(f.declare)}</td>
                    <td>${formatEUR(f.reçu)}</td>
                    <td style="font-weight:bold; color: ${resteAPayer > 0 ? '#dc3545' : '#28a745'};">
                        ${formatEUR(resteAPayer)}
                    </td>
                </tr>
            `;
        });
    }

    db.collection("stocks").onSnapshot(snap => {
        allStocks = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    db.collection("ventes").orderBy("date", "desc").onSnapshot(snap => {
        allSales = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });
    db.collection("recuperations").onSnapshot(snap => {
        allRecuperations = snap.docs.map(doc => doc.data());
        updateDashboard(); // Relance les calculs
    });
    db.collection("encaissements_vendeurs").onSnapshot(snap => {
        allPayments = snap.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Paiements: ", error));

    const printBtn = document.getElementById('printReinvestmentBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => { window.print(); });
    }

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
});