document.addEventListener('DOMContentLoaded', () => {
    let allSales = [], allStocks = [], allEncaissements = [], currentAuditLogs = [];

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
        
        currentAuditLogs = auditLogs; // Sauvegarde pour les exports

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

    // --- EXPORT EXCEL (CSV) ---
    window.exportAuditExcel = function() {
        if (currentAuditLogs.length === 0) return alert("Aucune donnée à exporter.");
        let csvContent = "Date;Type;Description;Entree;Sortie;Solde\n"; // Point-virgule pour Excel FR
        
        currentAuditLogs.forEach(log => {
            const desc = `"${log.desc.replace(/"/g, '""')}"`;
            // Formatage des nombres avec des virgules pour Excel français
            const inVal = log.in.toString().replace('.', ',');
            const outVal = log.out.toString().replace('.', ',');
            const balVal = log.balance.toString().replace('.', ',');
            csvContent += `${log.date};${log.type};${desc};${inVal};${outVal};${balVal}\n`;
        });

        // Encodage UTF-8 BOM pour bien afficher les accents dans Excel
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Grand_Livre_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- EXPORT PDF ---
    window.exportAuditPDF = function() {
        if (currentAuditLogs.length === 0) return alert("Aucune donnée à exporter.");
        if (typeof html2pdf === 'undefined') return alert("L'export PDF nécessite la librairie html2pdf.js dans audit.html.");
        
        const element = document.createElement('div');
        element.style.padding = '20px';
        element.style.fontFamily = 'Comfortaa, sans-serif';
        
        let html = `<div style="border-bottom: 3px solid #1877f2; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="color: #1877f2; margin: 0; font-size: 22px;">Grand Livre Comptable</h1>
            <p style="margin: 0; font-weight: bold; font-size: 14px;">Édité le : ${new Date().toLocaleDateString('fr-FR')}</p>
        </div><table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; color: #0f172a;">
        <thead><tr style="background-color: #1e293b; color: white;"><th style="padding: 8px; border: 1px solid #e2e8f0;">Date</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Type</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Description</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Entrée</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Sortie</th><th style="padding: 8px; border: 1px solid #e2e8f0;">Solde</th></tr></thead><tbody>`;
        currentAuditLogs.forEach(log => { html += `<tr><td style="padding: 6px; border: 1px solid #e2e8f0;">${log.date}</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${log.type}</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${log.desc}</td><td style="padding: 6px; border: 1px solid #e2e8f0; color:#10b981;">${log.in > 0 ? '+ ' + formatEUR(log.in) : '-'}</td><td style="padding: 6px; border: 1px solid #e2e8f0; color:#ef4444;">${log.out > 0 ? '- ' + formatEUR(log.out) : '-'}</td><td style="padding: 6px; border: 1px solid #e2e8f0; font-weight:bold;">${formatEUR(log.balance)}</td></tr>`; });
        html += `</tbody></table>`; element.innerHTML = html;

        const opt = { margin: 10, filename: `Grand_Livre_${new Date().toISOString().split('T')[0]}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        html2pdf().set(opt).from(element).save();
    };

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