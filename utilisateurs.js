const userListBody = document.getElementById('userListBody');
const msgUser = document.getElementById('msgUser');

// --- CHARGEMENT DES UTILISATEURS ---
function loadUsers() {
    if (!userListBody) return;
    db.collection("users").orderBy("nom", "asc").onSnapshot(snap => {
        userListBody.innerHTML = '';
        snap.forEach(doc => {
            const u = doc.data();
            userListBody.innerHTML += `
                <tr>
                    <td>${u.nom}<br><small style="color:gray">${u.email}</small></td>
                    <td><span class="badge-role">${u.role}</span></td>
                    <td>
                        <button onclick="resetPassword('${u.email}')" class="btn-reset">Réinitialiser</button>
                        <button onclick="deleteUser('${doc.id}')" class="btn-suppr">Suppr.</button>
                    </td>
                </tr>`;
        });
    });
}

// --- CRÉATION AVEC VÉRIFICATION ET INSTANCE SECONDAIRE ---
document.getElementById('btnCreateUser').addEventListener('click', async () => {
    const nomBrut = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;

    if (!nomBrut || pass.length < 6) return alert("Nom requis et mot de passe de 6 car. min.");

    // Nettoyage pour l'email
    const cleaned = nomBrut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const email = cleaned + "@amt.com";

    try {
        msgUser.innerText = "🔍 Vérification...";
        const check = await db.collection("users").doc(nomBrut).get();
        if (check.exists) return alert("Ce nom est déjà utilisé.");

        msgUser.innerText = "⏳ Création de l'accès...";
        
        let secApp;
        try { secApp = firebase.initializeApp(firebaseConfig, "Secondary"); } 
        catch (e) { secApp = firebase.app("Secondary"); }

        const userCred = await secApp.auth().createUserWithEmailAndPassword(email, pass);
        
        await db.collection("users").doc(nomBrut).set({
            nom: nomBrut, email: email, role: role, uid: userCred.user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await secApp.delete();
        msgUser.innerText = "✅ Succès !";
        msgUser.style.color = "green";
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPass').value = '';
        
    } catch (e) {
        msgUser.innerText = "❌ Erreur: " + e.message;
        msgUser.style.color = "red";
    }
});

// --- ACTIONS ---
window.resetPassword = (email) => {
    if (confirm("Envoyer un email de réinitialisation ?")) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => alert("Email envoyé !"))
            .catch(e => alert(e.message));
    }
};

window.deleteUser = (id) => {
    if (confirm("Supprimer ce profil ? (L'accès Auth restera actif dans la console)")) {
        db.collection("users").doc(id).delete();
    }
};

loadUsers();