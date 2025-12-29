document.addEventListener('DOMContentLoaded', () => {
    let allSales = [], allStocks = [];

    async function loadCashData() {
        // Chargement temps réel pour voir les changements instantanément
        const [salesSnap, stocksSnap] = await Promise.all([
            db.collection("ventes").orderBy("timestamp", "desc").get(),
            db.collection("stocks").get()
        ]);

        allSales = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allStocks = stocksSnap.docs.map(doc => doc.data());

        calculateTreasury();
    }

    function calculateTreasury() {
        const pendingBody = document.getElementById('abidjanPendingBody');
        pendingBody.innerHTML = '';

        let caAgence = 0;
        let caAbidjanRegle = 0;
        let caAbidjanAttente = 0;

        allSales.forEach(s => {
            const montant = parseFloat(s.total) || 0;
            
            if (!s.payeAbidjan) {
                // Argent encaissé par l'agence via les vendeurs
                caAgence += montant;
            } else {
                // Ventes Abidjan : On trie selon l'état du reversement
                if (s.abidjanRegle === true) {
                    caAbidjanRegle += montant;
                } else {
                    caAbidjanAttente += montant;
                    // On ajoute à la liste de recouvrement
                    renderPendingRow(s);
                }
            }
        });

        // Calcul des dépenses d'achat
        const totalDepenses = allStocks.reduce((sum, item) => sum + ((parseFloat(item.quantite) || 0) * (parseFloat(item.prixAchat) || 0)), 0);
        
        // RECETTES RÉELLES = Agence + Abidjan déjà reçu
        const recettesReelles = caAgence + caAbidjanRegle;
        const soldeNet = recettesReelles - totalDepenses;

        // Affichage KPI
        document.getElementById('totalRecettes').textContent = formatEUR(recettesReelles);
        document.getElementById('totalDepenses').textContent = formatEUR(totalDepenses);
        document.getElementById('soldeReel').textContent = formatEUR(soldeNet);
        document.getElementById('attenteAbidjan').textContent = formatEUR(caAbidjanAttente);

        // Détails Comptabilité
        document.getElementById('ca_agence_realise').textContent = "+ " + formatEUR(caAgence);
        document.getElementById('ca_abidjan_regle').textContent = "+ " + formatEUR(caAbidjanRegle);
        document.getElementById('total_cash_brut').textContent = formatEUR(recettesReelles);
    }

    function renderPendingRow(sale) {
        const tbody = document.getElementById('abidjanPendingBody');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sale.date}</td>
            <td><b>${sale.clientRef || 'N/A'}</b></td>
            <td>${sale.produit}</td>
            <td style="font-weight:bold; color:#701a75;">${formatEUR(sale.total)}</td>
            <td>${sale.vendeur}</td>
            <td><button class="btn-settle" onclick="marquerCommeRegle('${sale.id}')">Confirmer Réception ✅</button></td>
        `;
        tbody.appendChild(tr);
    }

    // FONCTION POUR VALIDER LE REVERSEMENT
    window.marquerCommeRegle = async (id) => {
        if (confirm("Confirmez-vous avoir reçu le montant de cette vente ?")) {
            try {
                await db.collection("ventes").doc(id).update({ abidjanRegle: true });
                alert("Montant intégré à la trésorerie !");
                loadCashData(); // Recharger les calculs
            } catch (e) {
                alert("Erreur lors de la validation.");
            }
        }
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    // Écouteurs Firestore
    db.collection("ventes").onSnapshot(() => loadCashData());
    db.collection("stocks").onSnapshot(() => loadCashData());
});