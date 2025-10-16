const auth = firebase.auth();
const currentPage = window.location.pathname.split('/').pop();

// Ce gardien est le seul responsable des redirections après le chargement de la page.
auth.onAuthStateChanged(user => {
    if (user) {
        // --- L'UTILISATEUR EST CONNECTÉ ---
        if (currentPage === 'login.html') {
            // S'il est connecté et se retrouve sur la page de login,
            // on le renvoie à l'accueil.
            window.location.href = 'index.html';
        }
    } else {
        // --- L'UTILISATEUR N'EST PAS CONNECTÉ ---
        if (currentPage !== 'login.html') {
            // S'il n'est pas sur la page de login, on l'y renvoie.
            window.location.href = 'login.html';
        }
    }
});

// Fonction de déconnexion globale
function logout() {
    auth.signOut().then(() => {
        // Après la déconnexion, on redirige vers la page de connexion.
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Erreur de déconnexion', error);
    });
}