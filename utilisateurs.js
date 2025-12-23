document.getElementById('btnCreateUser').addEventListener('click', async () => {
    let nomBrut = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;

    if (!nomBrut || pass.length < 6) return alert("Données invalides (Pass: 6 caract. min)");

    // --- NETTOYAGE DU NOM POUR L'EMAIL ---
    // On enlève les accents, les espaces et on met en minuscule
    const nomNettoye = nomBrut.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .replace(/\s+/g, ''); // Enlève tous les espaces

    const email = nomNettoye + "@amt.com";

    try {
        document.getElementById('msgUser').innerText = "Création de l'accès sécurisé...";

        // Initialisation de l'instance secondaire (si elle n'existe pas déjà)
        let secondaryApp;
        try {
            secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
        } catch (e) {
            secondaryApp = firebase.app("Secondary");
        }

        // 1. Création dans Firebase Auth
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const newUid = userCredential.user.uid;

        // 2. Enregistrement dans Firestore (On garde le nom brut avec majuscules pour l'affichage)
        await db.collection("users").doc(nomBrut).set({
            nom: nomBrut,
            email: email,
            role: role,
            uid: newUid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await secondaryApp.delete();

        document.getElementById('msgUser').innerText = "✅ Compte créé : " + email;
        document.getElementById('msgUser').style.color = "green";
        loadUsers(); // Recharger la liste
    } catch (error) {
        console.error(error);
        document.getElementById('msgUser').innerText = "Erreur : " + error.message;
        document.getElementById('msgUser').style.color = "red";
    }
});