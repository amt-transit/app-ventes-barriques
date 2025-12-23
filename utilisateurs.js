// Fonction pour créer un utilisateur sans se déconnecter
document.getElementById('btnCreateUser').addEventListener('click', async () => {
    const nom = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;
    const email = nom.toLowerCase() + "@amt.com";

    if (!nom || pass.length < 6) return alert("Données invalides (Pass: 6 caract. min)");

    try {
        document.getElementById('msgUser').innerText = "Création de l'accès sécurisé...";

        // --- ÉTAPE 1 : Créer une instance secondaire pour l'Auth ---
        // On initialise une app temporaire avec la même config
        const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

        // --- ÉTAPE 2 : Créer le compte dans Firebase Auth ---
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const newUid = userCredential.user.uid;

        // --- ÉTAPE 3 : Enregistrer le rôle dans Firestore ---
        await db.collection("users").doc(nom).set({
            nom: nom,
            email: email,
            role: role,
            uid: newUid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // --- ÉTAPE 4 : Nettoyage ---
        await secondaryApp.delete(); // On ferme l'instance temporaire

        document.getElementById('msgUser').innerText = "✅ Compte " + nom + " créé avec succès !";
        document.getElementById('msgUser').style.color = "green";
        
        // Réinitialiser les champs
        document.getElementById('newUserName').value = "";
        document.getElementById('newUserPass').value = "";

    } catch (error) {
        console.error(error);
        document.getElementById('msgUser').innerText = "Erreur : " + error.message;
        document.getElementById('msgUser').style.color = "red";
    }
});