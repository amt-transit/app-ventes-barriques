document.addEventListener('DOMContentLoaded', () => {
    let allSales = [], allStocks = [], allEncaissements = [];

    async function loadAuditData() {
        const [salesSnap, stocksSnap, encSnap] = await Promise.all([
            db.collection("ventes").get(),
            db.collection("stocks").get(),
            db.collection("encaissements_vendeurs").get()
        ]);

        allSales = salesSnap.docs.map(doc => doc.data());
        allStocks = stocksSnap.docs.map(doc => doc.data());
        allEncaissements = encSnap.docs.map(doc => doc.data());

        renderFinancialAudit();
    }

    function renderFinancialAudit() {
        const tbody = document.getElementById('financialAuditBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        let auditLogs = [];
        
        // 1. Dépenses (Achats de stock)
        allStocks.forEach(s => {
            const cost = (parseFloat(s.quantite) || 0) * (parseFloat(s.prixAchat) || 0);
            if (cost > 0) {
                auditLogs.push({ date: s.date, type: 'Dépense', desc: `Achat Stock : ${s.produit} (${s.quantite}x)`, in: 0, out: cost });
            }
        });
        
        // 2. Recettes (Encaissements globaux des vendeurs)
        allEncaissements.forEach(e => {
            const cash = parseFloat(e.montantRecu) || 0;
            const cb = parseFloat(e.montantCB) || 0;
            const vir = parseFloat(e.montantVirement) || 0;
            
            if (cash > 0) auditLogs.push({ date: e.date, type: 'Recette', desc: `Encaissement Cash (${e.vendeur})`, in: cash, out: 0 });
            if (cb > 0 && e.cbConfirme) auditLogs.push({ date: e.date, type: 'Recette', desc: `Paiement CB Confirmé (${e.vendeur})`, in: cb, out: 0 });
            if (vir > 0 && e.virementConfirme) auditLogs.push({ date: e.date, type: 'Recette', desc: `Virement Confirmé (${e.vendeur})`, in: vir, out: 0 });
        });
        
        // 3. Recettes (Ventes directes & Abidjan réglé)
        allSales.forEach(s => {
            const m = parseFloat(s.total) || 0;
            if (m > 0) {
                if (s.payeAbidjan && s.abidjanRegle) {
                    auditLogs.push({ date: s.date, type: 'Recette', desc: `Reversement Abidjan (${s.produit})`, in: m, out: 0 });
                } else if (!s.payeAbidjan && s.modeDePaiement) {
                    if (s.modeDePaiement === 'Espèce') auditLogs.push({ date: s.date, type: 'Recette', desc: `Vente Cash (${s.produit})`, in: m, out: 0 });
                    else if (s.modeDePaiement === 'Carte Bleue' && s.receptionConfirmee) auditLogs.push({ date: s.date, type: 'Recette', desc: `Vente CB Confirmée (${s.produit})`, in: m, out: 0 });
                    else if (s.modeDePaiement === 'Virement' && s.receptionConfirmee) auditLogs.push({ date: s.date, type: 'Recette', desc: `Vente Vir. Confirmée (${s.produit})`, in: m, out: 0 });
                }
            }
        });
        
        // Tri chronologique : du plus ancien au plus récent pour calculer le solde cumulé
        auditLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        let currentBalance = 0;
        auditLogs.forEach(log => {
            currentBalance += log.in;
            currentBalance -= log.out;
            log.balance = currentBalance;
        });
        
        // Tri inverse pour l'affichage (le plus récent en haut)
        auditLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        if (auditLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun mouvement financier enregistré.</td></tr>';
            return;
        }

        auditLogs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.date}</td>
                <td><span style="background:${log.type==='Recette'?'#dcfce7':'#fee2e2'}; color:${log.type==='Recette'?'#166534':'#991b1b'}; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${log.type}</span></td>
                <td>${log.desc}</td>
                <td style="color:#10b981; font-weight:bold;">${log.in > 0 ? '+ ' + formatEUR(log.in) : '-'}</td>
                <td style="color:#ef4444; font-weight:bold;">${log.out > 0 ? '- ' + formatEUR(log.out) : '-'}</td>
                <td style="font-weight:bold; color:${log.balance >= 0 ? '#1877f2' : '#be123c'}; background:#f8fafc;">${formatEUR(log.balance)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function formatEUR(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0); }

    // Écouteurs Firestore
    db.collection("ventes").onSnapshot(() => loadAuditData());
    db.collection("stocks").onSnapshot(() => loadAuditData());
    db.collection("encaissements_vendeurs").onSnapshot(() => loadAuditData());

    // --- GESTION DU BOUTON RETOUR EN HAUT (SCROLL UP ONLY) ---
    let backToTopBtn = document.getElementById("btnBackToTop");
    if (!backToTopBtn) {
        backToTopBtn = document.createElement('button');
        backToTopBtn.id = "btnBackToTop";
        backToTopBtn.innerHTML = "↑";
        document.body.appendChild(backToTopBtn);
        backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    let lastScrollTop = 0;
    window.addEventListener("scroll", () => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > 300 && st < lastScrollTop) {
            backToTopBtn.classList.add("show");
        } else {
            backToTopBtn.classList.remove("show");
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
});