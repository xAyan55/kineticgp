document.addEventListener('DOMContentLoaded', function () {
  const avatarButtons = document.querySelectorAll('.avatar-option-btn');
  const avatarInput = document.getElementById('selectedAvatarInput');
  const currentAvatarPreview = document.getElementById('currentAvatarPreview');

  avatarButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const avatarUrl = btn.dataset.avatarUrl;
      
      avatarButtons.forEach(b => b.classList.remove('border-[#2F81F7]', 'ring-2', 'ring-[#2F81F7]'));
      btn.classList.add('border-[#2F81F7]', 'ring-2', 'ring-[#2F81F7]');

      if (avatarInput) avatarInput.value = avatarUrl;
      if (currentAvatarPreview) currentAvatarPreview.src = avatarUrl;
    });
  });
});
