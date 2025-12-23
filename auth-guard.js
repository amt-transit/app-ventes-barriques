const auth = firebase.auth();
const db = firebase.firestore();
const currentPage = window.location.pathname.split('/').pop();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- UTILISATEUR CONNECTÉ ---
        
        // 1. Récupérer le rôle dans Firestore
        // On cherche le document dont l'email correspond à l'utilisateur connecté
        const userSnap = await db.collection("users").where("email", "==", user.email).get();
        
        if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            const role = userData.role; // 'admin' ou 'vendeur'
            const nomVendeur = userData.nom; // 'Abdoul'

            // 2. Gestion des menus interdits (si vendeur)
            if (role === 'vendeur') {
                const pagesInterdites = ['stock.html', 'dashboard.html', 'utilisateurs.html', 'history.html'];
                
                // Masquer les liens dans la navigation
                document.querySelectorAll('.navigation a').forEach(link => {
                    const href = link.getAttribute('href');
                    if (pagesInterdites.includes(href)) {
                        link.style.display = 'none';
                    }
                });

                // Bloquer l'accès direct par URL
                if (pagesInterdites.includes(currentPage)) {
                    window.location.href = 'validation.html';
                }

                // 3. Verrouiller le choix du vendeur dans la page Validation
                const selectVendeur = document.getElementById('valVendeur');
                if (selectVendeur) {
                    selectVendeur.value = nomVendeur;
                    selectVendeur.disabled = true; // Empêche de choisir un autre collègue
                    // Forcer le chargement des données de ce vendeur
                    if (typeof loadSellerData === 'function') loadSellerData();
                }
            }
        }

        // Si on est sur login.html alors qu'on est déjà connecté
        if (currentPage === 'login.html') {
            window.location.href = 'validation.html';
        }

    } else {
        // --- NON CONNECTÉ ---
        if (currentPage !== 'login.html') {
            window.location.href = 'login.html';
        }
    }
});

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    });
}