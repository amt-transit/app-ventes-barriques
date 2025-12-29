document.addEventListener('DOMContentLoaded', () => {
    // --- SÉLECTEURS ---
    const tableBodyVentes = document.getElementById('tableBodyVentes');
    const tableBodyInvendus = document.getElementById('tableBodyInvendus');
    const tableBodyPaiements = document.getElementById('tableBodyPaiements');
    const auditLogBody = document.getElementById('auditLogBody');
    const auditBadge = document.getElementById('auditCount');
    const filterVendeur = document.getElementById('filterVendeur');
    const dateStartInput = document.getElementById('mainFilterDateStart');
    const dateEndInput = document.getElementById('mainFilterDateEnd');

    const logFilterDate = document.getElementById('logFilterDate');
    const logFilterAuteur = document.getElementById('logFilterAuteur');
    const logFilterModule = document.getElementById('logFilterModule');
    const logFilterSearch = document.getElementById('logFilterSearch');

    // --- ÉTAT ---
    let allLogs = [];
    let salesData = [];
    let recupsData = [];
    let retoursData = [];
    
    let unsubscribeVentes = null;
    let unsubscribePaiements = null;
    let unsubscribeRecups = null;
    let unsubscribeRetours = null;
    let lastViewedTimestamp = localStorage.getItem('lastAuditLogView') || 0;

    // --- 1. INITIALISATION ---
    async function init() {
        setDefaultDates();
        await loadUsersIntoFilters();
        
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                setTimeout(() => {
                    startDataListeners();
                    loadAuditLogs();
                }, 800);
            }
        });
    }

    function setDefaultDates() {
        if (!dateStartInput || !dateEndInput) return;
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        dateStartInput.value = firstDay.toISOString().split('T')[0];
        dateEndInput.value = lastDay.toISOString().split('T')[0];
    }

    window.changeMonth = (offset) => {
        if (!dateStartInput) return;
        let currentStart = new Date(dateStartInput.value);
        currentStart.setMonth(currentStart.getMonth() + offset);
        const firstDay = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1);
        const lastDay = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0);
        dateStartInput.value = firstDay.toISOString().split('T')[0];
        if (dateEndInput) dateEndInput.value = lastDay.toISOString().split('T')[0];
        startDataListeners(); 
    };

    async function loadUsersIntoFilters() {
        const snap = await db.collection("users").orderBy("nom", "asc").get();
        snap.forEach(doc => {
            const nom = doc.data().nom;
            const opt = `<option value="${nom}">${nom}</option>`;
            if (filterVendeur) filterVendeur.innerHTML += opt;
            if (logFilterAuteur) logFilterAuteur.innerHTML += opt;
        });
    }

    // --- 2. NAVIGATION ---
    window.switchTab = (type) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-section').forEach(s => s.classList.remove('active'));
        
        const btn = document.getElementById(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (btn) btn.classList.add('active');
        
        const section = document.getElementById(`section-${type}`);
        if (section) section.classList.add('active');
        
        const gFilters = document.getElementById('global-filters');
        if (gFilters) gFilters.style.display = (type === 'audit') ? 'none' : 'flex';
        
        if (type === 'audit') resetAuditCounter();
    };

    function resetAuditCounter() {
        if (allLogs.length > 0 && allLogs[0].timestamp) {
            lastViewedTimestamp = allLogs[0].timestamp.toMillis();
            localStorage.setItem('lastAuditLogView', lastViewedTimestamp);
        }
        if (auditBadge) { auditBadge.style.display = 'none'; auditBadge.innerText = '0'; }
    }

    // --- 3. ÉCOUTEURS DE DONNÉES ---
    function startDataListeners() {
        if (!dateStartInput || !dateEndInput) return;
        
        if (unsubscribeVentes) unsubscribeVentes();
        if (unsubscribePaiements) unsubscribePaiements();
        if (unsubscribeRecups) unsubscribeRecups();
        if (unsubscribeRetours) unsubscribeRetours();

        const start = dateStartInput.value;
        const end = dateEndInput.value;
        const selectedVendeur = filterVendeur ? filterVendeur.value : "";

        // Listeners Firestore
        unsubscribeVentes = db.collection("ventes").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                salesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const filtered = selectedVendeur ? salesData.filter(d => d.vendeur === selectedVendeur) : salesData;
                renderVentes(filtered);
                renderInvendus(); // Recalculer les invendus
            });

        unsubscribePaiements = db.collection("encaissements_vendeurs").where("date", ">=", start).where("date", "<=", end).orderBy("date", "desc")
            .onSnapshot(snap => {
                let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (selectedVendeur) data = data.filter(d => d.vendeur === selectedVendeur);
                renderPaiements(data);
            });

        unsubscribeRecups = db.collection("recuperations").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => {
                recupsData = snap.docs.map(doc => doc.data());
                renderInvendus();
            });

        unsubscribeRetours = db.collection("retours_vendeurs").where("date", ">=", start).where("date", "<=", end)
            .onSnapshot(snap => {
                retoursData = snap.docs.map(doc => doc.data());
                renderInvendus();
            });
    }

    if (filterVendeur) filterVendeur.addEventListener('change', startDataListeners);
    if (dateStartInput) dateStartInput.addEventListener('change', startDataListeners);
    if (dateEndInput) dateEndInput.addEventListener('change', startDataListeners);

    function renderVentes(sales) {
        if (!tableBodyVentes) return;
        tableBodyVentes.innerHTML = '';
        if (sales.length === 0) { tableBodyVentes.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">Aucune vente.</td></tr>'; return; }
        
        sales.forEach(data => {
            const tagAbidjan = data.payeAbidjan ? `<br><span class="badge-role" style="background:#701a75; color:white; font-size:9px; padding:2px 4px; border-radius:4px;">📍 ABIDJAN</span>` : '';
            const clientInfo = data.clientRef ? `<br><small style="color:#701a75">Ref: ${data.clientRef}</small>` : '';
            const actions = (window.userRole === 'superadmin') 
                ? `<button class="btn-reset" onclick="editDocument('ventes', '${data.id}')">Modif.</button>
                   <button class="deleteBtn" onclick="deleteDocument('ventes', '${data.id}')">Suppr.</button>`
                : `<span style="font-size:10px; color:gray;">Lecture seule</span>`;

            tableBodyVentes.innerHTML += `
                <tr>
                    <td>${data.date}</td>
                    <td><b>${data.produit}</b>${clientInfo}</td>
                    <td>${data.quantite}</td>
                    <td style="font-weight:bold;">${formatEUR(data.total)}${tagAbidjan}</td>
                    <td style="color:#1877f2; font-weight:bold;">${data.vendeur}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    // --- LOGIQUE CALCUL DES INVENDUS (En main) ---
    function renderInvendus() {
        if (!tableBodyInvendus) return;
        tableBodyInvendus.innerHTML = '';
        
        const selectedVendeur = filterVendeur ? filterVendeur.value : "";
        let invendusMap = {};

        // 1. Ajouter Récupérations
        recupsData.forEach(r => {
            if (selectedVendeur && r.vendeur !== selectedVendeur) return;
            const key = `${r.vendeur}_${r.produit}`;
            if (!invendusMap[key]) invendusMap[key] = { vendeur: r.vendeur, produit: r.produit, pris: 0, vendu: 0, rendu: 0 };
            invendusMap[key].pris += r.quantite;
        });

        // 2. Soustraire Ventes
        salesData.forEach(v => {
            if (selectedVendeur && v.vendeur !== selectedVendeur) return;
            const key = `${v.vendeur}_${v.produit}`;
            if (!invendusMap[key]) invendusMap[key] = { vendeur: v.vendeur, produit: v.produit, pris: 0, vendu: 0, rendu: 0 };
            invendusMap[key].vendu += v.quantite;
        });

        // 3. Soustraire Retours
        retoursData.forEach(ret => {
            if (selectedVendeur && ret.vendeur !== selectedVendeur) return;
            const key = `${ret.vendeur}_${ret.produit}`;
            if (!invendusMap[key]) invendusMap[key] = { vendeur: ret.vendeur, produit: ret.produit, pris: 0, vendu: 0, rendu: 0 };
            invendusMap[key].rendu += ret.quantite;
        });

        const keys = Object.keys(invendusMap).sort();
        if (keys.length === 0) {
            tableBodyInvendus.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">Aucun stock identifié sur cette période.</td></tr>';
            return;
        }

        keys.forEach(k => {
            const d = invendusMap[k];
            const enMain = d.pris - d.vendu - d.rendu;
            if (enMain === 0) return; // Ne pas afficher si le stock est épuisé

            tableBodyInvendus.innerHTML += `
                <tr>
                    <td><b>${d.vendeur}</b></td>
                    <td>${d.produit}</td>
                    <td>${d.pris}</td>
                    <td>${d.vendu}</td>
                    <td>${d.rendu}</td>
                    <td style="font-weight:bold; color:#1877f2; font-size:14px;">${enMain}</td>
                </tr>`;
        });
    }

    function renderPaiements(payments) {
        if (!tableBodyPaiements) return;
        tableBodyPaiements.innerHTML = '';
        if (payments.length === 0) { tableBodyPaiements.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">Aucun paiement.</td></tr>'; return; }

        payments.forEach(data => {
            const total = (data.montantRecu || 0) + (data.remise || 0);
            const actions = (window.userRole === 'superadmin')
                ? `<button class="deleteBtn" onclick="deleteDocument('encaissements_vendeurs', '${data.id}')">Suppr.</button>`
                : `<small>Protégé</small>`;

            tableBodyPaiements.innerHTML += `
                <tr>
                    <td>${data.date}</td><td style="font-weight:bold; color:#1877f2;">${data.vendeur}</td>
                    <td style="color: #10b981;">+ ${formatEUR(data.montantRecu)}</td>
                    <td style="color: #3b82f6;">${formatEUR(data.remise)}</td>
                    <td style="font-weight:bold;">${formatEUR(total)}</td>
                    <td>${actions}</td>
                </tr>`;
        });
    }

    function loadAuditLogs() {
        db.collection("audit_logs").orderBy("timestamp", "desc").limit(150).onSnapshot(snap => {
            allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyLogFilters();
        });
    }

    function applyLogFilters() {
        if (!auditLogBody) return;
        const fDate = logFilterDate ? logFilterDate.value : "";
        const fAuteur = logFilterAuteur ? logFilterAuteur.value : "";
        const fModule = logFilterModule ? logFilterModule.value : "";
        const fSearch = logFilterSearch ? logFilterSearch.value.toLowerCase() : "";

        const filtered = allLogs.filter(log => {
            if (fDate && !log.dateAction.includes(fDate.split('-').reverse().join('/'))) return false;
            if (fAuteur && log.auteur !== fAuteur) return false;
            if (fModule && log.module !== fModule) return false;
            if (fSearch && !log.details.toLowerCase().includes(fSearch)) return false;
            return true;
        });

        auditLogBody.innerHTML = '';
        filtered.forEach(log => {
            const mColor = log.module === 'STOCK' ? '#1877f2' : log.module === 'COMPTES' ? '#8b5cf6' : '#f59e0b';
            auditLogBody.innerHTML += `
                <tr>
                    <td><small>${log.dateAction}</small></td>
                    <td><b>${log.auteur}</b></td>
                    <td><span class="badge-role" style="background:${mColor}; color:white; padding:2px 6px; font-size:10px; border-radius:4px;">${log.module}</span></td>
                    <td style="color:${log.type === 'SUPPRESSION' ? 'red' : 'orange'}; font-weight:bold;">${log.type}</td>
                    <td style="font-size:11px;">${log.details} [${log.produit || 'N/A'}]</td>
                </tr>`;
        });
    }

    [logFilterDate, logFilterAuteur, logFilterModule, logFilterSearch].forEach(el => {
        if (el) el.addEventListener('input', applyLogFilters);
    });

    // --- 5. ACTIONS ADMIN ---
    window.deleteDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Super Admin requis.");
        if (confirm("Confirmer la suppression ?")) {
            const snap = await db.collection(coll).doc(docId).get();
            const old = snap.data();
            await db.collection(coll).doc(docId).delete();
            if (window.logAction) {
                window.logAction(coll.toUpperCase(), "SUPPRESSION", `Valeur: ${old.total || old.montantRecu}€ pour ${old.vendeur}`, old.produit || "N/A");
            }
        }
    };

    window.editDocument = async (coll, docId) => {
        if (window.userRole !== 'superadmin') return alert("Super Admin requis.");
        const snap = await db.collection(coll).doc(docId).get();
        const old = snap.data();
        const nQ = prompt("Nouvelle quantité :", old.quantite);
        if (nQ && nQ != old.quantite) {
            const nT = parseInt(nQ) * old.prixUnitaire;
            await db.collection(coll).doc(docId).update({ quantite: parseInt(nQ), total: nT });
            if (window.logAction) {
                window.logAction("VENTES", "MODIFICATION", `Qté corrigée: ${old.quantite} -> ${nQ}`, old.produit);
            }
        }
    };

    window.downloadAuditLogPDF = function() {
        const element = document.getElementById('printableAuditArea');
        if (!element) return;
        html2pdf().set({ 
            margin: 10, filename: 'Audit_Global.pdf', 
            image: { type: 'jpeg', quality: 0.98 }, 
            html2canvas: { scale: 2 }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } 
        }).from(element).save();
    };

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }
    
    init();
});