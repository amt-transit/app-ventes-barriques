document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const errorMessage = document.getElementById('error-message');

    // Redirige si déjà connecté
    auth.onAuthStateChanged(user => {
        if (user) {
            window.location.href = 'index.html';
        }
    });

    loginBtn.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        auth.signInWithEmailAndPassword(email, password)
            .catch((error) => {
                errorMessage.textContent = "Erreur : E-mail ou mot de passe incorrect.";
            });
    });

    signupBtn.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        if (password.length < 6) {
            errorMessage.textContent = "Le mot de passe doit faire au moins 6 caractères.";
            return;
        }
        auth.createUserWithEmailAndPassword(email, password)
            .catch((error) => {
                if (error.code === 'auth/email-already-in-use') {
                    errorMessage.textContent = "Cette adresse e-mail est déjà utilisée.";
                } else {
                    errorMessage.textContent = "Erreur lors de la création du compte.";
                }
            });
    });
});