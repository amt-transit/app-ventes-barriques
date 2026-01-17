function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('themeBtn');
    
    // Changement d'icône et stockage
    if (isDark) {
        btn.innerHTML = '☀️';
        localStorage.setItem('amt-theme', 'dark');
    } else {
        btn.innerHTML = '🌙';
        localStorage.setItem('amt-theme', 'light');
    }
}

// Appliquer immédiatement au chargement
(function initTheme() {
    const savedTheme = localStorage.getItem('amt-theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
})();

// Une fois le DOM prêt
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeBtn');
    if (btn && document.body.classList.contains('dark-mode')) {
        btn.innerHTML = '☀️';
    }
});