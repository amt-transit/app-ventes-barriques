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

                // --- GESTION DU BOUTON RETOUR ADMIN ---
                const adminLink = document.getElementById('adminLink');
                if (adminLink && role === 'admin') {
                    adminLink.style.display = 'inline-block';
                }

                // --- REDIRECTIONS PAR RÔLE ---
                if (role === 'vendeur') {
                    const allowedForVendeur = ['recuperation.html', 'profil.html', 'login.html'];
                    if (!allowedForVendeur.includes(currentPage) && currentPage !== "") {
                        window.location.href = 'recuperation.html';
                    }
                    if (currentPage === 'login.html') window.location.href = 'recuperation.html';

                    // Verrouillage auto du nom
                    const selectVendeur = document.getElementById('recupVendeur') || document.getElementById('valVendeur');
                    if (selectVendeur) {
                        selectVendeur.value = userData.nom;
                        selectVendeur.disabled = true;
                        if (typeof loadSellerData === 'function') loadSellerData();
                    }
                } 
                else if (role === 'admin') {
                    if (currentPage === 'login.html') window.location.href = 'validation.html';
                }
            }
        } catch (e) {
            console.error("Erreur auth-guard:", e);
        }
    } else {
        if (currentPage !== 'login.html') window.location.href = 'login.html';
    }
});

function logout() {
    firebase.auth().signOut().then(() => { window.location.href = 'login.html'; });
}