document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const salesCollection = db.collection("ventes");
    let productDB = {};
    try {
        productDB = await fetch('references.json').then(res => res.json());
    } catch (error) {
        console.error("Erreur: Impossible de charger le fichier references.json.", error);
    }

    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm');

    const produitInput = document.getElementById('produit');
    const prixUnitaireInput = document.getElementById('prixUnitaire');
    const quantiteInput = document.getElementById('quantite');
    const totalInput = document.getElementById('total');
    const modeDePaiementInput = document.getElementById('modeDePaiement');
    const referenceList = document.getElementById('referenceList');
    
    const dailyTotalVentesEl = document.getElementById('dailyTotalVentes');
    const dailyTotalEspecesEl = document.getElementById('dailyTotalEspeces');
    const dailyTotalVirementsEl = document.getElementById('dailyTotalVirements');
    const dailyTotalCartesEl = document.getElementById('dailyTotalCartes');

    let dailySales = JSON.parse(localStorage.getItem('dailySales')) || [];

    function saveDailyToLocalStorage() {
        localStorage.setItem('dailySales', JSON.stringify(dailySales));
    }

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }

    function calculateTotal() { /* ... (code inchangé) ... */ }
    function updateDailySummary() { /* ... (code inchangé) ... */ }
    function renderDailyTable() { /* ... (code inchangé) ... */ }
    
    addEntryBtn.addEventListener('click', () => { /* ... (code inchangé) ... */ });
    dailyTableBody.addEventListener('click', (event) => { /* ... (code inchangé) ... */ });

    saveDayBtn.addEventListener('click', () => {
        if (dailySales.length === 0) {
            alert("Aucune vente à enregistrer.");
            return;
        }
        if (!confirm(`Voulez-vous vraiment enregistrer les ${dailySales.length} ventes de la journée dans l'historique ?`)) {
            return;
        }

        const batch = db.batch();
        dailySales.forEach(sale => {
            const docRef = salesCollection.doc();
            batch.set(docRef, sale);
        });

        batch.commit().then(() => {
            alert(`${dailySales.length} ventes ont été enregistrées avec succès !`);
            dailySales = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => {
            console.error("Erreur d'enregistrement : ", err);
            alert("Une erreur est survenue. Vérifiez votre connexion internet.");
        });
    });

    function populateDatalist() { /* ... (code inchangé) ... */ }

    renderDailyTable();
    populateDatalist();
});