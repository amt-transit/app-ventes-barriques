document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
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
    function calculateTotal() {
        const prixUnitaire = parseFloat(prixUnitaireInput.value) || 0;
        const quantite = parseFloat(quantiteInput.value) || 0;
        const total = prixUnitaire * quantite;
        totalInput.value = total.toFixed(2);
    }
    function updateDailySummary() {
        let totalVentes = 0, totalEspeces = 0, totalVirements = 0, totalCartes = 0;
        dailySales.forEach(sale => {
            totalVentes += sale.total;
            switch(sale.modeDePaiement) {
                case 'Espèce': totalEspeces += sale.total; break;
                case 'Virement': totalVirements += sale.total; break;
                case 'Carte Bleue': totalCartes += sale.total; break;
            }
        });
        dailyTotalVentesEl.textContent = formatEUR(totalVentes);
        dailyTotalEspecesEl.textContent = formatEUR(totalEspeces);
        dailyTotalVirementsEl.textContent = formatEUR(totalVirements);
        dailyTotalCartesEl.textContent = formatEUR(totalCartes);
    }
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
    function renderDailyTable() {
        dailyTableBody.innerHTML = '';
        dailySales.forEach((data, index) => {
            const row = document.createElement('tr');
            const paymentClass = `paiement-${textToClassName(data.modeDePaiement)}`;
            row.innerHTML = `
                <td data-label="Date">${data.date}</td>
                <td data-label="Produit">${data.produit}</td>
                <td data-label="Qté">${data.quantite}</td>
                <td data-label="Total">${formatEUR(data.total)}</td>
                <td data-label="Paiement" class="${paymentClass}">${data.modeDePaiement}</td>
                <td data-label="Action"><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });
        document.getElementById('dailyCount').textContent = dailySales.length;
        updateDailySummary();
    }
    produitInput.addEventListener('input', () => {
        const productValue = produitInput.value;
        if (productDB[productValue]) {
            prixUnitaireInput.value = productDB[productValue];
            calculateTotal();
        }
    });
    [prixUnitaireInput, quantiteInput].forEach(input => {
        input.addEventListener('input', calculateTotal);
    });
    modeDePaiementInput.addEventListener('change', (event) => {
        const selectEl = event.target;
        selectEl.classList.remove('select-espece', 'select-virement', 'select-carte-bleue');
        const className = `select-${textToClassName(selectEl.value)}`;
        if (selectEl.value) {
            selectEl.classList.add(className);
        }
    });
    addEntryBtn.addEventListener('click', () => {
        const newSale = {
            date: document.getElementById('date').value,
            produit: produitInput.value,
            prixUnitaire: parseFloat(prixUnitaireInput.value) || 0,
            quantite: parseFloat(quantiteInput.value) || 0,
            total: parseFloat(totalInput.value) || 0,
            modeDePaiement: modeDePaiementInput.value
        };
        if (!newSale.date || !newSale.produit || newSale.quantite <= 0 || !newSale.modeDePaiement) {
            return alert("Veuillez remplir la date, le produit, la quantité et le mode de paiement.");
        }
        dailySales.push(newSale);
        saveDailyToLocalStorage();
        renderDailyTable();
        formContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date') {
                if (el.id === 'quantite') el.value = '1';
                else el.value = '';
            }
        });
        modeDePaiementInput.classList.remove('select-espece', 'select-virement', 'select-carte-bleue');
        produitInput.focus();
    });
    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailySales.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
        }
    });
    saveDayBtn.addEventListener('click', () => {
        if (dailySales.length === 0) return alert("Aucune vente à enregistrer.");
        if (!confirm(`Voulez-vous vraiment enregistrer les ${dailySales.length} ventes de la journée ?`)) return;
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
    function populateDatalist() {
        for (const product in productDB) {
            const option = document.createElement('option');
            option.value = product;
            referenceList.appendChild(option);
        }
    }
    renderDailyTable();
    populateDatalist();
});