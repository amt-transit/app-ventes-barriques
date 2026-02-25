document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    let allSales = [], allStocks = [], allPayments = [], allRecuperations = [], allLosses = [];
    let salesChart = null, agentChart = null;

    // Fonction de sécurité pour éviter les erreurs "properties of null"
    const updateText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    function setDefaultDates() {
        const now = new Date();
        startDateInput.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDateInput.value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }
    setDefaultDates();

    function updateDashboard() {
        const start = startDateInput.value;
        const end = endDateInput.value;

        const filteredSales = allSales.filter(s => s.date >= start && s.date <= end);
        const filteredPayments = allPayments.filter(p => p.date >= start && p.date <= end);
        const filteredLosses = allLosses.filter(l => l.date >= start && l.date <= end);
        
        // FILTRE DOUBLE VALIDATION : Seuls les retraits confirmés ou sans statut (anciens) sont comptés
        const filteredRecups = allRecuperations.filter(r => 
            r.date >= start && 
            r.date <= end && 
            (r.statut === "confirme" || !r.statut)
        );

        calculateKPIs(filteredSales, filteredPayments, filteredLosses, filteredRecups);
        renderProductAnalysis(filteredSales);
        renderSellerAnalysis(filteredSales, filteredPayments);
        renderReinvestment(filteredSales);
        updateDailyFlashStats(allSales);

        const reportEl = document.getElementById('reportDate');
        if (reportEl) reportEl.textContent = "Mis à jour le : " + new Date().toLocaleDateString('fr-FR');
    }

    function calculateKPIs(sales, payments, losses, recups) {
        let productMap = {};
        allStocks.forEach(st => {
            const p = st.produit.toUpperCase();
            if (!productMap[p]) productMap[p] = { isConso: (parseFloat(st.prixVente) <= 0), pa: parseFloat(st.prixAchat) || 0 };
        });

        const caAgence = sales.filter(s => !s.payeAbidjan).reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const caAbidjan = sales.filter(s => s.payeAbidjan).reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const investTotal = allStocks.reduce((sum, item) => sum + ((parseFloat(item.quantite) || 0) * (parseFloat(item.prixAchat) || 0)), 0);

        let coutAchatVendus = 0;
        sales.forEach(s => {
            const info = productMap[s.produit.toUpperCase()];
            if (info && !info.isConso) coutAchatVendus += (parseInt(s.quantite) || 0) * info.pa;
        });

        let qtyVend = 0, qtyCons = 0;
        recups.forEach(r => {
            const info = productMap[r.produit.toUpperCase()];
            if (info && info.isConso) qtyCons += (parseInt(r.quantite) || 0);
            else qtyVend += (parseInt(r.quantite) || 0);
        });

        // --- NOUVEAUX CALCULS FINANCIERS ---
        const totalCash = payments.reduce((sum, p) => sum + (parseFloat(p.montantRecu) || 0), 0);
        const totalCB = payments.reduce((sum, p) => sum + (parseFloat(p.montantCB) || 0), 0); // Champ CB
        const totalVirement = payments.reduce((sum, p) => sum + (parseFloat(p.montantVirement) || 0), 0);
        const totalRemises = payments.reduce((sum, p) => sum + (parseFloat(p.remise) || 0), 0); // Champ Remise
        const totalPertes = losses.reduce((sum, l) => sum + (parseInt(l.quantite) || 0), 0);

        updateText('grandTotalVentes', formatEUR(caAgence + caAbidjan));
        updateText('totalValeurStock', formatEUR(investTotal));
        updateText('totalVenduAbidjan', formatEUR(caAbidjan));
        updateText('grandTotalCaisse', formatEUR(totalCash)); // Case Verte
        updateText('grandTotalCB', formatEUR(totalCB)); // Case Indigo (CB)
        updateText('grandTotalVirement', formatEUR(totalVirement)); // Case Violet (Virement)
        updateText('totalRemises', formatEUR(totalRemises));   // Case Orange
        
        // Dette = Ventes Agence - (Cash + CB + Remises)
        updateText('totalDues', formatEUR(caAgence - (totalCash + totalCB + totalVirement + totalRemises)));
        
        updateText('qtyVendablesSortis', qtyVend);
        updateText('qtyConsosSortis', qtyCons);
        updateText('totalPertes', totalPertes);
        updateText('beneficeTotalDisplay', formatEUR((caAgence + caAbidjan) - coutAchatVendus));
    }

    function renderProductAnalysis(sales) {
        const productData = {};
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
                const pa = stockInfo ? parseFloat(stockInfo.prixAchat) : 0;
                const profit = data.ca - (data.qte * pa);
                const isConso = stockInfo ? parseFloat(stockInfo.prixVente) <= 0 : false;

                tbody.innerHTML += `
                    <tr>
                        <td><b>${p}</b> ${isConso ? '<span style="font-size:9px;">🛠️</span>' : ''}</td>
                        <td style="text-align:center;">${data.qte}</td>
                        <td>${formatEUR(data.ca)}</td>
                        <td style="color:${isConso ? '#64748b' : '#10b981'}; font-weight:bold;">${isConso ? 'Usage' : formatEUR(profit)}</td>
                    </tr>`;
            }
        }
        updatePieChart(productData);
    }

    // --- FONCTION CORRIGÉE ---
    function renderSellerAnalysis(sales, payments) {
        const sellers = {};
        
        // 1. On cumule le CA Agence par vendeur
        sales.forEach(s => {
            if(!sellers[s.vendeur]) sellers[s.vendeur] = { qte: 0, ca: 0, recu: 0 };
            sellers[s.vendeur].qte += (parseInt(s.quantite) || 0);
            if (!s.payeAbidjan) sellers[s.vendeur].ca += (parseFloat(s.total) || 0);
        });

        // 2. On cumule TOUS les types de paiements (Cash + CB + Remise)
        payments.forEach(p => {
            if(!sellers[p.vendeur]) sellers[p.vendeur] = { qte: 0, ca: 0, recu: 0 };
            
            // CORRECTION ICI : On ajoute montantCB au total reçu du vendeur
            sellers[p.vendeur].recu += (parseFloat(p.montantRecu) || 0) + 
                                    (parseFloat(p.montantCB) || 0) +
                                    (parseFloat(p.montantVirement) || 0) + 
                                    (parseFloat(p.remise) || 0);
        });

        const tbody = document.getElementById('agentSummaryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            for (const name in sellers) {
                const s = sellers[name];
                const dette = s.ca - s.recu; // Maintenant cohérent avec le KPI du haut
                tbody.innerHTML += `
                    <tr>
                        <td>${name}</td>
                        <td style="text-align:center;">${s.qte}</td>
                        <td>${formatEUR(s.ca)}</td>
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
            if (!stock || parseFloat(stock.prixVente) <= 0) continue;
            const pa = parseFloat(stock.prixAchat) || 0;
            const profit = productsSold[p].ca - (productsSold[p].qte * pa);
            if (profit > 0 && pa > 0) {
                const qteMax = Math.floor(profit / pa);
                if (qteMax > 0) tbody.innerHTML += `<tr><td>${p}</td><td>${formatEUR(pa)}</td><td style="color:#1877f2; font-weight:bold;">+ ${qteMax} unités</td></tr>`;
            }
        }
    }

    function updateDailyFlashStats(sales) {
        const today = new Date().toISOString().split('T')[0];
        const todaySales = sales.filter(s => s.date === today);
        let totalVendables = 0, vendeurs = {};
        todaySales.forEach(s => {
            const stock = allStocks.find(st => st.produit.toUpperCase() === s.produit.toUpperCase());
            if (stock && parseFloat(stock.prixVente) > 0) totalVendables += (parseInt(s.quantite) || 0);
            vendeurs[s.vendeur] = (vendeurs[s.vendeur] || 0) + (parseFloat(s.total) || 0);
        });
        updateText('todayColis', totalVendables);
        let topV = "-", max = 0;
        for(let v in vendeurs) { if(vendeurs[v] > max) { max = vendeurs[v]; topV = v; } }
        updateText('topVendeur', topV);
    }

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    // --- OPTIMISATION DES GRAPHIQUES POUR LE MOBILE ---
    Chart.register(ChartDataLabels);
    function updatePieChart(data) {
        const ctx = document.getElementById('salesPieChart');
        if (!ctx || Object.keys(data).length === 0) return;
        if (salesChart) salesChart.destroy();

        // 1. Calcul du total général pour les pourcentages
        const totalCA = Object.values(data).reduce((sum, d) => sum + d.ca, 0);

        salesChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                // 2. On modifie les étiquettes ici pour inclure le %
                labels: Object.keys(data).map(p => {
                    const val = data[p].ca;
                    const pc = totalCA > 0 ? ((val / totalCA) * 100).toFixed(1) : 0;
                    return `${p} (${pc}%)`;
                }),
                datasets: [{ 
                    data: Object.values(data).map(d => d.ca), 
                    backgroundColor: ['#1877f2', '#10b981', '#f59e0b', '#be123c', '#8b5cf6', '#701a75'] 
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    // Affichage des pourcentages SUR les tranches
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 10, family: 'Comfortaa' },
                        formatter: (value) => {
                            const pc = totalCA > 0 ? (value * 100 / totalCA).toFixed(1) : 0;
                            return pc > 5 ? pc + "%" : null; // N'affiche que si > 5%
                        }
                    },
                    legend: {
                        position: window.innerWidth > 850 ? 'right' : 'bottom',
                        labels: { 
                            boxWidth: 10, 
                            font: { size: 9, family: 'Comfortaa' } 
                        }
                    }
                }
            }
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
                datasets: [{ 
                    label: 'CA Agence', 
                    data: Object.values(data).map(d => d.ca), 
                    backgroundColor: '#1877f2' 
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Empêche le graphique de devenir géant
                scales: {
                    y: { beginAtZero: true, ticks: { font: { size: 9 } } },
                    x: { ticks: { font: { size: 9 } } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- ÉCOUTEURS FIRESTORE ---
    db.collection("stocks").onSnapshot(snap => { allStocks = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("ventes").onSnapshot(snap => { allSales = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("recuperations").onSnapshot(snap => { allRecuperations = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("encaissements_vendeurs").onSnapshot(snap => { allPayments = snap.docs.map(doc => doc.data()); updateDashboard(); });
    db.collection("pertes").onSnapshot(snap => { allLosses = snap.docs.map(doc => doc.data()); updateDashboard(); });

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);

    // --- GESTION DU BOUTON RETOUR EN HAUT (SCROLL UP ONLY) ---
    let backToTopBtn = document.getElementById("btnBackToTop");
    if (!backToTopBtn) {
        backToTopBtn = document.createElement('button');
        backToTopBtn.id = "btnBackToTop";
        backToTopBtn.innerHTML = "↑";
        document.body.appendChild(backToTopBtn);
        backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    let lastScrollTop = 0;
    window.addEventListener("scroll", () => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > 300 && st < lastScrollTop) {
            backToTopBtn.classList.add("show");
        } else {
            backToTopBtn.classList.remove("show");
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
});