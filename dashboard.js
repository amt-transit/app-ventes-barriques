document.addEventListener('DOMContentLoaded', () => {
    // Éléments du DOM
    const grandTotalVentesEl = document.getElementById('grandTotalVentes');
    const grandTotalQuantiteEl = document.getElementById('grandTotalQuantite');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // Variables globales
    let allSales = [];
    let allStocks = [];
    let allRecuperations = [];
    let allPayments = [];
    let salesChart = null;
    let agentChart = null;

    // --- MISE À JOUR PRINCIPALE ---
    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Filtre pour les ventes (Analyse Produit/Vendeur)
        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });

        // Calculs des sections
        updateGrandTotals(filteredSales);
        generateProductSummary(filteredSales, allStocks);
        generateAgentSummary(filteredSales);
        
        // Suivi Physique (Récupéré vs Vendu)
        generateAgentPackageStock(filteredSales, allRecuperations);
        
        // NOUVELLE BALANCE FINANCIÈRE (Basée sur Retraits vs Paiements)
        generateFinancialBalance(allRecuperations, allPayments, allStocks);
        
        // Date du rapport
        const dateDisplay = document.getElementById('reportDate');
        if (dateDisplay) {
            dateDisplay.textContent = "Établi le : " + new Date().toLocaleDateString('fr-FR');
        }
    }

    // --- LOGIQUE FINANCIÈRE (DETTE SUR RÉCUPÉRATION) ---
    function generateFinancialBalance(recuperations, payments, stocks) {
        const tableBody = document.getElementById('financeBalanceTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        // 1. Créer un dictionnaire des prix de vente par produit
        const prixMap = {};
        stocks.forEach(s => {
            prixMap[s.produit] = s.prixVenteRef || 0;
        });

        const finance = {};

        // 2. Calculer la dette AUTOMATIQUE (Quantité récupérée * Prix de vente)
        recuperations.forEach(r => {
            const name = r.vendeur || "Inconnu";
            if (!finance[name]) finance[name] = { detteTheorique: 0, recu: 0 };
            const prixUnitaire = prixMap[r.produit] || 0;
            finance[name].detteTheorique += (r.quantite * prixUnitaire);
        });

        // 3. Calculer l'argent réellement reçu (Validations)
        payments.forEach(p => {
            const name = p.vendeur;
            if (!finance[name]) finance[name] = { detteTheorique: 0, recu: 0 };
            finance[name].recu += (p.montantRecu || 0);
        });

        const agents = Object.keys(finance).sort();
        if (agents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Aucun mouvement financier.</td></tr>';
            return;
        }

        agents.forEach(agent => {
            const f = finance[agent];
            const resteADevoir = f.detteTheorique - f.recu;

            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td>${formatEUR(f.detteTheorique)}</td>
                    <td>${formatEUR(f.recu)}</td>
                    <td style="font-weight:bold; color: ${resteADevoir > 0 ? '#dc3545' : '#28a745'};">
                        ${formatEUR(resteADevoir)}
                    </td>
                </tr>`;
        });
    }

    // --- SUIVI PHYSIQUE (COLIS) ---
    function generateAgentPackageStock(sales, recuperations) {
        const tableBody = document.getElementById('agentPackageStockTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const tracking = {};
        recuperations.forEach(r => {
            const name = r.vendeur;
            if (!tracking[name]) tracking[name] = { recup: 0, vendu: 0 };
            tracking[name].recup += (r.quantite || 0);
        });

        sales.forEach(s => {
            const name = s.vendeur;
            if (!tracking[name]) tracking[name] = { recup: 0, vendu: 0 };
            tracking[name].vendu += (s.quantite || 0);
        });

        Object.keys(tracking).sort().forEach(agent => {
            const data = tracking[agent];
            const reste = data.recup - data.vendu;
            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td style="text-align:center;">${data.recup}</td>
                    <td style="text-align:center;">${data.vendu}</td>
                    <td style="text-align:center; font-weight:bold; color: ${reste > 0 ? '#dc3545' : '#28a745'};">
                        ${reste} colis
                    </td>
                </tr>`;
        });
    }

    // --- ANALYSE PRODUITS ET GRAPHIQUES ---
    function generateProductSummary(sales, stocks) {
        if (!productSummaryTableBody) return;
        const productData = {};
        let beneficeTotalGlobal = 0;

        sales.forEach(s => {
            if (!productData[s.produit]) productData[s.produit] = { quantite: 0, total: 0 };
            productData[s.produit].quantite += s.quantite;
            productData[s.produit].total += s.total;
        });

        updateSalesChart(productData);

        const tbody = document.getElementById('productSummaryTableBody');
        tbody.innerHTML = '';
        Object.keys(productData).forEach(product => {
            const data = productData[product];
            const stockInfo = stocks.find(st => st.produit === product);
            const prixAchat = stockInfo ? stockInfo.prixAchat : 0;
            const benefice = data.total - (prixAchat * data.quantite);
            beneficeTotalGlobal += benefice;

            tbody.innerHTML += `
                <tr>
                    <td>${product}</td>
                    <td style="text-align:center;">${data.quantite}</td>
                    <td>${formatEUR(data.total)}</td>
                    <td style="color:#28a745; font-weight:bold;">${formatEUR(benefice)}</td>
                </tr>`;
        });
        document.getElementById('beneficeTotalDisplay').innerHTML = `Bénéfice Global Estimé : <span style="color:#28a745;">${formatEUR(beneficeTotalGlobal)}</span>`;
    }

    // --- ÉCOUTEURS FIREBASE (TEMPS RÉEL) ---
    db.collection("stocks").onSnapshot(snap => {
        allStocks = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    db.collection("ventes").onSnapshot(snap => {
        allSales = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    db.collection("recuperations").onSnapshot(snap => {
        allRecuperations = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    db.collection("encaissements_vendeurs").onSnapshot(snap => {
        allPayments = snap.docs.map(doc => doc.data());
        updateDashboard();
    });

    // --- FONCTIONS UTILITAIRES ---
    function formatEUR(n) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
    }

    function updateGrandTotals(sales) {
        const totalCA = sales.reduce((sum, s) => sum + s.total, 0);
        const totalQty = sales.reduce((sum, s) => sum + s.quantite, 0);
        grandTotalVentesEl.textContent = formatEUR(totalCA);
        grandTotalQuantiteEl.textContent = totalQty;
    }

    function updateSalesChart(productData) {
        const ctx = document.getElementById('salesPieChart');
        if (!ctx) return;
        if (salesChart) salesChart.destroy();
        salesChart = new Chart(ctx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(productData),
                datasets: [{
                    data: Object.values(productData).map(d => d.total),
                    backgroundColor: ['#1877f2', '#28a745', '#ffc107', '#dc3545', '#6610f2']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } } } }
        });
    }

    function generateAgentSummary(sales) {
        const agentData = {};
        sales.forEach(s => {
            const name = s.vendeur || "Inconnu";
            if (!agentData[name]) agentData[name] = { count: 0, total: 0 };
            agentData[name].count++;
            agentData[name].total += s.total;
        });
        updateAgentChart(agentData);
        const tbody = document.getElementById('agentSummaryTableBody');
        tbody.innerHTML = '';
        Object.keys(agentData).sort((a,b) => agentData[b].total - agentData[a].total).forEach(agent => {
            tbody.innerHTML += `<tr><td>${agent}</td><td style="text-align:center;">${agentData[agent].count}</td><td>${formatEUR(agentData[agent].total)}</td></tr>`;
        });
    }

    function updateAgentChart(agentData) {
        const ctx = document.getElementById('agentBarChart');
        if (!ctx) return;
        if (agentChart) agentChart.destroy();
        agentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(agentData),
                datasets: [{ label: 'CA', data: Object.values(agentData).map(d => d.total), backgroundColor: '#1877f2' }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
});