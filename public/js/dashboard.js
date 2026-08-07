document.addEventListener('DOMContentLoaded', function () {
  const actionButtons = document.querySelectorAll('.btn-server-action');
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-250 border ${
      type === 'success' 
        ? 'bg-[#1a1c1e] text-white border-emerald-500/40' 
        : 'bg-[#1a1c1e] text-white border-red-500/40'
    }`;

    const icon = type === 'success'
      ? `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`
      : `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  actionButtons.forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const serverId = btn.dataset.serverId;
      const action = btn.dataset.action;

      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span class="inline-block animate-spin mr-1">⚡</span> Processing...`;

      try {
        const response = await fetch(`/dashboard/servers/${serverId}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: JSON.stringify({ action: action, _csrf: csrfToken })
        });

        const data = await response.json();

        if (data.success) {
          showToast(data.message, 'success');
          // Reload page after brief delay to update server meters
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          showToast(data.message || 'Action failed', 'error');
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      } catch (err) {
        showToast('Network error, please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  });
});
