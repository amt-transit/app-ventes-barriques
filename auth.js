// auth.js - Version épurée (uniquement déconnexion et utilitaires)
const logoutSession = () => {
    firebase.auth().signOut().then(() => {
        window.location.href = 'login.html';
    });
};