const userListBody = document.getElementById('userListBody');
const msgUser = document.getElementById('msgUser');
const roleSelect = document.getElementById('newUserRole');

// --- 1. CHARGEMENT DES UTILISATEURS AVEC FILTRES ---
function loadUsers() {
    if (!userListBody) return;
    
    db.collection("users").orderBy("nom", "asc").onSnapshot(snap => {
        userListBody.innerHTML = '';
        
        snap.forEach(doc => {
            const u = doc.data();
            
            // RESTRICTION ADMIN : Ne pas voir le Super Admin dans la liste
            if (window.userRole === 'admin' && u.role === 'superadmin') {
                return; 
            }

            const isSuper = (window.userRole === 'superadmin');
            const passwordValue = isSuper ? (u.password_plain || "Non défini") : "********";

            // Sélecteur de rôle dynamique
            const roleSelector = `
                <select class="select-role-table" onchange="updateUserRole('${doc.id}', this.value, '${u.nom}')">
                    <option value="vendeur" ${u.role === 'vendeur' ? 'selected' : ''}>Vendeur</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    ${isSuper ? `<option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>SuperAdmin</option>` : ''}
                </select>
            `;

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
                    <td>${roleSelector}</td>
                    <td>
                        <button onclick="resetPassword('${u.email}')" style="padding:5px 10px; cursor:pointer; border-radius:5px; border:1px solid #ccc;">Reset</button>
                        ${isSuper ? `<button onclick="deleteUser('${doc.id}')" style="padding:5px 10px; cursor:pointer; background:#fee2e2; color:#be123c; border:1px solid #fecaca; border-radius:5px; margin-left:5px;">Suppr.</button>` : ''}
                    </td>
                </tr>`;
        });
    });
}

// --- 2. MODIFICATION DU RÔLE ---
window.updateUserRole = async (email, newRole, nom) => {
    if (confirm(`Changer le statut de ${nom} vers "${newRole}" ?`)) {
        try {
            await db.collection("users").doc(email).update({
                role: newRole
            });

            // LOG DE L'ACTION
            if (typeof window.logAction === 'function') {
                await window.logAction("COMPTES", "MODIFICATION", `Changement de rôle pour ${nom} : Nouveau statut = ${newRole}`);
            }

            alert("Statut mis à jour avec succès.");
        } catch (e) {
            alert("Erreur lors de la mise à jour : " + e.message);
        }
    } else {
        loadUsers(); // Recharger pour annuler visuellement le changement dans le select
    }
};

// --- 3. CONFIGURATION DU FORMULAIRE ---
function setupForm() {
    if (window.userRole === 'admin') {
        for (let i = 0; i < roleSelect.options.length; i++) {
            if (roleSelect.options[i].value === 'superadmin') {
                roleSelect.remove(i);
            }
        }
    }
}

// --- 4. AFFICHAGE DU MOT DE PASSE ---
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

// --- 5. CRÉATION DE COMPTE ---
document.getElementById('btnCreateUser').addEventListener('click', async () => {
    const nomBrut = document.getElementById('newUserName').value.trim();
    const pass = document.getElementById('newUserPass').value;
    const role = roleSelect.value;

    if (window.userRole === 'admin' && role === 'superadmin') return alert("Action non autorisée.");
    if (!nomBrut || pass.length < 6) return alert("Nom requis et mot de passe de 6 car. min.");

    const cleaned = nomBrut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const email = cleaned + "@amt.com";

    try {
        msgUser.innerText = "⏳ Création...";
        const check = await db.collection("users").doc(email).get();
        if (check.exists) return alert("Cet email/utilisateur existe déjà.");

        let secApp;
        try { secApp = firebase.initializeApp(firebaseConfig, "Secondary"); } 
        catch (e) { secApp = firebase.app("Secondary"); }

        const userCred = await secApp.auth().createUserWithEmailAndPassword(email, pass);
        
        await db.collection("users").doc(email).set({
            nom: nomBrut, 
            email: email, 
            role: role, 
            uid: userCred.user.uid,
            password_plain: pass, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

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

// --- 6. SUPPRESSION DE COMPTE ---
window.deleteUser = async (id) => {
    if (window.userRole !== 'superadmin') return alert("Seul le Super Admin peut supprimer des comptes.");
    
    try {
        const snap = await db.collection("users").doc(id).get();
        if (!snap.exists) return;
        const uData = snap.data();

        if (confirm(`Voulez-vous vraiment supprimer le compte de ${uData.nom} ?`)) {
            await db.collection("users").doc(id).delete();
            if (typeof window.logAction === 'function') {
                await window.logAction("COMPTES", "SUPPRESSION", `Compte ${uData.role} de ${uData.nom} supprimé.`);
            }
            alert("Compte supprimé.");
        }
    } catch (e) {
        alert("Erreur suppression: " + e.message);
    }
};

// --- 7. RÉINITIALISATION ---
window.resetPassword = (email) => {
    if (confirm("Envoyer un email de réinitialisation ?")) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => alert("Email envoyé !"))
            .catch(e => alert(e.message));
    }
};

// --- 8. INITIALISATION AUTO ---
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        db.collection("users").where("email", "==", user.email).get().then(snap => {
            if(!snap.empty) {
                const data = snap.docs[0].data();
                window.userRole = data.role;
                window.userName = data.nom;
                setupForm();
                loadUsers();
            }
        });
    }
});