document.addEventListener('DOMContentLoaded', () => {

    // --- GESTION AUTHENTIFICATION ---
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        } else {
            const userDoc = await db.collection("users").doc(user.displayName || user.email.split('@')[0]).get();
            const userData = userDoc.data();
            if (userData && userData.role === 'vendeur') {
                const forbiddenLinks = ['stock.html', 'dashboard.html', 'utilisateurs.html', 'history.html'];
                document.querySelectorAll('.navigation a').forEach(link => {
                    if (forbiddenLinks.includes(link.getAttribute('href'))) link.style.display = 'none';
                });
                if (forbiddenLinks.includes(window.location.pathname.split('/').pop())) {
                    window.location.href = 'validation.html';
                }
            }
        }
    });

    // --- VARIABLES ET ELEMENTS ---
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    let allSales = [], allStocks = [], allPayments = [], allRecuperations = [];
    let salesChart = null, agentChart = null;

    // --- FONCTION PRINCIPALE DE MISE À JOUR ---
    function updateDashboard() {
        const start = startDateInput.value;
        const end = endDateInput.value;

        // Filtrage par date
        const filteredSales = allSales.filter(s => (!start || s.date >= start) && (!end || s.date <= end));
        const filteredPayments = allPayments.filter(p => (!start || p.date >= start) && (!end || p.date <= end));

        // Appel des fonctions de rendu (Noms synchronisés)
        calculateKPIs(filteredSales, filteredPayments);
        renderProductAnalysis(filteredSales);
        renderSellerAnalysis(filteredSales, filteredPayments);
        renderAgentPackageStock(filteredSales, allRecuperations); // Correction du nom ici
        renderReinvestment(filteredSales);
        updateDailyFlashStats(allSales);

        const dateDisplay = document.getElementById('reportDate');
        if (dateDisplay) dateDisplay.textContent = "Établi le : " + new Date().toLocaleDateString('fr-FR');
    }

    // 1. KPI (Les 4 Grandes Cartes)
    function calculateKPIs(sales, payments) {
        const totalCA = sales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalCaisse = payments.reduce((sum, p) => sum + (p.montantRecu || 0), 0);
        const totalRemises = payments.reduce((sum, p) => sum + (p.remise || 0), 0);
        const totalQty = sales.reduce((sum, s) => sum + (s.quantite || 0), 0);
        
        const totalDû = totalCA - (totalCaisse + totalRemises);

        if(document.getElementById('grandTotalVentes')) document.getElementById('grandTotalVentes').textContent = formatEUR(totalCA);
        if(document.getElementById('grandTotalCaisse')) document.getElementById('grandTotalCaisse').textContent = formatEUR(totalCaisse);
        if(document.getElementById('totalDues')) document.getElementById('totalDues').textContent = formatEUR(totalDû);
        if(document.getElementById('grandTotalQuantite')) document.getElementById('grandTotalQuantite').textContent = totalQty;
    }

    // 2. ANALYSE PRODUITS
    function renderProductAnalysis(sales) {
        const productData = {};
        let totalProfitGlobal = 0;

        sales.forEach(s => {
            if (!productData[s.produit]) productData[s.produit] = { qte: 0, ca: 0 };
            productData[s.produit].qte += s.quantite;
            productData[s.produit].ca += s.total;
        });

        const tbody = document.getElementById('productSummaryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            for (const p in productData) {
                const data = productData[p];
                const stockInfo = allStocks.find(st => st.produit === p);
                const pAchat = stockInfo ? stockInfo.prixAchat : 0;
                const profit = data.ca - (data.qte * pAchat);
                totalProfitGlobal += profit;

                tbody.innerHTML += `
                    <tr>
                        <td><b>${p}</b></td>
                        <td style="text-align:center;">${data.qte}</td>
                        <td>${formatEUR(data.ca)}</td>
                        <td style="color:#10b981; font-weight:bold;">${formatEUR(profit)}</td>
                    </tr>`;
            }
        }
        if(document.getElementById('beneficeTotalDisplay')) {
            document.getElementById('beneficeTotalDisplay').innerHTML = `Bénéfice : <span style="color:#10b981;">${formatEUR(totalProfitGlobal)}</span>`;
        }
        updatePieChart(productData);
    }

    // 3. ANALYSE VENDEURS
    function renderSellerAnalysis(sales, payments) {
        const sellers = {};
        sales.forEach(s => {
            if(!sellers[s.vendeur]) sellers[s.vendeur] = { qte: 0, ca: 0, recu: 0 };
            sellers[s.vendeur].qte += s.quantite;
            sellers[s.vendeur].ca += s.total;
        });
        payments.forEach(p => {
            if(!sellers[p.vendeur]) sellers[p.vendeur] = { qte: 0, ca: 0, recu: 0 };
            sellers[p.vendeur].recu += (p.montantRecu || 0) + (p.remise || 0);
        });

        const tbody = document.getElementById('agentSummaryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            for (const name in sellers) {
                const s = sellers[name];
                const dette = s.ca - s.recu;
                tbody.innerHTML += `
                    <tr>
                        <td>${name}</td>
                        <td style="text-align:center;">${s.qte}</td>
                        <td>${formatEUR(s.ca)}</td>
                        <td style="color:${dette > 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">${formatEUR(dette)}</td>
                    </tr>`;
            }
        }
        updateBarChart(sellers);
    }

    // 4. SUIVI DES COLIS (STOCK VENDEUR)
    function renderAgentPackageStock(sales, recuperations) {
        const tableBody = document.getElementById('agentPackageStockTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const tracking = {};

        recuperations.forEach(r => {
            if (!tracking[r.vendeur]) tracking[r.vendeur] = { recup: 0, vendu: 0 };
            tracking[r.vendeur].recup += (r.quantite || 0);
        });
        sales.forEach(s => {
            if (!tracking[s.vendeur]) tracking[s.vendeur] = { recup: 0, vendu: 0 };
            tracking[s.vendeur].vendu += (s.quantite || 0);
        });

        for (const agent in tracking) {
            const reste = tracking[agent].recup - tracking[agent].vendu;
            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td style="text-align:center;">${tracking[agent].recup}</td>
                    <td style="text-align:center;">${tracking[agent].vendu}</td>
                    <td style="text-align:center; font-weight:bold; color:${reste > 0 ? '#f59e0b' : '#10b981'}">${reste} colis</td>
                </tr>`;
        }
    }

    // 5. RÉINVESTISSEMENT
    function renderReinvestment(sales) {
        const tbody = document.getElementById('reinvestmentTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const productsSold = {};
        sales.forEach(s => {
            if(!productsSold[s.produit]) productsSold[s.produit] = { qte: 0, ca: 0 };
            productsSold[s.produit].qte += s.quantite;
            productsSold[s.produit].ca += s.total;
        });

        for (const p in productsSold) {
            const stock = allStocks.find(st => st.produit === p);
            const pAchat = stock ? stock.prixAchat : 0;
            const profit = productsSold[p].ca - (productsSold[p].qte * pAchat);
            
            if (profit > 0 && pAchat > 0) {
                const qtePossible = Math.floor(profit / pAchat);
                if (qtePossible > 0) {
                    tbody.innerHTML += `<tr><td>${p}</td><td>${formatEUR(pAchat)}</td><td style="font-weight:bold; color:#1877f2;">+ ${qtePossible} unités</td></tr>`;
                }
            }
        }
    }

    // --- GRAPHIQUES ---
    function updatePieChart(data) {
        const ctx = document.getElementById('salesPieChart');
        if (!ctx) return;
        if (salesChart) salesChart.destroy();
        salesChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(data),
                datasets: [{ data: Object.values(data).map(d => d.ca), backgroundColor: ['#1877f2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    function updateBarChart(data) {
        const ctx = document.getElementById('agentBarChart');
        if (!ctx) return;
        if (agentChart) agentChart.destroy();
        agentChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{ label: 'Chiffre d\'Affaires', data: Object.values(data).map(d => d.ca), backgroundColor: '#1877f2' }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // --- STATS FLASH DU JOUR ---
    function updateDailyFlashStats(sales) {
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(s => s.date === today);
        let totalColis = 0;
        let vendeurs = {};

        todaySales.forEach(s => {
            totalColis += s.quantite;
            vendeurs[s.vendeur] = (vendeurs[s.vendeur] || 0) + s.total;
        });

        if(document.getElementById('todayColis')) document.getElementById('todayColis').textContent = totalColis;
        if(document.getElementById('todayVentes')) document.getElementById('todayVentes').textContent = formatEUR(todaySales.reduce((a,b) => a + b.total, 0));
        
        let topV = "-"; let max = 0;
        for(let v in vendeurs) { if(vendeurs[v] > max) { max = vendeurs[v]; topV = v; } }
        if(document.getElementById('topVendeur')) document.getElementById('topVendeur').textContent = topV;
    }

    // --- UTILITAIRES ET ÉCOUTEURS ---
    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n); }

    db.collection("stocks").onSnapshot(snap => { allStocks = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("ventes").onSnapshot(snap => { allSales = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("recuperations").onSnapshot(snap => { allRecuperations = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("encaissements_vendeurs").onSnapshot(snap => { allPayments = snap.docs.map(doc => doc.data()); updateDashboard(); });

    if(startDateInput) startDateInput.addEventListener('change', updateDashboard);
    if(endDateInput) endDateInput.addEventListener('change', updateDashboard);
});