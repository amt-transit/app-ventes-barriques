// auth-guard.js
firebase.auth().onAuthStateChanged(async (user) => {
    const currentPage = window.location.pathname.split('/').pop();
    const firestore = firebase.firestore();

    if (user) {
        try {
            const userSnap = await firestore.collection("users").where("email", "==", user.email).get();
            
            if (!userSnap.empty) {
                const userData = userSnap.docs[0].data();
                const role = userData.role;
                
                // STOCKAGE GLOBAL (Crucial pour les autres scripts)
                window.userRole = role; 
                window.userName = userData.nom; // Ajouté pour identifier l'auteur du log

                // --- GESTION DU BOUTON RETOUR ADMIN ---
                const adminLink = document.getElementById('adminLink');
                if (adminLink && (role === 'admin' || role === 'superadmin')) {
                    adminLink.style.display = 'inline-block';
                }

                // --- REDIRECTIONS PAR RÔLE ---
                if (role === 'vendeur') {
                    const allowedForVendeur = ['recuperation.html', 'profil.html', 'login.html'];
                    if (!allowedForVendeur.includes(currentPage) && currentPage !== "") {
                        window.location.href = 'recuperation.html';
                    }
                } 
                
                if (currentPage === 'login.html' && (role === 'admin' || role === 'superadmin')) {
                    window.location.href = 'validation.html';
                }

                // Masquage auto des boutons pour les simples Admins
                if (role === 'admin') {
                    // On attend un peu que le DOM soit chargé
                    setTimeout(() => {
                        document.querySelectorAll('.btn-suppr, .deleteBtn, .superadmin-only').forEach(el => el.style.display = 'none');
                    }, 500);
                }
            }
        } catch (e) { console.error("Erreur auth-guard:", e); }
    } else {
        if (currentPage !== 'login.html') window.location.href = 'login.html';
    }
});

// FONCTION UNIVERSELLE DE LOG (Centralisée)
window.logAction = async (module, type, details, produit = "N/A") => {
    try {
        await db.collection("audit_logs").add({
            dateAction: new Date().toLocaleString('fr-FR'),
            auteur: window.userName || "Admin",
            module: module, // ex: STOCK, VENTES, COMPTES
            type: type,     // ex: SUPPRESSION, MODIFICATION
            details: details,
            produit: produit,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Échec de l'enregistrement du log", e); }
};

function logout() {
    firebase.auth().signOut().then(() => { window.location.href = 'login.html'; });
}