document.addEventListener('DOMContentLoaded', () => {

    // --- GESTION AUTHENTIFICATION ---
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        } else {
            const userSnap = await db.collection("users").where("email", "==", user.email).get();
            if (!userSnap.empty) {
                const userData = userSnap.docs[0].data();
                window.userRole = userData.role;
                window.userName = userData.nom;

                if (userData.role === 'vendeur') {
                    const forbiddenLinks = ['stock.html', 'dashboard.html', 'utilisateurs.html', 'history.html'];
                    document.querySelectorAll('.navigation a').forEach(link => {
                        if (forbiddenLinks.includes(link.getAttribute('href'))) link.style.display = 'none';
                    });
                    if (forbiddenLinks.includes(window.location.pathname.split('/').pop())) {
                        window.location.href = 'validation.html';
                    }
                }
            }
        }
    });

    // --- VARIABLES ET ELEMENTS ---
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    let allSales = [], allStocks = [], allPayments = [], allRecuperations = [], allLosses = [];
    let salesChart = null, agentChart = null;

    // --- FONCTION PRINCIPALE DE MISE À JOUR ---
    function updateDashboard() {
        const start = startDateInput.value;
        const end = endDateInput.value;

        // Filtrage par date des différentes collections
        const filteredSales = allSales.filter(s => (!start || s.date >= start) && (!end || s.date <= end));
        const filteredPayments = allPayments.filter(p => (!start || p.date >= start) && (!end || p.date <= end));
        const filteredLosses = allLosses.filter(l => (!start || l.date >= start) && (!end || l.date <= end));

        // Appel des fonctions de rendu avec injection des pertes
        calculateKPIs(filteredSales, filteredPayments, filteredLosses);
        renderProductAnalysis(filteredSales);
        renderSellerAnalysis(filteredSales, filteredPayments);
        renderAgentPackageStock(filteredSales, allRecuperations, allLosses);
        renderReinvestment(filteredSales);
        updateDailyFlashStats(allSales);

        const dateDisplay = document.getElementById('reportDate');
        if (dateDisplay) dateDisplay.textContent = "Établi le : " + new Date().toLocaleDateString('fr-FR');
    }

    // 1. KPI (Calcul avec distinction Abidjan et Pertes)
    function calculateKPIs(sales, payments, losses) {
        // Ventes Agence vs Abidjan
        const totalCA_Agence = sales.filter(s => s.payeAbidjan !== true).reduce((sum, s) => sum + (s.total || 0), 0);
        const totalCA_Abidjan = sales.filter(s => s.payeAbidjan === true).reduce((sum, s) => sum + (s.total || 0), 0);
        
        const totalCaisse = payments.reduce((sum, p) => sum + (p.montantRecu || 0), 0);
        const totalRemises = payments.reduce((sum, p) => sum + (p.remise || 0), 0);
        const totalQty = sales.reduce((sum, s) => sum + (s.quantite || 0), 0);
        
        // Calcul du volume total des pertes sur la période
        const totalLossQty = losses.reduce((sum, l) => sum + (l.quantite || 0), 0);
        
        // La dette ne concerne que les ventes Agence
        const totalDû = totalCA_Agence - (totalCaisse + totalRemises);

        // Mise à jour des éléments HTML
        if(document.getElementById('grandTotalVentes')) document.getElementById('grandTotalVentes').textContent = formatEUR(totalCA_Agence + totalCA_Abidjan);
        if(document.getElementById('totalVenduAbidjan')) document.getElementById('totalVenduAbidjan').textContent = formatEUR(totalCA_Abidjan);
        if(document.getElementById('grandTotalCaisse')) document.getElementById('grandTotalCaisse').textContent = formatEUR(totalCaisse);
        if(document.getElementById('totalDues')) document.getElementById('totalDues').textContent = formatEUR(totalDû);
        if(document.getElementById('grandTotalQuantite')) document.getElementById('grandTotalQuantite').textContent = totalQty;
        if(document.getElementById('totalPertes')) document.getElementById('totalPertes').textContent = totalLossQty;
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
            document.getElementById('beneficeTotalDisplay').textContent = formatEUR(totalProfitGlobal);
        }
        updatePieChart(productData);
    }

    // 3. ANALYSE VENDEURS
    function renderSellerAnalysis(sales, payments) {
        const sellers = {};
        sales.forEach(s => {
            if(!sellers[s.vendeur]) sellers[s.vendeur] = { qte: 0, ca_agence: 0, ca_abidjan: 0, recu: 0 };
            sellers[s.vendeur].qte += s.quantite;
            if (s.payeAbidjan === true) sellers[s.vendeur].ca_abidjan += s.total;
            else sellers[s.vendeur].ca_agence += s.total;
        });
        
        payments.forEach(p => {
            if(!sellers[p.vendeur]) sellers[p.vendeur] = { qte: 0, ca_agence: 0, ca_abidjan: 0, recu: 0 };
            sellers[p.vendeur].recu += (p.montantRecu || 0) + (p.remise || 0);
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
                        <td>${formatEUR(s.ca_agence + s.ca_abidjan)}</td>
                        <td style="color:${dette > 0 ? '#ef4444' : '#10b981'}; font-weight:bold;">${formatEUR(dette)}</td>
                    </tr>`;
            }
        }
        updateBarChart(sellers);
    }

    // 4. SUIVI DES COLIS (Intégration des pertes dans le calcul du reste)
    function renderAgentPackageStock(sales, recuperations, losses) {
        const tableBody = document.getElementById('agentPackageStockTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const tracking = {};

        recuperations.forEach(r => {
            if (!tracking[r.vendeur]) tracking[r.vendeur] = { recup: 0, vendu: 0, perte: 0 };
            tracking[r.vendeur].recup += (r.quantite || 0);
        });
        sales.forEach(s => {
            if (!tracking[s.vendeur]) tracking[s.vendeur] = { recup: 0, vendu: 0, perte: 0 };
            tracking[s.vendeur].vendu += (s.quantite || 0);
        });
        // Intégration des pertes par vendeur pour le stock en main
        losses.forEach(l => {
            if (!tracking[l.vendeur]) tracking[l.vendeur] = { recup: 0, vendu: 0, perte: 0 };
            tracking[l.vendeur].perte += (l.quantite || 0);
        });

        for (const agent in tracking) {
            // Le stock réel = Récupéré - Vendu - Perte
            const reste = tracking[agent].recup - tracking[agent].vendu - tracking[agent].perte;
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
                datasets: [{ label: 'Ventes Agence', data: Object.values(data).map(d => d.ca_agence), backgroundColor: '#1877f2' }]
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

    // Écouteurs Firestore
    db.collection("stocks").onSnapshot(snap => { allStocks = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("ventes").onSnapshot(snap => { allSales = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("recuperations").onSnapshot(snap => { allRecuperations = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("encaissements_vendeurs").onSnapshot(snap => { allPayments = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("pertes").onSnapshot(snap => { allLosses = snap.docs.map(doc => doc.data()); updateDashboard(); });

    if(startDateInput) startDateInput.addEventListener('change', updateDashboard);
    if(endDateInput) endDateInput.addEventListener('change', updateDashboard);
});