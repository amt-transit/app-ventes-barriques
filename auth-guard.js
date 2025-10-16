const auth = firebase.auth();

// Gardien : Vérifie si un utilisateur est connecté
auth.onAuthStateChanged(user => {
    if (!user && window.location.pathname.split('/').pop() !== 'login.html') {
        // Si l'utilisateur n'est pas connecté ET qu'il n'est pas sur la page de login,
        // on le redirige vers la page de login.
        window.location.href = 'login.html';
    }
});

// Fonction de déconnexion globale
function logout() {
    auth.signOut().then(() => {
        console.log('Utilisateur déconnecté');
    }).catch((error) => {
        console.error('Erreur de déconnexion', error);
    });
}