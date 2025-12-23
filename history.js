document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        return alert("Erreur: La connexion à la base de données a échoué.");
    }
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

    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');

    // --- ÉCOUTEUR HISTORIQUE DES VENTES ---
    db.collection("ventes").orderBy("date", "desc").onSnapshot(snapshot => {
        const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderVentes(sales);
    }, error => {
        console.error("Erreur Ventes: ", error);
        tableBodyVentes.innerHTML = '<tr><td colspan="9">Erreur de chargement des ventes.</td></tr>';
    });

    // --- ÉCOUTEUR HISTORIQUE DES PAIEMENTS ---
    db.collection("encaissements_vendeurs").orderBy("date", "desc").onSnapshot(snapshot => {
        const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPaiements(payments);
    }, error => {
        console.error("Erreur Paiements: ", error);
        tableBodyPaiements.innerHTML = '<tr><td colspan="6">Erreur de chargement des paiements.</td></tr>';
    });

    // --- FONCTIONS DE RENDU ---

    function renderVentes(sales) {
        tableBodyVentes.innerHTML = '';
        if (sales.length === 0) {
            tableBodyVentes.innerHTML = '<tr><td colspan="9">Aucune vente trouvée.</td></tr>';
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
                <td>${data.vendeur || 'N/A'}</td>
                <td>${data.enregistrePar || 'Admin'}</td>
                <td><button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button></td>
            `;
            tableBodyVentes.appendChild(row);
        });
    }

    function renderPaiements(payments) {
        tableBodyPaiements.innerHTML = '';
        if (payments.length === 0) {
            tableBodyPaiements.innerHTML = '<tr><td colspan="6">Aucun paiement trouvé.</td></tr>';
            return;
        }

        payments.forEach(data => {
            const row = document.createElement('tr');
            const totalCredite = (data.montantRecu || 0) + (data.remise || 0);
            row.innerHTML = `
                <td>${data.date}</td>
                <td style="font-weight:bold;">${data.vendeur}</td>
                <td style="color: #10b981;">+ ${formatEUR(data.montantRecu)}</td>
                <td style="color: #3b82f6;">${formatEUR(data.remise)}</td>
                <td style="font-weight:bold; background: #f8fafc;">${formatEUR(totalCredite)}</td>
                <td><button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs', '${data.id}')">Suppr.</button></td>
            `;
            tableBodyPaiements.appendChild(row);
        });
    }

    // --- UTILITAIRES ---

    function formatEUR(number) {
        if (number === undefined || number === null) return '0,00 €';
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
    }

    // Rendre la fonction accessible globalement pour les boutons Suppr.
    window.deleteDocument = async (collection, docId) => {
        if (confirm("Confirmer la suppression définitive de cette ligne ? (Cela modifiera le solde du vendeur)")) {
            try {
                await db.collection(collection).doc(docId).delete();
            } catch (error) {
                alert("Erreur lors de la suppression.");
            }
        }
    };
});