document.addEventListener('DOMContentLoaded', () => {

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    let allSales = [], allStocks = [], allPayments = [], allRecuperations = [], allLosses = [], allReturns = [];
    let salesChart = null, agentChart = null;

    function setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDateInput.value = firstDay.toISOString().split('T')[0];
        endDateInput.value = lastDay.toISOString().split('T')[0];
    }
    setDefaultDates();

    function updateDashboard() {
        const start = startDateInput.value;
        const end = endDateInput.value;

        // Filtrage strict par date
        const filteredSales = allSales.filter(s => s.date && s.date >= start && s.date <= end);
        const filteredPayments = allPayments.filter(p => p.date && p.date >= start && p.date <= end);
        const filteredLosses = allLosses.filter(l => l.date && l.date >= start && l.date <= end);
        const filteredRecups = allRecuperations.filter(r => r.date && r.date >= start && r.date <= end);

        // Debug Console pour vérifier l'arrivée des données
        console.log("Ventes détectées dans Firestore:", allSales.length);
        console.log("Ventes après filtre date:", filteredSales.length);

        calculateKPIs(filteredSales, filteredPayments, filteredLosses, filteredRecups);
        renderProductAnalysis(filteredSales);
        renderSellerAnalysis(filteredSales, filteredPayments);
        renderReinvestment(filteredSales);
        updateDailyFlashStats(allSales);

        if (document.getElementById('reportDate')) {
            document.getElementById('reportDate').textContent = "Mis à jour le : " + new Date().toLocaleDateString('fr-FR');
        }
    }

    function calculateKPIs(sales, payments, losses, recups) {
        // 1. CALCUL DE L'INVESTISSEMENT TOTAL (Valeur d'achat de tout le dépôt)
        // On utilise allStocks qui contient tous les arrivages enregistrés
        const valeurTotaleInvestie = allStocks.reduce((sum, item) => {
            return sum + ( (parseFloat(item.quantite) || 0) * (parseFloat(item.prixAchat) || 0) );
        }, 0);

        // 2. CHIFFRE D'AFFAIRES (CA)
        const caAgence = sales.filter(s => s.payeAbidjan !== true).reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const caAbidjan = sales.filter(s => s.payeAbidjan === true).reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const totalCA = caAgence + caAbidjan;

        // 3. COÛT D'ACHAT DU VENDU (Investissement sur les ventes uniquement)
        let totalCoutAchatVendu = 0;
        sales.forEach(s => {
            const stockInfo = allStocks.find(st => st.produit.toUpperCase() === s.produit.toUpperCase());
            const unitPA = stockInfo ? (parseFloat(stockInfo.prixAchat) || 0) : 0;
            totalCoutAchatVendu += (parseInt(s.quantite) || 0) * unitPA;
        });

        // 4. AUTRES CALCULS (Caisse, Dette, Pertes)
        const totalCaisse = payments.reduce((sum, p) => sum + (parseFloat(p.montantRecu) || 0), 0);
        const totalRemises = payments.reduce((sum, p) => sum + (parseFloat(p.remise) || 0), 0);
        const totalColisSortis = recups.reduce((sum, r) => sum + (parseInt(r.quantite) || 0), 0);
        const totalPertes = losses.reduce((sum, l) => sum + (parseInt(l.quantite) || 0), 0);
        
        // Correction de l'erreur : on définit totalDu ici (sans accent)
        const totalDu = caAgence - (totalCaisse + totalRemises);

        // --- MISE À JOUR DE L'AFFICHAGE HTML ---
        if(document.getElementById('grandTotalVentes')) document.getElementById('grandTotalVentes').textContent = formatEUR(totalCA);
        if(document.getElementById('totalInvestissement')) document.getElementById('totalInvestissement').textContent = formatEUR(totalCoutAchatVendu);
        
        // Affichage de l'Investissement Total (Dépôt)
        if(document.getElementById('totalValeurStock')) document.getElementById('totalValeurStock').textContent = formatEUR(valeurTotaleInvestie);
        
        if(document.getElementById('totalVenduAbidjan')) document.getElementById('totalVenduAbidjan').textContent = formatEUR(caAbidjan);
        if(document.getElementById('grandTotalCaisse')) document.getElementById('grandTotalCaisse').textContent = formatEUR(totalCaisse);
        if(document.getElementById('totalDues')) document.getElementById('totalDues').textContent = formatEUR(totalDu);
        if(document.getElementById('grandTotalQuantite')) document.getElementById('grandTotalQuantite').textContent = totalColisSortis;
        if(document.getElementById('totalPertes')) document.getElementById('totalPertes').textContent = totalPertes;
    }

    function renderProductAnalysis(sales) {
        const productData = {};
        let totalProfit = 0;

        sales.forEach(s => {
            if (!productData[s.produit]) productData[s.produit] = { qte: 0, ca: 0 };
            productData[s.produit].qte += (parseInt(s.quantite) || 0);
            productData[s.produit].ca += (parseFloat(s.total) || 0);
        });

        const tbody = document.getElementById('productSummaryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            for (const p in productData) {
                const data = productData[p];
                const stockInfo = allStocks.find(st => st.produit.toUpperCase() === p.toUpperCase());
                const pa = stockInfo ? (parseFloat(stockInfo.prixAchat) || 0) : 0;
                const profit = data.ca - (data.qte * pa);
                totalProfit += profit;

                tbody.innerHTML += `
                    <tr>
                        <td><b>${p}</b></td>
                        <td style="text-align:center;">${data.qte}</td>
                        <td>${formatEUR(data.ca)}</td>
                        <td style="color:#10b981; font-weight:bold;">${formatEUR(profit)}</td>
                    </tr>`;
            }
        }
        document.getElementById('beneficeTotalDisplay').textContent = formatEUR(totalProfit);
        updatePieChart(productData);
    }

    function renderSellerAnalysis(sales, payments) {
        const sellers = {};
        sales.forEach(s => {
            if(!sellers[s.vendeur]) sellers[s.vendeur] = { qte: 0, ca_agence: 0, recu: 0 };
            sellers[s.vendeur].qte += (parseInt(s.quantite) || 0);
            if (s.payeAbidjan !== true) sellers[s.vendeur].ca_agence += (parseFloat(s.total) || 0);
        });
        
        payments.forEach(p => {
            if(!sellers[p.vendeur]) sellers[p.vendeur] = { qte: 0, ca_agence: 0, recu: 0 };
            sellers[p.vendeur].recu += (parseFloat(p.montantRecu) || 0) + (parseFloat(p.remise) || 0);
        });

        const tbody = document.getElementById('agentSummaryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            for (const name in sellers) {
                const s = sellers[name];
                const dette = s.ca_agence - s.recu;
                tbody.innerHTML += `
                    <tr>
                        <td>${name}</td>
                        <td style="text-align:center;">${s.qte}</td>
                        <td>${formatEUR(s.ca_agence)}</td>
                        <td style="color:${dette > 0 ? '#be123c' : '#10b981'}; font-weight:bold;">${formatEUR(dette)}</td>
                    </tr>`;
            }
        }
        updateBarChart(sellers);
    }

    function renderReinvestment(sales) {
        const tbody = document.getElementById('reinvestmentTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const productsSold = {};
        sales.forEach(s => {
            if(!productsSold[s.produit]) productsSold[s.produit] = { qte: 0, ca: 0 };
            productsSold[s.produit].qte += (parseInt(s.quantite) || 0);
            productsSold[s.produit].ca += (parseFloat(s.total) || 0);
        });
        for (const p in productsSold) {
            const stock = allStocks.find(st => st.produit.toUpperCase() === p.toUpperCase());
            const pa = stock ? (parseFloat(stock.prixAchat) || 0) : 0;
            const profit = productsSold[p].ca - (productsSold[p].qte * pa);
            if (profit > 0 && pa > 0) {
                const qteMax = Math.floor(profit / pa);
                if (qteMax > 0) tbody.innerHTML += `<tr><td>${p}</td><td>${formatEUR(pa)}</td><td style="color:#1877f2; font-weight:bold;">+ ${qteMax} unités</td></tr>`;
            }
        }
    }

    function updatePieChart(data) {
        const ctx = document.getElementById('salesPieChart');
        if (!ctx || Object.keys(data).length === 0) return;
        if (salesChart) salesChart.destroy();
        salesChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(data),
                datasets: [{ data: Object.values(data).map(d => d.ca), backgroundColor: ['#1877f2', '#10b981', '#f59e0b', '#be123c', '#8b5cf6', '#701a75'] }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }
        });
    }

    function updateBarChart(data) {
        const ctx = document.getElementById('agentBarChart');
        if (!ctx || Object.keys(data).length === 0) return;
        if (agentChart) agentChart.destroy();
        agentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{ label: 'CA Agence', data: Object.values(data).map(d => d.ca_agence), backgroundColor: '#1877f2' }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });
    }

    function updateDailyFlashStats(sales) {
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(s => s.date === today);
        let totalColis = 0; let vendeurs = {};
        todaySales.forEach(s => {
            totalColis += (parseInt(s.quantite) || 0);
            vendeurs[s.vendeur] = (vendeurs[s.vendeur] || 0) + (parseFloat(s.total) || 0);
        });
        document.getElementById('todayColis').textContent = totalColis;
        let topV = "-"; let max = 0;
        for(let v in vendeurs) { if(vendeurs[v] > max) { max = vendeurs[v]; topV = v; } }
        document.getElementById('topVendeur').textContent = topV;
    }

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    db.collection("stocks").onSnapshot(snap => { allStocks = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("ventes").onSnapshot(snap => { allSales = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("recuperations").onSnapshot(snap => { allRecuperations = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("encaissements_vendeurs").onSnapshot(snap => { allPayments = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("pertes").onSnapshot(snap => { allLosses = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("retours_vendeurs").onSnapshot(snap => { allReturns = snap.docs.map(doc => doc.data()); updateDashboard(); });

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
});