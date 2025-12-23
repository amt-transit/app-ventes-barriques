document.addEventListener('DOMContentLoaded', () => {

    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            // Si non connecté, redirection vers login
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        } else {
            // Si connecté, on vérifie le rôle dans Firestore
            const userDoc = await db.collection("users").doc(user.displayName || user.email.split('@')[0]).get();
            const userData = userDoc.data();

            if (userData && userData.role === 'vendeur') {
                // Masquer les menus interdits aux vendeurs
                const forbiddenLinks = ['stock.html', 'dashboard.html', 'utilisateurs.html', 'history.html'];
                document.querySelectorAll('.navigation a').forEach(link => {
                    const href = link.getAttribute('href');
                    if (forbiddenLinks.includes(href)) {
                        link.style.display = 'none';
                    }
                });
                
                // Empêcher l'accès direct par URL
                const currentPage = window.location.pathname.split('/').pop();
                if (forbiddenLinks.includes(currentPage)) {
                    window.location.href = 'validation.html';
                }
            }
        }
    });

    function logout() {
        firebase.auth().signOut().then(() => {
            window.location.href = 'login.html';
        });
    }
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

        // 1. Filtrer les Ventes par date
        const filteredSales = allSales.filter(sale => {
            if (startDate && sale.date < startDate) return false;
            if (endDate && sale.date > endDate) return false;
            return true;
        });

        // 2. Filtrer les Paiements par date (Indispensable pour la Caisse)
        const filteredPayments = allPayments.filter(payment => {
            if (startDate && payment.date < startDate) return false;
            if (endDate && payment.date > endDate) return false;
            return true;
        });

        // 3. Mise à jour des totaux avec les deux listes filtrées
        updateGrandTotals(filteredSales, filteredPayments);
        
        // 4. Les autres fonctions
        generateProductSummary(filteredSales, allStocks);
        generateAgentSummary(filteredSales);
        generateAgentPackageStock(filteredSales, allRecuperations);
        
        // On utilise les versions filtrées pour la balance financière
        generateFinancialBalance(filteredSales, filteredPayments);
        
        // Date du rapport
        const dateDisplay = document.getElementById('reportDate');
        if (dateDisplay) {
            dateDisplay.textContent = "Établi le : " + new Date().toLocaleDateString('fr-FR');
        }
    }

    // --- LOGIQUE FINANCIÈRE (DETTE SUR RÉCUPÉRATION) ---
    function generateFinancialBalance(sales, payments) {
        const tableBody = document.getElementById('financeBalanceTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const finance = {};

        // 1. Dette basée sur les VENTES RÉELLES
        sales.forEach(s => {
            const name = s.vendeur || "Inconnu";
            if (!finance[name]) finance[name] = { totalVendu: 0, totalPaye: 0 };
            finance[name].totalVendu += (s.total || 0);
        });

        // 2. Paiements RÉELS reçus
        payments.forEach(p => {
            const name = p.vendeur || "Inconnu";
            if (!finance[name]) finance[name] = { totalVendu: 0, totalPaye: 0 };
            finance[name].totalPaye += (p.montantRecu || 0) + (p.remise || 0);
        });

        const agents = Object.keys(finance).sort();
        if (agents.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Aucune donnée financière.</td></tr>';
            return;
        }

        agents.forEach(agent => {
            const f = finance[agent];
            const soldeDû = f.totalVendu - f.totalPaye;

            tableBody.innerHTML += `
                <tr>
                    <td>${agent}</td>
                    <td>${formatEUR(f.totalVendu)}</td>
                    <td style="color: #28a745;">${formatEUR(f.totalPaye)}</td>
                    <td style="font-weight:bold; color: ${soldeDû > 0 ? '#dc3545' : '#28a745'};">
                        ${formatEUR(soldeDû)}
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

    function updateGrandTotals(sales = [], payments = []) {
        // Calcul du Chiffre d'Affaires (Ventes validées)
        const totalCA = sales.reduce((sum, s) => sum + (s.total || 0), 0);
        
        // Calcul de la Caisse (Argent réellement encaissé)
        const totalCaisse = payments.reduce((sum, p) => sum + (p.montantRecu || 0), 0);
        
        // Calcul de la Quantité totale
        const totalQty = sales.reduce((sum, s) => sum + (s.quantite || 0), 0);

        // Affichage dans le HTML
        if (grandTotalVentesEl) grandTotalVentesEl.textContent = formatEUR(totalCA);
        
        // Assurez-vous d'avoir cet ID dans votre HTML pour voir l'argent réel
        const grandTotalCaisseEl = document.getElementById('grandTotalCaisse');
        if (grandTotalCaisseEl) grandTotalCaisseEl.textContent = formatEUR(totalCaisse);

        if (grandTotalQuantiteEl) grandTotalQuantiteEl.textContent = totalQty;
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
    async function loadDailyStats() {
        const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
        
        try {
            const snap = await db.collection("ventes")
                .where("date", "==", today)
                .get();

            let totalColis = 0;
            let totalVentes = snap.size;
            let vendeursActivity = {};

            snap.forEach(doc => {
                const d = doc.data();
                totalColis += (parseInt(d.quantite) || 0);
                
                // Compter l'activité par vendeur
                if (d.vendeur) {
                    vendeursActivity[d.vendeur] = (vendeursActivity[d.vendeur] || 0) + 1;
                }
            });

            // Trouver le top vendeur
            let topVendeurName = "-";
            let maxVentes = 0;
            for (const v in vendeursActivity) {
                if (vendeursActivity[v] > maxVentes) {
                    maxVentes = vendeursActivity[v];
                    topVendeurName = v;
                }
            }

            // Mise à jour de l'affichage
            document.getElementById('todayColis').innerText = totalColis;
            document.getElementById('todayVentes').innerText = totalVentes;
            document.getElementById('topVendeur').innerText = topVendeurName + " (" + maxVentes + ")";

        } catch (e) {
            console.error("Erreur stats du jour:", e);
        }
    }

    // Appeler la fonction au chargement
    loadDailyStats();

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
});