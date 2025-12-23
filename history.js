document.addEventListener('DOMContentLoaded', () => {
    const filterVendeur = document.getElementById('filterVendeur');
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');

    let unsubscribeVentes = null;
    let unsubscribePaiements = null;

    // 1. Charger dynamiquement les comptes dans le filtre
    async function loadFilterAccounts() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        snap.forEach(doc => {
            const u = doc.data();
            const opt = document.createElement('option');
            opt.value = u.nom;
            opt.textContent = u.nom;
            filterVendeur.appendChild(opt);
        });
    }

    // 2. Écouter les changements sur le filtre
    filterVendeur.addEventListener('change', () => {
        const selectedUser = filterVendeur.value;
        startListeners(selectedUser);
    });

    // 3. Fonction principale pour charger les données (avec ou sans filtre)
    function startListeners(vendeurNom = "") {
        // Arrêter les anciens écouteurs s'ils existent
        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribePaiements) unsubscribePaiements();

        // Requête Ventes
        let queryVentes = db.collection("ventes").orderBy("date", "desc");
        if (vendeurNom !== "") {
            queryVentes = queryVentes.where("vendeur", "==", vendeurNom);
        }

        unsubscribeVentes = queryVentes.onSnapshot(snapshot => {
            renderVentes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Requête Paiements
        let queryPaiements = db.collection("encaissements_vendeurs").orderBy("date", "desc");
        if (vendeurNom !== "") {
            queryPaiements = queryPaiements.where("vendeur", "==", vendeurNom);
        }

        unsubscribePaiements = queryPaiements.onSnapshot(snapshot => {
            renderPaiements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }

    // --- FONCTIONS DE RENDU ---

    function renderVentes(sales) {
        tableBodyVentes.innerHTML = '';
        if (sales.length === 0) {
            tableBodyVentes.innerHTML = '<tr><td colspan="9" style="text-align:center;">Aucune vente.</td></tr>';
            return;
        }

        sales.forEach(data => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${data.date}</td>
                <td>${data.produit}</td>
                <td>${data.quantite}</td>
                <td>${formatEUR(data.prixUnitaire)}</td>
                <td style="font-weight:bold;">${formatEUR(data.total)}</td>
                <td>${data.modeDePaiement || 'Validé Admin'}</td>
                <td style="color:#1877f2; font-weight:bold;">${data.vendeur || 'N/A'}</td>
                <td>${data.enregistrePar || 'Admin'}</td>
                <td><button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button></td>
            `;
            tableBodyVentes.appendChild(row);
        });
    }

    function renderPaiements(payments) {
        tableBodyPaiements.innerHTML = '';
        if (payments.length === 0) {
            tableBodyPaiements.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun paiement.</td></tr>';
            return;
        }

        payments.forEach(data => {
            const row = document.createElement('tr');
            const totalCredite = (data.montantRecu || 0) + (data.remise || 0);
            row.innerHTML = `
                <td>${data.date}</td>
                <td style="font-weight:bold; color:#1877f2;">${data.vendeur}</td>
                <td style="color: #10b981;">+ ${formatEUR(data.montantRecu)}</td>
                <td style="color: #3b82f6;">${formatEUR(data.remise)}</td>
                <td style="font-weight:bold; background: #f8fafc;">${formatEUR(totalCredite)}</td>
                <td><button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs', '${data.id}')">Suppr.</button></td>
            `;
            tableBodyPaiements.appendChild(row);
        });
    }

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number || 0);
    }

    window.deleteDocument = async (collection, docId) => {
        if (confirm("Supprimer définitivement cette ligne ?")) {
            try {
                await db.collection(collection).doc(docId).delete();
            } catch (error) {
                alert("Erreur de suppression.");
            }
        }
    };

    // Lancer le chargement initial
    loadFilterAccounts();
    startListeners();
});