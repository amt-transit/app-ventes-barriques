const userListBody = document.getElementById('userListBody');
const msgUser = document.getElementById('msgUser');
const roleSelect = document.getElementById('newUserRole');

// --- 1. CHARGEMENT DES UTILISATEURS AVEC FILTRES ---
function loadUsers() {
    if (!userListBody) return;
    
    // Écoute en temps réel
    db.collection("users").orderBy("nom", "asc").onSnapshot(snap => {
        userListBody.innerHTML = '';
        
        snap.forEach(doc => {
            const u = doc.data();
            
            // RESTRICTION ADMIN : Ne pas voir le Super Admin dans la liste
            if (window.userRole === 'admin' && u.role === 'superadmin') {
                return; 
            }

            // RESTRICTION PASS : Seul le Super Admin voit le MDP en clair
            const isSuper = (window.userRole === 'superadmin');
            const passwordValue = isSuper ? (u.password_plain || "Non défini") : "********";

            userListBody.innerHTML += `
                <tr>
                    <td><b>${u.nom}</b><br><small style="color:gray">${u.email}</small></td>
                    <td>
                        <span id="pass-${doc.id}" style="display:none;">${passwordValue}</span>
                        ${isSuper ? 
                            `<span id="hide-${doc.id}" class="pass-cell" onclick="togglePass('${doc.id}')" style="cursor:pointer; color:#1877f2; text-decoration:underline;">Afficher</span>` 
                            : `<span>Encodé</span>`
                        }
                    </td>
                    <td><span class="badge-role">${u.role}</span></td>
                    <td>
                        <button onclick="resetPassword('${u.email}')" class="btn-reset">Reset</button>
                        ${isSuper ? `<button onclick="deleteUser('${doc.id}')" class="btn-suppr">Suppr.</button>` : ''}
                    </td>
                </tr>`;
        });
    });
}

// --- 2. CONFIGURATION DU FORMULAIRE ---
function setupForm() {
    if (window.userRole === 'admin') {
        // Supprime l'option Super Admin pour les simples admins
        for (let i = 0; i < roleSelect.options.length; i++) {
            if (roleSelect.options[i].value === 'superadmin') {
                roleSelect.remove(i);
            }
        }
    }
}

// --- 3. AFFICHAGE DU MOT DE PASSE (Réservé Super Admin) ---
window.togglePass = (id) => {
    const p = document.getElementById('pass-' + id);
    const h = document.getElementById('hide-' + id);
    if (p.style.display === 'none') {
        p.style.display = 'inline';
        h.innerText = ' Masquer';
    } else {
        p.style.display = 'none';
        h.innerText = 'Afficher';
    }
};

// --- 4. CRÉATION DE COMPTE + LOG ---
document.getElementById('btnCreateUser').addEventListener('click', async () => {
    const nomBrut = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value;
    const role = roleSelect.value;

    if (window.userRole === 'admin' && role === 'superadmin') return alert("Action non autorisée.");
    if (!nomBrut || pass.length < 6) return alert("Nom requis et mot de passe de 6 car. min.");

    // Génération email propre
    const cleaned = nomBrut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const email = cleaned + "@amt.com";

    try {
        msgUser.innerText = "⏳ Création...";
        
        // Vérification doublon email
        const check = await db.collection("users").doc(email).get();
        if (check.exists) return alert("Cet email/utilisateur existe déjà.");

        // Création technique (Second App pour ne pas déconnecter l'admin actuel)
        let secApp;
        try { secApp = firebase.initializeApp(firebaseConfig, "Secondary"); } 
        catch (e) { secApp = firebase.app("Secondary"); }

        const userCred = await secApp.auth().createUserWithEmailAndPassword(email, pass);
        
        // Sauvegarde Firestore (ID = email)
        await db.collection("users").doc(email).set({
            nom: nomBrut, 
            email: email, 
            role: role, 
            uid: userCred.user.uid,
            password_plain: pass, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // ENREGISTREMENT DU LOG
        if (typeof window.logAction === 'function') {
            await window.logAction("COMPTES", "CRÉATION", `Compte ${role} créé pour ${nomBrut}`);
        }

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

// --- 5. SUPPRESSION DE COMPTE + LOG ---
window.deleteUser = async (id) => {
    if (window.userRole !== 'superadmin') return alert("Seul le Super Admin peut supprimer des comptes.");
    
    try {
        const snap = await db.collection("users").doc(id).get();
        if (!snap.exists) return;
        const uData = snap.data();

        if (confirm(`Voulez-vous vraiment supprimer le compte de ${uData.nom} ?`)) {
            await db.collection("users").doc(id).delete();

            // ENREGISTREMENT DU LOG
            if (typeof window.logAction === 'function') {
                await window.logAction("COMPTES", "SUPPRESSION", `Compte ${uData.role} de ${uData.nom} supprimé.`);
            }
            alert("Compte supprimé et action logguée.");
        }
    } catch (e) {
        alert("Erreur suppression: " + e.message);
    }
};

// --- 6. RÉINITIALISATION ---
window.resetPassword = (email) => {
    if (confirm("Envoyer un email de réinitialisation ?")) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => alert("Email envoyé !"))
            .catch(e => alert(e.message));
    }
};

// --- 7. INITIALISATION AUTO ---
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        db.collection("users").where("email", "==", user.email).get().then(snap => {
            if(!snap.empty) {
                const data = snap.docs[0].data();
                window.userRole = data.role;
                window.userName = data.nom; // Utile pour le log
                setupForm();
                loadUsers();
            }
        });
    }
});