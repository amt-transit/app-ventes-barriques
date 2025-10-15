document.addEventListener('DOMContentLoaded', () => {
    // Note : La connexion Firebase est en pause.
    // const db = firebase.firestore();
    // const salesCollection = db.collection("ventes");
    
    const tableBody = document.getElementById('tableBody');

    // Pour le test en local, on affiche un message
    tableBody.innerHTML = '<tr><td colspan="7">L\'historique sera disponible après la connexion à la base de données.</td></tr>';

    function formatEUR(number) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }
    
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }

    function renderTable(sales) {
        tableBody.innerHTML = '';
        if (sales.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">Aucun historique de vente trouvé.</td></tr>';
            return;
        }

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

    // NOTE : La logique de suppression sera activée avec Firebase
    // tableBody.addEventListener('click', (event) => { ... });

    // NOTE : L'écouteur Firebase sera activé ici
    // salesCollection.orderBy("date", "desc").onSnapshot(snapshot => { ... });
});