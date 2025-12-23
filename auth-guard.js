// NE PAS utiliser 'const auth' ou 'const db' ici !
// On utilise directement les fonctions de firebase ou les variables window.db / window.auth

firebase.auth().onAuthStateChanged(async (user) => {
    const currentPage = window.location.pathname.split('/').pop();
    const firestore = firebase.firestore(); // On récupère l'instance ici

    if (user) {
        // L'utilisateur est connecté
        try {
            const userSnap = await firestore.collection("users").where("email", "==", user.email).get();
            
            if (!userSnap.empty) {
                const userData = userSnap.docs[0].data();
                const role = userData.role;

                if (role === 'vendeur') {
                    const allowed = ['recuperation.html', 'profil.html', 'login.html'];
                    if (!allowed.includes(currentPage) && currentPage !== "") {
                        window.location.href = 'recuperation.html';
                    }

                    // Verrouillage du vendeur sur les pages de saisie
                    const selectVendeur = document.getElementById('recupVendeur') || document.getElementById('valVendeur');
                    if (selectVendeur) {
                        selectVendeur.value = userData.nom;
                        selectVendeur.disabled = true;
                        if (typeof loadSellerData === 'function') loadSellerData();
                    }
                }
            }
            if (currentPage === 'login.html') window.location.href = 'recuperation.html';
        } catch (e) {
            console.error("Erreur de vérification du rôle:", e);
        }
    } else {
        // Non connecté
        if (currentPage !== 'login.html') {
            window.location.href = 'login.html';
        }
    }
});

function logout() {
    firebase.auth().signOut().then(() => { window.location.href = 'login.html'; });
}