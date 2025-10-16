document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }

    const salesCollection = db.collection("ventes");
    const tableBody = document.getElementById('tableBody');

    salesCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(sales);
    }, error => console.error("Erreur Firestore: ", error));

    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression définitive de cette vente ?")) {
                salesCollection.doc(docId).delete();
            }
        }
    });

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
    function renderTable(sales) {
        tableBody.innerHTML = '<tr><td colspan="7">Aucun historique de vente trouvé.</td></tr>';
        if (sales.length === 0) return;
        tableBody.innerHTML = '';
        sales.forEach(data => {
            const row = document.createElement('tr');
            const paymentClass = `paiement-${textToClassName(data.modeDePaiement)}`;
            row.innerHTML = `
                <td data-label="Date">${data.date}</td>
                <td data-label="Produit">${data.produit}</td>
                <td data-label="Qté">${data.quantite}</td>
                <td data-label="PU">${formatEUR(data.prixUnitaire)}</td>
                <td data-label="Total">${formatEUR(data.total)}</td>
                <td data-label="Paiement" class="${paymentClass}">${data.modeDePaiement}</td>
                <td data-label="Action"><button class="deleteBtn" data-id="${data.id}">Suppr.</button></td>
            `;
            tableBody.appendChild(row);
        });
    }
});