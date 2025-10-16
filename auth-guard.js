const auth = firebase.auth();
const currentPage = window.location.pathname.split('/').pop();

// Gardien : Gère toutes les redirections liées à l'authentification
auth.onAuthStateChanged(user => {
    if (user) {
        // L'utilisateur est connecté
        if (currentPage === 'login.html') {
            // S'il est sur la page de login, on le redirige vers l'accueil
            window.location.href = 'index.html';
        }
    } else {
        // L'utilisateur n'est pas connecté
        if (currentPage !== 'login.html') {
            // S'il n'est PAS sur la page de login, on l'y renvoie
            window.location.href = 'login.html';
        }
    }
});

// Fonction de déconnexion globale améliorée
function logout() {
    auth.signOut().then(() => {
        // Redirige vers la page de connexion après la déconnexion
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Erreur de déconnexion', error);
    });
}